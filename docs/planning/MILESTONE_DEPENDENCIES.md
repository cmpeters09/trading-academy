# MILESTONE_DEPENDENCIES.md

# Trading Academy — Milestone Dependency Graph

Milestone IDs (M-x) are now referenced in FEATURE_ROADMAP.md. An arrow means "requires."
Key structural finding: **M-3 (Data Foundation) is a hidden prerequisite** for everything chart-related and was missing from the original roadmap — it has been added to Phase 1.

## Graph

```mermaid
graph TD
    M1[M-1 Project Setup<br/>Next.js, TS, Tailwind, theme] --> M2[M-2 Auth & Profiles]
    M1 --> M3[M-3 Data Foundation<br/>instruments, candles, import scripts, PriceChart component]
    M2 --> M4[M-4 Dashboard v1]
    M2 --> M5[M-5 XP Ledger & Activity Log]
    M5 --> M4

    M2 --> M6[M-6 Lesson Engine<br/>MDX pipeline, progress]
    M6 --> M7[M-7 Knowledge Checks<br/>quizzes, attempts]
    M3 --> M6
    M5 --> M6

    M3 --> M8[M-8 Simulator Engine<br/>pure TS fill engine + tests]
    M8 --> M9[M-9 Simulator UI<br/>order ticket, positions, accounts]
    M2 --> M9
    M3 --> M10[M-10 Replay Engine]
    M10 --> M9
    M9 --> M11[M-11 Trade Persistence<br/>Edge Fn validation, trades table]

    M11 --> M12[M-12 Journal]
    M11 --> M13[M-13 Statistics]
    M12 --> M14[M-14 AI Coach]
    M13 --> M14
    M6 --> M15[M-15 AI Tutor]

    M3 --> M16[M-16 Pattern Recognition]
    M6 --> M16
    M8 --> M17[M-17 Strategy Builder]
    M17 --> M18[M-18 Backtesting]
    M13 --> M18

    M12 --> M19[M-19 Psychology Trainer]
    M10 --> M19
    M5 --> M20[M-20 Full Gamification<br/>achievements, challenges, quests]
    M11 --> M20
    M6 --> M20
```

## Critical path
M-1 → M-3 → M-8 → M-9 → M-11 → M-13 → M-14

The simulator chain is the longest and highest-risk path; the AI Coach (a headline feature) sits at its end. Lessons (M-6/M-7) run in parallel off M-2/M-3, which is why Phase 2 and early Phase 3 work can interleave.

## Parallelizable pairs (useful for 1–2 hr work sessions)
- M-6 Lesson Engine ∥ M-8 Simulator Engine (no shared code beyond M-3)
- M-12 Journal ∥ M-13 Statistics (both read `trades`, touch nothing shared)
- M-16 Pattern Recognition ∥ M-20 Gamification

## Ordering corrections vs. the original roadmap
1. **M-3 Data Foundation added to Phase 1.** Original roadmap had no data milestone at all; simulator/replay/lessons-with-charts all silently depended on it.
2. **XP ledger (M-5) pulled from Phase 8 into Phase 1.** Lessons grant XP in Phase 2; retrofitting a ledger under a live counter is exactly the migration ADR-009 exists to avoid. Only the *ledger* moves early — achievements/challenges/quests stay in Phase 8 (M-20).
3. **Simulator engine (M-8) split from simulator UI (M-9).** The pure engine is the most test-critical module (ADR-010) and blocks both replay trading and backtesting; building it UI-first would couple them.
4. **Trade persistence (M-11) is its own milestone.** Journal, stats, coach, and gamification all hang off the `trades` table; it deserves explicit Definition-of-Done treatment rather than being an afterthought of the simulator UI.
