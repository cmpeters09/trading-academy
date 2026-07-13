# PROJECT_VISION.md

# Trading Academy
### Learn to Think Like a Professional Trader

Version 2.0 — aligned with ADR-001…012, DATABASE_SCHEMA.md, and FEATURE_ROADMAP.md v2.
Changes from v1 are marked ▲.

---

# Vision

Trading Academy is an immersive, interactive learning platform designed to transform complete beginners into disciplined, confident traders through hands-on practice—not passive reading.

The goal is not to teach users how to "get rich." The goal is to teach how markets work, how professional traders think, how to manage risk, and how to develop consistent decision-making. Learning should feel like Duolingo, with the depth of TradingView and the analytics of a professional trading journal.

▲ **Scope clarification:** Trading Academy is an education product operating entirely on **curated historical market data** (ADR-006). It is not a brokerage, provides no live quotes through Phase 6, and never gives real-market trade recommendations. The AI coach critiques *process on simulated trades* only.

---

# Mission

Help users master trading through interactive simulations, historical market replay, guided practice, realistic scenarios, AI coaching, personalized feedback, gamification, and progressive challenges. Every feature reinforces understanding through experience.

# Target Audience

Primary: complete beginners, self-taught traders, intermediate traders wanting structure.
Future: swing/day/options/forex/futures/crypto traders, investing students.

# Learning Philosophy

Learn by doing: make decisions → immediate feedback → analyze mistakes → practice repeatedly → build pattern recognition → improve. Every interaction teaches something.

▲ Reproducibility principle: because all exercises run on curated historical segments (the `dataset_segments` library), every user can replay the *same* market — lessons are consistent, reviewable, and testable.

---

# Core Principles

## Risk First
Risk management before profits: position sizing, stop losses, risk-reward, drawdowns, portfolio risk, capital preservation. ▲ Enforced structurally: lesson prerequisites gate strategy tracks behind risk tracks, and the default risk setting is capped at 5% in the schema itself.

## Probability Over Prediction
No strategy wins every time. Good trading manages probabilities and makes consistently good decisions.

## Process Over Outcome
Winning trades can be bad trades; losing trades can be good trades. ▲ Enforced structurally: XP reasons exist for journaling, plan adherence, and risk discipline — **there is no XP reason for profit** (ADR-009). Plan-adherence and R-multiples are first-class data (`trades.r_multiple`, `journal_entries.followed_plan`).

## Progressive Learning
Content unlocks gradually: Market Basics → Candlesticks → Trends → Support & Resistance → Market Structure → Volume → Risk Management* → Trading Psychology → Strategy Development → Advanced Analysis.
▲ *Risk fundamentals are additionally interleaved from track 1 onward — Rule 2 forbids treating risk as a late-stage topic.

---

# Product Experience & Design

Premium, fast, modern, interactive, beautiful, encouraging, professional. Inspiration: Apple, Linear, TradingView, Notion, Stripe, Raycast, Duolingo. Minimal, clean, spacious, elegant, smooth, excellent typography, responsive, accessible. Dark mode first.

---

# Core Modules
(unchanged in intent; build order and dependencies now governed by MILESTONE_DEPENDENCIES.md)

**Dashboard** — progress, streak, recent trades, challenges, performance, recommendations.
**Interactive Lessons** — ▲ MDX-based with embedded interactive components (ADR-008); explanation, visualization, interaction, practice, feedback, mastery check.
**Trading Simulator** — ▲ deterministic client-side fill engine with server-side validation (ADR-007); long/short, stops, targets, partial exits, slippage, commissions, position sizing.
**Market Replay** — candle-by-candle, future data hidden at the engine layer, resumable sessions, curated historical events.
**Pattern Recognition** — trends, ranges, breakouts, pullbacks, reversals, chart and candlestick patterns.
**Trading Journal** — entries, exits, screenshots, notes, ▲ structured emotion & mistake vocabularies (so patterns are analyzable), confidence, plan adherence; automatic insights.
**AI Trading Coach** — ▲ Claude-powered mentor (ADR-003): reflection, pattern identification, psychology and risk analysis; guides rather than answers; never shames; never advises real-market action.
**Strategy Builder + Backtesting** — visual rules; backtests run the *same* engine as the simulator, so practice and testing never disagree.
**Statistics** — win rate, profit factor, expectancy, drawdown, Sharpe, streaks — plus process metrics (plan adherence, risk violations) with equal prominence.
**Psychology Trainer** — fear/greed/FOMO/revenge/overconfidence/hesitation via simulated scenarios.
**Challenges & Achievements** — process-oriented (disciplined trades, 2:1 RR, journaling consistency).
**Portfolio & Macro Simulators** — later phases, historical data only.

---

# Gamification

XP (append-only ledger), levels (computed), achievements, daily streaks (timezone-aware), challenges, progress bars, unlockables, badges. ▲ Leaderboards remain optional and are *feasible without rework* because trades are server-validated (ADR-007) — but they launch only with process-based rankings, never PnL rankings (Rule 7).

---

# Long-Term Roadmap (phases summarized; canonical version in FEATURE_ROADMAP.md v2)

Phase 1 Foundation ▲ now includes the Data Foundation milestone (instruments/candles/chart component) and the XP ledger — both were hidden prerequisites.
Phase 2 Education · Phase 3 Simulator & Replay · Phase 4 Journal & Statistics · Phase 5 AI Coach & Tutor · Phase 6 Patterns, Strategy, Backtesting · Phase 7 Psychology · Phase 8 Full Gamification · Phase 9 Macro · Phase 10 Portfolio · Phase 11 Polish.
Phase 5 (commercial) unchanged. ▲ Live paper trading and broker integrations are explicitly out of scope through Phase 6 (ADR-006, RISKS R-7).

# Technical Goals

Fast, modular, scalable, secure, documented, maintainable, expandable. ▲ Now concrete: App Router + RSC, Supabase-only backend, RLS-everywhere, one shared fill engine, append-only gamification ledger, MDX content pipeline — see ARCHITECTURE.md v2 and /docs/adr.

# Success Metrics

Users understand markets, develop discipline, improve decisions, manage risk, recognize patterns, think probabilistically — confident without reckless trading.

# Guiding Question

Before implementing any feature: **"Does this make the user a better trader?"** If not, redesign until it does. Quality over quantity.
