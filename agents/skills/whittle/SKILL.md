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

## Local verification

## PR format

## Resolving preview links

## Outcome summary

## Rules
