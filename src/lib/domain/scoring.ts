/**
 * Opportunity scoring engine — internal, versioned, deterministic (spec §5.2
 * "Tính score theo cấu hình nội bộ"). The AI layer NEVER computes this score.
 *
 * Score v1 combines four 0–25 point pillars:
 *   Demand       — median estimated monthly sales of tracked competitors
 *   Competition  — review counts & ratings of the top of the niche
 *   Economics    — contribution margin & break-even ACOS of the base profile
 *   Confidence   — evidence completeness (sources, competitors, reviews)
 * Risk items apply a penalty. Output is 0–100 plus per-pillar diagnostics so
 * the UI can always explain WHY a number is what it is.
 */

import type { CompetitorProduct, ReviewInsight, RiskItem } from "../types";
import { computeEconomics, type EconomicsInputs } from "./economics";

export const SCORE_VERSION = "score-v1";

export interface ScorePillar {
  key: "demand" | "competition" | "economics" | "confidence";
  label: string;
  points: number; // 0..25
  max: number;
  explanation: string;
}

export interface OpportunityScore {
  score: number; // 0..100
  version: string;
  pillars: ScorePillar[];
  penalty: number;
  evidenceCompleteness: number; // 0..100
}

export interface ScoreInput {
  competitors: CompetitorProduct[];
  reviewInsights: ReviewInsight[];
  risks: RiskItem[];
  economics?: EconomicsInputs | null;
  sourceCount: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function scoreOpportunity(input: ScoreInput): OpportunityScore {
  const pillars: ScorePillar[] = [];

  // --- Demand (0..25): median competitor monthly sales estimate ------------
  const sales = input.competitors.map((c) => c.monthly_sales ?? 0).filter((n) => n > 0);
  const medSales = median(sales);
  let demandPts = 0;
  let demandExp = "Chưa có dữ liệu doanh thu ước tính của đối thủ.";
  if (medSales !== null) {
    if (medSales >= 3000) { demandPts = 25; demandExp = `Median ước tính ${Math.round(medSales)} đơn/tháng — nhu cầu lớn.`; }
    else if (medSales >= 1000) { demandPts = 20; demandExp = `Median ước tính ${Math.round(medSales)} đơn/tháng — nhu cầu khá.`; }
    else if (medSales >= 300) { demandPts = 13; demandExp = `Median ước tính ${Math.round(medSales)} đơn/tháng — nhu cầu trung bình.`; }
    else { demandPts = 5; demandExp = `Median ước tính ${Math.round(medSales)} đơn/tháng — nhu cầu thấp.`; }
  }
  pillars.push({ key: "demand", label: "Nhu cầu (Demand)", points: demandPts, max: 25, explanation: demandExp });

  // --- Competition (0..25): reviews & rating of top competitors ------------
  const withReviews = input.competitors.filter((c) => (c.review_count ?? 0) > 0);
  const medReviews = median(withReviews.map((c) => c.review_count ?? 0));
  const medRating = median(withReviews.map((c) => c.rating ?? 0).filter((r) => r > 0));
  let compPts = 12;
  let compExp = "Chưa đủ dữ liệu đối thủ để chấm điểm cạnh tranh.";
  if (medReviews !== null) {
    if (medReviews >= 5000) { compPts = 4; compExp = `Đối thủ chính có ~${Math.round(medReviews)} reviews — cạnh tranh rất cao.`; }
    else if (medReviews >= 1000) { compPts = 10; compExp = `Đối thủ chính có ~${Math.round(medReviews)} reviews — cạnh tranh cao.`; }
    else if (medReviews >= 300) { compPts = 17; compExp = `Đối thủ chính có ~${Math.round(medReviews)} reviews — cạnh tranh trung bình.`; }
    else { compPts = 24; compExp = `Đối thủ chính có ~${Math.round(medReviews)} reviews — ngách còn mở.`; }
    if (medRating !== null && medRating < 4.0) {
      compPts = Math.min(25, compPts + 5);
      compExp += ` Rating trung bình ${medRating.toFixed(1)} — cơ hội cải thiện sản phẩm.`;
    }
  }
  pillars.push({ key: "competition", label: "Cạnh tranh (Competition)", points: compPts, max: 25, explanation: compExp });

  // --- Economics (0..25): contribution margin of the base profile ----------
  let econPts = 0;
  let econExp = "Chưa có cost profile để tính economics.";
  if (input.economics) {
    const econ = computeEconomics(input.economics);
    const margin = econ.contributionMarginPct ?? -100;
    if (margin >= 35) { econPts = 25; econExp = `Contribution margin ~${margin.toFixed(1)}% — rất tốt.`; }
    else if (margin >= 25) { econPts = 20; econExp = `Contribution margin ~${margin.toFixed(1)}% — tốt.`; }
    else if (margin >= 15) { econPts = 13; econExp = `Contribution margin ~${margin.toFixed(1)}% — mỏng, cần kiểm soát chi phí.`; }
    else if (margin > 0) { econPts = 6; econExp = `Contribution margin ~${margin.toFixed(1)}% — quá mỏng, rủi ro cao.`; }
    else { econPts = 0; econExp = "Contribution margin âm ở kịch bản hiện tại."; }
    if (econ.status === "incomplete") {
      econExp += ` (Cost profile chưa đủ: ${econ.missingCosts.join(", ")})`;
    }
  }
  pillars.push({ key: "economics", label: "Economics", points: econPts, max: 25, explanation: econExp });

  // --- Confidence (0..25): evidence completeness ----------------------------
  // sources (0..8) + competitors (0..9) + review insights (0..8)
  const srcPts = Math.min(8, input.sourceCount * 3);
  const compPts2 = Math.min(9, input.competitors.length * 2);
  const revPts = Math.min(8, input.reviewInsights.length * 2);
  const confPts = srcPts + compPts2 + revPts;
  pillars.push({
    key: "confidence",
    label: "Độ tin cậy bằng chứng",
    points: confPts,
    max: 25,
    explanation: `${input.sourceCount} nguồn dữ liệu, ${input.competitors.length} đối thủ, ${input.reviewInsights.length} nhóm insight từ review.`,
  });

  const evidenceCompleteness = Math.round(
    ((srcPts / 8) * 30 + (compPts2 / 9) * 35 + (revPts / 8) * 35) * 100
  ) / 100 > 100
    ? 100
    : Math.round(((srcPts / 8) * 30 + (compPts2 / 9) * 35 + (revPts / 8) * 35) * 100) / 100;

  // --- Risk penalty ----------------------------------------------------------
  const riskWeight: Record<string, number> = { low: 2, medium: 5, high: 10, critical: 18 };
  const openRisks = input.risks.filter((r) => r.status === "open" || r.status === "unknown");
  const penalty = Math.min(
    30,
    openRisks.reduce((sum, r) => sum + (riskWeight[r.severity] ?? 0), 0)
  );

  const raw = pillars.reduce((s, p) => s + p.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw - penalty)));

  return {
    score,
    version: SCORE_VERSION,
    pillars,
    penalty,
    evidenceCompleteness,
  };
}
