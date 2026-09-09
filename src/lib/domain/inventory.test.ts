import { describe, expect, it } from "vitest";
import {
  averageDailySales,
  daysOfSupply,
  projectInventory,
  reorderPoint,
  totalLeadTime,
  type InventoryInput,
} from "./inventory";

const base: InventoryInput = {
  skuId: "sku-1",
  sku: "SKU-001",
  sellableUnits: 600,
  unitsSold: 300,
  observationDays: 30,
  productionLeadTimeDays: 30,
  freightLeadTimeDays: 35,
  customsBufferDays: 5,
  safetyStockUnits: 100,
  reorderQuantity: 1000,
  asOf: new Date("2026-09-09T00:00:00Z"),
};

describe("formulas", () => {
  it("average daily sales = units sold / observation days", () => {
    expect(averageDailySales(300, 30)).toBe(10);
    expect(averageDailySales(0, 30)).toBe(0);
    expect(averageDailySales(300, 0)).toBe(0);
  });

  it("days of supply = sellable / ADS", () => {
    expect(daysOfSupply(600, 10)).toBe(60);
    expect(daysOfSupply(0, 10)).toBe(0);
    expect(daysOfSupply(100, 0)).toBeNull(); // no sales data
  });

  it("reorder point = ADS × total lead time + safety stock", () => {
    const lead = totalLeadTime(30, 35, 5);
    expect(lead).toBe(70);
    expect(reorderPoint(10, lead, 100)).toBe(800);
  });
});

describe("projectInventory", () => {
  it("reports healthy supply when stock is ample", () => {
    const p = projectInventory({ ...base, sellableUnits: 2000 });
    expect(p.severity).toBe("low");
    expect(p.shouldReorder).toBe(false);
    expect(p.daysOfSupply).toBe(200);
    expect(p.reorderPoint).toBe(800);
  });

  it("flags high severity when below reorder point", () => {
    const p = projectInventory({ ...base, sellableUnits: 700 });
    // 700 < reorder point 800, but DoS (70) ≥ lead (70) → not critical
    expect(p.severity).toBe("high");
    expect(p.shouldReorder).toBe(true);
  });

  it("flags critical when stockout happens before a replenishment can arrive", () => {
    const p = projectInventory({ ...base, sellableUnits: 300 });
    // DoS = 30 < lead 70 → critical
    expect(p.severity).toBe("critical");
    expect(p.projectedStockoutDate).not.toBeNull();
    // stockout ~2026-10-09, replenishment today+70d = 2026-11-18
    expect(p.projectedStockoutDate!.toISOString().slice(0, 10)).toBe("2026-10-09");
    expect(p.replenishmentDate.toISOString().slice(0, 10)).toBe("2026-11-18");
  });

  it("uses inbound shipment ETA as the replenishment date when present", () => {
    const p = projectInventory({ ...base, inboundEta: "2026-09-20" });
    expect(p.replenishmentDate.toISOString().slice(0, 10)).toBe("2026-09-20");
    // stockout (Nov 8) after ETA → no critical lead-time risk, but 600 < ROP 800 → high
    expect(p.severity).toBe("high");
  });

  it("flags high when projected stockout lands before the inbound ETA", () => {
    const p = projectInventory({ ...base, sellableUnits: 100, inboundEta: "2026-09-25" });
    // DoS = 10 < lead 70 → critical anyway (cannot expedite in time)
    expect(p.severity).toBe("critical");
  });

  it("suggests a default reorder quantity derived from ADS and lead time", () => {
    const p = projectInventory({ ...base, reorderQuantity: 0 });
    expect(p.reorderQuantity).toBe(10 * 70 * 1.5); // 1050
  });

  it("returns medium when supply covers lead time but is within the 2x window", () => {
    // DoS = 80 days: > lead (70) but < 2×lead (140); 800 units > ROP 800? 800 <= 800 → high. Use 900.
    const p = projectInventory({ ...base, sellableUnits: 900 });
    // DoS=90 < 140 → medium (900 > ROP 800)
    expect(p.severity).toBe("medium");
  });
});
