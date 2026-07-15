import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/services/supabase/server";

/**
 * ADR-002/020 — this is the one legitimate Route Handler in the auth flow
 * (§20 permits Route Handlers for OAuth-style callbacks; this is the same
 * shape: an external redirect exchanging a token for a session). Every
 * other auth mutation is a Server Action in features/auth/actions.ts.
 *
 * Supabase's confirmation/recovery emails must be configured (Dashboard ->
 * Authentication -> Email Templates) to link here with token_hash and type
 * — see the PR description for the exact template strings. The default
 * {{ .ConfirmationURL }} template does NOT point here.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next");
  const next = rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      redirect(next);
    }

    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?error=" + encodeURIComponent("Invalid or expired confirmation link."));
}
