import { describe, expect, it } from "vitest";
import { buildScenarios, computeEconomics, type EconomicsInputs } from "./economics";

const complete: EconomicsInputs = {
  sellingPrice: 29.99,
  cogs: 6.5,
  freight: 1.8,
  duty: 0.6,
  fbaFee: 5.2,
  referralFee: 4.5, // 15%
  storageCost: 0.4,
  adAllowance: 3.0, // 10%
  returnAllowance: 0.9, // 3%
  promotionAllowance: 0,
  otherVariableCost: 0.3,
  packaging: 0.5,
  inspection: 0.15,
  thirdPartyLogistics: 0,
};

describe("computeEconomics", () => {
  it("computes contribution profit per the spec formula", () => {
    const r = computeEconomics(complete);
    // 29.99 − (6.5+1.8+0.6+5.2+4.5+0.4+3.0+0.9+0+0.3+0.5+0.15+0) = 29.99 − 23.85 = 6.14
    expect(r.contributionProfitPerUnit).toBeCloseTo(6.14, 2);
    expect(r.contributionMarginPct).toBeCloseTo(20.47, 1);
  });

  it("break-even ACOS equals margin before ad cost", () => {
    const r = computeEconomics(complete);
    // margin before ads = (6.14 + 3.0) / 29.99 = 30.48%
    expect(r.breakEvenAcosPct).toBeCloseTo(30.48, 1);
    expect(r.contributionMarginBeforeAdPct).toBeCloseTo(30.48, 1);
  });

  it("marks the profile complete when all mandatory costs exist", () => {
    const r = computeEconomics(complete);
    expect(r.status).toBe("complete");
    expect(r.missingCosts).toHaveLength(0);
    expect(r.derivedFrom).toBe("observed");
  });

  it("flags incomplete when FBA fee is missing and lists what is missing", () => {
    const r = computeEconomics({ ...complete, fbaFee: null, referralFee: null });
    expect(r.status).toBe("incomplete");
    expect(r.missingCosts).toContain("Phí FBA");
    expect(r.missingCosts).toContain("Referral fee");
    expect(r.derivedFrom).toBe("assumption");
    // still returns a best-effort number (treats missing as 0) for preview
    expect(r.contributionProfitPerUnit).toBeCloseTo(6.14 + 5.2 + 4.5, 2);
  });

  it("returns null margin when price is zero", () => {
    const r = computeEconomics({ ...complete, sellingPrice: 0 });
    expect(r.contributionMarginPct).toBeNull();
    expect(r.breakEvenAcosPct).toBeNull();
  });

  it("carries formula version, currency and marketplace", () => {
    const r = computeEconomics(complete, { currency: "USD", marketplace: "US" });
    expect(r.formulaVersion).toBe("econ-v1");
    expect(r.currency).toBe("USD");
    expect(r.marketplace).toBe("US");
  });
});

describe("buildScenarios", () => {
  it("produces conservative < base < aggressive profit when inputs are sane", () => {
    const [conservative, base, aggressive] = buildScenarios(complete);
    expect(base.scenario).toBe("base");
    expect(conservative.result.contributionProfitPerUnit!).toBeLessThan(
      base.result.contributionProfitPerUnit!
    );
    expect(aggressive.result.contributionProfitPerUnit!).toBeGreaterThan(
      base.result.contributionProfitPerUnit!
    );
  });

  it("keeps all three scenarios versioned", () => {
    for (const s of buildScenarios(complete)) {
      expect(s.result.formulaVersion).toBe("econ-v1");
    }
  });
});
