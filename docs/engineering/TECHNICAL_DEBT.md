# TECHNICAL_DEBT.md

# Trading Academy — Technical Debt Register

Required by NON_NEGOTIABLES.md Rule 17 and ENGINEERING_PRINCIPLES.md §26.
Debt is permitted only if it is **intentional, visible, and temporary**. If it is not in this file, it is not permitted.

Reviewed at every milestone boundary. If this list grows faster than it shrinks for two consecutive milestones, feature work stops until it is paid down.

**Status:** `open` · `paid` · `accepted` (deliberately permanent — requires a stated reason)

---

## Template — copy this

```md
### TD-nn · <one-line title>
- **Incurred:** M-x, YYYY-MM-DD
- **Why:** what forced the shortcut
- **Risk if unpaid:** concrete consequence, with the RISKS R-n reference if it maps to one
- **Proposed fix:** what "paid" looks like, with a rough estimate
- **Trigger to pay:** the condition that makes this urgent (a milestone, a user count, a cost threshold)
- **Owner:** Christian
- **Status:** open
```

---

## Open debt

### TD-01 · PROJECT_INSTRUCTIONS.md referenced but never written
- **Incurred:** M-1, 2026-07-13
- **Why:** PROJECT_MAP.md names it as the mandatory first-read entry point indexing the doc hierarchy, but it was never created; DOC_CONSISTENCY_REVIEW.md C-2 flagged this before M-1 and it wasn't resolved before implementation began.
- **Risk if unpaid:** New contributors (or a future session) have no single entry point into the doc hierarchy; PROJECT_MAP.md's own reading order points at a dead reference.
- **Proposed fix:** Write a short index document listing precedence order and pointing to each doc. ~30 min.
- **Trigger to pay:** Before M-2 begins.
- **Owner:** Christian
- **Status:** open

### TD-02 · ADR-013/014/015 referenced but never written
- **Incurred:** M-1, 2026-07-13
- **Why:** DOC_CONSISTENCY_REVIEW.md called for three ADRs before M-1 (ADR-013 engine location, ADR-014 numeric precision, ADR-015 env/secrets). ENGINEERING_PRINCIPLES.md §3.1 already describes ADR-013's resolution as settled, citing it as if it exists. None were written; ADR-016 was written and numbered past the gap.
- **Risk if unpaid:** Non-obvious domain rules (engine location, money arithmetic, secrets handling) cite ADRs that don't exist — a citation to nothing, which ENGINEERING_PRINCIPLES §15 calls worse than no citation.
- **Proposed fix:** Write ADR-013 (supersedes ADR-007, location only), ADR-014, and ADR-015 — each a short transcription of decisions already made in ENGINEERING_PRINCIPLES.md into immutable ADR form. ~30 min each.
- **Trigger to pay:** ADR-013 and ADR-014 before M-8 (simulator engine); ADR-015 before Supabase is wired (later this milestone).
- **Owner:** Christian
- **Status:** partially paid — ADR-015 written M-1 Session 4, 2026-07-14, before Supabase wiring per the original trigger. ADR-013 and ADR-014 remain outstanding; still open until M-8.

### TD-04 · Email confirmation disabled for local development
- **Incurred:** M-2, 2026-07-15
- **Why:** Editing Supabase's email templates (needed so the confirmation/recovery links point at `/auth/confirm` with `token_hash`/`type`, per PR #5) is now gated behind configuring custom SMTP, which isn't set up yet. Rather than block the auth-UI PR on standing up SMTP, "Confirm email" was disabled in Authentication -> Email Provider settings for the dev phase — signups now get an active session immediately, with no `/auth/confirm` round trip.
- **Incident, 2026-07-16:** Repeated manual signup testing against fake addresses (`test-...@example.com`, `claude-agent-test-...@gmail.com`, and other one-off test emails) caused Supabase's confirmation emails to bounce and triggered a bounce-rate warning from Supabase, with a threat to throttle sending if it continued. Mitigated in code (not by touching SMTP/dashboard email settings): `signUpSchema`/`forgotPasswordSchema` now reject RFC 2606-reserved test domains (`example.com`/`.org`/`.net`/`.edu`, `.test`/`.example`/`.invalid`/`.localhost`) before a request ever reaches Supabase. This reduces *accidental* bounces from careless test input; it does not change the underlying trade-off below, and testing the forgot-password flow against any address that isn't a real, owned inbox will still bounce — `resetPasswordForEmail` always sends mail regardless of the "Confirm email" setting.
- **Risk if unpaid:** Anyone can sign up with an email address they don't own; nothing verifies it's real or belongs to them. Acceptable only while the product has zero external users. Shipping this as-is to real users would mean unverified accounts, no protection against typo'd or fake emails, and password-reset links being usable by whoever controls an unverified inbox.
- **Proposed fix:** Configure custom SMTP (Dashboard -> Project Settings -> Auth -> SMTP Settings), point the "Confirm signup" and "Reset password" email templates at `/auth/confirm` using the exact values in PR #5's description, then re-enable "Confirm email" in Email Provider settings. ~30-45 min once an SMTP provider is chosen. **Deliberately not being done now** — still deferred to pre-launch, per the original trigger below.
- **Trigger to pay:** Before the first external/real user signs up — i.e., before any public or shared deployment. Blocks nothing before then.
- **Owner:** Christian
- **Status:** open

---

## Paid debt

### TD-03 · Scaffold dependencies use `^` ranges instead of exact pins
- **Incurred:** M-1, 2026-07-13
- **Why:** `create-next-app` and the initial scaffold pinned `typescript`, `eslint`, `tailwindcss`, `@tailwindcss/postcss`, `@types/node`, `@types/react`, and `@types/react-dom` with `^` ranges. ENGINEERING_PRINCIPLES.md §25 requires exact versions, updated deliberately via a scheduled dependency PR. Re-pinning the whole scaffold wasn't in scope of the Session 2 tooling work (CI/commitlint) that surfaced this.
- **Risk if unpaid:** A `^` range can resolve to a different version on a fresh `npm install` (e.g. a new contributor, or CI cache miss) than what was last tested locally, silently changing lint/typecheck/build behavior between environments.
- **Proposed fix:** Pin each `^`-ranged dependency to its currently installed exact version in `package.json`, in a dedicated dependency PR. ~15 min.
- **Trigger to pay:** Before M-3, when the first non-scaffold dependencies get added — pin the scaffold at the same time so all dependencies follow the same exact-version convention from that point on.
- **Owner:** Christian
- **Status:** paid — M-3, 2026-07-16. All seven pinned to their currently installed exact versions (`typescript` 5.9.3, `eslint` 9.39.5, `tailwindcss`/`@tailwindcss/postcss` 4.3.2, `@types/node` 20.19.43, `@types/react` 19.2.17, `@types/react-dom` 19.2.3); lockfile regenerated to match.

---

## Debt that may never be taken

These are not shortcuts. Taking them means the product is wrong, not merely unfinished.

- Skipping RLS policies on a table
- Skipping tests on the fill engine, statistics formulas, or XP grants
- Trusting a client-supplied `userId` in an Edge Function
- Floating-point arithmetic on money
- Shipping a number that might be wrong rather than shipping no number
- Anything that violates NON_NEGOTIABLES.md
