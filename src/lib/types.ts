/**
 * Domain types — mirrors the Supabase schema and the product spec (v1.0).
 *
 * Conventions (spec §6.1):
 *  - UUID primary keys.
 *  - Business tables carry organization_id and/or client_account_id.
 *  - created_at / updated_at / created_by / updated_by where relevant.
 *  - Soft delete via deleted_at for business entities.
 *  - JSONB for raw payload and AI output; normalized columns for anything
 *    that must be filtered or reported on.
 */

// ---------------------------------------------------------------------------
// Identity & access (spec §3, §6.2)
// ---------------------------------------------------------------------------

export type SystemRole =
  | "owner"
  | "admin"
  | "account_manager"
  | "product_research"
  | "sourcing"
  | "content_seo"
  | "ppc_operator"
  | "inventory_logistics"
  | "customer_service"
  | "finance"
  | "reviewer"
  | "viewer";

export type Department =
  | "research"
  | "sourcing"
  | "content"
  | "ppc"
  | "inventory"
  | "customer_service"
  | "finance"
  | "management";

export interface Organization {
  id: string;
  name: string;
  status: "active" | "inactive";
  created_at: string;
}

export interface Profile {
  id: string; // FK auth.users in Supabase mode
  full_name: string;
  email: string;
  avatar_url: string | null;
  status: "active" | "inactive";
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: SystemRole;
  department: Department;
  status: "invited" | "active" | "suspended";
}

export interface ClientAccount {
  id: string;
  organization_id: string;
  name: string;
  business_name: string;
  primary_contact: {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  status: "onboarding" | "active" | "paused" | "closed";
  owner_user_id: string | null; // account manager
  marketplace: string; // primary marketplace e.g. "US"
  created_at: string;
  updated_at: string;
}

export interface UserClientAccess {
  user_id: string;
  client_account_id: string;
  access_level: "full" | "department" | "read_only";
  allowed_departments: Department[];
}

// ---------------------------------------------------------------------------
// Research (spec §6.3)
// ---------------------------------------------------------------------------

export type OpportunityStage =
  | "idea"
  | "screening"
  | "researching"
  | "supplier_validation"
  | "economics_review"
  | "risk_review"
  | "pending_decision"
  | "go"
  | "go_with_conditions"
  | "need_more_evidence"
  | "no_go"
  | "archived";

export type OpportunityDecision =
  | "go"
  | "go_with_conditions"
  | "need_more_evidence"
  | "no_go";

export interface ProductOpportunity {
  id: string;
  organization_id: string;
  client_account_id: string;
  name: string;
  category: string | null;
  marketplace: string;
  target_price: number | null;
  stage: OpportunityStage;
  decision: OpportunityDecision | null;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  evidence_completeness: number; // 0..100
  opportunity_score: number | null; // 0..100
  score_version: string | null;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ResearchProvider =
  | "amazon"
  | "helium_10"
  | "jungle_scout"
  | "keepa"
  | "data_dive"
  | "sellersprite"
  | "google_trends"
  | "manual"
  | "other";

export interface ResearchSource {
  id: string;
  product_opportunity_id: string;
  source_type: "file" | "url" | "manual" | "report_export";
  provider_name: ResearchProvider;
  source_url: string | null;
  captured_at: string; // when the data was captured at the provider
  uploaded_by: string;
  file_path: string | null; // storage path in supabase mode
  file_name: string | null;
  content_hash: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CompetitorProduct {
  id: string;
  product_opportunity_id: string;
  asin: string | null;
  title: string;
  brand: string | null;
  price: number | null;
  rating: number | null;
  review_count: number | null;
  bsr: number | null;
  monthly_sales: number | null; // provider estimate — never labeled as actual
  monthly_revenue: number | null; // provider estimate
  data_source_id: string | null;
  observed_at: string;
}

export type Sentiment = "positive" | "negative" | "mixed" | "neutral";

export interface ReviewInsight {
  id: string;
  product_opportunity_id: string;
  source_id: string | null;
  theme: string;
  sentiment: Sentiment;
  frequency: number; // how many reviews mention it
  evidence_count: number;
  examples: string[];
  ai_confidence: "high" | "medium" | "low";
  created_at: string;
}

export type SampleStatus =
  | "not_requested"
  | "requested"
  | "in_production"
  | "in_transit"
  | "received"
  | "approved"
  | "rejected";

export interface SupplierCandidate {
  id: string;
  product_opportunity_id: string;
  supplier_name: string;
  country: string | null;
  contact_reference: string | null;
  moq: number | null;
  quoted_cogs: number | null;
  lead_time_days: number | null;
  sample_status: SampleStatus;
  quality_status: "unknown" | "pending" | "passed" | "failed";
  notes: string | null;
  created_at: string;
}

export type RiskSeverity = "low" | "medium" | "high" | "critical";
export type RiskStatus = "open" | "mitigated" | "accepted" | "unknown";

export interface RiskItem {
  id: string;
  product_opportunity_id: string;
  category: string; // e.g. "compliance", "seasonality", "competition"
  description: string;
  severity: RiskSeverity;
  status: RiskStatus;
  mitigation: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Catalog & operations (spec §6.4)
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  client_account_id: string;
  product_opportunity_id: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  status: "draft" | "active" | "discontinued";
  launch_project_id: string | null;
  created_at: string;
}

export interface Asin {
  id: string;
  product_id: string;
  asin: string;
  marketplace: string;
  title: string | null;
  status: "planned" | "live" | "suppressed";
  source_snapshot_id: string | null;
}

export interface Sku {
  id: string;
  asin_id: string;
  sku: string;
  fnsku: string | null;
  supplier_id: string | null;
  status: "planned" | "active" | "inactive";
  package_weight: number | null; // kg
  package_length: number | null; // cm
  package_width: number | null;
  package_height: number | null;
}

export type LaunchStage =
  | "created"
  | "onboarding"
  | "listing_preparation"
  | "content_review"
  | "inventory_preparation"
  | "ppc_preparation"
  | "ready_to_launch"
  | "launching"
  | "stabilizing"
  | "scaling"
  | "paused"
  | "completed";

export interface LaunchProject {
  id: string;
  client_account_id: string;
  product_id: string;
  stage: LaunchStage;
  target_launch_date: string | null;
  actual_launch_date: string | null;
  owner_user_id: string;
  health_status: "on_track" | "at_risk" | "blocked";
  checklist: LaunchChecklistItem[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LaunchChecklistItem {
  key: string;
  label: string;
  done: boolean;
  department: Department;
}

export type ListingVersionStatus =
  | "draft"
  | "internal_review"
  | "client_review"
  | "approved"
  | "ready_to_publish"
  | "published"
  | "post_launch_review"
  | "rejected";

export interface ListingVersion {
  id: string;
  asin_id: string;
  version_number: number;
  title: string;
  bullets: string[];
  description: string;
  backend_terms: string[];
  attributes: Record<string, unknown>;
  images: string[]; // storage paths
  status: ListingVersionStatus;
  change_reason: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export type CostProfileStatus = "draft" | "pending_approval" | "approved" | "locked";

export interface CostProfile {
  id: string;
  sku_id: string;
  marketplace: string;
  currency: string;
  // cost inputs — all per unit unless noted
  selling_price: number;
  cogs: number;
  freight: number;
  duty: number;
  fba_fee: number | null;
  referral_fee: number | null;
  storage_cost: number;
  ad_allowance: number;
  return_allowance: number;
  promotion_allowance: number;
  other_variable_cost: number;
  packaging: number;
  inspection: number;
  third_party_logistics: number;
  fx_rate: number; // quote currency → marketplace currency
  scenario: "base" | "conservative" | "aggressive";
  effective_from: string;
  effective_to: string | null;
  status: CostProfileStatus;
  approved_by: string | null;
  formula_version: string;
  created_by: string;
  created_at: string;
}

export interface InventorySnapshot {
  id: string;
  sku_id: string;
  snapshot_date: string;
  sellable_units: number;
  reserved_units: number;
  inbound_units: number;
  unfulfillable_units: number;
  units_sold: number; // in observation window
  observation_days: number;
  average_daily_sales: number | null; // derived
  days_of_supply: number | null; // derived
  source_snapshot_id: string | null;
  created_at: string;
}

export interface LeadTimeConfig {
  id: string;
  sku_id: string;
  production_lead_time_days: number;
  freight_lead_time_days: number;
  customs_buffer_days: number;
  safety_stock_units: number;
  reorder_quantity: number;
  route: string; // e.g. "VN → US (sea)"
  created_at: string;
}

export type ShipmentStatus =
  | "planned"
  | "booked"
  | "in_transit"
  | "customs"
  | "arrived"
  | "checked_in"
  | "cancelled";

export interface Shipment {
  id: string;
  client_account_id: string;
  shipment_reference: string;
  origin: string;
  destination: string;
  sku_lines: { sku_id: string; quantity: number }[];
  quantity: number;
  ship_date: string | null;
  eta: string | null;
  status: ShipmentStatus;
  freight_cost: number | null;
  tracking_reference: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// PPC & customer service (spec §6.5)
// ---------------------------------------------------------------------------

export interface AdCampaign {
  id: string;
  client_account_id: string;
  amazon_account_id: string | null;
  marketplace: string;
  campaign_id: string; // Amazon campaign id
  name: string;
  campaign_type: "sponsored_products" | "sponsored_brands" | "sponsored_display";
  daily_budget: number;
  status: "enabled" | "paused" | "archived";
  last_synced_at: string | null;
  created_at: string;
}

export interface AdMetricsDaily {
  id: string;
  campaign_id: string; // FK ad_campaigns.id
  metric_date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
  // derived, persisted for reporting
  ctr: number | null;
  cvr: number | null;
  acos: number | null;
  tacos: number | null;
  source_report_id: string | null;
}

export interface CustomerThread {
  id: string;
  client_account_id: string;
  marketplace: string;
  external_thread_id: string | null;
  customer_reference: string; // anonymized reference, no raw PII
  subject: string | null;
  status: "open" | "pending_response" | "awaiting_customer" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
}

export type MessageIntent =
  | "product_question"
  | "shipping_issue"
  | "return_refund"
  | "defect_complaint"
  | "review_request"
  | "account_issue"
  | "other";

export interface CustomerMessage {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  message_text: string;
  intent: MessageIntent | null;
  urgency: "low" | "medium" | "high" | "urgent" | null;
  ai_summary: string | null;
  reply_draft: string | null;
  policy_risk_level: "none" | "low" | "medium" | "high" | null;
  policy_risk_notes: string[] | null;
  status: "new" | "drafting" | "pending_approval" | "approved" | "sent" | "skipped";
  source_snapshot_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Workflow, AI & audit (spec §6.6)
// ---------------------------------------------------------------------------

export type TaskStatus =
  | "backlog"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "completed"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Task {
  id: string;
  client_account_id: string;
  title: string;
  description: string | null;
  department: Department | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  source_type: string | null; // e.g. "recommendation"
  source_id: string | null;
  attachments: { name: string; path: string }[];
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  comments: TaskComment[];
}

export type ApprovalRequestType =
  | "product_decision"
  | "cost_profile"
  | "listing_publish"
  | "ppc_action"
  | "inventory_reorder"
  | "customer_response"
  | "external_data_export";

export interface ApprovalRequest {
  id: string;
  client_account_id: string;
  request_type: ApprovalRequestType;
  entity_type: string;
  entity_id: string;
  title: string;
  payload_snapshot: Record<string, unknown>;
  requested_by: string;
  reviewed_by: string | null;
  decision: "pending" | "approved" | "rejected" | "expired" | null;
  decision_reason: string | null;
  expires_at: string | null;
  execution_status:
    | "not_started"
    | "executed"
    | "failed"
    | "partially_executed"
    | "rolled_back";
  created_at: string;
  decided_at: string | null;
}

export type RecommendationStatus =
  | "detected"
  | "analysis_ready"
  | "pending_review"
  | "approved"
  | "rejected"
  | "scheduled"
  | "executed"
  | "partially_executed"
  | "failed"
  | "rolled_back"
  | "expired";

export interface Recommendation {
  id: string;
  client_account_id: string;
  module: "ppc" | "inventory" | "listing" | "pricing" | "research";
  recommendation_type: string;
  title: string;
  explanation: string;
  evidence_ids: string[];
  confidence: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  proposed_action: Record<string, unknown>;
  guardrails: Record<string, unknown>;
  status: RecommendationStatus;
  model_version: string;
  created_at: string;
  updated_at: string;
}

export interface AiRun {
  id: string;
  client_account_id: string;
  use_case: string;
  model_name: string;
  prompt_version: string;
  input_record_ids: string[];
  output_json: Record<string, unknown> | null;
  token_usage: { prompt: number; completion: number } | null;
  status: "pending" | "succeeded" | "failed" | "insufficient_evidence";
  reviewed_by: string | null;
  created_at: string;
}

export interface SourceSnapshot {
  id: string;
  client_account_id: string;
  source_type: string;
  source_name: string;
  external_reference: string | null;
  raw_payload: Record<string, unknown> | null;
  captured_at: string;
  content_hash: string | null;
  retention_until: string | null;
  uploaded_by: string | null;
}

export interface AuditEvent {
  id: string;
  organization_id: string | null;
  client_account_id: string | null;
  actor_user_id: string | null;
  action: string; // e.g. "opportunity.decision_submitted"
  entity_type: string;
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  ip_hash: string | null;
  created_at: string;
}

export type JobType =
  | "import"
  | "ai_analysis"
  | "metrics_recalculation"
  | "api_sync"
  | "report_generation"
  | "notification";

export interface JobRun {
  id: string;
  job_type: JobType;
  client_account_id: string | null;
  status: "queued" | "running" | "succeeded" | "failed";
  retry_count: number;
  idempotency_key: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Derived view models (computed by the metrics engine, never by the LLM)
// ---------------------------------------------------------------------------

/** Evidence classification — every claim must state its provenance (spec §5.2). */
export type EvidenceType =
  | "observed"
  | "derived"
  | "ai_interpretation"
  | "assumption"
  | "verification_required";

export interface Finding {
  type: EvidenceType;
  claim: string;
  evidence_ids: string[];
  confidence: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  recommended_action: string;
}

export interface AiStructuredOutput {
  summary: string;
  findings: Finding[];
  missing_data: string[];
  risks: string[];
  next_actions: string[];
}

export interface EconomicsResult {
  formulaVersion: string;
  currency: string;
  marketplace: string;
  inputs: EconomicsInputs;
  contributionProfitPerUnit: number | null;
  contributionMarginPct: number | null;
  contributionMarginBeforeAdPct: number | null;
  breakEvenAcosPct: number | null;
  status: "complete" | "incomplete";
  missingCosts: string[];
  derivedFrom: "observed" | "assumption";
}

export interface EconomicsInputs {
  sellingPrice: number;
  cogs: number;
  freight: number;
  duty: number;
  fbaFee: number | null;
  referralFee: number | null;
  storageCost: number;
  adAllowance: number;
  returnAllowance: number;
  promotionAllowance: number;
  otherVariableCost: number;
  packaging: number;
  inspection: number;
  thirdPartyLogistics: number;
}

export interface StockoutRisk {
  sku_id: string;
  sku: string;
  daysOfSupply: number | null;
  projectedStockoutDate: string | null;
  replenishmentDate: string | null;
  reorderPoint: number;
  reorderQuantity: number;
  severity: RiskSeverity;
  explanation: string;
}

export interface TodayCard {
  id: string;
  category:
    | "overdue_task"
    | "pending_approval"
    | "product_risk"
    | "listing_review"
    | "ppc_anomaly"
    | "stockout_risk"
    | "customer_message"
    | "data_freshness"
    | "opportunity";
  title: string;
  client_account_id: string;
  severity: RiskSeverity;
  owner_user_id: string | null;
  due_at: string | null;
  action_label: string;
  action_href: string;
  evidence_href: string | null;
  explanation: string;
  read: boolean;
}

export interface SessionUser {
  id: string;
  full_name: string;
  email: string;
  role: SystemRole;
  department: Department;
  organization_id: string;
  avatar_url: string | null;
}
