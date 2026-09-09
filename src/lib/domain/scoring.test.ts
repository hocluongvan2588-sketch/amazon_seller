import { describe, expect, it } from "vitest";
import { scoreOpportunity, SCORE_VERSION } from "./scoring";
import type { CompetitorProduct, ReviewInsight, RiskItem } from "../types";

function competitor(overrides: Partial<CompetitorProduct> = {}): CompetitorProduct {
  return {
    id: "c1",
    product_opportunity_id: "opp-1",
    asin: "B0TEST0001",
    title: "Test Product",
    brand: "Brand",
    price: 25,
    rating: 4.4,
    review_count: 800,
    bsr: 5000,
    monthly_sales: 1500,
    monthly_revenue: 37500,
    data_source_id: null,
    observed_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function insight(overrides: Partial<ReviewInsight> = {}): ReviewInsight {
  return {
    id: "ri1",
    product_opportunity_id: "opp-1",
    source_id: null,
    theme: "breaks easily",
    sentiment: "negative",
    frequency: 40,
    evidence_count: 12,
    examples: [],
    ai_confidence: "high",
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function risk(overrides: Partial<RiskItem> = {}): RiskItem {
  return {
    id: "r1",
    product_opportunity_id: "opp-1",
    category: "compliance",
    description: "Cần kiểm tra chứng nhận FDA",
    severity: "medium",
    status: "open",
    mitigation: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("scoreOpportunity", () => {
  it("returns a bounded 0..100 score with version and 4 pillars", () => {
    const s = scoreOpportunity({
      competitors: [competitor()],
      reviewInsights: [insight()],
      risks: [],
      economics: null,
      sourceCount: 1,
    });
    expect(s.version).toBe(SCORE_VERSION);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.pillars).toHaveLength(4);
    expect(s.pillars.map((p) => p.key)).toEqual([
      "demand",
      "competition",
      "economics",
      "confidence",
    ]);
  });

  it("scores zero confidence with no evidence", () => {
    const s = scoreOpportunity({ competitors: [], reviewInsights: [], risks: [], sourceCount: 0 });
    expect(s.pillars.find((p) => p.key === "confidence")!.points).toBe(0);
    expect(s.pillars.find((p) => p.key === "demand")!.points).toBe(0);
    expect(s.evidenceCompleteness).toBe(0);
  });

  it("applies open risk penalties and caps them at 30", () => {
    const noRisk = scoreOpportunity({ competitors: [competitor()], reviewInsights: [], risks: [], sourceCount: 1 });
    const withRisks = scoreOpportunity({
      competitors: [competitor()],
      reviewInsights: [],
      risks: [risk({ severity: "critical" }), risk({ severity: "high", id: "r2" }), risk({ severity: "high", id: "r3" }), risk({ severity: "critical", id: "r4" })],
      sourceCount: 1,
    });
    expect(withRisks.penalty).toBe(30); // 18+10+10+18 = 56 → capped
    expect(withRisks.score).toBeLessThan(noRisk.score);
  });

  it("ignored mitigated risks in the penalty", () => {
    const s = scoreOpportunity({
      competitors: [competitor()],
      reviewInsights: [],
      risks: [risk({ severity: "critical", status: "mitigated" })],
      sourceCount: 1,
    });
    expect(s.penalty).toBe(0);
  });

  it("rewards high contribution margin in the economics pillar", () => {
    const good = scoreOpportunity({
      competitors: [competitor()],
      reviewInsights: [],
      risks: [],
      economics: {
        sellingPrice: 29.99, cogs: 6, freight: 2, duty: 0.5, fbaFee: 5.5, referralFee: 4.5,
        storageCost: 0.4, adAllowance: 3, returnAllowance: 0.9, promotionAllowance: 0,
        otherVariableCost: 0.2, packaging: 0.3, inspection: 0.1, thirdPartyLogistics: 0,
      },
      sourceCount: 1,
    });
    const bad = scoreOpportunity({
      competitors: [competitor()],
      reviewInsights: [],
      risks: [],
      economics: {
        sellingPrice: 19.99, cogs: 14, freight: 2, duty: 0.5, fbaFee: 5.5, referralFee: 3,
        storageCost: 0.4, adAllowance: 2, returnAllowance: 0.6, promotionAllowance: 0,
        otherVariableCost: 0.2, packaging: 0.3, inspection: 0.1, thirdPartyLogistics: 0,
      },
      sourceCount: 1,
    });
    expect(good.pillars.find((p) => p.key === "economics")!.points).toBeGreaterThan(
      bad.pillars.find((p) => p.key === "economics")!.points
    );
  });
});
