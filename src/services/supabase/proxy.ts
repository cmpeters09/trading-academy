import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";

const PUBLIC_PATH_PREFIXES = ["/login", "/signup", "/forgot-password", "/update-password", "/auth"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * ADR-002/012 — refreshes the Supabase session on every request and gates
 * every route except the public auth ones (default deny, same philosophy
 * as the RLS policies: everything is protected unless explicitly listed as
 * public). Pattern verified against Supabase's own official Next.js
 * middleware reference (github.com/supabase/supabase, ui-library registry)
 * rather than assumed from memory.
 */
export async function updateSession(request: NextRequest) {
  // Do not run code between createServerClient and getClaims(): a stray
  // await here can leave stale cookies and randomly log users out
  // (Supabase's own documented warning). Never hoist this client to module
  // scope either — a fresh one is required per request.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() validates the JWT (locally against cached signing keys when
  // possible), unlike getSession(), which must never be trusted server-side.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Must return this exact response object, unmodified, or the browser and
  // server can go out of sync and terminate the user's session prematurely.
  return response;
}
