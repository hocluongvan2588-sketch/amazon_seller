/**
 * CSV/XLSX import normalization — spec §5.2, §8.1.
 *
 * Accepts common export shapes from Helium 10 / Jungle Scout / SellerSprite
 * / generic sheets. Provider estimates are ALWAYS imported as estimates —
 * never written into actual sales fields. Returns rows with a provenance
 * marker so every competitor row can point back to its source.
 */

export interface CompetitorImportRow {
  asin: string | null;
  title: string;
  brand: string | null;
  price: number | null;
  rating: number | null;
  review_count: number | null;
  bsr: number | null;
  monthly_sales: number | null;
  monthly_revenue: number | null;
}

type RawRow = Record<string, string | number | null | undefined>;

const HEADER_ALIASES: Record<string, string[]> = {
  asin: ["asin", "asins", "amzn asin", "product asin"],
  title: ["title", "product title", "name", "product name", "listing title"],
  brand: ["brand", "brand name", "seller brand"],
  price: ["price", "buy box price", "current price", "price ($)", "price usd"],
  rating: ["rating", "review rating", "avg rating", "star rating"],
  review_count: ["reviews", "review count", "ratings count", "lbb reviews", "review_count"],
  bsr: ["bsr", "rank", "sales rank", "best sellers rank", "category rank"],
  monthly_sales: ["monthly sales", "est monthly sales", "sales/mo", "estimated monthly sales", "units per month", "monthly_sales"],
  monthly_revenue: ["monthly revenue", "est monthly revenue", "revenue/mo", "estimated monthly revenue", "monthly_revenue"],
};

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
}

function pickValue(row: RawRow, field: string): string | null {
  const aliases = HEADER_ALIASES[field] ?? [field];
  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = normalizeKey(rawKey);
    if (aliases.includes(key)) {
      if (rawValue === null || rawValue === undefined) return null;
      const s = String(rawValue).trim();
      if (s === "" || s === "-" || s.toLowerCase() === "n/a") return null;
      return s;
    }
  }
  return null;
}

function parseNumber(s: string | null): number | null {
  if (s === null) return null;
  // strip currency symbols, thousands separators, percent signs
  const cleaned = s.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseInt32(s: string | null): number | null {
  const n = parseNumber(s);
  return n === null ? null : Math.round(n);
}

export function normalizeCompetitorRow(row: RawRow): CompetitorImportRow | null {
  const title = pickValue(row, "title") ?? pickValue(row, "asin");
  if (!title) return null;

  return {
    asin: pickValue(row, "asin"),
    title,
    brand: pickValue(row, "brand"),
    price: parseNumber(pickValue(row, "price")),
    rating: parseNumber(pickValue(row, "rating")),
    review_count: parseInt32(pickValue(row, "review_count")),
    bsr: parseInt32(pickValue(row, "bsr")),
    monthly_sales: parseInt32(pickValue(row, "monthly_sales")),
    monthly_revenue: parseNumber(pickValue(row, "monthly_revenue")),
  };
}

export function normalizeCompetitorRows(rows: RawRow[]): {
  rows: CompetitorImportRow[];
  skipped: number;
} {
  const out: CompetitorImportRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const normalized = normalizeCompetitorRow(row);
    if (normalized) out.push(normalized);
    else skipped += 1;
  }
  return { rows: out, skipped };
}

/** Compute a stable content hash for source snapshot integrity (FNV-1a). */
export function contentHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
