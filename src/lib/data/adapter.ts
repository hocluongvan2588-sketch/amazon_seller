/**
 * DataAdapter — the single data-access contract used by server components
 * and server actions (spec §10 "API và service contract nội bộ").
 *
 * Two implementations:
 *  - DemoAdapter   : in-memory store mirroring the SQL schema 1:1, enforces
 *                    the same permission matrix as the RLS policies.
 *  - SupabaseAdapter: talks to Supabase where RLS enforces security.
 *
 * Rule: the UI never touches a provider directly and never computes
 * financial metrics — every number comes from the domain engines through
 * this layer.
 */

import type {
  AdCampaign,
  AdMetricsDaily,
  AiRun,
  ApprovalRequest,
  Asin,
  AuditEvent,
  ClientAccount,
  CompetitorProduct,
  CostProfile,
  CustomerMessage,
  CustomerThread,
  Department,
  EconomicsInputs,
  InventorySnapshot,
  LaunchProject,
  LeadTimeConfig,
  ListingVersion,
  OrganizationMember,
  Product,
  ProductOpportunity,
  Profile,
  Recommendation,
  ResearchSource,
  ReviewInsight,
  RiskItem,
  Shipment,
  Sku,
  SupplierCandidate,
  SystemRole,
  Task,
  TaskPriority,
  TaskStatus,
  TodayCard,
  SessionUser,
} from "../types";
import type { InventoryComputed } from "../domain/inventory";
import type { OpportunityScore } from "../domain/scoring";
import type { AiStructuredOutput } from "../types";

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

export interface OpportunityDetail {
  opportunity: ProductOpportunity;
  sources: ResearchSource[];
  competitors: CompetitorProduct[];
  reviewInsights: ReviewInsight[];
  suppliers: SupplierCandidate[];
  risks: RiskItem[];
  economics: EconomicsInputs | null;
  score: OpportunityScore | null;
  client: ClientAccount | null;
  owner: Profile | null;
}

export interface LaunchDetail {
  launch: LaunchProject;
  product: Product | null;
  asin: Asin | null;
  skus: Sku[];
  tasks: Task[];
  opportunity: ProductOpportunity | null;
}

export interface ListingWithMeta {
  asin: Asin;
  product: Product | null;
  versions: ListingVersion[];
}

export interface InventoryRow extends InventoryComputed {
  snapshot: InventorySnapshot;
  leadTime: LeadTimeConfig | null;
  sku: Sku;
  asin: Asin;
  product: Product;
  inboundEta: string | null;
}

export interface CampaignWithMetrics {
  campaign: AdCampaign;
  metrics: AdMetricsDaily[];
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    orders: number;
    sales: number;
    ctr: number | null;
    cvr: number | null;
    acos: number | null;
  };
}

export interface ThreadDetail {
  thread: CustomerThread;
  messages: CustomerMessage[];
}

export interface KpiSnapshot {
  // internal ops KPIs (spec §13)
  tasksTotal: number;
  tasksOverdue: number;
  taskCompletionRate: number;
  approvalsPending: number;
  avgApprovalTurnaroundHours: number | null;
  dataFreshnessIssues: number;
  recommendationAcceptanceRate: number | null;
  // client KPIs
  avgContributionMarginPct: number | null;
  avgBreakEvenAcosPct: number | null;
  blendedAcos: number | null;
  blendedTacos: number | null;
  stockoutRiskCount: number;
}

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface NewClientInput {
  name: string;
  business_name?: string | null;
  marketplace?: string;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
}

export interface SkuCatalogItem {
  sku: Sku;
  asin: Asin;
  product: Product;
}

export interface NewOpportunityInput {
  client_account_id: string;
  name: string;
  category?: string | null;
  marketplace?: string;
  target_price?: number | null;
}

export interface NewCompetitorInput {
  product_opportunity_id: string;
  asin?: string | null;
  title: string;
  brand?: string | null;
  price?: number | null;
  rating?: number | null;
  review_count?: number | null;
  bsr?: number | null;
  monthly_sales?: number | null;
  monthly_revenue?: number | null;
}

export interface NewSourceInput {
  product_opportunity_id: string;
  source_type: ResearchSource["source_type"];
  provider_name: ResearchSource["provider_name"];
  source_url?: string | null;
  file_name?: string | null;
  captured_at?: string;
  metadata?: Record<string, unknown>;
}

export interface NewTaskInput {
  client_account_id: string;
  title: string;
  description?: string | null;
  department?: Department | null;
  assignee_id?: string | null;
  reviewer_id?: string | null;
  priority?: TaskPriority;
  due_at?: string | null;
  source_type?: string | null;
  source_id?: string | null;
}

export interface NewCostProfileInput extends EconomicsInputs {
  sku_id: string;
  marketplace?: string;
  currency?: string;
  scenario?: CostProfile["scenario"];
}

export interface NewListingVersionInput {
  asin_id: string;
  title: string;
  bullets: string[];
  description: string;
  backend_terms: string[];
  change_reason?: string | null;
}

export interface NewSnapshotInput {
  sku_id: string;
  snapshot_date: string;
  sellable_units: number;
  reserved_units?: number;
  inbound_units?: number;
  unfulfillable_units?: number;
  units_sold: number;
  observation_days?: number;
}

export interface NewLeadTimeInput {
  sku_id: string;
  production_lead_time_days: number;
  freight_lead_time_days: number;
  customs_buffer_days: number;
  safety_stock_units: number;
  reorder_quantity: number;
  route?: string;
}

export interface DecisionInput {
  decision: "go" | "go_with_conditions" | "need_more_evidence" | "no_go";
  reason: string;
}

// ---------------------------------------------------------------------------
// The adapter contract
// ---------------------------------------------------------------------------

export interface DataAdapter {
  readonly mode: "demo" | "supabase";

  // --- session & identity ---------------------------------------------------
  getSessionUser(): Promise<SessionUser | null>;
  listDemoUsers(): Promise<{ id: string; full_name: string; email: string; role: SystemRole }[]>;
  listMembers(): Promise<(OrganizationMember & { profile: Profile | null })[]>;
  listProfiles(): Promise<Profile[]>;

  // --- clients ---------------------------------------------------------------
  listClients(): Promise<ClientAccount[]>;
  getClient(id: string): Promise<ClientAccount | null>;
  createClient(input: NewClientInput, userId: string): Promise<ClientAccount>;

  // --- product research ------------------------------------------------------
  listOpportunities(clientId?: string): Promise<(ProductOpportunity & { client_name: string })[]>;
  getOpportunity(id: string): Promise<OpportunityDetail | null>;
  createOpportunity(input: NewOpportunityInput, userId: string): Promise<ProductOpportunity>;
  updateOpportunityStage(id: string, stage: ProductOpportunity["stage"]): Promise<void>;
  addSource(input: NewSourceInput, userId: string): Promise<ResearchSource>;
  addCompetitors(
    input: NewCompetitorInput[],
    userId: string
  ): Promise<CompetitorProduct[]>;
  /** Parse & import raw CSV/XLSX rows (H10/JS/SellerSprite shapes). */
  importCompetitorRows(
    rawRows: Record<string, string | number | null>[],
    opportunityId: string,
    userId: string
  ): Promise<{ imported: number; skipped: number }>;
  deleteCompetitor(id: string): Promise<void>;
  addSupplier(
    input: { product_opportunity_id: string; supplier_name: string; country?: string | null; moq?: number | null; quoted_cogs?: number | null; lead_time_days?: number | null; notes?: string | null },
    userId: string
  ): Promise<SupplierCandidate>;
  updateSupplier(id: string, patch: Partial<SupplierCandidate>): Promise<void>;
  addRisk(
    input: { product_opportunity_id: string; category: string; description: string; severity: RiskItem["severity"]; mitigation?: string | null },
    userId: string
  ): Promise<RiskItem>;
  updateRisk(id: string, patch: Partial<RiskItem>): Promise<void>;
  runAnalysis(opportunityId: string, useCase: "market" | "review", userId: string): Promise<{
    output: AiStructuredOutput;
    aiRun: AiRun;
  }>;
  submitDecision(opportunityId: string, input: DecisionInput, userId: string): Promise<ApprovalRequest>;
  convertToLaunch(opportunityId: string, userId: string): Promise<{ launchId: string; productId: string }>;

  // --- economics -------------------------------------------------------------
  /** Tất cả SKU trong scope user (kể cả chưa có snapshot) — nền cho economics. */
  listSkuCatalog(): Promise<SkuCatalogItem[]>;
  listCostProfiles(skuId: string): Promise<CostProfile[]>;
  saveCostProfile(input: NewCostProfileInput, userId: string): Promise<CostProfile>;
  submitCostProfileApproval(id: string, userId: string): Promise<ApprovalRequest>;

  // --- launches & listings -----------------------------------------------------
  listLaunches(clientId?: string): Promise<(LaunchProject & { product_name: string; client_name: string })[]>;
  getLaunch(id: string): Promise<LaunchDetail | null>;
  updateLaunchStage(id: string, stage: LaunchProject["stage"]): Promise<void>;
  toggleChecklistItem(launchId: string, itemKey: string): Promise<void>;
  listListings(clientId?: string): Promise<ListingWithMeta[]>;
  createListingVersion(input: NewListingVersionInput, userId: string): Promise<ListingVersion>;
  transitionListing(id: string, status: ListingVersion["status"], userId: string): Promise<void>;
  submitListingForApproval(id: string, userId: string): Promise<ApprovalRequest>;
  rollbackListing(asinId: string, userId: string): Promise<void>;
  auditListing(input: { asin_id: string; version_id: string }, userId: string): Promise<AiStructuredOutput & { aiRun: AiRun }>;

  // --- PPC ----------------------------------------------------------------------
  listCampaigns(clientId?: string): Promise<CampaignWithMetrics[]>;
  listRecommendations(clientId?: string): Promise<Recommendation[]>;
  refreshPpcRecommendations(clientId: string, userId: string): Promise<Recommendation[]>;
  decideRecommendation(id: string, decision: "approved" | "rejected", userId: string): Promise<void>;
  executeRecommendation(id: string, userId: string): Promise<{ ok: boolean; message: string }>;

  // --- inventory ------------------------------------------------------------------
  listInventory(clientId?: string): Promise<InventoryRow[]>;
  saveSnapshot(input: NewSnapshotInput, userId: string): Promise<InventorySnapshot>;
  saveLeadTime(input: NewLeadTimeInput, userId: string): Promise<LeadTimeConfig>;
  listShipments(clientId?: string): Promise<Shipment[]>;
  createReorderRecommendation(skuId: string, userId: string): Promise<Recommendation>;

  // --- customer service ---------------------------------------------------------
  listThreads(clientId?: string): Promise<CustomerThread[]>;
  getThread(id: string): Promise<ThreadDetail | null>;
  classifyThread(threadId: string, userId: string): Promise<CustomerMessage>;
  draftReply(messageId: string, userId: string): Promise<CustomerMessage>;
  submitReplyForApproval(messageId: string, replyText: string, userId: string): Promise<ApprovalRequest>;
  markThreadStatus(threadId: string, status: CustomerThread["status"]): Promise<void>;

  // --- tasks & approvals -----------------------------------------------------------
  listTasks(clientId?: string, filters?: { status?: TaskStatus; assigneeId?: string }): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: NewTaskInput, userId: string): Promise<Task>;
  updateTask(id: string, patch: Partial<Pick<Task, "status" | "assignee_id" | "priority" | "due_at" | "title" | "description">>): Promise<void>;
  addTaskComment(taskId: string, body: string, userId: string): Promise<void>;
  listApprovals(clientId?: string, status?: ApprovalRequest["decision"]): Promise<ApprovalRequest[]>;
  decideApproval(id: string, decision: "approved" | "rejected", reason: string, userId: string): Promise<{ executed: boolean; message: string }>;

  // --- today / reports / audit -------------------------------------------------------
  getTodayCards(user: SessionUser): Promise<TodayCard[]>;
  markTodayCardRead(cardId: string, userId: string): Promise<void>;
  getKpis(clientId?: string): Promise<KpiSnapshot>;
  listAuditEvents(clientId?: string, limit?: number): Promise<AuditEvent[]>;
  listAiRuns(clientId?: string, limit?: number): Promise<AiRun[]>;
}
