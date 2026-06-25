# tinker Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `tinker` — a collaborative-then-autonomous Claude Code skill that investigates a briefed problem with the user, then (on explicit "go") builds the fix in an isolated worktree, opens a PR assigned to the user, and drives its CI checks to green — extracting the worktree/PR plumbing into a shared playbook that whittle is refactored to reuse.

**Architecture:** Three deliverables in the `~/.config/agents/` dotfiles repo: (1) a new shared playbook `skills/_shared/worktree-and-pr.md` holding the common worktree + PR + preview-link plumbing; (2) a refactor of `skills/whittle/SKILL.md` to reference that playbook instead of carrying its own copies; (3) the new `skills/tinker/` skill (`SKILL.md` + `README.md`) symlinked into `~/.claude/skills/`. All are markdown consumed by Claude Code — no compiled code; per-task verification is structural (grep/awk) plus keeping whittle coherent. Live acceptance is the user running `/tinker`.

**Tech Stack:** Markdown skill definitions. Runtime tools the skills invoke: `git` (incl. `git worktree`), `gh`, `turbo`, file edits. Target repo is the ffern Bun/Turborepo monorepo.

## Global Constraints

- **Home:** `~/.config/agents/skills/`. Not its own git repo — tracked by `~/.config`. tinker activated via symlink `~/.claude/skills/tinker` → `~/.config/agents/skills/tinker`.
- **`_shared/` is never symlinked** into `~/.claude/skills/` (so Claude never loads it as a skill); SKILL.md files reference it by **absolute path** `~/.config/agents/skills/_shared/worktree-and-pr.md`.
- **tinker lifecycle:** describe → investigate + Q&A (interactive, read-only) → explicit brief-and-"go" gate → autonomous build → CI watch-loop → terminate. Run in `screen`; detach after the gate.
- **Gate:** nothing written before "go" — Phase 1 is strictly read-only (no worktree/branch/edit). The brief = Root cause · The fix · Files · Verify.
- **Autonomous phase asks no questions:** decide-and-document, or stop tidily; never block on input.
- **CI watch-loop:** poll PR checks; fix failures in the same worktree; **≤3 fix attempts**; green → done; stuck → `gh pr ready --undo` (draft) + summary comment. Worktree **persists** through the loop, torn down at loop end.
- **Verification:** no local typecheck/lint; `turbo run format` only; CI is the gate and the signal.
- **PR:** author `hello@marcusmichaels.com`, no `Co-Authored-By` trailer; assignee `@me`; branch `fix/<slug>` (conventional type); Conventional Commits title; body = **Root cause / The fix / How to test**; no labels; no footer.
- **Safety rails (shared, non-destructive):** never push `main`/default branch; all work in the ephemeral worktree, never the primary checkout; claim-by-branch; never force-push / rewrite history / delete others' branches; no destructive git; no remote mutations beyond the one PR; clean teardown on exit.
- **Commits** into `~/.config` use `git -c user.email="hello@marcusmichaels.com" -c user.name="Marcus Michaels"`; no `Co-Authored-By` trailer.

---

### Task 1: Create the shared worktree + PR playbook

**Files:**
- Create: `~/.config/agents/skills/_shared/worktree-and-pr.md`

**Interfaces:**
- Produces: the canonical procedure both skills reference. Contract: a `<branch>` parameter the calling skill supplies (e.g. `<rule>/<slug>` for whittle, `fix/<slug>` for tinker); sections `## Claim by branch name`, `## Worktree setup`, `## Building "How to test"`, `## Resolving preview links`, `## Teardown`.

- [ ] **Step 1: Create the `_shared` directory**

```bash
mkdir -p ~/.config/agents/skills/_shared
```

- [ ] **Step 2: Write the playbook**

Create `~/.config/agents/skills/_shared/worktree-and-pr.md`:

````markdown
# Shared playbook — worktree, PR, preview links

Common plumbing for whittle and tinker. The calling skill supplies a **`<branch>`**
(its own naming scheme) and the **PR title/body** (its own format); everything else
is shared. Reference this file by absolute path:
`~/.config/agents/skills/_shared/worktree-and-pr.md`.

## Claim by branch name

Runs are parallel-safe with no global lock. The branch name is the claim ticket:
derive it deterministically from the unit of work, then `git worktree add -b
<branch> origin/main` is the atomic claim — all runs share one `.git`, so the same
work can be claimed only once. If `worktree add` fails because the branch already
exists (a concurrent run or open PR claimed it), back off (pick a different
target, or stop). Before claiming, you may pre-skip a branch that already exists
locally or on the remote: `git ls-remote --heads origin <branch>`.

## Worktree setup

```sh
MAIN="$(git rev-parse --show-toplevel)"
REPO="$(basename "$MAIN")"
SLUG="<slug>"                 # deterministic from the unit of work
BRANCH="<branch>"             # caller-supplied scheme, e.g. fix/$SLUG or <rule>/$SLUG
WT="$HOME/.cache/whittle/$REPO/$SLUG"   # ephemeral, outside the repo

git -C "$MAIN" fetch origin
# Atomic claim. If this fails because the branch exists, another run got there
# first. Retry transient git-lock errors ("unable to lock") a couple of times.
git -C "$MAIN" worktree add "$WT" -b "$BRANCH" origin/main

# Reuse node_modules from the primary checkout (no install):
ln -s "$MAIN/node_modules" "$WT/node_modules"
( cd "$MAIN" && find apps packages -maxdepth 2 -type d -name node_modules -prune 2>/dev/null ) \
  | while read -r d; do ln -s "$MAIN/$d" "$WT/$d"; done

# Per-run turbo cache so concurrent runs don't thrash a shared one:
export TURBO_CACHE_DIR="$WT/.turbo-cache"
```

All edits, commits, and pushes happen inside `$WT`, never the primary checkout.

## Building "How to test"

- **Pages affected:** trace importers of the changed file up to page entry points
  (`apps/ffern.co/src/pages/**`). List the affected routes; if the change is in a
  widely-used leaf component, name the most relevant pages and say it's shared.
- **Tester state:** infer required auth/user state from those pages (portal →
  logged-in member; checkout → active basket; marketing → "None").
- **Storybook:** if the changed component has a `.stories.tsx` sibling, link its
  story (see preview resolution below); omit otherwise.

## Resolving preview links

Preview URLs are NOT constructible from the branch name (Vercel truncates long
branches and appends a hash). Resolve from the PR's deployment statuses after push;
bounded to ~90s, never block longer.

1. Head SHA: `gh pr view <num> --json headRefOid --jq .headRefOid`.
2. Poll deployments (up to ~90s, ~6 tries × 15s):
   ```sh
   gh api "repos/{owner}/{repo}/deployments?sha=<sha>" --jq '.[] | {env: .environment, id: .id}'
   gh api "repos/{owner}/{repo}/deployments/<id>/statuses" --jq '.[0] | {state, url: .environment_url}'
   ```
   (Or read `gh pr view <num> --json statusCheckRollup` and take the Vercel checks'
   `targetUrl`s.)
3. Match by project: **`ffern-ui`** = Storybook, **`ffern.co`** = app. Team scope `ffern`.
4. Compose deep links and `gh pr edit <num> --body-file <updated>`:
   - App page: `<ffern.co-url>/<affected-route>`
   - Storybook: `<ffern-ui-url>/?path=/story/<storyId>` where `storyId` = kebab-cased
     story `title` + `--<export>` (e.g. `title: "Components/FfernButton"` →
     `components-ffernbutton--default`).
5. **Fallback:** if not READY within the window, write
   `App & Storybook previews: see the Vercel checks on this PR.` Don't block.

## Open the PR

```sh
gh pr create --assignee "@me" --base main --head "<branch>" \
  --title "<caller-supplied Conventional Commits title>" \
  --body-file <tmpfile>
```

No labels. Commit as `hello@marcusmichaels.com` with no `Co-Authored-By` trailer. The PR
body structure is the caller's (whittle and tinker differ).

## Teardown

`cd` out of `$WT`, then `git worktree remove --force "$WT"` + `git worktree prune`.
**When** to tear down is caller-specific: whittle does it immediately after opening
the PR; tinker keeps the worktree alive through its CI watch-loop and tears down at
the end.
````

- [ ] **Step 3: Verify structure**

Run: `grep -nE '^## ' ~/.config/agents/skills/_shared/worktree-and-pr.md`
Expected: the six headers — Claim by branch name, Worktree setup, Building "How to test", Resolving preview links, Open the PR, Teardown.

- [ ] **Step 4: Commit**

```bash
cd ~/.config && git add agents/skills/_shared && git -c user.email="hello@marcusmichaels.com" -c user.name="Marcus Michaels" commit -m "feat(agents): add shared worktree + PR playbook"
```

---

### Task 2: Refactor whittle to reference the shared playbook

**Files:**
- Modify: `~/.config/agents/skills/whittle/SKILL.md` (the `### Worktree setup snippet` block under Per-run procedure, and the `## Resolving preview links` section)

**Interfaces:**
- Consumes: `_shared/worktree-and-pr.md` (Task 1).
- Produces: a slimmer whittle that delegates worktree/preview plumbing to the shared doc while keeping its own Overview, Safety rails, Invocation, Per-run procedure steps, Local verification, PR format, Outcome summary, and Rules. whittle's branch scheme stays `<rule>/<slug>`; its teardown stays immediate.

- [ ] **Step 1: Replace the "Worktree setup snippet" block**

In `~/.config/agents/skills/whittle/SKILL.md`, find the `### Worktree setup snippet` heading and its fenced `sh` block (through the line ending `...even on abort.`) and replace the whole `### Worktree setup snippet` subsection with:

```markdown
### Worktree setup

Follow `~/.config/agents/skills/_shared/worktree-and-pr.md` — sections "Claim by
branch name" and "Worktree setup" — with **`<branch>` = `<rule>/<slug>`** (the
deterministic per-instance slug from step 5). If the claim fails because the branch
exists, a concurrent run took that fix — go back to step 5 for the next candidate.
```

- [ ] **Step 2: Replace the "Resolving preview links" section**

Find the `## Resolving preview links` section and replace its entire body (down to, but not including, `## Outcome summary`) with:

```markdown
## Resolving preview links

Follow `~/.config/agents/skills/_shared/worktree-and-pr.md` — sections "Building
\"How to test\"" and "Resolving preview links" — to populate the PR's How-to-test
section with the affected routes, tester state, and Storybook/app preview deep-links.
```

- [ ] **Step 3: Point the Per-run procedure at the shared teardown**

Find step 12 in whittle's `## Per-run procedure` (begins `**Tear down:**`) and confirm it still reads as immediate teardown after the PR. Replace it with:

```markdown
12. **Tear down immediately** (whittle does not tend CI): per the shared playbook's
    "Teardown" section — `git worktree remove --force "$WT"` + `git worktree prune`.
    Print the outcome summary.
```

- [ ] **Step 4: Verify whittle still coherent**

Run:
```bash
grep -n "_shared/worktree-and-pr.md" ~/.config/agents/skills/whittle/SKILL.md && \
grep -nE '^## ' ~/.config/agents/skills/whittle/SKILL.md
```
Expected: at least two references to the shared playbook; section list still shows Overview, Safety rails, Invocation, Per-run procedure, Local verification, PR format, Resolving preview links, Outcome summary, Rules. Confirm the moved setup snippet no longer remains inline (its unique worktree-path assignment is gone — the mechanics now live only in the shared doc):
```bash
grep -c 'WT="\$HOME/.cache' ~/.config/agents/skills/whittle/SKILL.md
```
Expected: `0`. (A conceptual mention of `git worktree add` may remain in whittle's safety rails prose — that's fine; only the fenced snippet moves.)

- [ ] **Step 5: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/SKILL.md && git -c user.email="hello@marcusmichaels.com" -c user.name="Marcus Michaels" commit -m "refactor(whittle): reference shared worktree + PR playbook"
```

---

### Task 3: Scaffold the tinker skill

**Files:**
- Create: `~/.config/agents/skills/tinker/SKILL.md`
- Create: `~/.config/agents/skills/tinker/README.md`

**Interfaces:**
- Produces: a discoverable `tinker` skill with valid frontmatter and section headers. Frontmatter: `name: tinker`, `description`, `allowed-tools`. Body sections filled by Tasks 4–6.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p ~/.config/agents/skills/tinker
```

- [ ] **Step 2: Write SKILL.md frontmatter + skeleton**

Create `~/.config/agents/skills/tinker/SKILL.md`:

```markdown
---
name: tinker
description: Use when Marcus wants to delegate a real, behaviour-changing fix that needs investigation first — fired as "/tinker <issue description>". Investigates the problem WITH Marcus (read-only, Q&A), presents a brief and waits for explicit "go", then autonomously builds the fix in an isolated worktree, opens a PR assigned to Marcus, and drives its CI checks to green. Run in screen; detach after approving the brief.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(turbo:*), Read, Edit, Write, Glob, Grep
---

# tinker

## Overview

## Phase 1 — investigate (interactive, read-only)

## The gate

## Phase 2 — autonomous build

## CI watch-loop

## PR format

## Verification

## Safety rails

## Outcome summary
```

- [ ] **Step 3: Write the README**

Create `~/.config/agents/skills/tinker/README.md`:

````markdown
# tinker

Delegate a real, behaviour-changing fix that needs investigating. Fire
`/tinker <issue description>` inside a repo, investigate it together, approve the
brief, then detach and let it build the fix + drive CI green.

## Install

```sh
ln -s ~/.config/agents/skills/tinker ~/.claude/skills/tinker
```

## Running it

Run inside `claude` in a `screen` session. Phase 1 (investigation + Q&A) is
interactive — you answer questions and approve the brief. After you say "go",
detach the screen: Phase 2 (build + CI tending) needs no input. Pre-allow `git`,
`gh`, `turbo`, and file edits so the autonomous phase doesn't stall on a prompt.

Shares worktree/PR plumbing with whittle via
`~/.config/agents/skills/_shared/worktree-and-pr.md`.
````

- [ ] **Step 4: Verify**

Run: `sed -n '1,6p' ~/.config/agents/skills/tinker/SKILL.md && grep -cE '^## ' ~/.config/agents/skills/tinker/SKILL.md`
Expected: valid frontmatter (`---`, `name: tinker`, `description:`, `allowed-tools:`, `---`); section count `9`.

- [ ] **Step 5: Commit**

```bash
cd ~/.config && git add agents/skills/tinker && git -c user.email="hello@marcusmichaels.com" -c user.name="Marcus Michaels" commit -m "feat(tinker): scaffold skill skeleton + README"
```

---

### Task 4: tinker SKILL.md — Overview, Phase 1, the gate

**Files:**
- Modify: `~/.config/agents/skills/tinker/SKILL.md` (`## Overview`, `## Phase 1`, `## The gate`)

**Interfaces:**
- Produces: the interactive half — doctrine, read-only investigation, and the brief-and-go gate that all later sections depend on.

- [ ] **Step 1: Fill Overview**

Replace the empty `## Overview` with:

```markdown
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
```

- [ ] **Step 2: Fill Phase 1**

Replace the empty `## Phase 1 — investigate (interactive, read-only)` with:

```markdown
## Phase 1 — investigate (interactive, read-only)

Strictly read-only — NO worktree, branch, or edit exists yet.

1. Read the target repo's `AGENTS.md` / `CLAUDE.md`.
2. Investigate the reported problem: grep/glob/read the code, run read-only commands,
   trace the data/render path. Ask me clarifying questions, explore, ask more — in
   any order, looping until the root cause is clear.
3. Aim for a confident answer to: *what is actually wrong (with file:line evidence)*
   and *what change fixes it*.
```

- [ ] **Step 3: Fill the gate**

Replace the empty `## The gate` with:

````markdown
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
````

- [ ] **Step 4: Verify**

Run: `grep -c "read-only\|Root cause:\|reply \"go\"" ~/.config/agents/skills/tinker/SKILL.md`
Expected: ≥ 3.

- [ ] **Step 5: Commit**

```bash
cd ~/.config && git add agents/skills/tinker/SKILL.md && git -c user.email="hello@marcusmichaels.com" -c user.name="Marcus Michaels" commit -m "feat(tinker): overview, investigation phase, gate"
```

---

### Task 5: tinker SKILL.md — Phase 2 build + CI watch-loop

**Files:**
- Modify: `~/.config/agents/skills/tinker/SKILL.md` (`## Phase 2 — autonomous build`, `## CI watch-loop`)

**Interfaces:**
- Consumes: the gate (Task 4); the shared playbook (Task 1).
- Produces: the autonomous build steps and the bounded CI tending loop with stuck-handling.

- [ ] **Step 1: Fill Phase 2**

Replace the empty `## Phase 2 — autonomous build` with:

```markdown
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
```

- [ ] **Step 2: Fill the CI watch-loop**

Replace the empty `## CI watch-loop` with:

````markdown
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
````

- [ ] **Step 3: Verify**

Run: `grep -c "_shared/worktree-and-pr.md\|3 attempts\|gh pr ready --undo\|fix/<slug>" ~/.config/agents/skills/tinker/SKILL.md`
Expected: ≥ 4.

- [ ] **Step 4: Commit**

```bash
cd ~/.config && git add agents/skills/tinker/SKILL.md && git -c user.email="hello@marcusmichaels.com" -c user.name="Marcus Michaels" commit -m "feat(tinker): autonomous build and CI watch-loop"
```

---

### Task 6: tinker SKILL.md — PR format, Verification, Safety rails, Outcome summary

**Files:**
- Modify: `~/.config/agents/skills/tinker/SKILL.md` (`## PR format`, `## Verification`, `## Safety rails`, `## Outcome summary`)

**Interfaces:**
- Consumes: the build + loop (Task 5).
- Produces: the PR body template, the verification stance, the safety rails, and the terminal summary format. Completes the SKILL.md.

- [ ] **Step 1: Fill PR format**

Replace the empty `## PR format` with:

````markdown
## PR format

Like a PR I opened by hand, framed for a behaviour-*changing* fix.

- **Author/assignee:** commit as `hello@marcusmichaels.com`, no `Co-Authored-By` trailer;
  `gh pr create --assignee "@me"`; no labels.
- **Branch:** `fix/<slug>` (or `feat/`/`chore/` if clearly otherwise).
- **Title:** Conventional Commits — e.g.
  `fix: stop portal showing returns window closed when it is open`.
- **Body — three sections, no footer:**

  ```markdown
  ## Root cause
  <what was actually wrong, with file:line evidence from the investigation>

  ## The fix
  <what changed and why it addresses the root cause>

  ## How to test
  - **Pages affected:** <preview links at the affected route(s)>
  - **Tester state:** <logged-in member / active subscription / etc., or "None">
  - **Storybook:** <story preview link if a component changed; omit otherwise>
  ```

There is NO "Why behaviour-preserving" section — tinker changes behaviour on
purpose. Build How-to-test + preview links per the shared playbook.
````

- [ ] **Step 2: Fill Verification**

Replace the empty `## Verification` with:

```markdown
## Verification

- **No local typecheck/lint** — CI is both the gate and the signal the watch-loop
  acts on, so local type/lint checks are redundant.
- **`turbo run format`** before committing — instant, avoids burning a CI cycle on
  a formatting nit.
- Everything else is proven by the PR's CI checks.
```

- [ ] **Step 3: Fill Safety rails**

Replace the empty `## Safety rails` with:

```markdown
## Safety rails

Inherits the shared non-destructive rails (never push `main`/default; all work in
the ephemeral worktree, never the primary checkout; claim-by-branch; never
force-push / rewrite history / delete others' branches; no destructive git; no
remote mutations beyond the one PR; clean teardown). Plus tinker-specific:

- **Nothing is written before the gate.** Phase 1 is strictly read-only — no
  worktree, branch, or edit until I say "go".
- **No questions after the gate.** Once I detach, never block on input — decide and
  document, or stop tidily (draft + summary).
- **Scoped to the brief.** Behaviour change is the point, so the behaviour-preserving
  doctrine does NOT apply — but no drive-by edits beyond what the agreed fix needs.
- **Stuck = draft, not abandon.** Preserve the work; never silently bin it.
```

- [ ] **Step 4: Fill Outcome summary**

Replace the empty `## Outcome summary` with:

```markdown
## Outcome summary

End every run with one line so a `screen` reattach shows the result:

- Green: `tinker: <pr-url> is green — <one-line what was fixed>.`
- Stuck: `tinker: <pr-url> left as draft — <failing check> still red after 3 tries.`
- Pre-gate exit: `tinker: stopped before building — <reason>.`
```

- [ ] **Step 5: Verify no empty sections remain**

Run:
```bash
awk '
/^## /{ if(h!="") print h": "n" lines"; h=$0; n=0; next }
{ if(h!="" && $0!="" && $0 !~ /^---/) n++ }
END{ if(h!="") print h": "n" lines" }
' ~/.config/agents/skills/tinker/SKILL.md
```
Expected: every section reports ≥ 3 content lines (none empty).

- [ ] **Step 6: Commit**

```bash
cd ~/.config && git add agents/skills/tinker/SKILL.md && git -c user.email="hello@marcusmichaels.com" -c user.name="Marcus Michaels" commit -m "feat(tinker): PR format, verification, safety rails, outcome summary"
```

---

### Task 7: Activate and smoke-test discovery

**Files:**
- Create: symlink `~/.claude/skills/tinker` → `~/.config/agents/skills/tinker`

**Interfaces:**
- Consumes: the complete tinker skill (Tasks 3–6) and the shared playbook (Task 1).
- Produces: an active, discoverable `tinker` skill. Does NOT run tinker against a repo (Marcus does the live test) — only confirms wiring and that `_shared/` is not itself symlinked as a skill.

- [ ] **Step 1: Create the symlink**

```bash
ln -s ~/.config/agents/skills/tinker ~/.claude/skills/tinker
```

- [ ] **Step 2: Verify the symlink and that `_shared` is NOT a skill**

Run:
```bash
readlink ~/.claude/skills/tinker && \
ls ~/.claude/skills/ && \
test ! -e ~/.claude/skills/_shared && echo "_shared correctly NOT symlinked"
```
Expected: symlink resolves to the tinker home; `~/.claude/skills/` lists `whittle` and `tinker` (no `_shared`); the final line prints.

- [ ] **Step 3: Verify the shared doc resolves from tinker by absolute path**

Run: `test -f ~/.config/agents/skills/_shared/worktree-and-pr.md && grep -c "_shared/worktree-and-pr.md" ~/.claude/skills/tinker/SKILL.md`
Expected: the file exists and tinker's SKILL.md references it (count ≥ 2).

- [ ] **Step 4: Note activation in nothing committable**

The symlink lives under `~/.claude/` (machine-local, not in the dotfiles repo). No commit needed — README documents the one-time `ln -s`.

Handoff: Marcus runs the live acceptance test himself — e.g. `/tinker the portal shows "returns window closed" when the window is actually open` inside `~/Sites/ffern-engineering` — and checks the investigation, the brief-and-go gate, the PR (assigned, Root cause / The fix / How to test, preview links), and that the CI watch-loop drives checks to green or leaves a tidy draft.
