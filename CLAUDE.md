@AGENTS.md

# Standing Rules

- **Read first, every session:** `docs/engineering/ENGINEERING_PRINCIPLES.md` and `docs/NON_NEGOTIABLES.md` before any work. They are binding.
  Precedence: `NON_NEGOTIABLES.md` > ADRs (`docs/adr/*`) > `ENGINEERING_PRINCIPLES.md` > everything else.
- **Branch protection is ON.** Never push directly to `main`. Work on a feature branch (naming per §21, e.g. `m1/theme-system`), push the branch, open a PR.
- **Never create, edit, or read `.env` files. Never handle secrets.** This repo is PUBLIC — a committed key is a security incident, not a bug.
- **The user is a beginner.** Explain what you're doing and why, briefly, as you go.
- **Any shortcut gets logged** in `docs/engineering/TECHNICAL_DEBT.md` per Rule 17. Never fix a doc gap silently — log it or ask.
- **One milestone in progress at a time** (§24).
- **GitHub CLI (`gh`) is installed** (via `winget install --id GitHub.cli --source winget`). Use it to open PRs (`gh pr create`) instead of asking the user to click a web link. Requires `gh auth login` once per machine — that step is interactive and belongs to the user, never run it unattended.
