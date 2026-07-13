# PROJECT_MAP.md

# Trading Academy — Repository Map

**If you are about to change something, read this file first.** It tells you where things live, why they live there, and which document you must read before touching a given area.

Last updated: 2026-07-13 · Status: pre-implementation (no application code yet)

---

## The 30-second version

- **`/docs`** — decisions and plans. Read-only-ish. This is the *source of truth*; the code follows it.
- **`/src`** — the application. All TypeScript/React lives here.
- **`/supabase`** — the database, its migrations, and server-side functions.
- **`/tests`** — end-to-end tests only. Unit tests live *next to* the code they test.
- **`/public`** — static files served as-is (fonts, images).
- **Root** — configuration files that the tools require to be at the root.

---

## Full tree

```
trading-academy/
│
├── README.md                    Entry point. Points here.
│
├── docs/                        ── SOURCE OF TRUTH ──
│   ├── PROJECT_INSTRUCTIONS.md    Start here. Document hierarchy + precedence.
│   ├── PROJECT_MAP.md             This file. Where everything lives.
│   ├── NON_NEGOTIABLES.md         The product constitution. Overrides everything.
│   ├── GLOSSARY.md                Trading terms used across the codebase.
│   │
│   ├── adr/                       WHY we chose each technology/pattern.
│   │   ├── ADR-000-template.md      Copy this to write a new one.
│   │   └── ADR-001 … ADR-012.md     One decision per file. IMMUTABLE.
│   │
│   ├── architecture/              HOW the system is put together.
│   │   ├── ARCHITECTURE.md          Stack, layering, data flow, security.
│   │   └── DATABASE_SCHEMA.md       Every table, with reasoning.
│   │
│   ├── planning/                  WHAT gets built, and in what order.
│   │   ├── PROJECT_VISION.md        What this is and who it's for.
│   │   ├── FEATURE_ROADMAP.md       Milestones M-0 … M-20 with checklists.
│   │   ├── MILESTONE_DEPENDENCIES.md  What blocks what. The critical path.
│   │   └── RISKS_AND_UNKNOWNS.md    What could still go wrong.
│   │
│   ├── engineering/               HOW code is written here.
│   │   ├── ENGINEERING_PRINCIPLES.md  The engineering constitution. Read before coding.
│   │   ├── TECHNICAL_DEBT.md         Known shortcuts, with fixes and triggers.
│   │   └── MASTER_PROMPT.md          The AI collaborator's operating role.
│   │
│   └── research/                  Findings and audits. Not binding.
│       ├── DATA_LICENSING.md        M-0 deliverable. The one external blocker.
│       └── DOC_CONSISTENCY_REVIEW.md  Audit of doc contradictions. Working list.
│
├── src/                         ── THE APPLICATION ──
│   ├── app/                       Routes ONLY. Thin. No business logic.
│   │   ├── (auth)/                  Login, signup, reset — unauthenticated shell.
│   │   └── (app)/                   Dashboard, lessons, replay — authenticated shell.
│   │
│   ├── components/                Shared UI. Knows NOTHING about trading.
│   │   ├── ui/                      shadcn primitives (Button, Dialog, Card).
│   │   ├── chart/                   <PriceChart> + overlays (ADR-004).
│   │   └── layout/                  Shell, nav, page frames.
│   │
│   ├── features/                  ★ THE MAIN UNIT OF ORGANIZATION ★
│   │   └── <feature>/               See "Adding a feature" below.
│   │
│   ├── lib/                       Domain logic with NO React import.
│   │   └── engine/                  ★ The deterministic trading engine (ADR-013).
│   │                                Fills, PnL, R-multiple, position sizing.
│   │                                Shared by simulator, replay, backtester,
│   │                                and the server-side validator.
│   │
│   ├── services/                  I/O boundaries — the ONLY place that talks out.
│   │   ├── supabase/                Client creation (browser + server).
│   │   └── ai/                      Claude provider abstraction + versioned prompts (ADR-003).
│   │
│   ├── content/lessons/           MDX lesson content (ADR-008).
│   ├── hooks/                     Cross-feature hooks only (useDebounce, useMediaQuery).
│   ├── types/                     Cross-cutting types + GENERATED database types.
│   ├── utils/                     Pure helpers. No I/O. No Date.now(). No randomness.
│   └── styles/                    Tailwind entry + design tokens.
│
├── supabase/                    ── THE DATABASE ──
│   ├── config.toml                Supabase CLI config (tool-mandated location).
│   ├── migrations/                Forward-only SQL. Immutable once merged.
│   ├── functions/                 Edge Functions (grant-xp, validate-trade, …).
│   ├── seed/                      Reference data (emotions, mistake tags, achievements).
│   └── scripts/                   Market-data import scripts (ADR-006).
│
├── tests/
│   ├── e2e/                       Playwright, critical paths only.
│   └── fixtures/                  Shared test data (candle sets, known trades).
│                                  ↳ UNIT TESTS DO NOT LIVE HERE. They sit next
│                                    to their source: lib/engine/fill.test.ts
│
├── public/                        Static assets served as-is.
│
├── .github/workflows/             CI: typecheck, lint, test, a11y.
│
└── [root config]                  package.json · tsconfig.json · next.config.ts
                                   tailwind.config.ts · eslint.config.mjs
                                   vitest.config.ts · playwright.config.ts
                                   .env.local (NEVER committed)
```

---

## Where do I put a new...?

| I'm adding... | It goes in | Rule |
|---|---|---|
| A whole new capability (journal, backtester) | `src/features/<name>/` | Always start here |
| A button used by two features | `src/components/ui/` | Only on the **second** use, never the first |
| A trading calculation (R-multiple, expectancy) | `src/lib/engine/` or `src/lib/` | Must be pure. No React, no Supabase |
| A date/currency formatter | `src/utils/` | Must be pure and deterministic |
| A hook used by one feature | `src/features/<name>/hooks/` | |
| A hook used by three features | `src/hooks/` | Rule of three |
| A database table | `supabase/migrations/` | **+ RLS policies in the same file** |
| Anything needing a secret key | `supabase/functions/` | Never in `src/` |
| A lesson | `src/content/lessons/<track>/` | MDX |
| A new page | `src/app/(app)/<route>/page.tsx` | Route only — logic lives in the feature |

### Adding a feature — the standard shape

```
src/features/journal/
├── components/          Feature-owned UI (EntryForm.tsx, EmotionPicker.tsx)
├── hooks/               useJournalEntry.ts
├── api/                 TanStack Query hooks + query-key factory
├── lib/                 Feature-local pure logic
├── store.ts             Zustand — only if ephemeral state exists
├── types.ts
├── index.ts             ★ The ONLY file other features may import from
└── README.md            Purpose · Architecture · API · Extension · Limitations
```

**The one rule that keeps this from collapsing:** other features import from `@/features/journal` — never `@/features/journal/components/EntryForm`. Deep imports are how a modular codebase quietly becomes a monolith. This is lint-enforced.

---

## Read before you change

| Before touching... | Read |
|---|---|
| **Anything, for the first time** | `docs/PROJECT_INSTRUCTIONS.md` → `docs/engineering/ENGINEERING_PRINCIPLES.md` |
| The database | `docs/architecture/DATABASE_SCHEMA.md` + ADR-011 (deletes) + ADR-012 (RLS) |
| The trading engine | ADR-007 (execution model) + `RISKS_AND_UNKNOWNS.md` R-3 (bar-path rule) |
| Anything about XP, levels, streaks | ADR-009 — **there is deliberately no XP for profit** |
| State management | ADR-005 — the five buckets |
| A chart | ADR-004 |
| The AI coach | ADR-003 + R-4 (cost) + R-7 (never advise real trades) |
| Adding a dependency | ENGINEERING_PRINCIPLES §25 |
| Taking a shortcut | ENGINEERING_PRINCIPLES §26 → log it in `TECHNICAL_DEBT.md` |
| Deciding "am I done?" | ENGINEERING_PRINCIPLES §23 (production-ready) and §24 (feature complete) |

**If a decision in `/docs/adr` blocks you, do not work around it.** Write a superseding ADR first, then code. An ADR you quietly ignored is worse than one you never wrote — the docs will now lie about the system.

---

## Why the structure is shaped this way

**Documentation is separated by the question it answers.** Not by author, not by date. `planning/` answers *what and when*, `architecture/` answers *how it fits together*, `engineering/` answers *how to write it*, `adr/` answers *why not the other way*. When you have a question, the folder name tells you where the answer is.

**Features, not layers, are the unit of code organization.** The common alternative — top-level `/controllers`, `/models`, `/views` — means one change touches four directories, and no directory tells you what the app does. Here, `src/features/` is a table of contents for the product.

**The trading engine is not inside a feature.** It's used by the simulator, replay, the backtester, and the server-side validator. If it lived in `features/simulator/`, the backtester would import into another feature's internals — exactly the coupling the architecture forbids. It also has to run in a Web Worker and be compiled for Deno on the server, neither of which works from inside a React feature module.

**`supabase/` is not called `database/`.** The Supabase CLI hardcodes this path. Renaming it means fighting the tool on every command, forever, to gain nothing.

**Unit tests are colocated; only e2e lives in `/tests`.** A parallel test tree mirroring `src/` rots — files move, the mirror doesn't follow, and tests quietly stop covering what you think they cover. A test next to its source is a test that gets renamed with it.

**There is no `/config` folder.** `package.json`, `tsconfig.json`, and `next.config.ts` must be at the root — the tools look there and nowhere else. A config folder holding the two files that *could* move, while the important five stay at root, is worse than no folder at all.
