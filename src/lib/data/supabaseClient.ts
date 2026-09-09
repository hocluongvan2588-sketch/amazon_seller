/**
 * Shared server-side Supabase client (cookie-based auth, spec §7.1).
 * Used by the SupabaseAdapter and auth server actions. Never expose the
 * service role key here — anon key + RLS only.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, anon, {
    cookies: {
      getAll: async () => (await cookies()).getAll(),
      setAll: async (list) => {
        try {
          const jar = await cookies();
          for (const { name, value, options } of list) {
            jar.set(name, value, options);
          }
        } catch {
          // Server Components are read-only; token refresh happens in
          // server actions / route handlers where cookies are writable.
        }
      },
    },
  });
}
