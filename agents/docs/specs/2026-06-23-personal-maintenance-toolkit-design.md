# Personal Maintenance Toolkit — Design

**Date:** 2026-06-23
**Author:** Marcus Michaels
**Status:** Design — approved, pending spec review

---

## Summary

A personal, on-demand Claude Code skill that produces **small, safe, single-issue
PRs authored by me** — Spiritmender's safe-fix discipline, but the contributions
are genuinely mine, not a bot's. It lives in my own repo (cloned to
`~/.config/agent-skills/`), is wired into Claude Code globally via a symlink, and
operates on whatever repo I fire it inside. It never commits anything into the
target work repo.

The toolkit is a **driver**, not a ruleset. It reads the *target repo's own*
contract (`SPIRITMENDER.md` + `AGENTS.md` in ffern-engineering) and works from
those rules. Drop it into a different repo and it adapts to that repo's contract,
or does nothing if there isn't one.

Name: **`whittle`** — fired as `/whittle`. A verb that telegraphs the constraint:
shave one small thing off, carefully, by hand.

---

## Goals & non-goals

**Goals**
- Ship a steady trickle of small, real, *me-authored* PRs with near-zero effort.
- Each PR is trivial to review: one rule, one clean instance, one focused diff.
- Zero footprint in the work repo — no skill files, no workflow, no bot config
  committed to ffern-engineering.
- Reuse, not fork, the rules ffern already maintains in `SPIRITMENDER.md`.

**Non-goals**
- Not autonomous / not scheduled. I fire it; nothing happens behind my back.
- Not feature work, not ticket execution, not large refactors. Safe fixes only.
- Not a second copy of the rules. The rules belong to each target repo.
- Not my main output — a side channel I keep up when I have a spare few minutes.

---

## Architecture

### Where it lives & how it's wired

- `~/.config/agent-skills/` — a clone of **my** git repo. `git pull` updates the
  toolkit. Holds the skill(s) and this spec.
- Each skill is a folder; I symlink the active ones into `~/.claude/skills/`:
  ```sh
  ln -s ~/.config/agent-skills/skills/whittle ~/.claude/skills/whittle
  ```
  This mirrors exactly the symlink discipline ffern's `.agents/` already uses to
  mount into `.claude/`. (Branches it opens are prefixed `marcus/<rule>/` — see
  PR identity below — independent of the `whittle` skill name.)
- Because it resolves at the **user level** in `~/.claude/`, the skill is available
  in every project and ffern-engineering never sees it.

### Driver, not ruleset (option A)

When fired inside a repo, the skill:
1. Reads the target repo's `SPIRITMENDER.md` (the rule catalogue) and `AGENTS.md`
   (coding standards). Both are treated as non-negotiable, exactly as Spiritmender
   treats them.
2. If the repo has no such contract, it does nothing and says so — silence is
   success.

The rules stay owned by each project. The toolkit's value is the *driving loop*:
pick a rule → find one clean instance → verify → open a me-authored PR.

---

## Behaviour

### Invocation (option C — both modes)

- **Targeted:** `/whittle <rule>` — works that specific rule (e.g.
  `/whittle console-log-to-logger`).
- **Bare:** `/whittle` — surveys the repo, picks the rule with the **cleanest
  available instance** (smallest, lowest-risk candidate), and fixes it. The "I've
  got 5 minutes, find me something" mode.

### One instance, one PR

Hard constraint, inherited from Spiritmender: **at most one clean instance per
run, one focused PR** (respecting any higher batch limit a rule declares, e.g.
`logger-pii-redaction` allows up to 10). Keeps every review trivial. Silence is
success — if no clean instance exists, exit without opening a PR.

### In-flight dedup

Before picking a target, list my own open PRs grouped by the rule's branch prefix
and pick a *different* file/instance:
```sh
gh pr list --author "@me" --state open \
  --search "head:marcus/<rule>/" --json number,title,headRefName,files
```

### Operating procedure (per run)

1. Read the target repo's `SPIRITMENDER.md` + `AGENTS.md`.
2. Resolve the rule (named, or pick one with a clean candidate).
3. Find candidates; pick the cleanest (smallest diff, lowest risk).
4. Apply the fix; verify by reading surrounding code.
5. **Verify locally** (see below).
6. `turbo run format` on the changed files.
7. Branch, commit, push, open the PR (format below).

---

## PR identity & format

The whole point: these read like PRs I opened by hand.

- **Author:** my real identity — `marcus@ffern.co`, normal `git commit`.
  **No** `Co-Authored-By` trailer (per standing preference). No `[spiritmender]`
  tag anywhere.
- **Branch:** `marcus/<rule>/<short-slug>` — obviously my branch, still groups by
  rule for the dedup check.
- **Title:** plain Conventional Commits — e.g.
  `refactor: use nullish coalescing for optional className`,
  `fix: ...`, `chore: ...`. No bot prefix.
- **Body:** keep Spiritmender's **What / Why this is safe / How to verify**
  structure (genuinely good hygiene). **No footer** — no source-rule note, no
  `## Rule` section. The PR carries no trace of how it was produced.
- **Labels:** none. No `spiritmender` / `agent-task:*` labels — they look like
  normal PRs.

---

## Local verification (where this beats Spiritmender)

Spiritmender skips builds because it runs in a 15-minute CI box. This runs **on my
machine, on demand**, so it can afford to land PRs green:

- Always: `turbo run format` on the changed scope.
- Always: `turbo run check-types` on the changed package/scope.
- Recommended: `turbo run lint` on the changed scope.

If typecheck or lint fails on the change, fix it or abandon the instance — never
open a red PR. (Per standing preference, typecheck may be run directly via `tsc`
on the affected package rather than through turbo if that's faster.)

---

## Components / units

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `~/.config/agent-skills/` repo | Home for the toolkit; `git pull` to update | git, my GitHub |
| `skills/whittle/SKILL.md` | The driver: invocation, dedup, procedure, PR format, verification steps | target repo's `SPIRITMENDER.md` + `AGENTS.md`, `gh`, `turbo` |
| Symlink → `~/.claude/skills/whittle` | Makes the skill globally available to Claude Code | Claude Code skill discovery |

The skill is a single self-contained `SKILL.md` (plus a short README in the repo
for the symlink setup). It reads the rules at runtime, so it carries no ffern
specifics itself.

---

## Error handling & safety

- **Silence is success.** No clean instance → no PR, exit quietly.
- **No drive-by changes.** One rule, one instance, no incidental refactors.
- **Net-change ceiling** inherited from the target's contract (≤600 lines for
  ffern).
- **Red PRs forbidden.** Local typecheck/lint gate before opening.
- **Dedup** against my own open PRs by branch prefix.
- **No secrets / no work-repo footprint** — nothing from the toolkit is committed
  into the target repo.

---

## Decisions (resolved)

- **Name:** `whittle`, fired as `/whittle`.
- **Bare mode:** picks the rule with the cleanest available instance (not random).
- **PR footer:** none — the PR carries no trace of how it was produced.
