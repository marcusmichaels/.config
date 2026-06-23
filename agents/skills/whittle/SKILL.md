---
name: whittle
description: Use when Marcus wants to open one small, behaviour-preserving, self-authored maintenance PR on the current repo — fired as "/whittle" (bare = pick the cleanest available fix) or "/whittle <rule>" (target a specific rule). Carries its own safe-fix rule catalogue; runs autonomously and opens a PR assigned to Marcus.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(turbo:*), Bash(bunx tsc:*), Bash(tsc:*), Read, Edit, Write, Glob, Grep
---

# whittle

<!-- Body filled in by later tasks: Overview, Safety rails, Invocation,
Per-run procedure, Local verification, PR format, Preview-URL resolution,
Outcome summary, Rule index. -->

## Overview

whittle opens ONE small, behaviour-preserving, Marcus-authored PR per run. It
carries its own rule catalogue (`rules/`) and grounds itself in the target repo's
standards doc (`AGENTS.md` / `CLAUDE.md`) when present. Silence is success: if no
clean instance exists, it opens nothing.

**Doctrine — behaviour-preserving by default.** Every change must be provably
equivalent at runtime. If you can construct any input where old and new differ,
skip it. The ONLY exception: fixing an existing, obvious bug — a demonstrable,
evident defect with one unambiguous correct behaviour. When in doubt, it is not
obvious; skip.

## Safety rails (read first — non-negotiable)

These override everything. An unattended agent must never destroy work.

1. **Pre-flight.** Take a lockfile: if `.git/whittle.lock` exists, print
   `whittle: another run holds the lock — exiting.` and STOP. Otherwise create it.
   Then confirm `git status --porcelain` is empty; if the tree is dirty, release
   the lock and STOP with `whittle: working tree is dirty — aborting.`
2. **Never push to `main`** or the repo's default branch. Only ever push the run
   branch `marcus/<rule>/<short-slug>` that this run creates.
3. **Always branch before editing.** Create + checkout the run branch first. If you
   cannot, abort.
4. **Never** force-push, rewrite history, delete branches, or run destructive git
   (`reset --hard`, `clean -fd`, `checkout -- .`).
5. **Edits scoped to the single target instance.** No bulk deletes, no `rm -rf`, no
   touching files outside the one fix.
6. **No remote/account mutations** beyond opening the one PR and assigning it to me.
7. **Clean abort.** On any failure after branching, unwind: do not push a branch
   with no PR; do not leave a half-formed PR. Always release the lockfile on exit
   (success or abort).

## Invocation

- **Targeted — `/whittle <rule>`:** work that specific rule (one of the names under
  `## Rules`).
- **Bare — `/whittle`:** survey the rules and pick the one with the cleanest
  available instance. Ranking heuristic (cheapest signal first): prefer a rule with
  a candidate that is (a) a single-line change, (b) in a file with the fewest other
  candidates, (c) in a leaf component/page with a clear set of affected routes. Stop
  at the first rule that yields one clean, guard-passing instance.

Branch for the run: `marcus/<rule>/<short-slug>`, where `<short-slug>` is a 2–4
word kebab summary of the target (e.g. the component or file name + change).

## Per-run procedure

Follow in order. Stop (silently, releasing the lock) at any "no clean instance".

1. **Pre-flight safety check** (lockfile + clean tree — see Safety rails).
2. Read the target repo's `AGENTS.md` / `CLAUDE.md` if present; conform to it.
3. Resolve the rule: the named one, or (bare) auto-pick per the Invocation
   heuristic.
4. **Dedup** against my own open PRs for this rule; skip instances already in
   flight:
   `gh pr list --author "@me" --state open --search "head:marcus/<rule>/" --json number,headRefName,files`
5. Run the rule's `## Find`; for each candidate apply the rule's `## Guards`. Pick
   ONE clean instance. None? Release lock and STOP — silence is success.
6. **Create + checkout** `marcus/<rule>/<short-slug>`.
7. Apply the fix (single instance only). Re-read the surrounding code to confirm
   behaviour-preservation per the rule's `## Why behaviour-preserving`.
8. **Verify locally** (see Local verification). If it fails and you cannot fix it
   within scope, `git checkout main && git branch -D <branch>`, release lock, STOP.
9. Commit (author `marcus@ffern.co`, no co-author trailer, Conventional Commits
   title) and push the run branch.
10. Open the PR assigned to me (see PR format).
11. Resolve preview links and edit them into the body (see Resolving preview links).
12. Release the lock. Print the outcome summary.

## Local verification

Run on my machine before opening the PR. Never open a red PR.

1. **Format** the changed files: `turbo run format` (Biome).
2. **Determine the changed package** — the workspace whose dir contains the edited
   file (read its nearest `package.json` `name`). Call it `<pkg>`.
3. **Typecheck** that package only:
   `turbo run check-types --filter=<pkg>` — or, if faster, run `tsc --noEmit -p`
   on the package's `tsconfig.json` directly.
4. **Lint** the changed scope: `turbo run lint --filter=<pkg>`.

If typecheck or lint reports an error attributable to the change, fix it within the
single-instance scope, or abandon the instance (clean abort per Safety rails). A
pre-existing failure unrelated to the change does not block — but state that in the
PR's "Why this is behaviour-preserving" so the reviewer knows.

## PR format

## Resolving preview links

## Outcome summary

## Rules
