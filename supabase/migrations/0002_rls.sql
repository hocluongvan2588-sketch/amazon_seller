-- ============================================================================
-- 0002_rls.sql — Row Level Security: helper functions + per-table policies
-- Spec: §7.2. Frontend permissions are UX hints; these policies are the truth.
--
-- Helper functions are SECURITY DEFINER so membership checks do not recurse
-- into RLS on organization_members / user_client_access.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (spec §7.2)
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.get_org_role(target_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.organization_members m
  where m.organization_id = target_org_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.has_client_access(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_accounts c
    where c.id = target_client_id
      and c.deleted_at is null
      and (
        public.is_org_admin(c.organization_id)
        or exists (
          select 1 from public.user_client_access uca
          where uca.client_account_id = target_client_id
            and uca.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.has_department_access(target_client_id uuid, target_department text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_admin(
    (select organization_id from public.client_accounts where id = target_client_id)
  )
  or exists (
    select 1 from public.user_client_access uca
    where uca.client_account_id = target_client_id
      and uca.user_id = auth.uid()
      and (
        uca.access_level = 'full'
        or (uca.access_level = 'department' and target_department = any (uca.allowed_departments))
      )
  );
$$;

create or replace function public.can_approve(target_client_id uuid, target_request_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Reviewer / admin / owner with access to the client may approve.
  -- Department owners (e.g. finance for cost_profile) can be layered on later.
  select public.has_client_access(target_client_id)
    and public.get_org_role(
      (select organization_id from public.client_accounts where id = target_client_id)
    ) in ('owner', 'admin', 'reviewer');
$$;

-- ---------------------------------------------------------------------------
-- Generic module permission — mirrors the TS permission matrix (spec §3.3)
-- module: client_profile | product_research | supplier_sample | economics |
--         listing | ppc | inventory_logistics | customer_response | tasks |
--         approvals | reports | audit_log
-- action: create | read | update | delete
-- The effective permission is the intersection of: system role, department,
-- assigned client scope (checked via has_client_access) and data type.
-- ---------------------------------------------------------------------------
create or replace function public.has_module_permission(
  target_client_id uuid,
  module text,
  action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_id uuid;
  user_role text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select organization_id into org_id from public.client_accounts
    where id = target_client_id and deleted_at is null;
  if org_id is null then
    return false;
  end if;

  user_role := public.get_org_role(org_id);
  if user_role is null then
    return false;
  end if;

  -- Admin & owner have full access everywhere
  if user_role in ('owner', 'admin') then
    return true;
  end if;

  if not public.has_client_access(target_client_id) then
    return false;
  end if;

  return case module
    -- Client profile: everyone with client scope can read; changes via admin.
    when 'client_profile' then action = 'read'

    -- Product research: CUD research/AM; U sourcing; R content/ppc/inventory/
    -- finance/reviewer/viewer; CS has no access.
    when 'product_research' then
      (user_role in ('account_manager', 'product_research') and action in ('create', 'read', 'update', 'delete'))
      or (user_role = 'sourcing' and action in ('read', 'update'))
      or (user_role in ('content_seo', 'ppc_operator', 'inventory_logistics', 'finance', 'reviewer', 'viewer') and action = 'read')

    -- Supplier & sample: CUD sourcing; RU AM/research; R finance/inventory/
    -- reviewer/viewer.
    when 'supplier_sample' then
      (user_role = 'sourcing' and action in ('create', 'read', 'update', 'delete'))
      or (user_role in ('account_manager', 'product_research') and action in ('read', 'update'))
      or (user_role in ('finance', 'inventory_logistics', 'reviewer', 'viewer') and action = 'read')

    -- Economics: CUD finance; RU research/sourcing; R AM/inventory/reviewer/viewer.
    when 'economics' then
      (user_role = 'finance' and action in ('create', 'read', 'update', 'delete'))
      or (user_role in ('product_research', 'sourcing') and action in ('read', 'update'))
      or (user_role in ('account_manager', 'inventory_logistics', 'reviewer', 'viewer') and action = 'read')

    -- Listing: CUD content; U AM; R research/ppc/inventory/reviewer/viewer.
    when 'listing' then
      (user_role = 'content_seo' and action in ('create', 'read', 'update', 'delete'))
      or (user_role = 'account_manager' and action in ('read', 'update'))
      or (user_role in ('product_research', 'ppc_operator', 'inventory_logistics', 'reviewer', 'viewer') and action = 'read')

    -- PPC: CUD ppc_operator; U AM; R research/inventory/finance/reviewer/viewer.
    when 'ppc' then
      (user_role = 'ppc_operator' and action in ('create', 'read', 'update', 'delete'))
      or (user_role = 'account_manager' and action in ('read', 'update'))
      or (user_role in ('product_research', 'inventory_logistics', 'finance', 'reviewer', 'viewer') and action = 'read')

    -- Inventory: CUD inventory; U AM; R sourcing/ppc/finance/reviewer/viewer.
    when 'inventory_logistics' then
      (user_role = 'inventory_logistics' and action in ('create', 'read', 'update', 'delete'))
      or (user_role = 'account_manager' and action in ('read', 'update'))
      or (user_role in ('sourcing', 'ppc_operator', 'finance', 'reviewer', 'viewer') and action = 'read')

    -- Customer response: CUD CS; U AM; R content/reviewer/viewer;
    -- research/sourcing/ppc/finance have no access (PII scoping, spec §3.4).
    when 'customer_response' then
      (user_role = 'customer_service' and action in ('create', 'read', 'update', 'delete'))
      or (user_role = 'account_manager' and action in ('read', 'update'))
      or (user_role in ('content_seo', 'reviewer', 'viewer') and action = 'read')

    -- Tasks: everyone can work tasks; viewer & reviewer are read/approve-only.
    when 'tasks' then
      (action = 'read')
      or (user_role not in ('viewer', 'reviewer') and action in ('create', 'update', 'delete'))

    -- Approvals: everyone (except viewer/reviewer) can request; decisions go
    -- through the separate can_approve policy.
    when 'approvals' then
      (action = 'read')
      or (action = 'create' and user_role not in ('viewer', 'reviewer'))

    -- Reports: finance builds; everyone reads.
    when 'reports' then
      (user_role = 'finance' and action in ('create', 'read', 'update', 'delete'))
      or (action = 'read')

    -- Audit log: readable by every role except viewer.
    when 'audit_log' then (action = 'read' and user_role <> 'viewer')

    else false
  end;
end;
$$;

-- Safe client-id extraction from storage object paths
-- ({organization_id}/{client_account_id}/{entity_id}/{filename}).
create or replace function public.storage_client_id(obj_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  parts text[];
  candidate text;
begin
  parts := string_to_array(obj_name, '/');
  if parts is null or array_length(parts, 1) < 2 then
    return null;
  end if;
  candidate := parts[2];
  if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return candidate::uuid;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every business table (spec §7.2)
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.client_accounts enable row level security;
alter table public.user_client_access enable row level security;
alter table public.product_opportunities enable row level security;
alter table public.research_sources enable row level security;
alter table public.competitor_products enable row level security;
alter table public.review_insights enable row level security;
alter table public.supplier_candidates enable row level security;
alter table public.risk_items enable row level security;
alter table public.products enable row level security;
alter table public.asins enable row level security;
alter table public.skus enable row level security;
alter table public.launch_projects enable row level security;
alter table public.listing_versions enable row level security;
alter table public.cost_profiles enable row level security;
alter table public.inventory_snapshots enable row level security;
alter table public.lead_time_configs enable row level security;
alter table public.shipments enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_metrics_daily enable row level security;
alter table public.customer_threads enable row level security;
alter table public.customer_messages enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.approval_requests enable row level security;
alter table public.recommendations enable row level security;
alter table public.ai_runs enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.audit_events enable row level security;
alter table public.job_runs enable row level security;
alter table public.platform_settings enable row level security;

-- ---------------------------------------------------------------------------
-- Identity & access
-- ---------------------------------------------------------------------------

-- Profiles: users can see themselves and colleagues in the same organization
create policy "profiles read same org" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.organization_members me
      join public.organization_members them on them.organization_id = me.organization_id
      where me.user_id = auth.uid()
        and me.status = 'active'
        and them.user_id = profiles.id
    )
  );

create policy "profiles self update" on public.profiles
  for update using (id = auth.uid());

create policy "organizations read for members" on public.organizations
  for select using (public.is_org_member(id));

create policy "organizations admin manage" on public.organizations
  for all using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy "org members read own org" on public.organization_members
  for select using (public.is_org_member(organization_id));

create policy "org members admin manage" on public.organization_members
  for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- Policy quoted verbatim from the spec:
create policy "members can read assigned client data" on public.client_accounts
  for select using (public.has_client_access(id));

create policy "org admins manage clients" on public.client_accounts
  for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy "user client access self read" on public.user_client_access
  for select using (
    user_id = auth.uid()
    or public.is_org_admin(
      (select organization_id from public.client_accounts c where c.id = user_client_access.client_account_id)
    )
  );

create policy "user client access admin manage" on public.user_client_access
  for all using (
    public.is_org_admin(
      (select organization_id from public.client_accounts c where c.id = user_client_access.client_account_id)
    )
  ) with check (
    public.is_org_admin(
      (select organization_id from public.client_accounts c where c.id = user_client_access.client_account_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Research & product (spec §3.3 matrix)
-- ---------------------------------------------------------------------------

create policy "research read by permission" on public.product_opportunities
  for select using (public.has_module_permission(client_account_id, 'product_research', 'read'));

create policy "research create by permission" on public.product_opportunities
  for insert with check (public.has_module_permission(client_account_id, 'product_research', 'create'));

create policy "research update by permission" on public.product_opportunities
  for update using (public.has_module_permission(client_account_id, 'product_research', 'update'));

create policy "research delete by permission" on public.product_opportunities
  for delete using (public.has_module_permission(client_account_id, 'product_research', 'delete'));

create policy "research sources read" on public.research_sources
  for select using (
    exists (
      select 1 from public.product_opportunities o
      where o.id = research_sources.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'read')
    )
  );

create policy "research sources write" on public.research_sources
  for insert with check (
    exists (
      select 1 from public.product_opportunities o
      where o.id = research_sources.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'create')
    )
  );

create policy "competitors read" on public.competitor_products
  for select using (
    exists (
      select 1 from public.product_opportunities o
      where o.id = competitor_products.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'read')
    )
  );

create policy "competitors write" on public.competitor_products
  for insert with check (
    exists (
      select 1 from public.product_opportunities o
      where o.id = competitor_products.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'create')
    )
  );

create policy "competitors delete" on public.competitor_products
  for delete using (
    exists (
      select 1 from public.product_opportunities o
      where o.id = competitor_products.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'delete')
    )
  );

create policy "review insights read" on public.review_insights
  for select using (
    exists (
      select 1 from public.product_opportunities o
      where o.id = review_insights.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'read')
    )
  );

create policy "review insights write" on public.review_insights
  for insert with check (
    exists (
      select 1 from public.product_opportunities o
      where o.id = review_insights.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'create')
    )
  );

create policy "suppliers read" on public.supplier_candidates
  for select using (
    exists (
      select 1 from public.product_opportunities o
      where o.id = supplier_candidates.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'supplier_sample', 'read')
    )
  );

create policy "suppliers write" on public.supplier_candidates
  for all using (
    exists (
      select 1 from public.product_opportunities o
      where o.id = supplier_candidates.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'supplier_sample', 'update')
    )
  ) with check (
    exists (
      select 1 from public.product_opportunities o
      where o.id = supplier_candidates.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'supplier_sample', 'update')
    )
  );

create policy "risk items read" on public.risk_items
  for select using (
    exists (
      select 1 from public.product_opportunities o
      where o.id = risk_items.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'read')
    )
  );

create policy "risk items write" on public.risk_items
  for all using (
    exists (
      select 1 from public.product_opportunities o
      where o.id = risk_items.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'update')
    )
  ) with check (
    exists (
      select 1 from public.product_opportunities o
      where o.id = risk_items.product_opportunity_id
        and public.has_module_permission(o.client_account_id, 'product_research', 'update')
    )
  );

-- ---------------------------------------------------------------------------
-- Catalog & operations
-- ---------------------------------------------------------------------------

create policy "products read" on public.products
  for select using (public.has_module_permission(client_account_id, 'product_research', 'read'));

create policy "products write" on public.products
  for insert with check (
    public.has_module_permission(client_account_id, 'product_research', 'create')
  );

create policy "products update" on public.products
  for update using (
    public.has_module_permission(client_account_id, 'product_research', 'update')
  );

create policy "asins read" on public.asins
  for select using (
    exists (
      select 1 from public.products p
      where p.id = asins.product_id
        and public.has_module_permission(p.client_account_id, 'product_research', 'read')
    )
  );

create policy "skus read" on public.skus
  for select using (
    exists (
      select 1 from public.asins a
      join public.products p on p.id = a.product_id
      where a.id = skus.asin_id
        and public.has_module_permission(p.client_account_id, 'product_research', 'read')
    )
  );

create policy "launch projects read" on public.launch_projects
  for select using (public.has_module_permission(client_account_id, 'listing', 'read'));

create policy "launch projects write" on public.launch_projects
  for all using (public.has_module_permission(client_account_id, 'listing', 'update'))
  with check (public.has_module_permission(client_account_id, 'listing', 'update'));

create policy "listing versions read" on public.listing_versions
  for select using (
    exists (
      select 1 from public.asins a
      join public.products p on p.id = a.product_id
      where a.id = listing_versions.asin_id
        and public.has_module_permission(p.client_account_id, 'listing', 'read')
    )
  );

create policy "listing versions write" on public.listing_versions
  for all using (
    exists (
      select 1 from public.asins a
      join public.products p on p.id = a.product_id
      where a.id = listing_versions.asin_id
        and public.has_module_permission(p.client_account_id, 'listing', 'update')
    )
  ) with check (
    exists (
      select 1 from public.asins a
      join public.products p on p.id = a.product_id
      where a.id = listing_versions.asin_id
        and public.has_module_permission(p.client_account_id, 'listing', 'update')
    )
  );

-- Finance data: restricted to finance, admin, owner, reviewer (spec §3.4)
create policy "cost profiles restricted read" on public.cost_profiles
  for select using (
    exists (
      select 1
      from public.skus s
      join public.asins a on a.id = s.asin_id
      join public.products p on p.id = a.product_id
      join public.client_accounts c on c.id = p.client_account_id
      where s.id = cost_profiles.sku_id
        and public.has_client_access(c.id)
        and public.get_org_role(c.organization_id) in ('owner', 'admin', 'finance', 'reviewer')
    )
  );

create policy "cost profiles finance write" on public.cost_profiles
  for all using (
    public.has_module_permission(
      (select p.client_account_id
         from public.skus s
         join public.asins a on a.id = s.asin_id
         join public.products p on p.id = a.product_id
         where s.id = cost_profiles.sku_id),
      'economics', 'update')
  ) with check (
    public.has_module_permission(
      (select p.client_account_id
         from public.skus s
         join public.asins a on a.id = s.asin_id
         join public.products p on p.id = a.product_id
         where s.id = cost_profiles.sku_id),
      'economics', 'update')
  );

create policy "inventory read" on public.inventory_snapshots
  for select using (
    exists (
      select 1 from public.skus s
      join public.asins a on a.id = s.asin_id
      join public.products p on p.id = a.product_id
      where s.id = inventory_snapshots.sku_id
        and public.has_module_permission(p.client_account_id, 'inventory_logistics', 'read')
    )
  );

create policy "inventory write" on public.inventory_snapshots
  for insert with check (
    exists (
      select 1 from public.skus s
      join public.asins a on a.id = s.asin_id
      join public.products p on p.id = a.product_id
      where s.id = inventory_snapshots.sku_id
        and public.has_module_permission(p.client_account_id, 'inventory_logistics', 'create')
    )
  );

create policy "lead times read" on public.lead_time_configs
  for select using (
    exists (
      select 1 from public.skus s
      join public.asins a on a.id = s.asin_id
      join public.products p on p.id = a.product_id
      where s.id = lead_time_configs.sku_id
        and public.has_module_permission(p.client_account_id, 'inventory_logistics', 'read')
    )
  );

create policy "lead times write" on public.lead_time_configs
  for all using (
    exists (
      select 1 from public.skus s
      join public.asins a on a.id = s.asin_id
      join public.products p on p.id = a.product_id
      where s.id = lead_time_configs.sku_id
        and public.has_module_permission(p.client_account_id, 'inventory_logistics', 'update')
    )
  ) with check (
    exists (
      select 1 from public.skus s
      join public.asins a on a.id = s.asin_id
      join public.products p on p.id = a.product_id
      where s.id = lead_time_configs.sku_id
        and public.has_module_permission(p.client_account_id, 'inventory_logistics', 'update')
    )
  );

create policy "shipments read" on public.shipments
  for select using (public.has_module_permission(client_account_id, 'inventory_logistics', 'read'));

create policy "shipments write" on public.shipments
  for all using (public.has_module_permission(client_account_id, 'inventory_logistics', 'update'))
  with check (public.has_module_permission(client_account_id, 'inventory_logistics', 'update'));

-- ---------------------------------------------------------------------------
-- PPC & customer service
-- ---------------------------------------------------------------------------

create policy "campaigns read" on public.ad_campaigns
  for select using (public.has_module_permission(client_account_id, 'ppc', 'read'));

create policy "campaigns write" on public.ad_campaigns
  for all using (public.has_module_permission(client_account_id, 'ppc', 'update'))
  with check (public.has_module_permission(client_account_id, 'ppc', 'update'));

create policy "ad metrics read" on public.ad_metrics_daily
  for select using (
    exists (
      select 1 from public.ad_campaigns c
      where c.id = ad_metrics_daily.campaign_id
        and public.has_module_permission(c.client_account_id, 'ppc', 'read')
    )
  );

create policy "ad metrics write" on public.ad_metrics_daily
  for insert with check (
    exists (
      select 1 from public.ad_campaigns c
      where c.id = ad_metrics_daily.campaign_id
        and public.has_module_permission(c.client_account_id, 'ppc', 'create')
    )
  );

-- PII-adjacent data: restricted roles only (spec §3.4)
create policy "threads read" on public.customer_threads
  for select using (public.has_module_permission(client_account_id, 'customer_response', 'read'));

create policy "threads write" on public.customer_threads
  for all using (public.has_module_permission(client_account_id, 'customer_response', 'update'))
  with check (public.has_module_permission(client_account_id, 'customer_response', 'update'));

create policy "messages read" on public.customer_messages
  for select using (
    exists (
      select 1 from public.customer_threads t
      where t.id = customer_messages.thread_id
        and public.has_module_permission(t.client_account_id, 'customer_response', 'read')
    )
  );

create policy "messages write" on public.customer_messages
  for all using (
    exists (
      select 1 from public.customer_threads t
      where t.id = customer_messages.thread_id
        and public.has_module_permission(t.client_account_id, 'customer_response', 'update')
    )
  ) with check (
    exists (
      select 1 from public.customer_threads t
      where t.id = customer_messages.thread_id
        and public.has_module_permission(t.client_account_id, 'customer_response', 'update')
    )
  );

-- ---------------------------------------------------------------------------
-- Workflow, AI & audit
-- ---------------------------------------------------------------------------

create policy "tasks read" on public.tasks
  for select using (public.has_module_permission(client_account_id, 'tasks', 'read'));

create policy "tasks write" on public.tasks
  for all using (
    public.has_module_permission(client_account_id, 'tasks', 'update')
    and public.has_module_permission(client_account_id, 'tasks', 'create')
  ) with check (
    public.has_module_permission(client_account_id, 'tasks', 'update')
    and public.has_module_permission(client_account_id, 'tasks', 'create')
  );

create policy "task comments read" on public.task_comments
  for select using (
    exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and public.has_module_permission(t.client_account_id, 'tasks', 'read')
    )
  );

create policy "task comments write" on public.task_comments
  for insert with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and public.has_module_permission(t.client_account_id, 'tasks', 'update')
    )
  );

create policy "approvals read" on public.approval_requests
  for select using (public.has_module_permission(client_account_id, 'approvals', 'read'));

create policy "approvals create" on public.approval_requests
  for insert with check (public.has_module_permission(client_account_id, 'approvals', 'create'));

create policy "approvals decide" on public.approval_requests
  for update using (public.can_approve(client_account_id, request_type));

create policy "recommendations read" on public.recommendations
  for select using (public.has_module_permission(client_account_id, 'ppc', 'read'));

create policy "recommendations decide" on public.recommendations
  for update using (
    public.can_approve(client_account_id, 'ppc_action')
    or public.has_module_permission(client_account_id, 'ppc', 'update')
  );

create policy "ai runs read" on public.ai_runs
  for select using (public.has_client_access(client_account_id));

create policy "ai runs write" on public.ai_runs
  for insert with check (public.has_client_access(client_account_id));

create policy "source snapshots read" on public.source_snapshots
  for select using (public.has_client_access(client_account_id));

create policy "source snapshots write" on public.source_snapshots
  for insert with check (public.has_client_access(client_account_id));

-- Audit log: readable by every role except viewer; append-only via trigger.
create policy "audit events read non viewer" on public.audit_events
  for select using (
    (client_account_id is null or public.has_client_access(client_account_id))
    and public.get_org_role(
      coalesce(
        (select organization_id from public.client_accounts where id = audit_events.client_account_id),
        organization_id
      )
    ) in ('owner', 'admin', 'account_manager', 'product_research', 'sourcing',
          'content_seo', 'ppc_operator', 'inventory_logistics',
          'customer_service', 'finance', 'reviewer')
  );

create policy "job runs read" on public.job_runs
  for select using (public.is_org_admin(
    (select organization_id from public.client_accounts where id = job_runs.client_account_id)));

create policy "job runs write" on public.job_runs
  for all using (public.is_org_admin(
    (select organization_id from public.client_accounts where id = job_runs.client_account_id)))
  with check (public.is_org_admin(
    (select organization_id from public.client_accounts where id = job_runs.client_account_id)));

create policy "settings read" on public.platform_settings
  for select using (public.is_org_member(organization_id));

create policy "settings admin write" on public.platform_settings
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
