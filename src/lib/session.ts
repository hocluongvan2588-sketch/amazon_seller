/**
 * Session helpers for server components & actions.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdapter } from "./data/factory";
import type { SessionUser } from "./types";

export const DEMO_COOKIE = "demo_user";

/** Get the current session user, or null (demo: cookie; supabase: auth). */
export async function getSessionUser(): Promise<SessionUser | null> {
  return getAdapter().getSessionUser();
}

/** Require a session — redirects to /login when absent. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Demo mode: switch the acting user (sets the cookie). Production: Supabase login. */
export async function setDemoUser(userId: string) {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
}
