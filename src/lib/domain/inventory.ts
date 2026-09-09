/**
 * Inventory & logistics engine — spec §5.7.
 *
 * These are INTERNAL models — never labeled as official Amazon formulas
 * (spec §5.7 "Các công thức này là mô hình nội bộ").
 *
 *   Average Daily Sales = Units Sold / Observation Days
 *   Days of Supply      = Sellable Inventory / Average Daily Sales
 *   Reorder Point       = Average Daily Sales × Total Lead Time + Safety Stock
 *   Total Lead Time     = Production + Freight + Customs buffer
 */

import type { RiskSeverity } from "../types";

export interface InventoryInput {
  skuId: string;
  sku: string;
  sellableUnits: number;
  unitsSold: number;
  observationDays: number;
  productionLeadTimeDays: number;
  freightLeadTimeDays: number;
  customsBufferDays: number;
  safetyStockUnits: number;
  reorderQuantity: number;
  /** ETA of the next inbound shipment, if any (ISO date). */
  inboundEta?: string | null;
  /** Date of the snapshot the numbers come from. */
  asOf: Date;
}

export interface InventoryComputed {
  skuId: string;
  skuCode: string;
  averageDailySales: number;
  daysOfSupply: number | null;
  totalLeadTimeDays: number;
  reorderPoint: number;
  reorderQuantity: number;
  projectedStockoutDate: Date | null;
  replenishmentDate: Date;
  severity: RiskSeverity;
  shouldReorder: boolean;
  explanation: string;
}

export function averageDailySales(unitsSold: number, observationDays: number): number {
  if (observationDays <= 0) return 0;
  return round2(unitsSold / observationDays);
}

export function daysOfSupply(sellableUnits: number, ads: number): number | null {
  if (ads <= 0) return sellableUnits > 0 ? null : 0;
  return round2(sellableUnits / ads);
}

export function reorderPoint(ads: number, totalLeadTimeDays: number, safetyStock: number): number {
  return Math.ceil(ads * totalLeadTimeDays + safetyStock);
}

export function totalLeadTime(
  productionDays: number,
  freightDays: number,
  customsBufferDays: number
): number {
  return productionDays + freightDays + customsBufferDays;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Full projection for one SKU. Severity model:
 *  - critical: projected stockout before a replenishment can even arrive
 *              (DoS < total lead time) — must expedite (air freight).
 *  - high:     below reorder point — reorder now.
 *  - medium:   stockout within 2× lead time window — plan the next PO.
 *  - low:      healthy supply.
 */
export function projectInventory(input: InventoryInput): InventoryComputed {
  const ads = averageDailySales(input.unitsSold, input.observationDays);
  const dos = daysOfSupply(input.sellableUnits, ads);
  const lead = totalLeadTime(
    input.productionLeadTimeDays,
    input.freightLeadTimeDays,
    input.customsBufferDays
  );
  const rop = reorderPoint(ads, lead, input.safetyStockUnits);

  // If an inbound shipment exists, replenishment is its ETA; otherwise a
  // PO placed today would arrive after the full lead time.
  const replenishmentDate = input.inboundEta
    ? new Date(input.inboundEta)
    : addDays(input.asOf, lead);

  const projectedStockoutDate =
    dos !== null && dos >= 0 && ads > 0 ? addDays(input.asOf, Math.floor(dos)) : null;

  const stockoutBeforeReplenishment =
    projectedStockoutDate !== null && projectedStockoutDate < replenishmentDate;

  let severity: RiskSeverity = "low";
  let explanation = "Nguồn cung ổn định so với lead time và safety stock.";

  if (dos !== null && dos < lead && stockoutBeforeReplenishment) {
    // Ordering today would still arrive too late → expedite needed.
    severity = "critical";
    explanation = `Dự kiến stockout sau ~${Math.max(0, Math.floor(dos))} ngày, trong khi lead time bổ sung là ${lead} ngày. Cần expedite (air freight) hoặc sẽ đứt hàng.`;
  } else if (input.sellableUnits <= rop) {
    severity = "high";
    explanation = `Tồn kho (${input.sellableUnits}) đã xuống dưới reorder point (${rop}). Cần đặt hàng bổ sung ngay.`;
  } else if (dos !== null && dos < lead * 2) {
    severity = "medium";
    explanation = `Days of supply (${dos} ngày) nằm trong khung ${lead * 2} ngày — cần lên kế hoạch PO tiếp theo.`;
  }

  return {
    skuId: input.skuId,
    skuCode: input.sku,
    averageDailySales: ads,
    daysOfSupply: dos,
    totalLeadTimeDays: lead,
    reorderPoint: rop,
    reorderQuantity: input.reorderQuantity > 0 ? input.reorderQuantity : Math.ceil(ads * lead * 1.5),
    projectedStockoutDate,
    replenishmentDate,
    severity,
    shouldReorder: input.sellableUnits <= rop,
    explanation,
  };
}

function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
