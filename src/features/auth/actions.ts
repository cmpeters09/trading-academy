"use server";

import { redirect } from "next/navigation";

import { logger, serializeError } from "@/lib/logger";
import { createClient } from "@/services/supabase/server";

import {
  forgotPasswordSchema,
  logInSchema,
  signUpSchema,
  updatePasswordSchema,
  type ForgotPasswordValues,
  type LogInValues,
  type SignUpValues,
  type UpdatePasswordValues,
} from "./schemas";

/**
 * Guards the post-login redirect target. input.next comes from a query
 * param a client controls, so "starts with /" alone isn't enough —
 * "//evil.com" and "/\evil.com" both start with "/" but browsers treat
 * them as protocol-relative external URLs (an open-redirect vector).
 */
function isSafeRedirectPath(path: string | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

/**
 * ENGINEERING_PRINCIPLES.md §7 — expected domain errors (bad credentials,
 * an already-registered email) are typed results, never thrown. A thrown
 * error here would hit the route error boundary, which is the wrong UX for
 * "wrong password" — the user needs an inline message, not a crash screen.
 */
export type AuthActionResult = { ok: true } | { ok: false; error: string };

/**
 * Whether "Confirm email" is on is a Supabase project setting (TD-04), not
 * something this code controls — signUp() itself tells us which happened:
 * data.session is populated when no confirmation was required (the user is
 * immediately logged in), null when a confirmation email is pending. The
 * form needs to know which, so it shows the right thing instead of always
 * claiming "check your email" even when there's nothing to check.
 */
export type SignUpActionResult =
  | { ok: true; sessionCreated: boolean }
  | { ok: false; error: string };

export async function signUpAction(
  input: SignUpValues & { timezone: string },
): Promise<SignUpActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields and try again." };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          // Real browser-detected IANA timezone (ADR-009, captured client-
          // side — the server has no reliable way to know it). The
          // handle_new_user() trigger falls back to UTC if this is ever
          // missing or malformed.
          timezone: input.timezone || "UTC",
        },
      },
    });

    if (error) {
      logger.warn("auth_sign_up_failed", { code: error.code, status: error.status });
      return { ok: false, error: error.message };
    }

    // Diagnostic for TD-04: sessionCreated already drives the UI branch below,
    // but when it disagrees with the dashboard's "Confirm email" toggle, these
    // are the fields that show whether Supabase actually treated this as
    // confirmation-required — booleans/counts only, never the email or token.
    logger.debug("auth_sign_up_response", {
      hasSession: Boolean(data.session),
      hasUser: Boolean(data.user),
      identitiesCount: data.user?.identities?.length ?? null,
      emailConfirmedAt: Boolean(data.user?.email_confirmed_at),
      confirmationSentAt: Boolean(data.user?.confirmation_sent_at),
    });

    return { ok: true, sessionCreated: Boolean(data.session) };
  } catch (err) {
    logger.error("auth_sign_up_unexpected_error", {
      ...serializeError(err),
    });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function logInAction(
  input: LogInValues & { next?: string | undefined },
): Promise<AuthActionResult> {
  const parsed = logInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields and try again." };
  }

  const supabase = await createClient();

  try {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      logger.warn("auth_log_in_failed", { code: error.code, status: error.status });
      return { ok: false, error: error.message };
    }
  } catch (err) {
    logger.error("auth_log_in_unexpected_error", {
      ...serializeError(err),
    });
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // Outside the try/catch on purpose: redirect() works by throwing a
  // special Next.js-internal error that must propagate, not be caught here.
  redirect(isSafeRedirectPath(input.next) ? input.next : "/");
}

export async function requestPasswordResetAction(
  input: ForgotPasswordValues,
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const supabase = await createClient();

  try {
    // Supabase deliberately does not reveal whether the email is registered
    // — same non-committal "check your email" message either way, so the
    // UI can't be used to enumerate accounts.
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);

    if (error) {
      logger.warn("auth_password_reset_request_failed", {
        code: error.code,
        status: error.status,
      });
      return { ok: false, error: error.message };
    }
  } catch (err) {
    logger.error("auth_password_reset_request_unexpected_error", {
      ...serializeError(err),
    });
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true };
}

export async function updatePasswordAction(
  input: UpdatePasswordValues,
): Promise<AuthActionResult> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields and try again." };
  }

  const supabase = await createClient();

  try {
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

    if (error) {
      logger.warn("auth_password_update_failed", { code: error.code, status: error.status });
      return { ok: false, error: error.message };
    }
  } catch (err) {
    logger.error("auth_password_update_unexpected_error", {
      ...serializeError(err),
    });
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  redirect("/");
}

export async function logOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
