import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * ADR-002 — for Server Components, Route Handlers, and Server Functions.
 * Also uses only the public anon key, scoped to the requesting user's
 * session via cookies; RLS (ADR-012) enforces access, not this client.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Deliberate exception to ENGINEERING_PRINCIPLES §7's empty-catch
            // ban: Next.js does not support setting cookies during Server
            // Component rendering (only Server Functions/Route Handlers
            // can). @supabase/ssr's official Next.js pattern calls setAll on
            // every client creation regardless of caller, expecting this to
            // no-op there — session refresh happens via middleware instead,
            // once auth is wired in a later milestone. Not domain error
            // handling; SSR plumbing matching Supabase's documented pattern.
          }
        },
      },
    },
  );
}
