import { describe, expect, it } from "vitest";
import { computePriority, urgencyFromDueDate, SEVERITY_ORDER } from "./priorities";

describe("computePriority (spec §5.1: Impact × Urgency × Confidence × Scope)", () => {
  it("maps the top of the scale to Critical", () => {
    const r = computePriority({ category: "stockout_risk", impact: 5, urgency: 5, confidence: 1 });
    expect(r.score).toBe(25);
    expect(r.label).toBe("critical");
  });

  it("maps low-impact scheduled work to Low", () => {
    const r = computePriority({ category: "data_freshness", impact: 1, urgency: 1, confidence: 0.8 });
    expect(r.label).toBe("low");
  });

  it("scope factor lifts cross-module items without changing the label bands unexpectedly", () => {
    const base = computePriority({ category: "ppc_anomaly", impact: 3, urgency: 3, confidence: 1 });
    const scoped = computePriority({ category: "ppc_anomaly", impact: 3, urgency: 3, confidence: 1, scopeFactor: 1.5 });
    expect(scoped.score).toBeGreaterThan(base.score);
  });

  it("clamps inputs into valid ranges", () => {
    const r = computePriority({ category: "overdue_task", impact: 99, urgency: -5, confidence: 5 });
    // impact 99→5, urgency −5→1, confidence 5→1 → 5×1×1 = 5
    expect(r.score).toBe(5);
  });
});

describe("urgencyFromDueDate", () => {
  const now = new Date("2026-09-09T00:00:00Z");
  it("overdue items get maximum urgency", () => {
    expect(urgencyFromDueDate("2026-09-05T00:00:00Z", now)).toBe(5);
  });
  it("due today is nearly max", () => {
    expect(urgencyFromDueDate("2026-09-09T12:00:00Z", now)).toBe(4);
  });
  it("far future items are calm", () => {
    expect(urgencyFromDueDate("2026-10-01T00:00:00Z", now)).toBe(1);
  });
  it("no due date defaults to a neutral urgency", () => {
    expect(urgencyFromDueDate(null, now)).toBe(2);
  });
});

describe("severity ordering", () => {
  it("sorts critical first", () => {
    expect(SEVERITY_ORDER.critical).toBeLessThan(SEVERITY_ORDER.high);
    expect(SEVERITY_ORDER.high).toBeLessThan(SEVERITY_ORDER.medium);
    expect(SEVERITY_ORDER.medium).toBeLessThan(SEVERITY_ORDER.low);
  });
});
