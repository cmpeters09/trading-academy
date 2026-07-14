# ADR-015: Environment & Secrets Management

**Status:** Accepted · **Date:** 2026-07-14

## Context
DOC_CONSISTENCY_REVIEW.md G-3 flagged that no document says which env vars exist, where they live, what's public vs. server-only, or what happens on a missing var. ENGINEERING_PRINCIPLES §4 and PROJECT_MAP.md both assert rules about secrets ("Edge-Function-only," "anything needing a secret key → `supabase/functions/`, never in `src/`") without a home for the reasoning. This repo is also **public on GitHub** — there is no private-repo safety net if a key lands in a commit.

## Decision

### 1. Env vars that exist at this stage (M-1, connection only)

| Variable | Public? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | The Supabase project's API URL. Needed by both browser and server Supabase clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | The anon/publishable key. Safe to ship to the browser — RLS (ADR-012) is the actual security boundary, not key secrecy. |

No other env var is introduced by this session. Future secrets (AI provider keys per ADR-003, etc.) follow rule 3 below — they are never added to this table as Next.js/Vercel variables.

### 2. `NEXT_PUBLIC_*` vs. server-only
Next.js inlines any `NEXT_PUBLIC_*` variable into the client bundle at build time — it is public **by construction**, not by accident. Only put a value behind that prefix if it is safe for a stranger to read in browser dev tools.

Everything else defaults to server-only: readable in Server Components, Route Handlers, and `instrumentation.ts`, never sent to the browser. At this stage there are no server-only Next.js env vars — see rule 3 for why `SUPABASE_SERVICE_ROLE_KEY` is not one of them.

### 3. Service-role keys never leave Edge Functions
`SUPABASE_SERVICE_ROLE_KEY` (and every future secret with equivalent privilege — AI provider keys, etc.) is **not a Next.js or Vercel environment variable**. It is set exclusively as a Supabase secret (`supabase secrets set`, or Dashboard → Edge Functions → Secrets) and read only inside Edge Functions running on Supabase's infrastructure.

This is stronger than "don't expose it to the client" — it never enters the Next.js process at all, in any environment, so it cannot be imported into a Client Component by mistake (ENGINEERING_PRINCIPLES §4), cannot leak via a Route Handler that grew business logic it shouldn't have (§20), and isn't sitting in Vercel's env var UI where a misconfigured "Expose to client" toggle could ship it. This matches PROJECT_MAP.md's rule: "Anything needing a secret key → `supabase/functions/`, never in `src/`."

### 4. Where each var lives

| Location | What goes there |
|---|---|
| `.env.local` (local dev only) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` for a dev Supabase project. **Gitignored** (`.env*` in `.gitignore`) and stays that way — never committed, never renamed to bypass the ignore pattern. |
| Vercel → Project Settings → Environment Variables | The same two variables, set per environment (Production / Preview / Development). **SHOULD** point at a separate Supabase project from local dev once more than one exists, so a local experiment can't corrupt shared data — not yet enforced since only one project exists at this stage. |
| Supabase → Edge Functions → Secrets | `SUPABASE_SERVICE_ROLE_KEY` and any future privileged-write secret. Never duplicated anywhere else. |

**This repo is PUBLIC.** A committed key is a security incident, not a bug to quietly fix — rotate it in Supabase immediately and treat the exposure as real. This is why validation (rule 5) fails loudly on a missing var instead of a code path silently falling back to some default that could mask a misconfigured or leaked key.

### 5. Fail-fast validation at boot, not at first use
A Zod schema (`src/lib/env.ts`) parses `process.env` once at module load and throws immediately if a variable is missing or malformed. `src/instrumentation.ts` imports it inside `register()` — the Next.js hook that runs once when a server instance starts and **must complete before the server accepts any requests** (stable since Next 15, used here rather than a hand-rolled check since it's the framework's own answer to "run this once at boot").

This means a missing `NEXT_PUBLIC_SUPABASE_ANON_KEY` fails `next dev` / `next start` / the Vercel deployment immediately, with a clear error naming the missing variable — instead of surfacing three clicks deep as an opaque "Invalid API key" from whichever Server Component happens to call Supabase first.

## Rationale
- Fail-fast over fail-later: a wrong number is worse than a crash (§14's own framing, applied to config instead of trading data) — an app that silently boots with no Supabase URL will produce confusing runtime errors far from the actual cause.
- Zero-trust for the service-role key over "just don't import it in a Client Component": relying on developer discipline alone is exactly the kind of thing that fails once, at 1am, in a rushed PR. Removing the key from the Next.js process entirely removes the failure mode, not just the common case of it.
- `instrumentation.ts` over validating inside the Supabase client factory: the factory only runs when first imported, which in serverless can be deferred to the first request that happens to hit that code path — not "boot" in any meaningful sense. `register()` is the actual boot hook.

## Consequences
- `/services/supabase/browser.ts` and `/services/supabase/server.ts` both import `env` from `src/lib/env.ts` rather than reading `process.env` directly — one validated source, no duplicated parsing.
- No service-role/admin Supabase client exists anywhere in `src/`. If a future feature seems to need one, that is a signal the logic belongs in a Supabase Edge Function instead (ADR-002, §20) — not a reason to add the key to Vercel.
- TECHNICAL_DEBT.md TD-02 is partially paid: ADR-015 is written. ADR-013 (engine location) and ADR-014 (numeric precision) remain outstanding.
- Local setup requires a human to create `.env.local` by hand (a `gitignore`d file cannot be scaffolded by an agent without risking a secret touching the working tree) — documented as a manual step, not automated.
