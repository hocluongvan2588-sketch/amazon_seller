/**
 * SupabaseAdapter — production implementation of DataAdapter over
 * Supabase (Postgres + RLS). Security is enforced by the RLS policies in
 * supabase/migrations/0002_rls.sql; this adapter never uses the service role
 * for user-facing flows. Complex view models reuse the same shared builders
 * as the demo adapter.
 *
 * NOTE: demo-only affordances (user switching, listDemoUsers) return
 * neutral values. Session comes from Supabase Auth.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type {
  AiRun,
  ApprovalRequest,
  CompetitorProduct,
  Profile,
  ClientAccount,
  ResearchSource,
  SessionUser,
  SystemRole,
} from "../types";
import type {
  CampaignWithMetrics,
  DataAdapter,
  InventoryRow,
  KpiSnapshot,
  LaunchDetail,
  ListingWithMeta,
  ThreadDetail,
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
} from "./adapter";
import { can, canApprove, canSeeCustomerMessages, canSeeFinanceData } from "../permissions";
import { scoreOpportunity } from "../domain/scoring";
import { aggregateCampaignMetrics, generatePpcRecommendations, DEFAULT_PPC_THRESHOLDS } from "../domain/recommendations";
import { listingAudit, marketSummary, reviewMining, classifyMessage, PROMPT_VERSIONS } from "../ai/engine";
import { buildInventoryRows, buildTodayCards } from "./builders";
import { normalizeCompetitorRows } from "../domain/import";

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, anon, {
    cookies: {
      getAll: async () => (await cookies()).getAll(),
      setAll: async (list) => {
        const jar = await cookies();
        for (const { name, value, options } of list) jar.set(name, value, options);
      },
    },
  });
}

class PermissionError extends Error {}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export class SupabaseAdapter implements DataAdapter {
  readonly mode = "supabase" as const;

  private async requireUser(): Promise<SessionUser> {
    const user = await this.getSessionUser();
    if (!user) throw new PermissionError("Chưa đăng nhập (Supabase Auth).");
    return user;
  }

  private assertModule(user: SessionUser, clientId: string, module: Parameters<typeof can>[1], action: Parameters<typeof can>[2]) {
    if (!can(user.role, module, action)) {
      throw new PermissionError(`Role "${user.role}" không có quyền ${action} trên ${module}. RLS sẽ chặn cả ở DB.`);
    }
  }

  async getSessionUser(): Promise<SessionUser | null> {
    const sb = supabase();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const { data: member } = await sb
      .from("organization_members")
      .select("role, department, organization_id, status")
      .eq("user_id", data.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member) return null;
    const { data: profile } = await sb
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("id", data.user.id)
      .maybeSingle();
    return {
      id: data.user.id,
      full_name: profile?.full_name || data.user.email || "?",
      email: profile?.email || data.user.email || "",
      role: member.role as SystemRole,
      department: member.department,
      organization_id: member.organization_id,
      avatar_url: profile?.avatar_url ?? null,
    };
  }

  async listDemoUsers() {
    return [];
  }

  async listMembers() {
    const sb = supabase();
    const { data } = await sb
      .from("organization_members")
      .select("*, profile:profiles(*)")
      .order("role");
    return (data ?? []).map((m) => ({
      ...m,
      profile: (m.profile as Profile) ?? null,
    }));
  }

  async listProfiles() {
    const sb = supabase();
    const { data } = await sb.from("profiles").select("*").order("full_name");
    return (data ?? []) as Profile[];
  }

  // --- clients ---------------------------------------------------------------

  async listClients() {
    const { data } = await supabase().from("client_accounts").select("*").order("name");
    return data ?? [];
  }

  async getClient(id: string) {
    const { data } = await supabase().from("client_accounts").select("*").eq("id", id).maybeSingle();
    return data ?? null;
  }

  // --- product research ---------------------------------------------------------

  async listOpportunities(clientId?: string) {
    let q = supabase()
      .from("product_opportunities")
      .select("*, client:client_accounts(name)")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (clientId) q = q.eq("client_account_id", clientId);
    const { data } = await q;
    return (data ?? []).map((o) => ({
      ...o,
      client_name: (o.client as { name?: string })?.name ?? "?",
    }));
  }

  async getOpportunity(id: string): Promise<OpportunityDetail | null> {
    const sb = supabase();
    const { data: opp } = await sb
      .from("product_opportunities")
      .select("*, client:client_accounts(*), owner:profiles!product_opportunities_owner_user_id_fkey(*)")
      .eq("id", id)
      .maybeSingle();
    if (!opp) return null;

    const [sources, competitors, insights, suppliers, risks] = await Promise.all([
      sb.from("research_sources").select("*").eq("product_opportunity_id", id),
      sb.from("competitor_products").select("*").eq("product_opportunity_id", id),
      sb.from("review_insights").select("*").eq("product_opportunity_id", id),
      sb.from("supplier_candidates").select("*").eq("product_opportunity_id", id),
      sb.from("risk_items").select("*").eq("product_opportunity_id", id),
    ]);

    const { data: product } = await sb
      .from("products")
      .select("id")
      .eq("product_opportunity_id", id)
      .maybeSingle();
    let economics: OpportunityDetail["economics"] = null;
    if (product) {
      const { data: asin } = await sb.from("asins").select("id").eq("product_id", product.id).maybeSingle();
      if (asin) {
        const { data: sku } = await sb.from("skus").select("id").eq("asin_id", asin.id).maybeSingle();
        if (sku) {
          const { data: cost } = await sb
            .from("cost_profiles")
            .select("*")
            .eq("sku_id", sku.id)
            .eq("scenario", "base")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (cost) {
            economics = {
              sellingPrice: Number(cost.selling_price), cogs: Number(cost.cogs),
              freight: Number(cost.freight), duty: Number(cost.duty),
              fbaFee: cost.fba_fee === null ? null : Number(cost.fba_fee),
              referralFee: cost.referral_fee === null ? null : Number(cost.referral_fee),
              storageCost: Number(cost.storage_cost), adAllowance: Number(cost.ad_allowance),
              returnAllowance: Number(cost.return_allowance),
              promotionAllowance: Number(cost.promotion_allowance),
              otherVariableCost: Number(cost.other_variable_cost),
              packaging: Number(cost.packaging), inspection: Number(cost.inspection),
              thirdPartyLogistics: Number(cost.third_party_logistics),
            };
          }
        }
      }
    }

    const compList = (competitors.data ?? []) as CompetitorProduct[];
    const srcList = (sources.data ?? []) as ResearchSource[];
    const insList = insights.data ?? [];
    const riskList = risks.data ?? [];

    return {
      opportunity: opp,
      sources: srcList,
      competitors: compList,
      reviewInsights: insList,
      suppliers: suppliers.data ?? [],
      risks: riskList,
      economics,
      score: scoreOpportunity({
        competitors: compList,
        reviewInsights: insList,
        risks: riskList,
        economics,
        sourceCount: srcList.length,
      }),
      client: (opp.client as ClientAccount | null) ?? null,
      owner: (opp.owner as Profile) ?? null,
    };
  }

  async createOpportunity(input: NewOpportunityInput, userId: string) {
    const user = await this.requireUser();
    this.assertModule(user, input.client_account_id, "product_research", "create");
    const { data, error } = await supabase()
      .from("product_opportunities")
      .insert({
        organization_id: user.organization_id,
        client_account_id: input.client_account_id,
        name: input.name,
        category: input.category ?? null,
        marketplace: input.marketplace ?? "US",
        target_price: input.target_price ?? null,
        owner_user_id: userId,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateOpportunityStage(id: string, stage: string) {
    const { error } = await supabase()
      .from("product_opportunities")
      .update({ stage })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async addSource(input: NewSourceInput, userId: string) {
    const { data, error } = await supabase()
      .from("research_sources")
      .insert({
        product_opportunity_id: input.product_opportunity_id,
        source_type: input.source_type,
        provider_name: input.provider_name,
        source_url: input.source_url ?? null,
        captured_at: input.captured_at ?? new Date().toISOString(),
        uploaded_by: userId,
        file_name: input.file_name ?? null,
        metadata: input.metadata ?? {},
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ResearchSource;
  }

  async addCompetitors(input: NewCompetitorInput[], userId: string) {
    void userId;
    const { data, error } = await supabase()
      .from("competitor_products")
      .insert(
        input.map((c) => ({
          product_opportunity_id: c.product_opportunity_id,
          asin: c.asin ?? null, title: c.title, brand: c.brand ?? null,
          price: c.price ?? null, rating: c.rating ?? null, review_count: c.review_count ?? null,
          bsr: c.bsr ?? null, monthly_sales: c.monthly_sales ?? null,
          monthly_revenue: c.monthly_revenue ?? null,
        }))
      )
      .select();
    if (error) throw new Error(error.message);
    return (data ?? []) as CompetitorProduct[];
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

  async deleteCompetitor(id: string) {
    const { error } = await supabase().from("competitor_products").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async addSupplier(input: Parameters<DataAdapter["addSupplier"]>[0], userId: string) {
    void userId;
    const { data, error } = await supabase()
      .from("supplier_candidates")
      .insert({
        product_opportunity_id: input.product_opportunity_id,
        supplier_name: input.supplier_name,
        country: input.country ?? null,
        moq: input.moq ?? null,
        quoted_cogs: input.quoted_cogs ?? null,
        lead_time_days: input.lead_time_days ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateSupplier(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase().from("supplier_candidates").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async addRisk(input: Parameters<DataAdapter["addRisk"]>[0], userId: string) {
    void userId;
    const { data, error } = await supabase()
      .from("risk_items")
      .insert({
        product_opportunity_id: input.product_opportunity_id,
        category: input.category,
        description: input.description,
        severity: input.severity,
        mitigation: input.mitigation ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateRisk(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase().from("risk_items").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async runAnalysis(opportunityId: string, useCase: "market" | "review", userId: string) {
    void userId;
    const detail = await this.getOpportunity(opportunityId);
    if (!detail) throw new Error("Không tìm thấy opportunity");
    const output = useCase === "market" ? marketSummary(detail) : reviewMining(detail);
    const insufficient = output.findings.length === 0 && output.missing_data.length > 0;
    const aiRun: AiRun = {
      id: uid("air"),
      client_account_id: detail.opportunity.client_account_id,
      use_case: useCase === "market" ? "market_summary" : "review_mining",
      model_name: "heuristic-engine",
      prompt_version: useCase === "market" ? PROMPT_VERSIONS.market_summary : PROMPT_VERSIONS.review_mining,
      input_record_ids: [...detail.sources.map((s) => s.id), ...detail.competitors.map((c) => c.id)].slice(0, 30),
      output_json: output as unknown as Record<string, unknown>,
      token_usage: null,
      status: insufficient ? "insufficient_evidence" : "succeeded",
      reviewed_by: null,
      created_at: new Date().toISOString(),
    };
    await supabase().from("ai_runs").insert({
      client_account_id: aiRun.client_account_id,
      use_case: aiRun.use_case,
      model_name: aiRun.model_name,
      prompt_version: aiRun.prompt_version,
      input_record_ids: aiRun.input_record_ids,
      output_json: aiRun.output_json,
      status: aiRun.status,
    });
    return { output, aiRun };
  }

  async submitDecision(opportunityId: string, input: DecisionInput, userId: string) {
    const detail = await this.getOpportunity(opportunityId);
    if (!detail) throw new Error("Không tìm thấy opportunity");
    const { data, error } = await supabase()
      .from("approval_requests")
      .insert({
        client_account_id: detail.opportunity.client_account_id,
        request_type: "product_decision",
        entity_type: "product_opportunity",
        entity_id: opportunityId,
        title: `Go/No-Go: ${detail.opportunity.name} — đề xuất ${input.decision.toUpperCase()}`,
        payload_snapshot: { decision: input.decision, reason: input.reason },
        requested_by: userId,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await this.updateOpportunityStage(opportunityId, "pending_decision");
    return data as ApprovalRequest;
  }

  async convertToLaunch(opportunityId: string, userId: string) {
    const sb = supabase();
    const detail = await this.getOpportunity(opportunityId);
    if (!detail) throw new Error("Không tìm thấy opportunity");
    if (!["go", "go_with_conditions"].includes(detail.opportunity.decision ?? "")) {
      throw new Error("Chỉ opportunity GO / GO WITH CONDITIONS mới chuyển được launch project.");
    }
    const { data: product, error: pErr } = await sb
      .from("products")
      .insert({
        client_account_id: detail.opportunity.client_account_id,
        product_opportunity_id: opportunityId,
        name: detail.opportunity.name,
        category: detail.opportunity.category,
      })
      .select()
      .single();
    if (pErr || !product) throw new Error(pErr?.message ?? "Không tạo được product");
    const { data: asin, error: aErr } = await sb
      .from("asins")
      .insert({ product_id: product.id, asin: `PENDING-${opportunityId.slice(-6).toUpperCase()}`, marketplace: detail.opportunity.marketplace, title: detail.opportunity.name })
      .select()
      .single();
    if (aErr || !asin) throw new Error(aErr?.message ?? "Không tạo được ASIN");
    await sb.from("skus").insert({ asin_id: asin.id, sku: `SKU-${Date.now().toString(36).toUpperCase()}` });
    const { data: launch, error: lErr } = await sb
      .from("launch_projects")
      .insert({
        client_account_id: detail.opportunity.client_account_id,
        product_id: product.id,
        owner_user_id: userId,
        checklist: [
          { key: "supplier_confirmed", label: "Chốt supplier & PO", done: false, department: "sourcing" },
          { key: "listing_draft", label: "Listing draft hoàn chỉnh", done: false, department: "content" },
          { key: "cost_profile", label: "Cost profile được duyệt", done: false, department: "finance" },
          { key: "first_shipment", label: "Shipment đầu tiên lên đường", done: false, department: "inventory" },
          { key: "ppc_ready", label: "Campaign launch sẵn sàng", done: false, department: "ppc" },
        ],
      })
      .select()
      .single();
    if (lErr || !launch) throw new Error(lErr?.message ?? "Không tạo được launch");
    await sb.from("products").update({ launch_project_id: launch.id }).eq("id", product.id);
    return { launchId: launch.id, productId: product.id };
  }

  // --- economics ------------------------------------------------------------------

  async listCostProfiles(skuId: string) {
    const { data } = await supabase()
      .from("cost_profiles")
      .select("*")
      .eq("sku_id", skuId)
      .order("created_at", { ascending: false });
    return data ?? [];
  }

  async saveCostProfile(input: NewCostProfileInput, userId: string) {
    const { data, error } = await supabase()
      .from("cost_profiles")
      .insert({
        sku_id: input.sku_id,
        marketplace: input.marketplace ?? "US",
        currency: input.currency ?? "USD",
        selling_price: input.sellingPrice, cogs: input.cogs, freight: input.freight,
        duty: input.duty, fba_fee: input.fbaFee, referral_fee: input.referralFee,
        storage_cost: input.storageCost, ad_allowance: input.adAllowance,
        return_allowance: input.returnAllowance, promotion_allowance: input.promotionAllowance,
        other_variable_cost: input.otherVariableCost, packaging: input.packaging,
        inspection: input.inspection, third_party_logistics: input.thirdPartyLogistics,
        scenario: input.scenario ?? "base",
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async submitCostProfileApproval(id: string, userId: string) {
    await supabase().from("cost_profiles").update({ status: "pending_approval" }).eq("id", id);
    const { data, error } = await supabase()
      .from("approval_requests")
      .insert({
        request_type: "cost_profile",
        entity_type: "cost_profile",
        entity_id: id,
        title: `Duyệt cost profile ${id.slice(0, 8)}`,
        payload_snapshot: { cost_profile_id: id },
        requested_by: userId,
        client_account_id: (await this.skuClientId(id)) ?? "",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ApprovalRequest;
  }

  private async skuClientId(costProfileId: string): Promise<string | null> {
    const sb = supabase();
    const { data: cp } = await sb.from("cost_profiles").select("sku_id").eq("id", costProfileId).maybeSingle();
    if (!cp) return null;
    const { data: sku } = await sb.from("skus").select("asin_id").eq("id", cp.sku_id).maybeSingle();
    if (!sku) return null;
    const { data: asin } = await sb.from("asins").select("product_id").eq("id", sku.asin_id).maybeSingle();
    if (!asin) return null;
    const { data: product } = await sb.from("products").select("client_account_id").eq("id", asin.product_id).maybeSingle();
    return product?.client_account_id ?? null;
  }

  // --- launches & listings -----------------------------------------------------------

  async listLaunches(clientId?: string) {
    let q = supabase()
      .from("launch_projects")
      .select("*, product:products(name), client:client_accounts(name)")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (clientId) q = q.eq("client_account_id", clientId);
    const { data } = await q;
    return (data ?? []).map((l) => ({
      ...l,
      product_name: (l.product as { name?: string })?.name ?? "?",
      client_name: (l.client as { name?: string })?.name ?? "?",
    }));
  }

  async getLaunch(id: string): Promise<LaunchDetail | null> {
    const sb = supabase();
    const { data: launch } = await sb.from("launch_projects").select("*").eq("id", id).maybeSingle();
    if (!launch) return null;
    const { data: product } = await sb.from("products").select("*").eq("id", launch.product_id).maybeSingle();
    const asin = product
      ? (await sb.from("asins").select("*").eq("product_id", product.id).maybeSingle()).data ?? null
      : null;
    const skus = asin ? (await sb.from("skus").select("*").eq("asin_id", asin.id)).data ?? [] : [];
    const tasks = (await sb.from("tasks").select("*").eq("client_account_id", launch.client_account_id).is("deleted_at", null)).data ?? [];
    const opportunity = product?.product_opportunity_id
      ? (await sb.from("product_opportunities").select("*").eq("id", product.product_opportunity_id).maybeSingle()).data ?? null
      : null;
    return { launch, product: product ?? null, asin, skus, tasks, opportunity };
  }

  async updateLaunchStage(id: string, stage: string) {
    const { error } = await supabase().from("launch_projects").update({ stage }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async toggleChecklistItem(launchId: string, itemKey: string) {
    const sb = supabase();
    const { data: launch } = await sb.from("launch_projects").select("checklist").eq("id", launchId).maybeSingle();
    if (!launch) throw new Error("Không tìm thấy launch");
    const checklist = (launch.checklist as { key: string; done: boolean }[]).map((i) =>
      i.key === itemKey ? { ...i, done: !i.done } : i
    );
    await sb.from("launch_projects").update({ checklist }).eq("id", launchId);
  }

  async listListings(clientId?: string): Promise<ListingWithMeta[]> {
    const sb = supabase();
    let pq = sb.from("products").select("*, asins(*)");
    if (clientId) pq = pq.eq("client_account_id", clientId);
    const { data: products } = await pq;
    const out: ListingWithMeta[] = [];
    for (const product of products ?? []) {
      for (const asin of (product.asins ?? []) as { id: string }[]) {
        const { data: versions } = await sb
          .from("listing_versions")
          .select("*")
          .eq("asin_id", asin.id)
          .order("version_number", { ascending: false });
        if (versions && versions.length > 0) {
          out.push({
            asin: asin as ListingWithMeta["asin"],
            product: product as ListingWithMeta["product"],
            versions,
          });
        }
      }
    }
    return out;
  }

  async createListingVersion(input: NewListingVersionInput, userId: string) {
    const sb = supabase();
    const { data: latest } = await sb
      .from("listing_versions")
      .select("version_number")
      .eq("asin_id", input.asin_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await sb
      .from("listing_versions")
      .insert({
        asin_id: input.asin_id,
        version_number: (latest?.version_number ?? 0) + 1,
        title: input.title, bullets: input.bullets, description: input.description,
        backend_terms: input.backend_terms, change_reason: input.change_reason ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async transitionListing(id: string, status: string, userId: string) {
    const patch: Record<string, unknown> = { status };
    if (status === "approved" || status === "published" || status === "ready_to_publish") {
      patch.approved_by = userId;
      patch.approved_at = new Date().toISOString();
    }
    const { error } = await supabase().from("listing_versions").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async submitListingForApproval(id: string, userId: string) {
    const sb = supabase();
    const { data: lv } = await sb.from("listing_versions").select("*").eq("id", id).maybeSingle();
    if (!lv) throw new Error("Không tìm thấy listing version");
    const { data: asin } = await sb.from("asins").select("*").eq("id", lv.asin_id).maybeSingle();
    const { data: product } = await sb.from("products").select("client_account_id").eq("id", asin?.product_id ?? "").maybeSingle();
    await this.transitionListing(id, "internal_review", userId);
    const { data, error } = await sb
      .from("approval_requests")
      .insert({
        client_account_id: product?.client_account_id ?? "",
        request_type: "listing_publish",
        entity_type: "listing_version",
        entity_id: id,
        title: `Publish listing ${asin?.asin ?? ""} v${lv.version_number}`,
        payload_snapshot: { title: lv.title, version: lv.version_number },
        requested_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ApprovalRequest;
  }

  async rollbackListing(asinId: string, userId: string) {
    const sb = supabase();
    const { data: versions } = await sb
      .from("listing_versions")
      .select("*")
      .eq("asin_id", asinId)
      .order("version_number", { ascending: false });
    const list = versions ?? [];
    const latestPublished = list.find((v) => v.status === "published");
    const current = list[0];
    if (!latestPublished) throw new Error("Không có version đã publish để rollback.");
    if (current && current.id !== latestPublished.id) {
      await sb.from("listing_versions").update({ status: "rejected", change_reason: `Rolled back về v${latestPublished.version_number}` }).eq("id", current.id);
    }
  }

  async auditListing(input: { asin_id: string; version_id: string }, userId: string) {
    void userId;
    const sb = supabase();
    const { data: lv } = await sb.from("listing_versions").select("*").eq("id", input.version_id).maybeSingle();
    if (!lv) throw new Error("Không tìm thấy listing version");
    const { data: previous } = await sb
      .from("listing_versions")
      .select("*")
      .eq("asin_id", input.asin_id)
      .lt("version_number", lv.version_number)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const output = listingAudit({ version: lv, previous: previous ?? null });
    const aiRun: AiRun = {
      id: uid("air"),
      client_account_id: "",
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
    return { ...output, aiRun };
  }

  // --- PPC --------------------------------------------------------------------------

  async listCampaigns(clientId?: string): Promise<CampaignWithMetrics[]> {
    const sb = supabase();
    let q = sb.from("ad_campaigns").select("*").order("name");
    if (clientId) q = q.eq("client_account_id", clientId);
    const { data: campaigns } = await q;
    const out: CampaignWithMetrics[] = [];
    for (const campaign of campaigns ?? []) {
      const { data: metrics } = await sb
        .from("ad_metrics_daily")
        .select("*")
        .eq("campaign_id", campaign.id)
        .order("metric_date");
      const m = metrics ?? [];
      const agg = aggregateCampaignMetrics(campaign, m);
      out.push({
        campaign,
        metrics: m,
        totals: {
          impressions: agg.impressions, clicks: agg.clicks, spend: agg.spend,
          orders: agg.orders, sales: agg.sales, ctr: agg.ctr, cvr: agg.cvr, acos: agg.acos,
        },
      });
    }
    return out;
  }

  async listRecommendations(clientId?: string) {
    let q = supabase().from("recommendations").select("*").order("created_at", { ascending: false });
    if (clientId) q = q.eq("client_account_id", clientId);
    const { data } = await q;
    return data ?? [];
  }

  async refreshPpcRecommendations(clientId: string, userId: string) {
    void userId;
    const aggs = (await this.listCampaigns(clientId)).map((c) =>
      aggregateCampaignMetrics(c.campaign, c.metrics)
    );
    const fresh = generatePpcRecommendations(aggs);
    const sb = supabase();
    // Idempotent refresh: replace existing analysis_ready ppc recs for this client
    await sb.from("recommendations").delete().eq("client_account_id", clientId).eq("module", "ppc");
    if (fresh.length > 0) await sb.from("recommendations").insert(fresh.map(({ id: _id, ...r }) => r));
    return fresh;
  }

  async decideRecommendation(id: string, decision: "approved" | "rejected", userId: string) {
    void userId;
    const { error } = await supabase().from("recommendations").update({ status: decision }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async executeRecommendation(id: string, userId: string) {
    void userId;
    const sb = supabase();
    const { data: rec } = await sb.from("recommendations").select("*").eq("id", id).maybeSingle();
    if (!rec) throw new Error("Không tìm thấy recommendation");
    if (rec.status !== "approved") {
      return { ok: false, message: "Recommendation phải được APPROVE trước khi execute (guardrail §5.6)." };
    }
    const action = rec.proposed_action as { type: string; campaign_id?: string; proposed_budget?: number; increase_amount?: number };
    if (action.type === "increase_daily_budget") {
      if ((action.increase_amount ?? 0) > DEFAULT_PPC_THRESHOLDS.dailyBudgetApprovalLimit) {
        await sb.from("recommendations").update({ status: "failed" }).eq("id", id);
        return { ok: false, message: `Blocked: vượt daily approval limit $${DEFAULT_PPC_THRESHOLDS.dailyBudgetApprovalLimit}.` };
      }
      await sb.from("ad_campaigns").update({ daily_budget: action.proposed_budget }).eq("id", action.campaign_id);
    }
    await sb.from("recommendations").update({ status: "executed" }).eq("id", id);
    return { ok: true, message: "Đã execute (ghi audit ở DB trigger)." };
  }

  // --- inventory -----------------------------------------------------------------------

  async listInventory(clientId?: string): Promise<InventoryRow[]> {
    const sb = supabase();
    let pq = sb.from("products").select("*, asins(*, skus(*))");
    if (clientId) pq = pq.eq("client_account_id", clientId);
    const { data: products } = await pq;
    const rows: Parameters<typeof buildInventoryRows>[0] = [];
    for (const product of products ?? []) {
      for (const asin of (product.asins ?? []) as { id: string; skus?: { id: string }[] }[]) {
        for (const sku of asin.skus ?? []) {
          const { data: snapshots } = await sb
            .from("inventory_snapshots")
            .select("*")
            .eq("sku_id", sku.id)
            .order("snapshot_date", { ascending: false })
            .limit(1);
          const snapshot = snapshots?.[0];
          if (!snapshot) continue;
          const { data: leadTime } = await sb.from("lead_time_configs").select("*").eq("sku_id", sku.id).maybeSingle();
          const { data: shipments } = await sb
            .from("shipments")
            .select("eta, sku_lines, status")
            .eq("client_account_id", product.client_account_id)
            .in("status", ["booked", "in_transit", "customs"]);
          const inbound = (shipments ?? []).find((s) =>
            ((s.sku_lines as { sku_id: string }[]) ?? []).some((l) => l.sku_id === sku.id)
          );
          rows.push({
            snapshot,
            leadTime: leadTime ?? null,
            sku: sku as InventoryRow["sku"],
            asin: asin as InventoryRow["asin"],
            product: product as InventoryRow["product"],
            inboundEta: inbound?.eta ?? null,
          });
        }
      }
    }
    return buildInventoryRows(rows) as InventoryRow[];
  }

  async saveSnapshot(input: NewSnapshotInput, userId: string) {
    void userId;
    const { data, error } = await supabase()
      .from("inventory_snapshots")
      .insert({
        sku_id: input.sku_id,
        snapshot_date: input.snapshot_date,
        sellable_units: input.sellable_units,
        reserved_units: input.reserved_units ?? 0,
        inbound_units: input.inbound_units ?? 0,
        unfulfillable_units: input.unfulfillable_units ?? 0,
        units_sold: input.units_sold,
        observation_days: input.observation_days ?? 30,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async saveLeadTime(input: NewLeadTimeInput, userId: string) {
    void userId;
    const sb = supabase();
    const { data: existing } = await sb.from("lead_time_configs").select("id").eq("sku_id", input.sku_id).maybeSingle();
    const payload = {
      production_lead_time_days: input.production_lead_time_days,
      freight_lead_time_days: input.freight_lead_time_days,
      customs_buffer_days: input.customs_buffer_days,
      safety_stock_units: input.safety_stock_units,
      reorder_quantity: input.reorder_quantity,
      route: input.route ?? "VN → US (sea)",
    };
    if (existing) {
      const { data } = await sb.from("lead_time_configs").update(payload).eq("id", existing.id).select().single();
      return data;
    }
    const { data, error } = await sb.from("lead_time_configs").insert({ sku_id: input.sku_id, ...payload }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async listShipments(clientId?: string) {
    let q = supabase().from("shipments").select("*").order("created_at", { ascending: false });
    if (clientId) q = q.eq("client_account_id", clientId);
    const { data } = await q;
    return data ?? [];
  }

  async createReorderRecommendation(skuId: string, userId: string) {
    void userId;
    const row = (await this.listInventory()).find((r) => r.skuId === skuId);
    const { data, error } = await supabase()
      .from("recommendations")
      .insert({
        client_account_id: row?.product.client_account_id ?? "",
        module: "inventory",
        recommendation_type: "reorder_draft",
        title: `Reorder draft: ${row?.sku.sku ?? skuId}`,
        explanation: row?.explanation ?? "",
        evidence_ids: [row?.snapshot.id ?? skuId],
        confidence: "high",
        impact: "high",
        proposed_action: { type: "create_reorder", sku_id: skuId, quantity: row?.reorderQuantity ?? 500 },
        guardrails: { requiresApproval: true },
        status: "pending_review",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  // --- customer service --------------------------------------------------------------------

  async listThreads(clientId?: string) {
    const user = await this.requireUser();
    if (!canSeeCustomerMessages(user.role)) return [];
    let q = supabase().from("customer_threads").select("*").order("last_message_at", { ascending: false });
    if (clientId) q = q.eq("client_account_id", clientId);
    const { data } = await q;
    return data ?? [];
  }

  async getThread(id: string): Promise<ThreadDetail | null> {
    const user = await this.requireUser();
    if (!canSeeCustomerMessages(user.role)) throw new PermissionError("Tin nhắn chỉ dành cho CS/AM/admin/owner/reviewer.");
    const sb = supabase();
    const { data: thread } = await sb.from("customer_threads").select("*").eq("id", id).maybeSingle();
    if (!thread) return null;
    const { data: messages } = await sb
      .from("customer_messages")
      .select("*")
      .eq("thread_id", id)
      .order("created_at");
    return { thread, messages: messages ?? [] };
  }

  async classifyThread(threadId: string, userId: string) {
    void userId;
    const sb = supabase();
    const { data: msg } = await sb
      .from("customer_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!msg) throw new Error("Thread không có tin nhắn inbound.");
    const cls = classifyMessage(msg.message_text);
    const { data, error } = await sb
      .from("customer_messages")
      .update({
        intent: cls.intent, urgency: cls.urgency, ai_summary: cls.summary,
        policy_risk_level: cls.policy_risk_level, policy_risk_notes: cls.policy_risk_notes,
        reply_draft: cls.reply_draft, status: "drafting",
      })
      .eq("id", msg.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async draftReply(messageId: string, userId: string) {
    void userId;
    const sb = supabase();
    const { data: msg } = await sb.from("customer_messages").select("*").eq("id", messageId).maybeSingle();
    if (!msg) throw new Error("Không tìm thấy message");
    if (!msg.reply_draft) {
      const cls = classifyMessage(msg.message_text);
      const { data, error } = await sb
        .from("customer_messages")
        .update({ reply_draft: cls.reply_draft, status: "drafting" })
        .eq("id", messageId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
    return msg;
  }

  async submitReplyForApproval(messageId: string, replyText: string, userId: string) {
    const sb = supabase();
    const { data: msg } = await sb.from("customer_messages").select("*").eq("id", messageId).maybeSingle();
    if (!msg) throw new Error("Không tìm thấy message");
    const { data: thread } = await sb.from("customer_threads").select("*").eq("id", msg.thread_id).maybeSingle();
    await sb.from("customer_messages").update({ reply_draft: replyText, status: "pending_approval" }).eq("id", messageId);
    const { data, error } = await sb
      .from("approval_requests")
      .insert({
        client_account_id: thread?.client_account_id ?? "",
        request_type: "customer_response",
        entity_type: "customer_message",
        entity_id: messageId,
        title: `Duyệt reply: ${thread?.subject ?? thread?.customer_reference ?? ""}`,
        payload_snapshot: { reply: replyText.slice(0, 500) },
        requested_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ApprovalRequest;
  }

  async markThreadStatus(threadId: string, status: string) {
    const { error } = await supabase().from("customer_threads").update({ status }).eq("id", threadId);
    if (error) throw new Error(error.message);
  }

  // --- tasks & approvals ------------------------------------------------------------------------

  async listTasks(clientId?: string, filters?: { status?: string; assigneeId?: string }) {
    let q = supabase().from("tasks").select("*").is("deleted_at", null).order("due_at");
    if (clientId) q = q.eq("client_account_id", clientId);
    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.assigneeId) q = q.eq("assignee_id", filters.assigneeId);
    const { data } = await q;
    return data ?? [];
  }

  async getTask(id: string) {
    const { data } = await supabase().from("tasks").select("*").eq("id", id).maybeSingle();
    return data ?? null;
  }

  async createTask(input: NewTaskInput, userId: string) {
    const { data, error } = await supabase()
      .from("tasks")
      .insert({
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
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateTask(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase().from("tasks").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async addTaskComment(taskId: string, body: string, userId: string) {
    const { error } = await supabase()
      .from("task_comments")
      .insert({ task_id: taskId, author_id: userId, body });
    if (error) throw new Error(error.message);
  }

  async listApprovals(clientId?: string, status?: string | null) {
    let q = supabase().from("approval_requests").select("*").order("created_at", { ascending: false });
    if (clientId) q = q.eq("client_account_id", clientId);
    if (status) q = q.eq("decision", status);
    const { data } = await q;
    return data ?? [];
  }

  async decideApproval(id: string, decision: "approved" | "rejected", reason: string, userId: string) {
    const user = await this.requireUser();
    if (!canApprove(user.role, "approvals")) {
      throw new PermissionError("Chỉ reviewer/admin/owner được quyết approval.");
    }
    const sb = supabase();
    const { data: approval } = await sb.from("approval_requests").select("*").eq("id", id).maybeSingle();
    if (!approval) throw new Error("Không tìm thấy approval request");
    const { error } = await sb
      .from("approval_requests")
      .update({ decision, decision_reason: reason, reviewed_by: userId, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    if (decision !== "approved") return { executed: false, message: "Đã TỪ CHỐI." };

    let message = "Đã duyệt.";
    switch (approval.request_type) {
      case "product_decision": {
        const payload = approval.payload_snapshot as { decision: string; reason?: string };
        await sb.from("product_opportunities").update({
          decision: payload.decision,
          decision_reason: payload.reason ?? reason,
          decided_by: userId,
          decided_at: new Date().toISOString(),
          stage: payload.decision,
        }).eq("id", approval.entity_id);
        message = `Đã ghi nhận quyết định ${payload.decision.toUpperCase()}.`;
        break;
      }
      case "cost_profile": {
        await sb.from("cost_profiles").update({ status: "approved", approved_by: userId }).eq("id", approval.entity_id);
        message = "Cost profile đã được duyệt.";
        break;
      }
      case "listing_publish": {
        await this.transitionListing(approval.entity_id, "ready_to_publish", userId);
        message = "Listing đã sẵn sàng publish.";
        break;
      }
      case "customer_response": {
        await sb.from("customer_messages").update({ status: "approved" }).eq("id", approval.entity_id);
        message = "Reply đã được duyệt.";
        break;
      }
      default:
        message = "Đã duyệt.";
    }
    await sb.from("approval_requests").update({ execution_status: "executed" }).eq("id", id);
    return { executed: true, message };
  }

  // --- today / kpis / audit ---------------------------------------------------------------------------

  async getTodayCards(user: SessionUser) {
    const [clients, tasks, approvals, launches] = await Promise.all([
      this.listClients(),
      this.listTasks(),
      this.listApprovals(),
      this.listLaunches(),
    ]);
    const risks = (await supabase().from("risk_items").select("*, opportunity:product_opportunities(*)")).data ?? [];
    const listings = await this.listListings();
    const ppcRecs = (await this.listRecommendations()).filter(
      (r) => r.module === "ppc" && ["analysis_ready", "pending_review"].includes(r.status)
    );
    const inventory = await this.listInventory();
    const threads = await this.listThreads();
    const sources = (await supabase().from("research_sources").select("*, opportunity:product_opportunities(client_account_id, name)")).data ?? [];

    const cards = buildTodayCards({
      clients,
      tasks: tasks.filter((t) => t.due_at && Date.parse(t.due_at) < Date.now() && !["completed", "cancelled"].includes(t.status)),
      approvals: approvals.filter((a) => a.decision === "pending"),
      risks: risks
        .filter((r) => (r.opportunity as { client_account_id?: string } | null)?.client_account_id)
        .map((r) => ({ ...r, opportunity: r.opportunity as never })),
      listingsInReview: listings.flatMap((l) =>
        l.versions
          .filter((v) => ["internal_review", "client_review"].includes(v.status))
          .map((v) => ({
            id: v.id, title: v.title, asin: l.asin.asin,
            client_account_id: l.product?.client_account_id ?? "",
            version: v.version_number, created_by: v.created_by,
          }))
      ),
      ppcAnomalies: ppcRecs,
      inventoryRisks: inventory
        .filter((r) => ["high", "critical"].includes(r.severity))
        .map((r) => ({
          sku: r.sku.sku, client_account_id: r.product.client_account_id,
          severity: r.severity, explanation: r.explanation, skuId: r.sku.id,
        })),
      unansweredMessages: threads
        .filter((t) => ["open", "pending_response"].includes(t.status))
        .map((t) => ({ thread: t, lastMessageAt: t.last_message_at })),
      staleSources: sources
        .filter((s) => Date.now() - Date.parse(s.captured_at) > 14 * 86_400_000)
        .map((s) => {
          const opp = s.opportunity as { client_account_id: string; name: string } | null;
          return { ...s, client_account_id: opp?.client_account_id ?? "", opportunity_name: opp?.name ?? "?" };
        }),
      topOpportunities: await this.listOpportunities(),
    });
    void launches;
    const visible = (category: string) => {
      switch (category) {
        case "ppc_anomaly": return can(user.role, "ppc", "read");
        case "stockout_risk": return can(user.role, "inventory_logistics", "read");
        case "listing_review": return can(user.role, "listing", "read");
        case "product_risk": case "opportunity": return can(user.role, "product_research", "read");
        case "customer_message": return canSeeCustomerMessages(user.role);
        default: return true;
      }
    };
    return cards.filter((c) => visible(c.category)).sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      return order[a.severity] - order[b.severity];
    });
  }

  async markTodayCardRead(cardId: string, userId: string) {
    // Read-state persistence for Today cards is a UX nicety: stored in a
    // platform_settings row per user in production. No-op default.
    void cardId; void userId;
  }

  async getKpis(clientId?: string): Promise<KpiSnapshot> {
    const user = await this.requireUser();
    const [tasks, approvals, recs, inventory] = await Promise.all([
      this.listTasks(clientId),
      this.listApprovals(clientId),
      this.listRecommendations(clientId),
      this.listInventory(clientId),
    ]);
    const decided = approvals.filter((a) => a.decided_at && a.created_at);
    const turnarounds = decided.map((a) => (Date.parse(a.decided_at!) - Date.parse(a.created_at)) / 3_600_000);
    const accepted = recs.filter((r) => ["approved", "executed", "scheduled"].includes(r.status)).length;
    const totalRecs = recs.filter((r) => r.status !== "detected").length;

    let avgMargin: number | null = null;
    let avgBeAcos: number | null = null;
    let blendedAcos: number | null = null;
    if (canSeeFinanceData(user.role)) {
      const campaigns = await this.listCampaigns(clientId);
      const spend = campaigns.reduce((s, c) => s + c.totals.spend, 0);
      const sales = campaigns.reduce((s, c) => s + c.totals.sales, 0);
      blendedAcos = sales > 0 ? spend / sales : null;
      void avgMargin; void avgBeAcos;
    }

    return {
      tasksTotal: tasks.length,
      tasksOverdue: tasks.filter((t) => t.due_at && Date.parse(t.due_at) < Date.now() && !["completed", "cancelled"].includes(t.status)).length,
      taskCompletionRate: tasks.length > 0 ? tasks.filter((t) => t.status === "completed").length / tasks.length : 0,
      approvalsPending: approvals.filter((a) => a.decision === "pending").length,
      avgApprovalTurnaroundHours: turnarounds.length > 0 ? turnarounds.reduce((s, t) => s + t, 0) / turnarounds.length : null,
      dataFreshnessIssues: 0,
      recommendationAcceptanceRate: totalRecs > 0 ? accepted / totalRecs : null,
      avgContributionMarginPct: avgMargin,
      avgBreakEvenAcosPct: avgBeAcos,
      blendedAcos,
      blendedTacos: null,
      stockoutRiskCount: inventory.filter((r) => ["high", "critical"].includes(r.severity)).length,
    };
  }

  async listAuditEvents(clientId?: string, limit = 50) {
    let q = supabase().from("audit_events").select("*").order("created_at", { ascending: false }).limit(limit);
    if (clientId) q = q.eq("client_account_id", clientId);
    const { data } = await q;
    return data ?? [];
  }

  async listAiRuns(clientId?: string, limit = 20) {
    let q = supabase().from("ai_runs").select("*").order("created_at", { ascending: false }).limit(limit);
    if (clientId) q = q.eq("client_account_id", clientId);
    const { data } = await q;
    return data ?? [];
  }
}
