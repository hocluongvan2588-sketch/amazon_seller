/** Deterministic PRNG (mulberry32) so demo data is stable across reloads. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function intBetween(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

/** ISO date `days` offset from today (negative = past). */
export function dateOffset(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** YYYY-MM-DD `days` offset from today. */
export function dateOnlyOffset(days: number, now = new Date()): string {
  return dateOffset(days, now).slice(0, 10);
}
