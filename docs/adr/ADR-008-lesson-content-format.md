# ADR-008: Lesson Content — MDX in Repo, Progress & Attempts in Database

**Status:** Accepted · **Date:** 2026-07-12

## Context
Roadmap says "Markdown support" but never decided where lesson content lives: database, CMS, or repo. Lessons must embed interactive components (charts, quizzes, mini-sims), which plain Markdown can't.

## Decision
- Lessons are **MDX files in the repo** (`/content/lessons/<track>/<slug>.mdx`), embedding interactive components (`<Quiz>`, `<ChartExample>`, `<PracticeExercise>`).
- The database stores only lesson **metadata** (id/slug, track, order, prerequisites, XP value) and all **user state** (progress, quiz attempts, scores).
- A build-time script syncs MDX frontmatter → `lessons` table so ordering/prereqs are queryable.

## Rationale
- Content is code: versioned, reviewed, testable — matches how one small team actually authors.
- Interactive-first learning (Rule 5) requires components inside prose; MDX is the standard answer.
- A CMS adds infrastructure for zero users; can migrate later since user state is already DB-separated.

## Consequences
- Non-developers can't edit content without a PR — acceptable now, revisit at Phase 4 (community/custom lessons).
- Quiz question definitions live in MDX; only attempts/answers are persisted (keyed by stable question ids in frontmatter).
