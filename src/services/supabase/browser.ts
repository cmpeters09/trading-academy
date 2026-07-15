import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * ADR-002 — for Client Components only. Uses the public anon key; RLS
 * (ADR-012) is the actual security boundary, not key secrecy. Never import
 * this into a module that also touches a service-role key (ADR-015).
 */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
