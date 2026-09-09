/**
 * Today dashboard priority engine — spec §5.1.
 *
 *   Priority Score = Impact × Urgency × Confidence × Scope Factor
 *
 * Raw scores are NEVER shown to regular users — they see the labels
 * Critical / High / Medium / Low with an expandable explanation.
 */

import type { RiskSeverity } from "../types";

export type TodayCategory =
  | "overdue_task"
  | "pending_approval"
  | "product_risk"
  | "listing_review"
  | "ppc_anomaly"
  | "stockout_risk"
  | "customer_message"
  | "data_freshness"
  | "opportunity";

export interface PriorityInput {
  category: TodayCategory;
  /** 1..5 — business impact if handled/ignored */
  impact: number;
  /** 1..5 — time pressure (overdue = 5, due today = 4, this week = 2 …) */
  urgency: number;
  /** 0..1 — how confident we are in the underlying signal */
  confidence: number;
  /** 1..1.5 — cross-module / cross-team items bubble up */
  scopeFactor?: number;
}

export interface PriorityResult {
  score: number;
  label: RiskSeverity;
}

const IMPACT_BY_CATEGORY: Record<TodayCategory, number> = {
  overdue_task: 3,
  pending_approval: 4,
  product_risk: 4,
  listing_review: 3,
  ppc_anomaly: 3,
  stockout_risk: 5,
  customer_message: 4,
  data_freshness: 2,
  opportunity: 3,
};

export function computePriority(input: PriorityInput): PriorityResult {
  const impact = Math.max(1, Math.min(5, input.impact ?? IMPACT_BY_CATEGORY[input.category]));
  const urgency = Math.max(1, Math.min(5, input.urgency));
  const confidence = Math.max(0, Math.min(1, input.confidence));
  const scope = Math.max(1, Math.min(1.5, input.scopeFactor ?? 1));
  const score = Math.round(impact * urgency * confidence * scope * 20) / 20;

  let label: RiskSeverity;
  if (score >= 14) label = "critical";
  else if (score >= 9) label = "high";
  else if (score >= 5) label = "medium";
  else label = "low";

  return { score, label };
}

/** Urgency from a due date: overdue days push it to the top. */
export function urgencyFromDueDate(dueAt: string | null | undefined, now = new Date()): number {
  if (!dueAt) return 2;
  const diffDays = Math.floor((Date.parse(dueAt) - now.getTime()) / 86_400_000);
  if (diffDays < 0) return 5;
  if (diffDays === 0) return 4;
  if (diffDays <= 2) return 3;
  if (diffDays <= 7) return 2;
  return 1;
}

export const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const SEVERITY_LABELS_VI: Record<RiskSeverity, string> = {
  critical: "Nghiêm trọng",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};
