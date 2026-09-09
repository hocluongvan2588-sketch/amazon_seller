/**
 * Adapter factory — picks Supabase when credentials exist, demo otherwise.
 * Both implementations share the same DataAdapter contract and the same
 * domain engines, so behavior is identical; only persistence differs.
 */

import type { DataAdapter } from "./adapter";
import { DemoAdapter } from "./demo/adapter";
import { SupabaseAdapter } from "./supabaseAdapter";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getAdapter(): DataAdapter {
  return isSupabaseConfigured() ? new SupabaseAdapter() : new DemoAdapter();
}

export type { DataAdapter };
