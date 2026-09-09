-- ============================================================================
-- 0001_schema.sql — Amazon Internal Operations Platform
-- Identity, access, research, catalog, operations, PPC, CS, workflow, AI, audit
-- Spec: §6 Cấu trúc cơ sở dữ liệu Supabase
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- §6.2 Identity & access
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in (
    'owner', 'admin', 'account_manager', 'product_research', 'sourcing',
    'content_seo', 'ppc_operator', 'inventory_logistics', 'customer_service',
    'finance', 'reviewer', 'viewer'
  )),
  department text not null check (department in (
    'research', 'sourcing', 'content', 'ppc', 'inventory',
    'customer_service', 'finance', 'management'
  )),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  business_name text,
  primary_contact jsonb,
  marketplace text not null default 'US',
  status text not null default 'onboarding' check (status in ('onboarding', 'active', 'paused', 'closed')),
  owner_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.user_client_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  access_level text not null check (access_level in ('full', 'department', 'read_only')),
  allowed_departments text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, client_account_id)
);

-- ---------------------------------------------------------------------------
-- §6.3 Research & product
-- ---------------------------------------------------------------------------

create table public.product_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  name text not null,
  category text,
  marketplace text not null default 'US',
  target_price numeric(12, 2),
  stage text not null default 'idea' check (stage in (
    'idea', 'screening', 'researching', 'supplier_validation', 'economics_review',
    'risk_review', 'pending_decision', 'go', 'go_with_conditions',
    'need_more_evidence', 'no_go', 'archived'
  )),
  decision text check (decision in (
    'go', 'go_with_conditions', 'need_more_evidence', 'no_go'
  )),
  decision_reason text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  evidence_completeness numeric(5, 2) not null default 0,
  opportunity_score numeric(5, 2),
  score_version text,
  owner_user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  product_opportunity_id uuid not null references public.product_opportunities (id) on delete cascade,
  source_type text not null check (source_type in ('file', 'url', 'manual', 'report_export')),
  provider_name text not null check (provider_name in (
    'amazon', 'helium_10', 'jungle_scout', 'keepa', 'data_dive',
    'sellersprite', 'google_trends', 'manual', 'other'
  )),
  source_url text,
  captured_at timestamptz not null default now(),
  uploaded_by uuid not null references public.profiles (id),
  file_path text,
  file_name text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.competitor_products (
  id uuid primary key default gen_random_uuid(),
  product_opportunity_id uuid not null references public.product_opportunities (id) on delete cascade,
  asin text,
  title text not null,
  brand text,
  price numeric(12, 2),
  rating numeric(3, 2),
  review_count integer,
  bsr integer,
  monthly_sales integer,      -- provider ESTIMATE, never actual sales
  monthly_revenue numeric(14, 2), -- provider ESTIMATE
  data_source_id uuid references public.research_sources (id) on delete set null,
  observed_at timestamptz not null default now()
);

create table public.review_insights (
  id uuid primary key default gen_random_uuid(),
  product_opportunity_id uuid not null references public.product_opportunities (id) on delete cascade,
  source_id uuid references public.research_sources (id) on delete set null,
  theme text not null,
  sentiment text not null check (sentiment in ('positive', 'negative', 'mixed', 'neutral')),
  frequency integer not null default 0,
  evidence_count integer not null default 0,
  examples jsonb not null default '[]'::jsonb,
  ai_confidence text not null check (ai_confidence in ('high', 'medium', 'low')),
  created_at timestamptz not null default now()
);

create table public.supplier_candidates (
  id uuid primary key default gen_random_uuid(),
  product_opportunity_id uuid not null references public.product_opportunities (id) on delete cascade,
  supplier_name text not null,
  country text,
  contact_reference text,
  moq integer,
  quoted_cogs numeric(12, 2),
  lead_time_days integer,
  sample_status text not null default 'not_requested' check (sample_status in (
    'not_requested', 'requested', 'in_production', 'in_transit', 'received', 'approved', 'rejected'
  )),
  quality_status text not null default 'unknown' check (quality_status in ('unknown', 'pending', 'passed', 'failed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.risk_items (
  id uuid primary key default gen_random_uuid(),
  product_opportunity_id uuid not null references public.product_opportunities (id) on delete cascade,
  category text not null,
  description text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'mitigated', 'accepted', 'unknown')),
  mitigation text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- §6.4 Catalog & operations
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  product_opportunity_id uuid references public.product_opportunities (id) on delete set null,
  name text not null,
  brand text,
  category text,
  status text not null default 'draft' check (status in ('draft', 'active', 'discontinued')),
  launch_project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.asins (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  asin text not null,
  marketplace text not null default 'US',
  title text,
  status text not null default 'planned' check (status in ('planned', 'live', 'suppressed')),
  source_snapshot_id uuid,
  created_at timestamptz not null default now()
);

create table public.skus (
  id uuid primary key default gen_random_uuid(),
  asin_id uuid not null references public.asins (id) on delete cascade,
  sku text not null,
  fnsku text,
  supplier_id uuid references public.supplier_candidates (id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'active', 'inactive')),
  package_weight numeric(8, 3),
  package_length numeric(8, 2),
  package_width numeric(8, 2),
  package_height numeric(8, 2),
  created_at timestamptz not null default now()
);

create table public.launch_projects (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  stage text not null default 'created' check (stage in (
    'created', 'onboarding', 'listing_preparation', 'content_review',
    'inventory_preparation', 'ppc_preparation', 'ready_to_launch',
    'launching', 'stabilizing', 'scaling', 'paused', 'completed'
  )),
  target_launch_date date,
  actual_launch_date date,
  owner_user_id uuid not null references public.profiles (id),
  health_status text not null default 'on_track' check (health_status in ('on_track', 'at_risk', 'blocked')),
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.listing_versions (
  id uuid primary key default gen_random_uuid(),
  asin_id uuid not null references public.asins (id) on delete cascade,
  version_number integer not null,
  title text not null,
  bullets jsonb not null default '[]'::jsonb,
  description text not null default '',
  backend_terms jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  images jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in (
    'draft', 'internal_review', 'client_review', 'approved', 'ready_to_publish',
    'published', 'post_launch_review', 'rejected'
  )),
  change_reason text,
  created_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.cost_profiles (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id) on delete cascade,
  marketplace text not null default 'US',
  currency text not null default 'USD',
  selling_price numeric(12, 2) not null,
  cogs numeric(12, 2) not null default 0,
  freight numeric(12, 2) not null default 0,
  duty numeric(12, 2) not null default 0,
  fba_fee numeric(12, 2),
  referral_fee numeric(12, 2),
  storage_cost numeric(12, 2) not null default 0,
  ad_allowance numeric(12, 2) not null default 0,
  return_allowance numeric(12, 2) not null default 0,
  promotion_allowance numeric(12, 2) not null default 0,
  other_variable_cost numeric(12, 2) not null default 0,
  packaging numeric(12, 2) not null default 0,
  inspection numeric(12, 2) not null default 0,
  third_party_logistics numeric(12, 2) not null default 0,
  fx_rate numeric(10, 4) not null default 1,
  scenario text not null default 'base' check (scenario in ('base', 'conservative', 'aggressive')),
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'locked')),
  approved_by uuid references public.profiles (id) on delete set null,
  formula_version text not null default 'v1',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id) on delete cascade,
  snapshot_date date not null,
  sellable_units integer not null default 0,
  reserved_units integer not null default 0,
  inbound_units integer not null default 0,
  unfulfillable_units integer not null default 0,
  units_sold integer not null default 0,
  observation_days integer not null default 30,
  average_daily_sales numeric(10, 2), -- derived by metrics engine
  days_of_supply numeric(10, 2),      -- derived by metrics engine
  source_snapshot_id uuid,
  created_at timestamptz not null default now()
);

create table public.lead_time_configs (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id) on delete cascade,
  production_lead_time_days integer not null default 30,
  freight_lead_time_days integer not null default 35,
  customs_buffer_days integer not null default 5,
  safety_stock_units integer not null default 0,
  reorder_quantity integer not null default 0,
  route text not null default 'VN → US (sea)',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  shipment_reference text not null,
  origin text,
  destination text,
  sku_lines jsonb not null default '[]'::jsonb,
  quantity integer not null default 0,
  ship_date date,
  eta date,
  status text not null default 'planned' check (status in (
    'planned', 'booked', 'in_transit', 'customs', 'arrived', 'checked_in', 'cancelled'
  )),
  freight_cost numeric(12, 2),
  tracking_reference text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- §6.5 PPC & customer service
-- ---------------------------------------------------------------------------

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  amazon_account_id text,
  marketplace text not null default 'US',
  campaign_id text not null,
  name text not null,
  campaign_type text not null check (campaign_type in ('sponsored_products', 'sponsored_brands', 'sponsored_display')),
  daily_budget numeric(12, 2) not null default 0,
  status text not null default 'enabled' check (status in ('enabled', 'paused', 'archived')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ad_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  metric_date date not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  spend numeric(12, 2) not null default 0,
  orders integer not null default 0,
  sales numeric(14, 2) not null default 0,
  ctr numeric(8, 5),   -- derived
  cvr numeric(8, 5),   -- derived
  acos numeric(8, 5),  -- derived
  tacos numeric(8, 5), -- derived
  source_report_id text,
  created_at timestamptz not null default now(),
  unique (campaign_id, metric_date)
);

create table public.customer_threads (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  marketplace text not null default 'US',
  external_thread_id text,
  customer_reference text not null, -- anonymized, no raw PII
  subject text,
  status text not null default 'open' check (status in ('open', 'pending_response', 'awaiting_customer', 'closed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assigned_to uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.customer_threads (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_text text not null,
  intent text check (intent in (
    'product_question', 'shipping_issue', 'return_refund', 'defect_complaint',
    'review_request', 'account_issue', 'other'
  )),
  urgency text check (urgency in ('low', 'medium', 'high', 'urgent')),
  ai_summary text,
  reply_draft text,
  policy_risk_level text check (policy_risk_level in ('none', 'low', 'medium', 'high')),
  policy_risk_notes jsonb,
  status text not null default 'new' check (status in ('new', 'drafting', 'pending_approval', 'approved', 'sent', 'skipped')),
  source_snapshot_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- §6.6 Workflow, AI & audit
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  title text not null,
  description text,
  department text check (department in (
    'research', 'sourcing', 'content', 'ppc', 'inventory',
    'customer_service', 'finance', 'management'
  )),
  assignee_id uuid references public.profiles (id) on delete set null,
  reviewer_id uuid references public.profiles (id) on delete set null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'backlog' check (status in (
    'backlog', 'assigned', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled'
  )),
  due_at timestamptz,
  source_type text,
  source_id uuid,
  attachments jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  request_type text not null check (request_type in (
    'product_decision', 'cost_profile', 'listing_publish', 'ppc_action',
    'inventory_reorder', 'customer_response', 'external_data_export'
  )),
  entity_type text not null,
  entity_id uuid not null,
  title text not null default '',
  payload_snapshot jsonb not null default '{}'::jsonb,
  requested_by uuid not null references public.profiles (id),
  reviewed_by uuid references public.profiles (id) on delete set null,
  decision text default 'pending' check (decision in ('pending', 'approved', 'rejected', 'expired')),
  decision_reason text,
  expires_at timestamptz,
  execution_status text not null default 'not_started' check (execution_status in (
    'not_started', 'executed', 'failed', 'partially_executed', 'rolled_back'
  )),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  module text not null check (module in ('ppc', 'inventory', 'listing', 'pricing', 'research')),
  recommendation_type text not null,
  title text not null,
  explanation text not null default '',
  evidence_ids jsonb not null default '[]'::jsonb,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  impact text not null check (impact in ('high', 'medium', 'low')),
  proposed_action jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  status text not null default 'detected' check (status in (
    'detected', 'analysis_ready', 'pending_review', 'approved', 'rejected',
    'scheduled', 'executed', 'partially_executed', 'failed', 'rolled_back', 'expired'
  )),
  model_version text not null default 'rules-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  use_case text not null,
  model_name text not null,
  prompt_version text not null,
  input_record_ids jsonb not null default '[]'::jsonb,
  output_json jsonb,
  token_usage jsonb,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'insufficient_evidence')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts (id) on delete cascade,
  source_type text not null,
  source_name text not null,
  external_reference text,
  raw_payload jsonb,
  captured_at timestamptz not null default now(),
  content_hash text,
  retention_until timestamptz,
  uploaded_by uuid references public.profiles (id) on delete set null
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  client_account_id uuid references public.client_accounts (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in (
    'import', 'ai_analysis', 'metrics_recalculation', 'api_sync',
    'report_generation', 'notification'
  )),
  client_account_id uuid references public.client_accounts (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  retry_count integer not null default 0,
  idempotency_key text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Platform settings (thresholds configurable by admin — spec §5.6 Guardrail)
create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

-- ---------------------------------------------------------------------------
-- Indexes for common access paths
-- ---------------------------------------------------------------------------

create index idx_org_members_user on public.organization_members (user_id);
create index idx_client_accounts_org on public.client_accounts (organization_id);
create index idx_user_client_access_client on public.user_client_access (client_account_id);
create index idx_opportunities_client on public.product_opportunities (client_account_id);
create index idx_opportunities_stage on public.product_opportunities (stage);
create index idx_research_sources_opportunity on public.research_sources (product_opportunity_id);
create index idx_competitors_opportunity on public.competitor_products (product_opportunity_id);
create index idx_review_insights_opportunity on public.review_insights (product_opportunity_id);
create index idx_suppliers_opportunity on public.supplier_candidates (product_opportunity_id);
create index idx_risks_opportunity on public.risk_items (product_opportunity_id);
create index idx_products_client on public.products (client_account_id);
create index idx_asins_product on public.asins (product_id);
create index idx_skus_asin on public.skus (asin_id);
create index idx_launch_projects_client on public.launch_projects (client_account_id);
create index idx_listing_versions_asin on public.listing_versions (asin_id, version_number desc);
create index idx_cost_profiles_sku on public.cost_profiles (sku_id);
create index idx_inventory_snapshots_sku on public.inventory_snapshots (sku_id, snapshot_date desc);
create index idx_lead_times_sku on public.lead_time_configs (sku_id);
create index idx_shipments_client on public.shipments (client_account_id);
create index idx_ad_campaigns_client on public.ad_campaigns (client_account_id);
create index idx_ad_metrics_campaign on public.ad_metrics_daily (campaign_id, metric_date desc);
create index idx_customer_threads_client on public.customer_threads (client_account_id, status);
create index idx_customer_messages_thread on public.customer_messages (thread_id);
create index idx_tasks_client on public.tasks (client_account_id, status);
create index idx_tasks_assignee on public.tasks (assignee_id, status);
create index idx_approval_requests_client on public.approval_requests (client_account_id, decision);
create index idx_recommendations_client on public.recommendations (client_account_id, status);
create index idx_ai_runs_client on public.ai_runs (client_account_id, created_at desc);
create index idx_audit_events_entity on public.audit_events (entity_type, entity_id);
create index idx_audit_events_client on public.audit_events (client_account_id, created_at desc);
create index idx_job_runs_type on public.job_runs (job_type, status);
