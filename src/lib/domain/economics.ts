/**
 * Unit Economics engine — spec §5.4.
 *
 * All metrics in this file are computed by deterministic code, never by the
 * LLM (spec §5.3 "Các số liệu quan trọng do metrics engine tính").
 * Formulas are versioned: every result carries formula_version, currency,
 * marketplace and effective date (spec §5.4).
 */

import type { EconomicsInputs, EconomicsResult } from "../types";

export type { EconomicsInputs };

export const ECONOMICS_FORMULA_VERSION = "econ-v1";

/** Mandatory cost lines — if any is missing the profile is `incomplete`. */
const MANDATORY_COSTS: (keyof EconomicsInputs)[] = [
  "sellingPrice",
  "cogs",
  "freight",
  "duty",
  "fbaFee",
  "referralFee",
  "storageCost",
  "returnAllowance",
];

const COST_LABELS: Record<keyof EconomicsInputs, string> = {
  sellingPrice: "Giá bán (selling price)",
  cogs: "COGS",
  freight: "Freight",
  duty: "Duty / nhập khẩu",
  fbaFee: "Phí FBA",
  referralFee: "Referral fee",
  storageCost: "Storage allocation",
  adAllowance: "Advertising allowance",
  returnAllowance: "Return / refund allowance",
  promotionAllowance: "Promotion discount",
  otherVariableCost: "Chi phí biến đổi khác",
  packaging: "Packaging",
  inspection: "Inspection",
  thirdPartyLogistics: "3PL",
};

export function costLabel(key: keyof EconomicsInputs): string {
  return COST_LABELS[key];
}

function isMissing(value: number | null): boolean {
  return value === null || Number.isNaN(value);
}

/**
 * Compute contribution economics per unit.
 *
 *   Contribution Profit = Price − COGS − Freight − Duty − FBA − Referral
 *                        − Storage − Ads − Returns − Promo − Other
 *                        − Packaging − Inspection − 3PL
 *   Contribution Margin % = CP / Price × 100
 *   Break-even ACOS % = Contribution Margin Before Ad Cost × 100
 *
 * If any mandatory cost is missing the result status is `incomplete` and
 * headline numbers are still returned as best-effort estimates — the UI must
 * show the `incomplete` badge instead of presenting them as exact net profit
 * (spec §5.4 acceptance criteria).
 */
export function computeEconomics(
  inputs: EconomicsInputs,
  options?: { currency?: string; marketplace?: string }
): EconomicsResult {
  const missingCosts = MANDATORY_COSTS.filter((k) => isMissing(inputs[k] as number | null)).map(
    (k) => COST_LABELS[k]
  );

  const num = (v: number | null): number => (isMissing(v) ? 0 : (v as number));

  const totalCosts =
    num(inputs.cogs) +
    num(inputs.freight) +
    num(inputs.duty) +
    num(inputs.fbaFee) +
    num(inputs.referralFee) +
    num(inputs.storageCost) +
    num(inputs.adAllowance) +
    num(inputs.returnAllowance) +
    num(inputs.promotionAllowance) +
    num(inputs.otherVariableCost) +
    num(inputs.packaging) +
    num(inputs.inspection) +
    num(inputs.thirdPartyLogistics);

  const price = num(inputs.sellingPrice);
  const contributionProfit = round2(price - totalCosts);

  // Margin before advertising = CP + ad allowance (i.e. margin had we spent $0 on ads)
  const marginBeforeAdRatio =
    price > 0 ? (contributionProfit + num(inputs.adAllowance)) / price : 0;

  return {
    formulaVersion: ECONOMICS_FORMULA_VERSION,
    currency: options?.currency ?? "USD",
    marketplace: options?.marketplace ?? "US",
    inputs,
    contributionProfitPerUnit: contributionProfit,
    contributionMarginPct: price > 0 ? round2((contributionProfit / price) * 100) : null,
    contributionMarginBeforeAdPct: price > 0 ? round2(marginBeforeAdRatio * 100) : null,
    breakEvenAcosPct: price > 0 ? round2(marginBeforeAdRatio * 100) : null,
    status: missingCosts.length > 0 ? "incomplete" : "complete",
    missingCosts,
    // FBA/referral fees are actual observed data only when present; treating
    // a null fee as 0 makes the result an assumption, flagged here.
    derivedFrom: missingCosts.length > 0 ? "assumption" : "observed",
  };
}

export interface ScenarioComparison {
  scenario: "base" | "conservative" | "aggressive";
  label: string;
  result: EconomicsResult;
}

/**
 * Build the three standard scenarios from a base profile (spec §5.4):
 *  - conservative: −10% price, +10% costs
 *  - aggressive:   +10% price, −5% costs
 */
export function buildScenarios(base: EconomicsInputs): ScenarioComparison[] {
  const scale = (inputs: EconomicsInputs, priceFactor: number, costFactor: number): EconomicsInputs => {
    const scaleCost = (v: number | null): number | null =>
      v === null ? null : round2(v * costFactor);
    return {
      ...inputs,
      sellingPrice: round2(inputs.sellingPrice * priceFactor),
      cogs: scaleCost(inputs.cogs)!,
      freight: scaleCost(inputs.freight)!,
      duty: scaleCost(inputs.duty)!,
      fbaFee: scaleCost(inputs.fbaFee),
      referralFee: scaleCost(inputs.referralFee),
      storageCost: scaleCost(inputs.storageCost)!,
      adAllowance: scaleCost(inputs.adAllowance)!,
      returnAllowance: scaleCost(inputs.returnAllowance)!,
      promotionAllowance: scaleCost(inputs.promotionAllowance)!,
      otherVariableCost: scaleCost(inputs.otherVariableCost)!,
      packaging: scaleCost(inputs.packaging)!,
      inspection: scaleCost(inputs.inspection)!,
      thirdPartyLogistics: scaleCost(inputs.thirdPartyLogistics)!,
    };
  };

  return [
    { scenario: "conservative", label: "Conservative (giảm 10% giá, tăng 10% chi phí)", result: computeEconomics(scale(base, 0.9, 1.1)) },
    { scenario: "base", label: "Base", result: computeEconomics(base) },
    { scenario: "aggressive", label: "Aggressive (tăng 10% giá, giảm 5% chi phí)", result: computeEconomics(scale(base, 1.1, 0.95)) },
  ];
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
