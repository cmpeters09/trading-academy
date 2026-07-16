import type { NextRequest } from "next/server";

import { updateSession } from "@/services/supabase/proxy";

// Next.js 16 renamed the "middleware" file convention to "proxy" (the old
// name was easy to confuse with Express-style middleware). Confirmed
// against node_modules/next/dist/docs before writing this, per AGENTS.md.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
