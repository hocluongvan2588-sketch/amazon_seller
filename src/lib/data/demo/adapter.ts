/**
 * DemoAdapter — in-memory implementation of DataAdapter.
 *
 * Mirrors the Supabase schema 1:1 (see data/demo/seed.ts) and enforces the
 * same permission rules as the RLS policies: the user must have client scope
 * (`user_client_access`) AND the module permission for their role (§3.3).
 * Every sensitive mutation writes an audit event and/or creates an approval
 * request — exactly like the production flow (§3.4, §5.9).
 */

import { cookies } from "next/headers";
import type {
  AiRun,
  ApprovalRequest,
  CompetitorProduct,
  ResearchSource,
  RiskItem,
  SessionUser,
  Sku,
  SupplierCandidate,
  SystemRole,
  Task,
} from "../../types";
import type {
  DataAdapter,
  OpportunityDetail,
  NewOpportunityInput,
  NewCompetitorInput,
  NewSourceInput,
  NewTaskInput,
  NewCostProfileInput,
  NewListingVersionInput,
  NewSnapshotInput,
  NewLeadTimeInput,
  DecisionInput,
  CampaignWithMetrics,
  InventoryRow,
  LaunchDetail,
  ListingWithMeta,
  ThreadDetail,
  KpiSnapshot,
} from "../adapter";
import {
  can,
  canApprove,
  canSeeCustomerMessages,
  canSeeFinanceData,
  type ModuleKey,
  type Permission,
} from "../../permissions";
import { computeEconomics } from "../../domain/economics";
import { scoreOpportunity } from "../../domain/scoring";
import {
  aggregateCampaignMetrics,
  generatePpcRecommendations,
  DEFAULT_PPC_THRESHOLDS,
} from "../../domain/recommendations";
import { listingAudit, marketSummary, reviewMining, classifyMessage, PROMPT_VERSIONS } from "../../ai/engine";
import { buildTodayCards, buildInventoryRows } from "../builders";
import { contentHash, normalizeCompetitorRows } from "../../domain/import";
import * as seed from "./seed";
import { dateOffset } from "./random";

const DEMO_COOKIE = "demo_user";

interface Store {
  members: typeof seed.MEMBERS;
  users: typeof seed.USERS;
  clients: typeof seed.CLIENTS;
  access: typeof seed.USER_CLIENT_ACCESS;
  opportunities: typeof seed.OPPORTUNITIES;
  sources: typeof seed.SOURCES;
  competitors: typeof seed.COMPETITORS;
  insights: typeof seed.REVIEW_INSIGHTS;
  suppliers: typeof seed.SUPPLIERS;
  risks: typeof seed.RISKS;
  products: typeof seed.PRODUCTS;
  asins: typeof seed.ASINS;
  skus: typeof seed.SKUS;
  launches: typeof seed.LAUNCHES;
  listings: typeof seed.LISTING_VERSIONS;
  costProfiles: typeof seed.COST_PROFILES;
  inventory: typeof seed.INVENTORY_SNAPSHOTS;
  leadTimes: typeof seed.LEAD_TIMES;
  shipments: typeof seed.SHIPMENTS;
  campaigns: typeof seed.CAMPAIGNS;
  metrics: typeof seed.AD_METRICS;
  threads: typeof seed.THREADS;
  messages: typeof seed.MESSAGES;
  tasks: typeof seed.TASKS;
  approvals: typeof seed.APPROVALS;
  recommendations: typeof seed.RECOMMENDATIONS;
  aiRuns: AiRun[];
  audit: typeof seed.AUDIT_EVENTS;
  readCards: Record<string, string[]>;
}

function seedAiRuns(): AiRun[] {
  return seed.AI_RUNS.map((r) => ({
    id: r.id,
    client_account_id: r.client_account_id,
    use_case: r.use_case,
    model_name: r.model_name,
    prompt_version: r.prompt_version,
    input_record_ids: r.input_record_ids,
    output_json: r.output,
    token_usage: null,
    status: r.status,
    reviewed_by: r.reviewed_by,
    created_at: r.created_at,
  }));
}

function createStore(): Store {
  return {
    members: seed.MEMBERS,
    users: seed.USERS,
    clients: seed.CLIENTS,
    access: seed.USER_CLIENT_ACCESS,
    opportunities: seed.OPPORTUNITIES,
    sources: seed.SOURCES,
    competitors: seed.COMPETITORS,
    insights: seed.REVIEW_INSIGHTS,
    suppliers: seed.SUPPLIERS,
    risks: seed.RISKS,
    products: seed.PRODUCTS,
    asins: seed.ASINS,
    skus: seed.SKUS,
    launches: seed.LAUNCHES,
    listings: seed.LISTING_VERSIONS,
    costProfiles: seed.COST_PROFILES,
    inventory: seed.INVENTORY_SNAPSHOTS,
    leadTimes: seed.LEAD_TIMES,
    shipments: seed.SHIPMENTS,
    campaigns: seed.CAMPAIGNS,
    metrics: seed.AD_METRICS,
    threads: seed.THREADS,
    messages: seed.MESSAGES,
    tasks: seed.TASKS,
    approvals: seed.APPROVALS,
    recommendations: seed.RECOMMENDATIONS,
    aiRuns: seedAiRuns(),
    audit: seed.AUDIT_EVENTS,
    readCards: {},
  };
}

// Module-level store: persists across requests within the dev server process.
const g = globalThis as unknown as { __demoStore?: Store };
const store: Store = (g.__demoStore ??= createStore());

class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export class DemoAdapter implements DataAdapter {
  readonly mode = "demo" as const;

  // -------------------------------------------------------------------------
  // Session & identity
  // -------------------------------------------------------------------------

  async getSessionUser(): Promise<SessionUser | null> {
    const jar = await cookies();
    const id = jar.get(DEMO_COOKIE)?.value;
    if (!id) return null;
    const user = store.users.find((u) => u.id === id);
    const member = store.members.find((m) => m.user_id === id && m.status === "active");
    if (!user || !member) return null;
    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: member.role,
      department: member.department,
      organization_id: member.organization_id,
      avatar_url: user.avatar_url,
    };
  }

  async listDemoUsers() {
    return store.users.map((u) => {
      const m = store.members.find((mm) => mm.user_id === u.id)!;
      return { id: u.id, full_name: u.full_name, email: u.email, role: m.role as SystemRole };
    });
  }

  async listMembers() {
    return store.members.map((m) => ({
      ...m,
      profile: store.users.find((u) => u.id === m.user_id) ?? null,
    }));
  }

  async listProfiles() {
    return store.users;
  }

  // -------------------------------------------------------------------------
  // Permission guards — mirror the RLS policies in 0002_rls.sql
  // -------------------------------------------------------------------------

  private async requireUser(): Promise<SessionUser> {
    const user = await this.getSessionUser();
    if (!user) throw new PermissionError("Chưa đăng nhập.");
    return user;
  }

  private clientIdsFor(user: SessionUser): Set<string> {
    if (user.role === "owner" || user.role === "admin") {
      return new Set(store.clients.map((c) => c.id));
    }
    return new Set(store.access.filter((a) => a.user_id === user.id).map((a) => a.client_account_id));
  }

  private assertClientScope(user: SessionUser, clientId: string) {
    if (!this.clientIdsFor(user).has(clientId)) {
      throw new PermissionError(
        `Không có quyền truy cập client này (RLS: user_client_access).`
      );
    }
  }

  private assertModule(user: SessionUser, clientId: string, module: ModuleKey, action: Permission) {
    this.assertClientScope(user, clientId);
    if (!can(user.role, module, action)) {
      throw new PermissionError(
        `Role "${user.role}" không có quyền ${action} trên module ${module} (ma trận §3.3).`
      );
    }
  }

  private scoped<T extends { client_account_id: string }>(rows: T[], user: SessionUser): T[] {
    const ids = this.clientIdsFor(user);
    return rows.filter((r) => ids.has(r.client_account_id));
  }

  private audit(
    user: SessionUser | null,
    action: string,
    entityType: string,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    clientId: string | null
  ) {
    store.audit.unshift({
      id: uid("aud"),
      organization_id: seed.ORG_ID,
      client_account_id: clientId,
      actor_user_id: user?.id ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      before_json: before,
      after_json: after,
      ip_hash: null,
      created_at: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------------------------
  // Clients
  // -------------------------------------------------------------------------

  async listClients() {
    const user = await this.requireUser();
    const ids = this.clientIdsFor(user);
    return store.clients.filter((c) => ids.has(c.id));
  }

  async getClient(id: string) {
    const user = await this.requireUser();
    const client = store.clients.find((c) => c.id === id) ?? null;
    if (client) this.assertClientScope(user, id);
    return client;
  }

  // -------------------------------------------------------------------------
  // Product research
  // -------------------------------------------------------------------------

  async listOpportunities(clientId?: string) {
    const user = await this.requireUser();
    let rows = store.opportunities.filter((o) => !o.deleted_at);
    if (clientId) rows = rows.filter((o) => o.client_account_id === clientId);
    return this.scoped(rows, user).map((o) => ({
      ...o,
      client_name: store.clients.find((c) => c.id === o.client_account_id)?.name ?? "?",
    }));
  }

  async getOpportunity(id: string): Promise<OpportunityDetail | null> {
    const user = await this.requireUser();
    const opp = store.opportunities.find((o) => o.id === id && !o.deleted_at);
    if (!opp) return null;
    this.assertClientScope(user, opp.client_account_id);
    if (!can(user.role, "product_research", "read")) return null;

    const sources = store.sources.filter((s) => s.product_opportunity_id === id);
    const competitors = store.competitors.filter((c) => c.product_opportunity_id === id);
    const insights = store.insights.filter((i) => i.product_opportunity_id === id);
    const suppliers = store.suppliers.filter((s) => s.product_opportunity_id === id);
    const risks = store.risks.filter((r) => r.product_opportunity_id === id);

    // Find the product/sku created for this opportunity to load its cost profile
    const product = store.products.find((p) => p.product_opportunity_id === id);
    const asin = product ? store.asins.find((a) => a.product_id === product.id) : undefined;
    const sku = asin ? store.skus.find((s) => s.asin_id === asin.id) : undefined;
    const cost = sku
      ? store.costProfiles
          .filter((c) => c.sku_id === sku.id && c.scenario === "base")
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      : undefined;
    const economics = cost
      ? {
          sellingPrice: cost.selling_price,
          cogs: cost.cogs,
          freight: cost.freight,
          duty: cost.duty,
          fbaFee: cost.fba_fee,
          referralFee: cost.referral_fee,
          storageCost: cost.storage_cost,
          adAllowance: cost.ad_allowance,
          returnAllowance: cost.return_allowance,
          promotionAllowance: cost.promotion_allowance,
          otherVariableCost: cost.other_variable_cost,
          packaging: cost.packaging,
          inspection: cost.inspection,
          thirdPartyLogistics: cost.third_party_logistics,
        }
      : null;

    return {
      opportunity: opp,
      sources,
      competitors,
      reviewInsights: insights,
      suppliers,
      risks,
      economics,
      score: scoreOpportunity({
        competitors,
        reviewInsights: insights,
        risks,
        economics,
        sourceCount: sources.length,
      }),
      client: store.clients.find((c) => c.id === opp.client_account_id) ?? null,
      owner: store.users.find((u) => u.id === opp.owner_user_id) ?? null,
    };
  }

  async createOpportunity(input: NewOpportunityInput, userId: string) {
    const user = await this.requireUser();
    this.assertModule(user, input.client_account_id, "product_research", "create");
    const now = new Date().toISOString();
    const opp = {
      id: uid("opp"),
      organization_id: seed.ORG_ID,
      client_account_id: input.client_account_id,
      name: input.name,
      category: input.category ?? null,
      marketplace: input.marketplace ?? "US",
      target_price: input.target_price ?? null,
      stage: "idea" as const,
      decision: null,
      decision_reason: null,
      decided_by: null,
      decided_at: null,
      evidence_completeness: 0,
      opportunity_score: null,
      score_version: null,
      owner_user_id: userId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    store.opportunities.unshift(opp);
    this.audit(user, "product_opportunities.insert", "product_opportunities", opp.id, null, { name: opp.name, stage: opp.stage }, opp.client_account_id);
    return opp;
  }

  async updateOpportunityStage(id: string, stage: (typeof store.opportunities)[number]["stage"]) {
    const user = await this.requireUser();
    const opp = store.opportunities.find((o) => o.id === id);
    if (!opp) throw new Error("Không tìm thấy opportunity");
    this.assertModule(user, opp.client_account_id, "product_research", "update");
    const before = { stage: opp.stage };
    opp.stage = stage;
    opp.updated_at = new Date().toISOString();
    this.audit(user, "product_opportunities.update", "product_opportunities", id, before, { stage }, opp.client_account_id);
  }

  async addSource(input: NewSourceInput, userId: string) {
    const user = await this.requireUser();
    const opp = store.opportunities.find((o) => o.id === input.product_opportunity_id);
    if (!opp) throw new Error("Không tìm thấy opportunity");
    this.assertModule(user, opp.client_account_id, "product_research", "create");
    const now = new Date().toISOString();
    const source: ResearchSource = {
      id: uid("src"),
      product_opportunity_id: input.product_opportunity_id,
      source_type: input.source_type,
      provider_name: input.provider_name,
      source_url: input.source_url ?? null,
      captured_at: input.captured_at ?? now,
      uploaded_by: userId,
      file_path: null,
      file_name: input.file_name ?? null,
      content_hash: input.file_name ? contentHash(input.file_name + now) : null,
      metadata: input.metadata ?? {},
      created_at: now,
    };
    store.sources.unshift(source);
    this.audit(user, "research_sources.insert", "research_sources", source.id, null, { provider: source.provider_name }, opp.client_account_id);
    return source;
  }

  async addCompetitors(input: NewCompetitorInput[], userId: string) {
    const user = await this.requireUser();
    const opp = store.opportunities.find((o) => o.id === input[0]?.product_opportunity_id);
    if (!opp) throw new Error("Không tìm thấy opportunity");
    this.assertModule(user, opp.client_account_id, "product_research", "create");
    const now = new Date().toISOString();
    const rows: CompetitorProduct[] = input.map((c) => ({
      id: uid("comp"),
      product_opportunity_id: c.product_opportunity_id,
      asin: c.asin ?? null,
      title: c.title,
      brand: c.brand ?? null,
      price: c.price ?? null,
      rating: c.rating ?? null,
      review_count: c.review_count ?? null,
      bsr: c.bsr ?? null,
      monthly_sales: c.monthly_sales ?? null,
      monthly_revenue: c.monthly_revenue ?? null,
      data_source_id: null,
      observed_at: now,
    }));
    store.competitors.push(...rows);
    this.audit(user, "competitor_products.insert", "competitor_products", opp.id, null, { count: rows.length }, opp.client_account_id);
    return rows;
  }

  async deleteCompetitor(id: string) {
    const user = await this.requireUser();
    const comp = store.competitors.find((c) => c.id === id);
    if (!comp) return;
    const opp = store.opportunities.find((o) => o.id === comp.product_opportunity_id)!;
    this.assertModule(user, opp.client_account_id, "product_research", "delete");
    store.competitors = store.competitors.filter((c) => c.id !== id);
    this.audit(user, "competitor_products.delete", "competitor_products", id, { title: comp.title }, null, opp.client_account_id);
  }

  async importCompetitorRows(rawRows: Record<string, string | number | null>[], opportunityId: string, userId: string) {
    const { rows, skipped } = normalizeCompetitorRows(rawRows);
    if (rows.length > 0) {
      await this.addCompetitors(
        rows.map((r) => ({ product_opportunity_id: opportunityId, ...r })),
        userId
      );
    }
    return { imported: rows.length, skipped };
  }

  async addSupplier(input: Parameters<DataAdapter["addSupplier"]>[0], userId: string) {
    const user = await this.requireUser();
    const opp = store.opportunities.find((o) => o.id === input.product_opportunity_id);
    if (!opp) throw new Error("Không tìm thấy opportunity");
    this.assertModule(user, opp.client_account_id, "supplier_sample", "create");
    const now = new Date().toISOString();
    const sup = {
      id: uid("sup"),
      product_opportunity_id: input.product_opportunity_id,
      supplier_name: input.supplier_name,
      country: input.country ?? null,
      contact_reference: null,
      moq: input.moq ?? null,
      quoted_cogs: input.quoted_cogs ?? null,
      lead_time_days: input.lead_time_days ?? null,
      sample_status: "not_requested" as const,
      quality_status: "unknown" as const,
      notes: input.notes ?? null,
      created_at: now,
    };
    store.suppliers.unshift(sup);
    this.audit(user, "supplier_candidates.insert", "supplier_candidates", sup.id, null, { name: sup.supplier_name }, opp.client_account_id);
    return sup;
  }

  async updateSupplier(id: string, patch: Partial<SupplierCandidate>) {
    const user = await this.requireUser();
    const sup = store.suppliers.find((s) => s.id === id);
    if (!sup) throw new Error("Không tìm thấy supplier");
    const opp = store.opportunities.find((o) => o.id === sup.product_opportunity_id)!;
    this.assertModule(user, opp.client_account_id, "supplier_sample", "update");
    const before = { ...sup };
    Object.assign(sup, patch);
    this.audit(user, "supplier_candidates.update", "supplier_candidates", id, before, { ...sup }, opp.client_account_id);
  }

  async addRisk(input: Parameters<DataAdapter["addRisk"]>[0], userId: string) {
    const user = await this.requireUser();
    const opp = store.opportunities.find((o) => o.id === input.product_opportunity_id);
    if (!opp) throw new Error("Không tìm thấy opportunity");
    this.assertModule(user, opp.client_account_id, "product_research", "update");
    const risk = {
      id: uid("risk"),
      product_opportunity_id: input.product_opportunity_id,
      category: input.category,
      description: input.description,
      severity: input.severity,
      status: "open" as const,
      mitigation: input.mitigation ?? null,
      created_at: new Date().toISOString(),
    };
    store.risks.unshift(risk);
    return risk;
  }

  async updateRisk(id: string, patch: Partial<RiskItem>) {
    const user = await this.requireUser();
    const risk = store.risks.find((r) => r.id === id);
    if (!risk) throw new Error("Không tìm thấy risk");
    const opp = store.opportunities.find((o) => o.id === risk.product_opportunity_id)!;
    this.assertModule(user, opp.client_account_id, "product_research", "update");
    Object.assign(risk, patch);
    this.audit(user, "risk_items.update", "risk_items", id, null, { status: risk.status }, opp.client_account_id);
  }

  async runAnalysis(opportunityId: string, useCase: "market" | "review", userId: string) {
    const user = await this.requireUser();
    const detail = await this.getOpportunity(opportunityId);
    if (!detail) throw new Error("Không tìm thấy opportunity");
    this.assertModule(user, detail.opportunity.client_account_id, "product_research", "read");

    const output =
      useCase === "market" ? marketSummary(detail) : reviewMining(detail);
    const insufficient =
      output.findings.length === 0 && output.missing_data.length > 0;

    const aiRun: AiRun = {
      id: uid("air"),
      client_account_id: detail.opportunity.client_account_id,
      use_case: useCase === "market" ? "market_summary" : "review_mining",
      model_name: "heuristic-engine",
      prompt_version: useCase === "market" ? PROMPT_VERSIONS.market_summary : PROMPT_VERSIONS.review_mining,
      input_record_ids: [
        ...detail.sources.map((s) => s.id),
        ...detail.competitors.map((c) => c.id),
      ].slice(0, 30),
      output_json: output as unknown as Record<string, unknown>,
      token_usage: null,
      status: insufficient ? "insufficient_evidence" : "succeeded",
      reviewed_by: null,
      created_at: new Date().toISOString(),
    };
    store.aiRuns.unshift(aiRun);
    return { output, aiRun };
  }

  async submitDecision(opportunityId: string, input: DecisionInput, userId: string) {
    const user = await this.requireUser();
    const opp = store.opportunities.find((o) => o.id === opportunityId);
    if (!opp) throw new Error("Không tìm thấy opportunity");
    this.assertModule(user, opp.client_account_id, "product_research", "update");

    const approval: ApprovalRequest = {
      id: uid("appr"),
      client_account_id: opp.client_account_id,
      request_type: "product_decision",
      entity_type: "product_opportunity",
      entity_id: opportunityId,
      title: `Go/No-Go: ${opp.name} — đề xuất ${input.decision.toUpperCase()}`,
      payload_snapshot: {
        decision: input.decision,
        reason: input.reason,
        score: opp.opportunity_score,
      },
      requested_by: userId,
      reviewed_by: null,
      decision: "pending",
      decision_reason: null,
      expires_at: dateOffset(7),
      execution_status: "not_started",
      created_at: new Date().toISOString(),
      decided_at: null,
    };
    store.approvals.unshift(approval);
    opp.stage = "pending_decision";
    this.audit(user, "approval_requests.insert", "approval_requests", approval.id, null, { type: "product_decision" }, opp.client_account_id);
    return approval;
  }

  async convertToLaunch(opportunityId: string, userId: string) {
    const user = await this.requireUser();
    const opp = store.opportunities.find((o) => o.id === opportunityId);
    if (!opp) throw new Error("Không tìm thấy opportunity");
    if (!["go", "go_with_conditions"].includes(opp.decision ?? "")) {
      throw new Error("Chỉ opportunity có decision GO / GO WITH CONDITIONS mới chuyển được launch project.");
    }
    this.assertModule(user, opp.client_account_id, "listing", "create");

    const now = new Date().toISOString();
    const product = {
      id: uid("prod"),
      client_account_id: opp.client_account_id,
      product_opportunity_id: opp.id,
      name: opp.name,
      brand: null,
      category: opp.category,
      status: "draft" as const,
      launch_project_id: null as string | null,
      created_at: now,
    };
    const asin = {
      id: uid("asin"),
      product_id: product.id,
      asin: "PENDING-" + opportunityId.slice(-6).toUpperCase(),
      marketplace: opp.marketplace,
      title: opp.name,
      status: "planned" as const,
      source_snapshot_id: null,
    };
    const sku = {
      id: uid("sku"),
      asin_id: asin.id,
      sku: `SKU-${Date.now().toString(36).toUpperCase()}`,
      fnsku: null,
      supplier_id: store.suppliers.find((s) => s.product_opportunity_id === opportunityId)?.id ?? null,
      status: "planned" as const,
      package_weight: null,
      package_length: null,
      package_width: null,
      package_height: null,
    };
    const launch = {
      id: uid("launch"),
      client_account_id: opp.client_account_id,
      product_id: product.id,
      stage: "created" as const,
      target_launch_date: null,
      actual_launch_date: null,
      owner_user_id: userId,
      health_status: "on_track" as const,
      checklist: [
        { key: "supplier_confirmed", label: "Chốt supplier & PO", done: false, department: "sourcing" as const },
        { key: "listing_draft", label: "Listing draft hoàn chỉnh", done: false, department: "content" as const },
        { key: "cost_profile", label: "Cost profile được duyệt", done: false, department: "finance" as const },
        { key: "first_shipment", label: "Shipment đầu tiên lên đường", done: false, department: "inventory" as const },
        { key: "ppc_ready", label: "Campaign launch sẵn sàng", done: false, department: "ppc" as const },
      ],
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    product.launch_project_id = launch.id;
    store.products.unshift(product);
    store.asins.unshift(asin);
    store.skus.unshift(sku);
    store.launches.unshift(launch);
    this.audit(user, "launch_projects.insert", "launch_projects", launch.id, null, { product: product.name }, opp.client_account_id);
    return { launchId: launch.id, productId: product.id };
  }

  // -------------------------------------------------------------------------
  // Economics
  // -------------------------------------------------------------------------

  async listCostProfiles(skuId: string) {
    const user = await this.requireUser();
    const sku = store.skus.find((s) => s.id === skuId);
    if (!sku) return [];
    const asin = store.asins.find((a) => a.id === sku.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertClientScope(user, product.client_account_id);
    if (!canSeeFinanceData(user.role)) throw new PermissionError("Dữ liệu finance chỉ dành cho finance/admin/owner/reviewer (§3.4).");
    return store.costProfiles.filter((c) => c.sku_id === skuId);
  }

  async saveCostProfile(input: NewCostProfileInput, userId: string) {
    const user = await this.requireUser();
    const sku = store.skus.find((s) => s.id === input.sku_id);
    if (!sku) throw new Error("Không tìm thấy SKU");
    const asin = store.asins.find((a) => a.id === sku.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertModule(user, product.client_account_id, "economics", "create");

    const now = new Date().toISOString();
    const profile = {
      id: uid("cp"),
      sku_id: input.sku_id,
      marketplace: input.marketplace ?? "US",
      currency: input.currency ?? "USD",
      selling_price: input.sellingPrice,
      cogs: input.cogs,
      freight: input.freight,
      duty: input.duty,
      fba_fee: input.fbaFee,
      referral_fee: input.referralFee,
      storage_cost: input.storageCost,
      ad_allowance: input.adAllowance,
      return_allowance: input.returnAllowance,
      promotion_allowance: input.promotionAllowance,
      other_variable_cost: input.otherVariableCost,
      packaging: input.packaging,
      inspection: input.inspection,
      third_party_logistics: input.thirdPartyLogistics,
      fx_rate: 1,
      scenario: input.scenario ?? ("base" as const),
      effective_from: now.slice(0, 10),
      effective_to: null,
      status: "draft" as const,
      approved_by: null,
      formula_version: "econ-v1",
      created_by: userId,
      created_at: now,
    };
    store.costProfiles.unshift(profile);
    this.audit(user, "cost_profiles.insert", "cost_profiles", profile.id, null, { sku: sku.sku, selling_price: profile.selling_price }, product.client_account_id);
    return profile;
  }

  async submitCostProfileApproval(id: string, userId: string) {
    const user = await this.requireUser();
    const cp = store.costProfiles.find((c) => c.id === id);
    if (!cp) throw new Error("Không tìm thấy cost profile");
    const sku = store.skus.find((s) => s.id === cp.sku_id)!;
    const asin = store.asins.find((a) => a.id === sku.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertModule(user, product.client_account_id, "economics", "update");
    cp.status = "pending_approval";
    const approval: ApprovalRequest = {
      id: uid("appr"),
      client_account_id: product.client_account_id,
      request_type: "cost_profile",
      entity_type: "cost_profile",
      entity_id: id,
      title: `Duyệt cost profile ${sku.sku} (${cp.scenario})`,
      payload_snapshot: { selling_price: cp.selling_price, formula: cp.formula_version },
      requested_by: userId,
      reviewed_by: null,
      decision: "pending",
      decision_reason: null,
      expires_at: dateOffset(7),
      execution_status: "not_started",
      created_at: new Date().toISOString(),
      decided_at: null,
    };
    store.approvals.unshift(approval);
    return approval;
  }

  // -------------------------------------------------------------------------
  // Launches & listings
  // -------------------------------------------------------------------------

  async listLaunches(clientId?: string) {
    const user = await this.requireUser();
    let rows = store.launches.filter((l) => !l.deleted_at);
    if (clientId) rows = rows.filter((l) => l.client_account_id === clientId);
    return this.scoped(rows, user).map((l) => ({
      ...l,
      product_name: store.products.find((p) => p.id === l.product_id)?.name ?? "?",
      client_name: store.clients.find((c) => c.id === l.client_account_id)?.name ?? "?",
    }));
  }

  async getLaunch(id: string): Promise<LaunchDetail | null> {
    const user = await this.requireUser();
    const launch = store.launches.find((l) => l.id === id);
    if (!launch) return null;
    this.assertClientScope(user, launch.client_account_id);
    const product = store.products.find((p) => p.id === launch.product_id) ?? null;
    const asin = product ? store.asins.find((a) => a.product_id === product.id) ?? null : null;
    const skus = asin ? store.skus.filter((s) => s.asin_id === asin.id) : [];
    const tasks = store.tasks.filter(
      (t) => t.client_account_id === launch.client_account_id && !t.deleted_at
    );
    return {
      launch,
      product,
      asin,
      skus,
      tasks,
      opportunity:
        store.opportunities.find((o) => o.id === product?.product_opportunity_id) ?? null,
    };
  }

  async updateLaunchStage(id: string, stage: (typeof store.launches)[number]["stage"]) {
    const user = await this.requireUser();
    const launch = store.launches.find((l) => l.id === id);
    if (!launch) throw new Error("Không tìm thấy launch");
    this.assertModule(user, launch.client_account_id, "listing", "update");
    const before = { stage: launch.stage };
    launch.stage = stage;
    launch.updated_at = new Date().toISOString();
    this.audit(user, "launch_projects.update", "launch_projects", id, before, { stage }, launch.client_account_id);
  }

  async toggleChecklistItem(launchId: string, itemKey: string) {
    const user = await this.requireUser();
    const launch = store.launches.find((l) => l.id === launchId);
    if (!launch) throw new Error("Không tìm thấy launch");
    this.assertModule(user, launch.client_account_id, "listing", "update");
    const item = launch.checklist.find((c) => c.key === itemKey);
    if (item) {
      item.done = !item.done;
      launch.updated_at = new Date().toISOString();
      this.audit(user, "launch_projects.update", "launch_projects", launchId, null, { checklist_item: itemKey, done: item.done }, launch.client_account_id);
    }
  }

  async listListings(clientId?: string): Promise<ListingWithMeta[]> {
    const user = await this.requireUser();
    const ids = this.clientIdsFor(user);
    const out: ListingWithMeta[] = [];
    for (const asin of store.asins) {
      const product = store.products.find((p) => p.id === asin.product_id) ?? null;
      if (!product || !ids.has(product.client_account_id)) continue;
      if (clientId && product.client_account_id !== clientId) continue;
      const versions = store.listings
        .filter((lv) => lv.asin_id === asin.id)
        .sort((a, b) => b.version_number - a.version_number);
      if (versions.length === 0) continue;
      out.push({ asin, product, versions });
    }
    return out;
  }

  async createListingVersion(input: NewListingVersionInput, userId: string) {
    const user = await this.requireUser();
    const asin = store.asins.find((a) => a.id === input.asin_id);
    if (!asin) throw new Error("Không tìm thấy ASIN");
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertModule(user, product.client_account_id, "listing", "create");
    const latest = store.listings
      .filter((lv) => lv.asin_id === input.asin_id)
      .sort((a, b) => b.version_number - a.version_number)[0];
    const version: (typeof store.listings)[number] = {
      id: uid("lv"),
      asin_id: input.asin_id,
      version_number: (latest?.version_number ?? 0) + 1,
      title: input.title,
      bullets: input.bullets,
      description: input.description,
      backend_terms: input.backend_terms,
      attributes: {},
      images: [],
      status: "draft",
      change_reason: input.change_reason ?? null,
      created_by: userId,
      approved_by: null,
      approved_at: null,
      created_at: new Date().toISOString(),
    };
    store.listings.unshift(version);
    this.audit(user, "listing_versions.insert", "listing_versions", version.id, null, { version: version.version_number }, product.client_account_id);
    return version;
  }

  async transitionListing(id: string, status: (typeof store.listings)[number]["status"], userId: string) {
    const user = await this.requireUser();
    const lv = store.listings.find((l) => l.id === id);
    if (!lv) throw new Error("Không tìm thấy listing version");
    const asin = store.asins.find((a) => a.id === lv.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    const isApprovalFlow = ["approved", "published", "ready_to_publish"].includes(status);
    this.assertModule(
      user,
      product.client_account_id,
      "listing",
      isApprovalFlow ? "update" : "update"
    );
    const before = { status: lv.status };
    lv.status = status;
    if (status === "approved" || status === "published") {
      lv.approved_by = userId;
      lv.approved_at = new Date().toISOString();
    }
    this.audit(user, "listing_versions.update", "listing_versions", id, before, { status }, product.client_account_id);
  }

  async submitListingForApproval(id: string, userId: string) {
    const user = await this.requireUser();
    const lv = store.listings.find((l) => l.id === id);
    if (!lv) throw new Error("Không tìm thấy listing version");
    const asin = store.asins.find((a) => a.id === lv.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertModule(user, product.client_account_id, "listing", "update");
    lv.status = "internal_review";
    const approval: ApprovalRequest = {
      id: uid("appr"),
      client_account_id: product.client_account_id,
      request_type: "listing_publish",
      entity_type: "listing_version",
      entity_id: id,
      title: `Publish listing ${asin.asin} v${lv.version_number}`,
      payload_snapshot: { title: lv.title, version: lv.version_number },
      requested_by: userId,
      reviewed_by: null,
      decision: "pending",
      decision_reason: null,
      expires_at: dateOffset(5),
      execution_status: "not_started",
      created_at: new Date().toISOString(),
      decided_at: null,
    };
    store.approvals.unshift(approval);
    return approval;
  }

  async rollbackListing(asinId: string, userId: string) {
    const user = await this.requireUser();
    const asin = store.asins.find((a) => a.id === asinId);
    if (!asin) throw new Error("Không tìm thấy ASIN");
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertModule(user, product.client_account_id, "listing", "update");
    const versions = store.listings
      .filter((lv) => lv.asin_id === asinId)
      .sort((a, b) => b.version_number - a.version_number);
    const latestPublished = versions.find((lv) => lv.status === "published");
    const current = versions[0];
    if (!latestPublished) throw new Error("Không có version đã publish để rollback.");
    if (current && current.id !== latestPublished.id) {
      current.status = "rejected";
      current.change_reason = "Rolled back về v" + latestPublished.version_number;
    }
    latestPublished.status = "published";
    this.audit(user, "listing_versions.update", "listing_versions", latestPublished.id, null, { rollback_to: latestPublished.version_number }, product.client_account_id);
  }

  async auditListing(input: { asin_id: string; version_id: string }, userId: string) {
    const user = await this.requireUser();
    const lv = store.listings.find((l) => l.id === input.version_id);
    if (!lv) throw new Error("Không tìm thấy listing version");
    const asin = store.asins.find((a) => a.id === lv.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertClientScope(user, product.client_account_id);
    const previous = store.listings
      .filter((l) => l.asin_id === lv.asin_id && l.version_number < lv.version_number)
      .sort((a, b) => b.version_number - a.version_number)[0] ?? null;
    const output = listingAudit({ version: lv, previous });
    const aiRun: AiRun = {
      id: uid("air"),
      client_account_id: product.client_account_id,
      use_case: "listing_audit",
      model_name: "heuristic-engine",
      prompt_version: PROMPT_VERSIONS.listing_audit,
      input_record_ids: [lv.id, ...(previous ? [previous.id] : [])],
      output_json: output as unknown as Record<string, unknown>,
      token_usage: null,
      status: "succeeded",
      reviewed_by: null,
      created_at: new Date().toISOString(),
    };
    store.aiRuns.unshift(aiRun);
    return { ...output, aiRun };
  }

  // -------------------------------------------------------------------------
  // PPC
  // -------------------------------------------------------------------------

  async listCampaigns(clientId?: string): Promise<CampaignWithMetrics[]> {
    const user = await this.requireUser();
    let rows = store.campaigns;
    if (clientId) rows = rows.filter((c) => c.client_account_id === clientId);
    return this.scoped(rows, user).map((c) => {
      const metrics = store.metrics
        .filter((m) => m.campaign_id === c.id)
        .sort((a, b) => a.metric_date.localeCompare(b.metric_date));
      const agg = aggregateCampaignMetrics(c, metrics);
      return {
        campaign: c,
        metrics,
        totals: {
          impressions: agg.impressions,
          clicks: agg.clicks,
          spend: agg.spend,
          orders: agg.orders,
          sales: agg.sales,
          ctr: agg.ctr,
          cvr: agg.cvr,
          acos: agg.acos,
        },
      };
    });
  }

  async listRecommendations(clientId?: string) {
    const user = await this.requireUser();
    let rows = store.recommendations;
    if (clientId) rows = rows.filter((r) => r.client_account_id === clientId);
    return this.scoped(rows, user);
  }

  async refreshPpcRecommendations(clientId: string, userId: string) {
    const user = await this.requireUser();
    this.assertModule(user, clientId, "ppc", "read");
    const campaigns = store.campaigns.filter((c) => c.client_account_id === clientId);
    const aggs = campaigns.map((c) =>
      aggregateCampaignMetrics(c, store.metrics.filter((m) => m.campaign_id === c.id))
    );
    const fresh = generatePpcRecommendations(aggs);
    // Replace existing ppc recommendations for this client (idempotent refresh)
    store.recommendations = store.recommendations.filter(
      (r) => !(r.client_account_id === clientId && r.module === "ppc")
    );
    store.recommendations.unshift(...fresh);
    return fresh;
  }

  async decideRecommendation(id: string, decision: "approved" | "rejected", userId: string) {
    const user = await this.requireUser();
    const rec = store.recommendations.find((r) => r.id === id);
    if (!rec) throw new Error("Không tìm thấy recommendation");
    this.assertModule(user, rec.client_account_id, "ppc", "update");
    rec.status = decision;
    rec.updated_at = new Date().toISOString();
    this.audit(user, "recommendations.update", "recommendations", id, null, { status: decision }, rec.client_account_id);
  }

  async executeRecommendation(id: string, userId: string) {
    const user = await this.requireUser();
    const rec = store.recommendations.find((r) => r.id === id);
    if (!rec) throw new Error("Không tìm thấy recommendation");
    this.assertModule(user, rec.client_account_id, "ppc", "update");
    if (rec.status !== "approved") {
      return { ok: false, message: "Recommendation phải được APPROVE trước khi execute (guardrail §5.6)." };
    }
    const action = rec.proposed_action as {
      type: string;
      campaign_id?: string;
      proposed_budget?: number;
      increase_amount?: number;
    };
    // Guardrails: budget increases above the daily approval limit are blocked
    if (action.type === "increase_daily_budget") {
      const limit = DEFAULT_PPC_THRESHOLDS.dailyBudgetApprovalLimit;
      if ((action.increase_amount ?? 0) > limit) {
        rec.status = "failed";
        return { ok: false, message: `Blocked: mức tăng $${action.increase_amount?.toFixed(2)} vượt daily approval limit $${limit}.` };
      }
      const camp = store.campaigns.find((c) => c.id === action.campaign_id);
      if (camp && action.proposed_budget) {
        camp.daily_budget = action.proposed_budget;
        rec.status = "executed";
        this.audit(user, "ad_campaigns.update", "ad_campaigns", camp.id, { daily_budget: camp.daily_budget }, { daily_budget: action.proposed_budget }, rec.client_account_id);
        return { ok: true, message: `Đã tăng budget "${camp.name}" lên $${action.proposed_budget}/ngày (dry-run trong demo).` };
      }
    }
    if (action.type === "review_and_pause") {
      rec.status = "executed";
      return { ok: true, message: "Đã tạo task review campaign — không tự tắt campaign (human-in-the-loop)." };
    }
    rec.status = "executed";
    return { ok: true, message: "Đã ghi nhận execute (dry-run trong demo)." };
  }

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------

  async listInventory(clientId?: string): Promise<InventoryRow[]> {
    const user = await this.requireUser();
    const ids = this.clientIdsFor(user);
    const rows = store.skus
      .map((sku) => {
        const asin = store.asins.find((a) => a.id === sku.asin_id);
        if (!asin) return null;
        const product = store.products.find((p) => p.id === asin.product_id);
        if (!product || !ids.has(product.client_account_id)) return null;
        if (clientId && product.client_account_id !== clientId) return null;
        const snapshot = store.inventory
          .filter((s) => s.sku_id === sku.id)
          .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
        if (!snapshot) return null;
        const leadTime = store.leadTimes.find((l) => l.sku_id === sku.id) ?? null;
        const inboundShipment = store.shipments.find(
          (sh) =>
            sh.client_account_id === product.client_account_id &&
            sh.sku_lines.some((l) => l.sku_id === sku.id) &&
            sh.eta &&
            ["in_transit", "customs", "booked"].includes(sh.status)
        );
        return {
          snapshot,
          leadTime,
          sku,
          asin,
          product,
          inboundEta: inboundShipment?.eta ?? null,
        };
      })
      .filter((x) => x !== null);
    return buildInventoryRows(rows) as InventoryRow[];
  }

  async saveSnapshot(input: NewSnapshotInput, userId: string) {
    const user = await this.requireUser();
    const sku = store.skus.find((s) => s.id === input.sku_id);
    if (!sku) throw new Error("Không tìm thấy SKU");
    const asin = store.asins.find((a) => a.id === sku.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertModule(user, product.client_account_id, "inventory_logistics", "create");
    const now = new Date().toISOString();
    const snapshot = {
      id: uid("inv"),
      sku_id: input.sku_id,
      snapshot_date: input.snapshot_date,
      sellable_units: input.sellable_units,
      reserved_units: input.reserved_units ?? 0,
      inbound_units: input.inbound_units ?? 0,
      unfulfillable_units: input.unfulfillable_units ?? 0,
      units_sold: input.units_sold,
      observation_days: input.observation_days ?? 30,
      average_daily_sales: null,
      days_of_supply: null,
      source_snapshot_id: null,
      created_at: now,
    };
    store.inventory.unshift(snapshot);
    this.audit(user, "inventory_snapshots.insert", "inventory_snapshots", snapshot.id, null, { sellable: input.sellable_units }, product.client_account_id);
    return snapshot;
  }

  async saveLeadTime(input: NewLeadTimeInput, userId: string) {
    const user = await this.requireUser();
    const sku = store.skus.find((s) => s.id === input.sku_id);
    if (!sku) throw new Error("Không tìm thấy SKU");
    const asin = store.asins.find((a) => a.id === sku.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertModule(user, product.client_account_id, "inventory_logistics", "update");
    const existing = store.leadTimes.find((l) => l.sku_id === input.sku_id);
    if (existing) {
      Object.assign(existing, input, { sku_id: input.sku_id, route: input.route ?? existing.route });
      return existing;
    }
    const lt = {
      id: uid("lt"),
      ...input,
      route: input.route ?? "VN → US (sea)",
      created_at: new Date().toISOString(),
    };
    store.leadTimes.unshift(lt);
    return lt;
  }

  async listShipments(clientId?: string) {
    const user = await this.requireUser();
    let rows = store.shipments;
    if (clientId) rows = rows.filter((s) => s.client_account_id === clientId);
    return this.scoped(rows, user);
  }

  async createReorderRecommendation(skuId: string, userId: string) {
    const user = await this.requireUser();
    const sku = store.skus.find((s) => s.id === skuId);
    if (!sku) throw new Error("Không tìm thấy SKU");
    const asin = store.asins.find((a) => a.id === sku.asin_id)!;
    const product = store.products.find((p) => p.id === asin.product_id)!;
    this.assertModule(user, product.client_account_id, "inventory_logistics", "update");
    const rows = await this.listInventory(product.client_account_id);
    const row = rows.find((r) => r.skuId === skuId);
    const rec = {
      id: uid("rec"),
      client_account_id: product.client_account_id,
      module: "inventory" as const,
      recommendation_type: "reorder_draft",
      title: `Reorder draft: ${sku.sku}`,
      explanation: row?.explanation ?? "Tồn kho dưới reorder point.",
      evidence_ids: [row?.snapshot.id ?? skuId],
      confidence: "high" as const,
      impact: "high" as const,
      proposed_action: { type: "create_reorder", sku_id: skuId, quantity: row?.reorderQuantity ?? 500 },
      guardrails: { requiresApproval: true, note: "Tạo PO draft — KHÔNG tự đặt hàng (spec §5.7)." },
      status: "pending_review" as const,
      model_version: "rules-v1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.recommendations.unshift(rec);
    this.audit(user, "recommendations.insert", "recommendations", rec.id, null, { type: "reorder_draft" }, product.client_account_id);
    return rec;
  }

  // -------------------------------------------------------------------------
  // Customer service
  // -------------------------------------------------------------------------

  async listThreads(clientId?: string) {
    const user = await this.requireUser();
    let rows = store.threads;
    if (clientId) rows = rows.filter((t) => t.client_account_id === clientId);
    const scoped = this.scoped(rows, user);
    if (!canSeeCustomerMessages(user.role)) return [];
    return scoped;
  }

  async getThread(id: string): Promise<ThreadDetail | null> {
    const user = await this.requireUser();
    if (!canSeeCustomerMessages(user.role)) throw new PermissionError("Tin nhắn khách hàng chỉ dành cho CS/AM/admin/owner/reviewer (§3.4).");
    const thread = store.threads.find((t) => t.id === id);
    if (!thread) return null;
    this.assertClientScope(user, thread.client_account_id);
    return {
      thread,
      messages: store.messages
        .filter((m) => m.thread_id === id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    };
  }

  async classifyThread(threadId: string, userId: string) {
    const user = await this.requireUser();
    const thread = store.threads.find((t) => t.id === threadId);
    if (!thread) throw new Error("Không tìm thấy thread");
    this.assertModule(user, thread.client_account_id, "customer_response", "update");
    const inbound = store.messages
      .filter((m) => m.thread_id === threadId && m.direction === "inbound")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!inbound) throw new Error("Thread không có tin nhắn inbound.");
    const cls = classifyMessage(inbound.message_text);
    inbound.intent = cls.intent as typeof inbound.intent;
    inbound.urgency = cls.urgency;
    inbound.ai_summary = cls.summary;
    inbound.policy_risk_level = cls.policy_risk_level;
    inbound.policy_risk_notes = cls.policy_risk_notes;
    inbound.reply_draft = cls.reply_draft;
    inbound.status = "drafting";
    thread.priority = cls.urgency;
    this.audit(user, "customer_messages.update", "customer_messages", inbound.id, { status: "new" }, { status: "drafting", policy_risk: cls.policy_risk_level }, thread.client_account_id);
    return inbound;
  }

  async draftReply(messageId: string, userId: string) {
    const user = await this.requireUser();
    const msg = store.messages.find((m) => m.id === messageId);
    if (!msg) throw new Error("Không tìm thấy message");
    const thread = store.threads.find((t) => t.id === msg.thread_id)!;
    this.assertModule(user, thread.client_account_id, "customer_response", "update");
    if (!msg.reply_draft) {
      const cls = classifyMessage(msg.message_text);
      msg.reply_draft = cls.reply_draft;
      msg.status = "drafting";
    }
    return msg;
  }

  async submitReplyForApproval(messageId: string, replyText: string, userId: string) {
    const user = await this.requireUser();
    const msg = store.messages.find((m) => m.id === messageId);
    if (!msg) throw new Error("Không tìm thấy message");
    const thread = store.threads.find((t) => t.id === msg.thread_id)!;
    this.assertModule(user, thread.client_account_id, "customer_response", "update");
    msg.reply_draft = replyText;
    msg.status = "pending_approval";
    const approval: ApprovalRequest = {
      id: uid("appr"),
      client_account_id: thread.client_account_id,
      request_type: "customer_response",
      entity_type: "customer_message",
      entity_id: messageId,
      title: `Duyệt reply: ${thread.subject ?? thread.customer_reference}`,
      payload_snapshot: { reply: replyText.slice(0, 500) },
      requested_by: userId,
      reviewed_by: null,
      decision: "pending",
      decision_reason: null,
      expires_at: dateOffset(2),
      execution_status: "not_started",
      created_at: new Date().toISOString(),
      decided_at: null,
    };
    store.approvals.unshift(approval);
    this.audit(user, "customer_messages.update", "customer_messages", messageId, { status: "drafting" }, { status: "pending_approval" }, thread.client_account_id);
    return approval;
  }

  async markThreadStatus(threadId: string, status: (typeof store.threads)[number]["status"]) {
    const user = await this.requireUser();
    const thread = store.threads.find((t) => t.id === threadId);
    if (!thread) throw new Error("Không tìm thấy thread");
    this.assertModule(user, thread.client_account_id, "customer_response", "update");
    thread.status = status;
  }

  // -------------------------------------------------------------------------
  // Tasks & approvals
  // -------------------------------------------------------------------------

  async listTasks(clientId?: string, filters?: { status?: (typeof store.tasks)[number]["status"]; assigneeId?: string }) {
    const user = await this.requireUser();
    let rows = store.tasks.filter((t) => !t.deleted_at);
    if (clientId) rows = rows.filter((t) => t.client_account_id === clientId);
    if (filters?.status) rows = rows.filter((t) => t.status === filters.status);
    if (filters?.assigneeId) rows = rows.filter((t) => t.assignee_id === filters.assigneeId);
    return this.scoped(rows, user);
  }

  async getTask(id: string) {
    const user = await this.requireUser();
    const task = store.tasks.find((t) => t.id === id);
    if (!task) return null;
    this.assertClientScope(user, task.client_account_id);
    return task;
  }

  async createTask(input: NewTaskInput, userId: string) {
    const user = await this.requireUser();
    this.assertModule(user, input.client_account_id, "tasks", "create");
    const now = new Date().toISOString();
    const task: (typeof store.tasks)[number] = {
      id: uid("task"),
      client_account_id: input.client_account_id,
      title: input.title,
      description: input.description ?? null,
      department: input.department ?? null,
      assignee_id: input.assignee_id ?? null,
      reviewer_id: input.reviewer_id ?? null,
      priority: input.priority ?? "medium",
      status: input.assignee_id ? "assigned" : "backlog",
      due_at: input.due_at ?? null,
      source_type: input.source_type ?? null,
      source_id: input.source_id ?? null,
      attachments: [],
      created_by: userId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      comments: [],
    };
    store.tasks.unshift(task);
    return task;
  }

  async updateTask(id: string, patch: Partial<Pick<Task, "status" | "assignee_id" | "priority" | "due_at" | "title" | "description">>) {
    const user = await this.requireUser();
    const task = store.tasks.find((t) => t.id === id);
    if (!task) throw new Error("Không tìm thấy task");
    this.assertModule(user, task.client_account_id, "tasks", "update");
    const before = { status: task.status };
    Object.assign(task, patch);
    task.updated_at = new Date().toISOString();
    this.audit(user, "tasks.update", "tasks", id, before, { status: task.status }, task.client_account_id);
  }

  async addTaskComment(taskId: string, body: string, userId: string) {
    const user = await this.requireUser();
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Không tìm thấy task");
    this.assertModule(user, task.client_account_id, "tasks", "update");
    task.comments.push({
      id: uid("tc"),
      task_id: taskId,
      author_id: userId,
      body,
      created_at: new Date().toISOString(),
    });
  }

  async listApprovals(clientId?: string, status?: ApprovalRequest["decision"]) {
    const user = await this.requireUser();
    let rows = store.approvals;
    if (clientId) rows = rows.filter((a) => a.client_account_id === clientId);
    if (status) rows = rows.filter((a) => a.decision === status);
    return this.scoped(rows, user);
  }

  async decideApproval(id: string, decision: "approved" | "rejected", reason: string, userId: string) {
    const user = await this.requireUser();
    const approval = store.approvals.find((a) => a.id === id);
    if (!approval) throw new Error("Không tìm thấy approval request");
    this.assertClientScope(user, approval.client_account_id);
    const roleAllowed =
      canApprove(user.role, "approvals") || user.role === "admin" || user.role === "owner";
    if (!roleAllowed) {
      throw new PermissionError("Chỉ reviewer/admin/owner được quyết approval (§3.3 cột A).");
    }

    approval.decision = decision;
    approval.decision_reason = reason;
    approval.reviewed_by = userId;
    approval.decided_at = new Date().toISOString();
    this.audit(user, "approval_requests.update", "approval_requests", id, { decision: "pending" }, { decision }, approval.client_account_id);

    if (decision !== "approved") {
      return { executed: false, message: "Đã TỪ CHỐI — không thực hiện thay đổi." };
    }

    // Execute the approved side effect (spec §5.9 "thực thi action sau approval")
    let message = "Đã duyệt.";
    switch (approval.request_type) {
      case "product_decision": {
        const opp = store.opportunities.find((o) => o.id === approval.entity_id);
        if (opp) {
          const payload = approval.payload_snapshot as { decision: DecisionInput["decision"] };
          opp.decision = payload.decision;
          opp.decision_reason = (approval.payload_snapshot as { reason?: string }).reason ?? reason;
          opp.decided_by = userId;
          opp.decided_at = new Date().toISOString();
          opp.stage = payload.decision;
          message = `Đã ghi nhận quyết định ${payload.decision.toUpperCase()} cho "${opp.name}".`;
        }
        break;
      }
      case "cost_profile": {
        const cp = store.costProfiles.find((c) => c.id === approval.entity_id);
        if (cp) {
          cp.status = "approved";
          cp.approved_by = userId;
          message = "Cost profile đã được duyệt.";
        }
        break;
      }
      case "listing_publish": {
        const lv = store.listings.find((l) => l.id === approval.entity_id);
        if (lv) {
          lv.status = "ready_to_publish";
          lv.approved_by = userId;
          lv.approved_at = new Date().toISOString();
          message = `Listing v${lv.version_number} đã sẵn sàng publish (publish cuối cần thao tác Seller Central).`;
        }
        break;
      }
      case "customer_response": {
        const msg = store.messages.find((m) => m.id === approval.entity_id);
        if (msg) {
          msg.status = "approved";
          message = "Reply đã được duyệt — chờ CS copy vào Seller Central và gửi (demo không tự gửi).";
        }
        break;
      }
      default:
        message = "Đã duyệt (không có side effect tự động trong demo).";
    }
    approval.execution_status = "executed";
    return { executed: true, message };
  }

  // -------------------------------------------------------------------------
  // Today / KPIs / audit
  // -------------------------------------------------------------------------

  async getTodayCards(user: SessionUser) {
    const ids = this.clientIdsFor(user);
    const clients = store.clients.filter((c) => ids.has(c.id));
    const tasks = store.tasks.filter(
      (t) => ids.has(t.client_account_id) && !t.deleted_at &&
        ["backlog", "assigned", "in_progress", "blocked", "in_review"].includes(t.status) &&
        t.due_at && Date.parse(t.due_at) < Date.now()
    );
    const approvals = store.approvals.filter((a) => ids.has(a.client_account_id) && a.decision === "pending");
    const risks = store.risks
      .map((r) => ({
        ...r,
        opportunity: store.opportunities.find((o) => o.id === r.product_opportunity_id)!,
      }))
      .filter((r) => r.opportunity && ids.has(r.opportunity.client_account_id));
    const listingsInReview = store.listings
      .filter((lv) => ["internal_review", "client_review"].includes(lv.status))
      .map((lv) => {
        const asin = store.asins.find((a) => a.id === lv.asin_id)!;
        const product = store.products.find((p) => p.id === asin.product_id)!;
        return {
          id: lv.id,
          title: lv.title,
          asin: asin.asin,
          client_account_id: product.client_account_id,
          version: lv.version_number,
          created_by: lv.created_by,
        };
      })
      .filter((l) => ids.has(l.client_account_id));
    const ppcAnomalies = store.recommendations.filter(
      (r) => ids.has(r.client_account_id) && r.module === "ppc" && ["analysis_ready", "pending_review"].includes(r.status)
    );
    const inventoryRows = (await this.listInventory()).filter((r) => ids.has(r.product.client_account_id));
    const inventoryRisks = inventoryRows
      .filter((r) => ["high", "critical"].includes(r.severity))
      .map((r) => ({
        sku: r.sku.sku,
        client_account_id: r.product.client_account_id,
        severity: r.severity,
        explanation: r.explanation,
        skuId: r.sku.id,
      }));
    const unanswered = store.threads
      .filter((t) => ids.has(t.client_account_id) && ["open", "pending_response"].includes(t.status))
      .map((t) => ({ thread: t, lastMessageAt: t.last_message_at }));
    const staleSources = store.sources
      .filter((s) => Date.now() - Date.parse(s.captured_at) > 14 * 86_400_000)
      .map((s) => {
        const opp = store.opportunities.find((o) => o.id === s.product_opportunity_id)!;
        return { ...s, client_account_id: opp.client_account_id, opportunity_name: opp.name };
      })
      .filter((s) => ids.has(s.client_account_id));
    const opportunities = store.opportunities
      .filter((o) => !o.deleted_at && ids.has(o.client_account_id))
      .map((o) => ({
        ...o,
        client_name: store.clients.find((c) => c.id === o.client_account_id)?.name ?? "?",
      }));

    const cards = buildTodayCards({
      clients,
      tasks,
      approvals,
      risks,
      listingsInReview,
      ppcAnomalies,
      inventoryRisks,
      unansweredMessages: canSeeCustomerMessages(user.role) ? unanswered : [],
      staleSources,
      topOpportunities: opportunities,
    });

    // Filter by module visibility per role
    const visibleByRole = (category: string): boolean => {
      switch (category) {
        case "ppc_anomaly": return can(user.role, "ppc", "read");
        case "stockout_risk": return can(user.role, "inventory_logistics", "read");
        case "listing_review": return can(user.role, "listing", "read");
        case "product_risk": case "opportunity": return can(user.role, "product_research", "read");
        case "customer_message": return canSeeCustomerMessages(user.role);
        default: return true;
      }
    };

    const readSet = new Set(store.readCards[user.id] ?? []);
    return cards
      .filter((c) => visibleByRole(c.category))
      .map((c) => ({ ...c, read: readSet.has(c.id) }))
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
        return order[a.severity] - order[b.severity];
      });
  }

  async markTodayCardRead(cardId: string, userId: string) {
    store.readCards[userId] ??= [];
    if (!store.readCards[userId].includes(cardId)) {
      store.readCards[userId].push(cardId);
    }
  }

  async getKpis(clientId?: string): Promise<KpiSnapshot> {
    const user = await this.requireUser();
    const ids = clientId ? new Set([clientId]) : this.clientIdsFor(user);
    const tasks = store.tasks.filter((t) => ids.has(t.client_account_id) && !t.deleted_at);
    const approvals = store.approvals.filter((a) => ids.has(a.client_account_id));
    const decided = approvals.filter((a) => a.decided_at && a.created_at);
    const turnarounds = decided.map(
      (a) => (Date.parse(a.decided_at!) - Date.parse(a.created_at)) / 3_600_000
    );
    const recs = store.recommendations.filter((r) => ids.has(r.client_account_id));
    const accepted = recs.filter((r) => ["approved", "executed", "scheduled"].includes(r.status)).length;
    const totalRecs = recs.filter((r) => r.status !== "detected").length;

    let avgMargin: number | null = null;
    let avgBeAcos: number | null = null;
    let blendedAcos: number | null = null;
    if (canSeeFinanceData(user.role)) {
      const margins = store.costProfiles
        .filter((c) => c.status === "approved" || c.status === "locked")
        .map((c) => computeEconomics({
          sellingPrice: c.selling_price, cogs: c.cogs, freight: c.freight, duty: c.duty,
          fbaFee: c.fba_fee, referralFee: c.referral_fee, storageCost: c.storage_cost,
          adAllowance: c.ad_allowance, returnAllowance: c.return_allowance,
          promotionAllowance: c.promotion_allowance, otherVariableCost: c.other_variable_cost,
          packaging: c.packaging, inspection: c.inspection, thirdPartyLogistics: c.third_party_logistics,
        }))
        .map((r) => r.contributionMarginPct);
      if (margins.length > 0) avgMargin = margins.reduce<number>((s, m) => s + (m ?? 0), 0) / margins.length;
      const beAcos = store.costProfiles
        .filter((c) => c.status === "approved" || c.status === "locked")
        .map((c) => computeEconomics({
          sellingPrice: c.selling_price, cogs: c.cogs, freight: c.freight, duty: c.duty,
          fbaFee: c.fba_fee, referralFee: c.referral_fee, storageCost: c.storage_cost,
          adAllowance: c.ad_allowance, returnAllowance: c.return_allowance,
          promotionAllowance: c.promotion_allowance, otherVariableCost: c.other_variable_cost,
          packaging: c.packaging, inspection: c.inspection, thirdPartyLogistics: c.third_party_logistics,
        }).breakEvenAcosPct);
      if (beAcos.length > 0) avgBeAcos = beAcos.reduce<number>((s, m) => s + (m ?? 0), 0) / beAcos.length;

      const campaignAggs = store.campaigns
        .filter((c) => ids.has(c.client_account_id))
        .map((c) => aggregateCampaignMetrics(c, store.metrics.filter((m) => m.campaign_id === c.id)));
      const spend = campaignAggs.reduce((s, a) => s + a.spend, 0);
      const sales = campaignAggs.reduce((s, a) => s + a.sales, 0);
      blendedAcos = sales > 0 ? spend / sales : null;
    }

    const inv = await this.listInventory(clientId);
    return {
      tasksTotal: tasks.length,
      tasksOverdue: tasks.filter((t) => t.due_at && Date.parse(t.due_at) < Date.now() && !["completed", "cancelled"].includes(t.status)).length,
      taskCompletionRate: tasks.length > 0
        ? tasks.filter((t) => t.status === "completed").length / tasks.length
        : 0,
      approvalsPending: approvals.filter((a) => a.decision === "pending").length,
      avgApprovalTurnaroundHours: turnarounds.length > 0
        ? turnarounds.reduce((s, t) => s + t, 0) / turnarounds.length
        : null,
      dataFreshnessIssues: store.sources.filter(
        (s) => Date.now() - Date.parse(s.captured_at) > 14 * 86_400_000
      ).length,
      recommendationAcceptanceRate: totalRecs > 0 ? accepted / totalRecs : null,
      avgContributionMarginPct: avgMargin,
      avgBreakEvenAcosPct: avgBeAcos,
      blendedAcos,
      blendedTacos: null,
      stockoutRiskCount: inv.filter((r) => ["high", "critical"].includes(r.severity)).length,
    };
  }

  async listAuditEvents(clientId?: string, limit = 50) {
    const user = await this.requireUser();
    if (!can(user.role, "audit_log", "read")) return [];
    const ids = this.clientIdsFor(user);
    let rows = store.audit.filter(
      (a): a is typeof a & { client_account_id: string } =>
        a.client_account_id !== null && ids.has(a.client_account_id)
    );
    if (clientId) rows = rows.filter((a) => a.client_account_id === clientId);
    return rows.slice(0, limit);
  }

  async listAiRuns(clientId?: string, limit = 20) {
    const user = await this.requireUser();
    let rows = store.aiRuns;
    if (clientId) rows = rows.filter((r) => r.client_account_id === clientId);
    return this.scoped(rows, user).slice(0, limit);
  }
}

export { DEMO_COOKIE };
