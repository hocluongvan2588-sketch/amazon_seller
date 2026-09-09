import { describe, expect, it } from "vitest";
import { classifyMessage, listingAudit, marketSummary, reviewMining } from "./engine";
import type { ListingVersion, ProductOpportunity } from "../types";
import type { OpportunityDetail } from "../data/adapter";

const opp: ProductOpportunity = {
  id: "opp-1", organization_id: "org", client_account_id: "client-1",
  name: "Test Bottle", category: "Home", marketplace: "US", target_price: 25,
  stage: "researching", decision: null, decision_reason: null, decided_by: null,
  decided_at: null, evidence_completeness: 50, opportunity_score: null,
  score_version: null, owner_user_id: "u1", created_at: "2026-09-01",
  updated_at: "2026-09-01", deleted_at: null,
};

function detail(overrides: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    opportunity: opp,
    sources: [],
    competitors: [],
    reviewInsights: [],
    suppliers: [],
    risks: [],
    economics: null,
    score: null,
    client: null,
    owner: null,
    ...overrides,
  };
}

describe("marketSummary", () => {
  it("refuses to conclude with fewer than 3 competitors (spec §5.2)", () => {
    const out = marketSummary(detail({ competitors: [
      { id: "c1", product_opportunity_id: "opp-1", asin: "A", title: "T1", brand: null, price: 20, rating: 4, review_count: 100, bsr: 1, monthly_sales: 500, monthly_revenue: 10000, data_source_id: null, observed_at: "2026-09-01" },
    ] }));
    expect(out.findings).toHaveLength(0);
    expect(out.missing_data.length).toBeGreaterThan(0);
    expect(out.missing_data[0]).toMatch(/3 đối thủ/);
  });

  it("labels provider numbers as ESTIMATE and cites evidence ids", () => {
    const competitors = [1, 2, 3, 4].map((i) => ({
      id: `c${i}`, product_opportunity_id: "opp-1", asin: `A${i}`, title: `T${i}`,
      brand: null, price: 20 + i, rating: 4.5, review_count: 100 * i, bsr: i,
      monthly_sales: 500 * i, monthly_revenue: 10000 * i, data_source_id: null,
      observed_at: "2026-09-01",
    }));
    const out = marketSummary(detail({ competitors }));
    expect(out.findings.length).toBeGreaterThan(0);
    const demand = out.findings.find((f) => f.claim.includes("ESTIMATE"));
    expect(demand).toBeDefined();
    expect(demand!.evidence_ids.length).toBe(4);
    expect(out.missing_data).toContain("Cost profile chưa có — chưa tính được contribution margin");
  });
});

describe("reviewMining", () => {
  it("returns missing-data guidance when no insights exist", () => {
    const out = reviewMining(detail());
    expect(out.findings).toHaveLength(0);
    expect(out.missing_data.length).toBeGreaterThan(0);
  });

  it("sorts pain points by frequency and recommends supplier fixes", () => {
    const out = reviewMining(detail({
      reviewInsights: [
        { id: "ri1", product_opportunity_id: "opp-1", source_id: null, theme: "leaks", sentiment: "negative", frequency: 90, evidence_count: 30, examples: [], ai_confidence: "high", created_at: "2026-09-01" },
        { id: "ri2", product_opportunity_id: "opp-1", source_id: null, theme: "great insulation", sentiment: "positive", frequency: 200, evidence_count: 80, examples: [], ai_confidence: "high", created_at: "2026-09-01" },
      ],
    }));
    expect(out.summary).toContain("leaks");
    const leak = out.findings.find((f) => f.claim.includes("leaks"));
    expect(leak).toBeDefined();
    expect(leak!.impact).toBe("high");
    expect(out.next_actions.join(" ")).toContain("supplier");
  });
});

describe("listingAudit", () => {
  const base: ListingVersion = {
    id: "lv1", asin_id: "a1", version_number: 1,
    title: "Short", bullets: ["one", "two"], description: "tiny",
    backend_terms: [], attributes: {}, images: [], status: "draft",
    change_reason: null, created_by: "u1", approved_by: null, approved_at: null,
    created_at: "2026-09-01",
  };

  it("flags short titles, missing bullets and short descriptions", () => {
    const out = listingAudit({ version: base });
    expect(out.findings.some((f) => f.claim.includes("Title chỉ"))).toBe(true);
    expect(out.findings.some((f) => f.claim.includes("5 bullets"))).toBe(true);
  });

  it("detects unsupported compliance claims as high impact", () => {
    const out = listingAudit({
      version: { ...base, title: "FDA Approved Miracle Cure Water Bottle 500ml Premium Quality Stainless Steel Insulated Leakproof" },
    });
    const claim = out.findings.find((f) => f.claim.includes("compliance"));
    expect(claim).toBeDefined();
    expect(claim!.impact).toBe("high");
  });

  it("detects keyword repetition across title and bullets", () => {
    const out = listingAudit({
      version: { ...base, title: "Water Bottle water bottle water bottle water bottle", bullets: ["water bottle", "water bottle"] },
    });
    expect(out.findings.some((f) => f.claim.includes("lặp lại"))).toBe(true);
  });
});

describe("classifyMessage", () => {
  it("flags off-Amazon payment requests as high policy risk (spec §5.8)", () => {
    const cls = classifyMessage("Can you PayPal me a refund so it's faster?");
    expect(cls.policy_risk_level).toBe("high");
    expect(cls.policy_risk_notes.join(" ")).toMatch(/ngoài Amazon/);
    expect(cls.urgency).toBe("urgent");
  });

  it("flags review manipulation requests", () => {
    const cls = classifyMessage("I will change your review to 5 stars if you send a replacement.");
    expect(cls.policy_risk_level).toBe("high");
    expect(cls.policy_risk_notes.some((n) => /sửa\/xóa review/.test(n))).toBe(true);
  });

  it("classifies shipping issues as urgent without policy risk", () => {
    const cls = classifyMessage("Where is my order? It says delivered but nothing arrived.");
    expect(cls.intent).toBe("shipping_issue");
    expect(cls.urgency).toBe("urgent");
    expect(cls.policy_risk_level).toBe("none");
  });

  it("always drafts a reply marked as needing approval", () => {
    const cls = classifyMessage("What is the size of the bottle?");
    expect(cls.reply_draft).toContain("BẢN NHÁP");
  });
});
