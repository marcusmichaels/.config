---
name: tinker
description: Use when Marcus wants to delegate a real, behaviour-changing fix that needs investigation first — fired as "/tinker <issue description>". Investigates the problem WITH Marcus (read-only, Q&A), presents a brief and waits for explicit "go", then autonomously builds the fix in an isolated worktree, opens a PR assigned to Marcus, and drives its CI checks to green. Run in screen; detach after approving the brief.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(turbo:*), Read, Edit, Write, Glob, Grep
---

# tinker

## Overview

tinker takes a real, behaviour-*changing* task I brief it on — usually a bug that
needs investigating before it can be fixed. It works WITH me to understand the
problem, then — on my explicit "go" — works on its own: builds the fix in an
isolated worktree, opens a PR assigned to me, and drives that PR's CI checks to
green. Run it in a `screen` session: interactive while I'm there for Phase 1,
autonomous (no questions) after I approve the brief and detach.

It conforms to the target repo's standards doc (`AGENTS.md` / `CLAUDE.md`). Unlike
whittle, tinker changes behaviour on purpose — correctness is established by CI
plus my manual QA, not a behaviour-preserving doctrine.

## Phase 1 — investigate (interactive, read-only)

Strictly read-only — NO worktree, branch, or edit exists yet.

1. Read the target repo's `AGENTS.md` / `CLAUDE.md`.
2. Investigate the reported problem: grep/glob/read the code, run read-only commands,
   trace the data/render path. Ask me clarifying questions, explore, ask more — in
   any order, looping until the root cause is clear.
3. Aim for a confident answer to: *what is actually wrong (with file:line evidence)*
   and *what change fixes it*.

## The gate

When the root cause and fix are clear, STOP and present a brief, then wait — write
nothing until I reply "go" (or ask for a tweak, in which case revise and wait again):

```
Root cause: <what's actually wrong, with file:line evidence>
The fix:    <what you'll change and why it addresses the root cause>
Files:      <the files you expect to touch>
Verify:     <which CI checks will prove it; any manual QA I should do>
```

This is the last thing I see before detaching, so it must be concrete. Only after
my explicit "go" do you enter Phase 2.

## Phase 2 — autonomous build

Begins only after "go". I have detached — ask NO questions from here. If you hit
ambiguity you couldn't foresee, make the most reasonable decision, note it in the
PR body, and press on. Never block on input.

1. **Create the worktree** per `~/.config/agents/skills/_shared/worktree-and-pr.md`
   ("Claim by branch name" + "Worktree setup"), with **`<branch>` = `fix/<slug>`**
   (`<slug>` = a 2–4 word kebab summary of the fix; type is `fix/` for bugs,
   `feat/`/`chore/` if clearly otherwise).
2. Implement the agreed fix in `$WT` — scoped to the brief, no drive-by edits.
3. `turbo run format` on the changed files. (No local typecheck/lint — CI is the
   signal; see Verification.)
4. Commit (`hello@marcusmichaels.com`, no co-author trailer, Conventional Commits title) and
   push the branch from `$WT`.
5. Open the PR assigned to me (see PR format), build its How-to-test and resolve
   preview links per the shared playbook.
6. Enter the CI watch-loop.

## CI watch-loop

Drive the PR's CI checks to green. The worktree stays alive through this loop.

1. Poll the PR's checks until they settle (bounded — checks usually finish in
   minutes; don't wait unboundedly):
   `gh pr checks <num>` / `gh pr view <num> --json statusCheckRollup`.
2. **On a failing check** (up to **3 attempts** total):
   - Fetch the failure detail: `gh run view <run-id> --log-failed`, or open the
     check's `targetUrl`.
   - Diagnose and fix in the same `$WT`; commit; push; re-poll from step 1.
3. **All required checks green → done.** Tear down (shared playbook "Teardown").
4. **Still red after 3 attempts → stop tidily:**
   - `gh pr ready --undo <num>` to convert the PR to a draft.
   - Post a comment (`gh pr comment <num>`): which check is failing, the error, and
     each fix you tried.
   - Tear down the worktree.
A stuck run is still useful — I get the investigation, the attempted fix, and
exactly which check beat it.

## PR format

## Verification

## Safety rails

## Outcome summary
