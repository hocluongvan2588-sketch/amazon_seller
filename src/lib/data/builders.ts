/**
 * Shared view-model builders — used by BOTH the demo and supabase adapters so
 * Today cards, KPIs and inventory projections behave identically (spec §9
 * "Tách UI, domain service, data access và integration adapter").
 */

import type {
  AdMetricsDaily,
  ApprovalRequest,
  ClientAccount,
  CustomerThread,
  InventorySnapshot,
  LaunchProject,
  LeadTimeConfig,
  ProductOpportunity,
  ResearchSource,
  RiskItem,
  Sku,
  Task,
  TodayCard,
  Asin,
  Product,
  Recommendation,
} from "../types";
import { projectInventory, type InventoryComputed } from "../domain/inventory";
import { computePriority, urgencyFromDueDate } from "../domain/priorities";

export function buildInventoryRows(
  rows: {
    snapshot: InventorySnapshot;
    leadTime: LeadTimeConfig | null;
    sku: Sku;
    asin: Asin;
    product: Product;
    inboundEta: string | null;
  }[]
): (InventoryComputed & {
  snapshot: InventorySnapshot;
  leadTime: LeadTimeConfig | null;
  sku: Sku;
  asin: Asin;
  product: Product;
  inboundEta: string | null;
})[] {
  return rows.map((r) => ({
    ...r,
    ...projectInventory({
      skuId: r.sku.id,
      sku: r.sku.sku,
      sellableUnits: r.snapshot.sellable_units,
      unitsSold: r.snapshot.units_sold,
      observationDays: r.snapshot.observation_days || 30,
      productionLeadTimeDays: r.leadTime?.production_lead_time_days ?? 30,
      freightLeadTimeDays: r.leadTime?.freight_lead_time_days ?? 35,
      customsBufferDays: r.leadTime?.customs_buffer_days ?? 5,
      safetyStockUnits: r.leadTime?.safety_stock_units ?? 0,
      reorderQuantity: r.leadTime?.reorder_quantity ?? 0,
      inboundEta: r.inboundEta,
      asOf: new Date(r.snapshot.created_at),
    }),
  }));
}

export interface TodayInputs {
  clients: ClientAccount[];
  tasks: Task[];
  approvals: ApprovalRequest[];
  risks: (RiskItem & { opportunity: ProductOpportunity })[];
  listingsInReview: { id: string; title: string; asin: string; client_account_id: string; version: number; created_by: string }[];
  ppcAnomalies: Recommendation[];
  inventoryRisks: { sku: string; client_account_id: string; severity: string; explanation: string; skuId: string }[];
  unansweredMessages: { thread: CustomerThread; lastMessageAt: string }[];
  staleSources: (ResearchSource & { client_account_id: string; opportunity_name: string })[];
  topOpportunities: (ProductOpportunity & { client_name: string })[];
}

export function buildTodayCards(input: TodayInputs): TodayCard[] {
  const cards: TodayCard[] = [];
  const clientName = (id: string) => input.clients.find((c) => c.id === id)?.name ?? id;

  // 1. Overdue tasks
  for (const t of input.tasks) {
    if (["completed", "cancelled"].includes(t.status)) continue;
    const overdue = t.due_at && Date.parse(t.due_at) < Date.now();
    if (!overdue) continue;
    const p = computePriority({
      category: "overdue_task",
      urgency: 5,
      confidence: 1,
      impact: t.priority === "urgent" ? 5 : t.priority === "high" ? 4 : t.priority === "medium" ? 3 : 2,
    });
    cards.push({
      id: `task-${t.id}`,
      category: "overdue_task",
      title: `Quá hạn: ${t.title}`,
      client_account_id: t.client_account_id,
      severity: p.label,
      owner_user_id: t.assignee_id,
      due_at: t.due_at,
      action_label: "Mở task",
      action_href: `/tasks?focus=${t.id}`,
      evidence_href: `/tasks?focus=${t.id}`,
      explanation: `Task "${t.title}" cho ${clientName(t.client_account_id)} đã quá hạn ${Math.floor((Date.now() - Date.parse(t.due_at!)) / 86_400_000)} ngày.`,
      read: false,
    });
  }

  // 2. Pending approvals
  for (const a of input.approvals) {
    if (a.decision !== "pending") continue;
    const p = computePriority({
      category: "pending_approval",
      urgency: a.expires_at ? Math.max(3, urgencyFromDueDate(a.expires_at)) : 3,
      confidence: 1,
      impact: 4,
    });
    cards.push({
      id: `approval-${a.id}`,
      category: "pending_approval",
      title: `Chờ duyệt: ${a.title}`,
      client_account_id: a.client_account_id,
      severity: p.label,
      owner_user_id: a.reviewed_by,
      due_at: a.expires_at,
      action_label: "Xem & duyệt",
      action_href: "/today#approvals",
      evidence_href: null,
      explanation: `${a.title} — ${clientName(a.client_account_id)}. Request type: ${a.request_type}.`,
      read: false,
    });
  }

  // 3. High/critical open product risks
  for (const r of input.risks) {
    if (r.status !== "open" || !["high", "critical"].includes(r.severity)) continue;
    const p = computePriority({
      category: "product_risk",
      urgency: r.severity === "critical" ? 5 : 4,
      confidence: 0.8,
      impact: 4,
    });
    cards.push({
      id: `risk-${r.id}`,
      category: "product_risk",
      title: `Rủi ro ${r.severity === "critical" ? "nghiêm trọng" : "cao"}: ${r.opportunity.name}`,
      client_account_id: r.opportunity.client_account_id,
      severity: p.label,
      owner_user_id: r.opportunity.owner_user_id,
      due_at: null,
      action_label: "Xem rủi ro",
      action_href: `/research/${r.product_opportunity_id}#risks`,
      evidence_href: `/research/${r.product_opportunity_id}#risks`,
      explanation: r.description,
      read: false,
    });
  }

  // 4. Listings awaiting review
  for (const l of input.listingsInReview) {
    const p = computePriority({ category: "listing_review", urgency: 3, confidence: 1, impact: 3 });
    cards.push({
      id: `listing-${l.id}`,
      category: "listing_review",
      title: `Listing chờ review: ${l.asin} v${l.version}`,
      client_account_id: l.client_account_id,
      severity: p.label,
      owner_user_id: l.created_by,
      due_at: null,
      action_label: "Review listing",
      action_href: "/listings",
      evidence_href: "/listings",
      explanation: `Version ${l.version} của ${l.asin} đang chờ review — ${l.title.slice(0, 80)}…`,
      read: false,
    });
  }

  // 5. PPC anomalies
  for (const r of input.ppcAnomalies) {
    const p = computePriority({
      category: "ppc_anomaly",
      urgency: 4,
      confidence: r.confidence === "high" ? 0.9 : 0.6,
      impact: r.impact === "high" ? 5 : r.impact === "medium" ? 3 : 2,
    });
    cards.push({
      id: `ppc-${r.id}`,
      category: "ppc_anomaly",
      title: `PPC: ${r.title}`,
      client_account_id: r.client_account_id,
      severity: p.label,
      owner_user_id: null,
      due_at: null,
      action_label: "Xem recommendation",
      action_href: "/ads",
      evidence_href: "/ads",
      explanation: r.explanation,
      read: false,
    });
  }

  // 6. Inventory stockout risk
  for (const i of input.inventoryRisks) {
    const p = computePriority({
      category: "stockout_risk",
      urgency: i.severity === "critical" ? 5 : 4,
      confidence: 0.9,
      impact: 5,
    });
    cards.push({
      id: `stock-${i.skuId}`,
      category: "stockout_risk",
      title: `Stockout ${i.severity === "critical" ? "nghiêm trọng" : "nguy cơ"}: ${i.sku}`,
      client_account_id: i.client_account_id,
      severity: p.label,
      owner_user_id: null,
      due_at: null,
      action_label: "Xem inventory",
      action_href: "/inventory",
      evidence_href: "/inventory",
      explanation: i.explanation,
      read: false,
    });
  }

  // 7. Unanswered customer messages
  for (const m of input.unansweredMessages) {
    const p = computePriority({
      category: "customer_message",
      urgency: m.thread.priority === "urgent" ? 5 : m.thread.priority === "high" ? 4 : 2,
      confidence: 1,
      impact: 4,
    });
    cards.push({
      id: `msg-${m.thread.id}`,
      category: "customer_message",
      title: `Tin nhắn chưa xử lý: ${m.thread.subject ?? m.thread.customer_reference}`,
      client_account_id: m.thread.client_account_id,
      severity: p.label,
      owner_user_id: m.thread.assigned_to,
      due_at: null,
      action_label: "Xem message",
      action_href: `/messages/${m.thread.id}`,
      evidence_href: `/messages/${m.thread.id}`,
      explanation: `Thread ${m.thread.status} từ ${m.thread.customer_reference} — ${clientName(m.thread.client_account_id)}.`,
      read: false,
    });
  }

  // 8. Data freshness
  if (input.staleSources.length > 0) {
    const p = computePriority({ category: "data_freshness", urgency: 2, confidence: 1, impact: 2 });
    cards.push({
      id: "stale-sources",
      category: "data_freshness",
      title: `${input.staleSources.length} nguồn dữ liệu đã cũ (>14 ngày)`,
      client_account_id: input.staleSources[0].product_opportunity_id ? input.clients.find((c) => c.id === input.clients.find((cl) => cl)?.id)?.id ?? input.clients[0]?.id : input.clients[0]?.id ?? "",
      severity: p.label,
      owner_user_id: null,
      due_at: null,
      action_label: "Kiểm tra sources",
      action_href: "/research",
      evidence_href: "/research",
      explanation: "Dữ liệu cũ làm giảm độ tin cậy của phân tích — cần capture lại từ công cụ nguồn.",
      read: false,
    });
  }

  // 9. Top 3 opportunities by score
  const top3 = [...input.topOpportunities]
    .filter((o) => !["no_go", "archived"].includes(o.stage))
    .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
    .slice(0, 3);
  for (const o of top3) {
    const p = computePriority({ category: "opportunity", urgency: 2, confidence: 0.7, impact: 3 });
    cards.push({
      id: `opp-${o.id}`,
      category: "opportunity",
      title: `Cơ hội: ${o.name} (score ${Math.round(o.opportunity_score ?? 0)})`,
      client_account_id: o.client_account_id,
      severity: p.label,
      owner_user_id: o.owner_user_id,
      due_at: null,
      action_label: "Mở opportunity",
      action_href: `/research/${o.id}`,
      evidence_href: `/research/${o.id}`,
      explanation: `${o.name} cho ${o.client_name} — stage ${o.stage}, score ${Math.round(o.opportunity_score ?? 0)}/100.`,
      read: false,
    });
  }

  return cards;
}
