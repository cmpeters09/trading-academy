# Auth

## Purpose

Sign up, log in, log out, and password reset for Trading Academy accounts. Owns the boundary between an anonymous visitor and a session-bearing user — every other feature assumes a user is already authenticated by the time it runs.

## Architecture

- **Server Actions** (`actions.ts`) do the actual Supabase Auth calls (`signUp`, `signInWithPassword`, `resetPasswordForEmail`, `updateUser`, `signOut`). Expected failures (bad credentials, validation errors) return a typed `{ ok: false; error }` result per ENGINEERING_PRINCIPLES §7 — they are never thrown, so the form can show an inline message instead of hitting an error boundary.
- **Forms** (`components/*.tsx`) are Client Components using React Hook Form + the same Zod schemas the actions re-validate server-side (`schemas.ts`). Each form calls its action directly; there is no `/api` fetch layer for auth.
- **Route group** `src/app/(auth)/` holds the public pages (`/login`, `/signup`, `/forgot-password`, `/update-password`). `src/app/auth/confirm/route.ts` is the one Route Handler in this flow — it exchanges a Supabase email-link `token_hash` for a session, the same "external redirect" shape §20 permits for Route Handlers.
- **`src/proxy.ts` / `src/services/supabase/proxy.ts`** refresh the session on every request and redirect unauthenticated requests to `/login`, except the public paths listed in `PUBLIC_PATH_PREFIXES`. Default-deny: a new route is protected unless explicitly added to that list.
- **`handle_new_user()`** (DB trigger, `supabase/migrations`) creates the `profiles`/`user_settings` rows and captures the browser-detected IANA timezone passed in `signUp()`'s `options.data.timezone` — needed for streak/DST logic later (ADR-009).

## Public API

Exported from `index.ts`: `SignUpForm`, `LogInForm`, `LogOutButton`, `ForgotPasswordForm`, `UpdatePasswordForm`. Each is a drop-in Client Component; pages in `(auth)/` render them directly.

## Extension guide

- New auth-adjacent mutation → add a Server Action in `actions.ts` following the existing `{ ok }` result shape, plus a Zod schema in `schemas.ts` shared between the form and the action.
- New public (unauthenticated) route → add its prefix to `PUBLIC_PATH_PREFIXES` in `src/services/supabase/proxy.ts`, or the proxy will redirect it to `/login`.
- Changing what happens after signup/login → check `isSafeRedirectPath()` in `actions.ts` first; the `next` query param is client-controlled and must stay open-redirect-safe.

## Known limitations

- **TD-04:** "Confirm email" is currently OFF in the Supabase dashboard for local dev (no SMTP configured yet), so `signUp()` returns an active session immediately — there is no email-verification round trip in dev. `SignUpForm` branches on `sessionCreated` from the action so it shows the right UI either way, but this must be re-enabled, with SMTP configured, before any real/external user signs up.
- `resetPasswordForEmail` always sends mail regardless of the "Confirm email" setting — testing forgot-password against an address you don't own will bounce.
- No rate limiting on the Server Actions themselves; Supabase's own auth email rate limit is the only current backstop.
