-- ============================================================================
-- 0003_functions_triggers.sql — updated_at, profile bootstrap, audit trail
-- ============================================================================

-- updated_at maintenance -----------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'client_accounts', 'product_opportunities',
    'supplier_candidates', 'products', 'launch_projects', 'cost_profiles',
    'lead_time_configs', 'tasks', 'recommendations'
  ]
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- Auto-create a profile whenever an auth user is created ----------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generic audit trigger (spec §5.9, §6.6) -------------------------------------
-- Writes before/after snapshots for sensitive mutations. Rows are inserted by
-- the SECURITY DEFINER trigger, so the audit trail cannot be forged or
-- deleted from the browser. NEW is only referenced for INSERT/UPDATE.
--
-- client_account_id resolution is table-aware: many tables carry the column
-- directly; others reach it through their parent (sku → asin → product,
-- asin → product, message → thread).

create or replace function public.audit_entity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after jsonb;
  v_before jsonb;
  v_entity uuid;
  v_client uuid;
  v_org uuid;
begin
  if tg_op <> 'DELETE' then
    v_after := to_jsonb(new);
  end if;
  if tg_op <> 'INSERT' then
    v_before := to_jsonb(old);
  end if;

  v_entity := coalesce(
    (v_after ->> 'id')::uuid,
    (v_before ->> 'id')::uuid
  );

  v_client := case tg_table_name
    when 'product_opportunities' then (v_after ->> 'client_account_id')::uuid
    when 'launch_projects' then (v_after ->> 'client_account_id')::uuid
    when 'ad_campaigns' then (v_after ->> 'client_account_id')::uuid
    when 'approval_requests' then (v_after ->> 'client_account_id')::uuid
    when 'cost_profiles' then (
      select p.client_account_id from public.skus s
      join public.asins a on a.id = s.asin_id
      join public.products p on p.id = a.product_id
      where s.id = (v_after ->> 'sku_id')::uuid)
    when 'listing_versions' then (
      select p.client_account_id from public.asins a
      join public.products p on p.id = a.product_id
      where a.id = (v_after ->> 'asin_id')::uuid)
    when 'inventory_snapshots' then (
      select p.client_account_id from public.skus s
      join public.asins a on a.id = s.asin_id
      join public.products p on p.id = a.product_id
      where s.id = (v_after ->> 'sku_id')::uuid)
    when 'customer_messages' then (
      select t.client_account_id from public.customer_threads t
      where t.id = (v_after ->> 'thread_id')::uuid)
    else null
  end;

  if v_client is not null then
    select organization_id into v_org from public.client_accounts
      where id = v_client;
  end if;

  insert into public.audit_events (
    organization_id, client_account_id, actor_user_id, action,
    entity_type, entity_id, before_json, after_json
  ) values (
    v_org, v_client, auth.uid(), lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_name, v_entity, v_before, v_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Apply audit trail to sensitive business tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'product_opportunities', 'cost_profiles', 'listing_versions',
    'approval_requests', 'customer_messages', 'inventory_snapshots',
    'ad_campaigns', 'launch_projects'
  ]
  loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on public.%1$s
       for each row execute function public.audit_entity_change()', t);
  end loop;
end;
$$;

-- Metrics engine: derive ad metrics ratios on write ---------------------------

create or replace function public.compute_ad_metrics()
returns trigger
language plpgsql
as $$
begin
  new.ctr  := case when new.impressions > 0
                 then round((new.clicks::numeric / new.impressions)::numeric, 5) end;
  new.cvr  := case when new.clicks > 0
                 then round((new.orders::numeric / new.clicks)::numeric, 5) end;
  new.acos := case when new.sales > 0
                 then round((new.spend / new.sales)::numeric, 5) end;
  -- TACOS needs account-level sales; left null here — computed by the
  -- metrics recalculation job which has full context.
  return new;
end;
$$;

drop trigger if exists trg_ad_metrics_compute on public.ad_metrics_daily;
create trigger trg_ad_metrics_compute
  before insert or update on public.ad_metrics_daily
  for each row execute function public.compute_ad_metrics();

-- Late circular FK: products.launch_project_id → launch_projects
alter table public.products
  drop constraint if exists fk_products_launch_project;
alter table public.products
  add constraint fk_products_launch_project
  foreign key (launch_project_id) references public.launch_projects (id)
  on delete set null;
