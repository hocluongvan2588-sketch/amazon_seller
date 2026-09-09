import { describe, expect, it } from "vitest";
import { contentHash, normalizeCompetitorRows } from "./import";

describe("normalizeCompetitorRows", () => {
  it("maps Helium 10-style headers", () => {
    const { rows, skipped } = normalizeCompetitorRows([
      {
        ASIN: "B0ABC12345",
        Title: "Stainless Steel Water Bottle 32oz",
        Brand: "HydroFlask",
        "Buy Box Price": "$29.99",
        Rating: "4.6",
        "Review Count": "12,345",
        "Sales Rank": "890",
        "Est. Monthly Sales": "2500",
      },
    ]);
    expect(skipped).toBe(0);
    expect(rows[0].asin).toBe("B0ABC12345");
    expect(rows[0].price).toBeCloseTo(29.99, 2);
    expect(rows[0].review_count).toBe(12345);
    expect(rows[0].bsr).toBe(890);
    expect(rows[0].monthly_sales).toBe(2500);
  });

  it("maps Jungle Scout-style headers", () => {
    const { rows } = normalizeCompetitorRows([
      {
        asins: "B0XYZ99999",
        "Product Name": "Yoga Mat Non Slip",
        price: "21.50",
        "Review Rating": "4.2",
        Reviews: "890",
        "Monthly Sales": "1,200",
        "Monthly Revenue": "25,800",
      },
    ]);
    expect(rows[0].asin).toBe("B0XYZ99999");
    expect(rows[0].title).toBe("Yoga Mat Non Slip");
    expect(rows[0].monthly_revenue).toBeCloseTo(25800, 2);
  });

  it("treats empty / dash cells as null, not zero", () => {
    const { rows } = normalizeCompetitorRows([
      { ASIN: "B0A", Title: "T", Price: "-", Reviews: "", Rating: "N/A" },
    ]);
    expect(rows[0].price).toBeNull();
    expect(rows[0].review_count).toBeNull();
    expect(rows[0].rating).toBeNull();
  });

  it("skips rows without any title or asin", () => {
    const { rows, skipped } = normalizeCompetitorRows([
      { Price: "10" },               // nothing identifiable
      { ASIN: "B0B", Title: "OK" },  // valid
    ]);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it("is case/spacing tolerant on headers", () => {
    const { rows } = normalizeCompetitorRows([
      { "  monthly-sales ": "300", asin: "B0C", title: "X" },
    ]);
    expect(rows[0].monthly_sales).toBe(300);
  });
});

describe("contentHash", () => {
  it("is deterministic and collision-tolerant for imports", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
    expect(contentHash("")).toMatch(/^[0-9a-f]{8}$/);
  });
});
