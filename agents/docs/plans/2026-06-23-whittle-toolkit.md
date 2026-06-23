# whittle Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `whittle` — a personal, on-demand, repo-agnostic Claude Code skill that opens one small, behaviour-preserving, Marcus-authored PR per run, verified locally and assigned to him.

**Architecture:** A skill folder under `~/.config/agents/skills/whittle/` (tracked by the `.config` dotfiles repo, symlinked into `~/.claude/skills/whittle/`). `SKILL.md` is the driver (invocation, safety rails, per-run procedure, verification, PR format, preview-URL resolution). Each rule is a self-contained markdown file under `rules/`. A `README.md` documents setup, permissions, and ffern-specific Vercel/Storybook config. The skill carries its own rules and has no runtime dependency on any target repo.

**Tech Stack:** Markdown skill definition (no compiled code); consumed by Claude Code. Runtime tools the skill invokes: `git`, `gh`, `turbo`/`tsc`, file edits. Target repo here is the ffern Bun/Turborepo monorepo.

> **Note (superseded in part):** after this plan was executed, whittle was revised to run each fix in an **ephemeral git worktree** off `origin/main` (node_modules symlinked from the primary checkout; CI is the authoritative gate) and the run branch was changed to `<rule>/<short-slug>` (no `marcus/` prefix). Where this plan's task bodies describe a "create+checkout branch", "refuse a dirty tree", or `.git/whittle.lock`, the **spec and `SKILL.md` are canonical** — see `docs/specs/2026-06-23-personal-maintenance-toolkit-design.md`.

## Global Constraints

- **Home:** `~/.config/agents/skills/whittle/`. Not its own git repo — tracked by `~/.config`. Activated via symlink `~/.claude/skills/whittle` → `~/.config/agents/skills/whittle`.
- **Doctrine (top rule):** behaviour-preserving — provably equivalent at runtime. Sole exception: fixing an obvious, evident existing bug. When in doubt, skip.
- **Safety rails (non-negotiable):** never push to `main`/default branch; always create+checkout the run branch before editing; never force-push / rewrite history / delete branches; no destructive git (`reset --hard`, `clean -fd`, `checkout -- .`); refuse a dirty starting tree; edits scoped to the single target instance; no `rm -rf`; no remote mutations beyond opening+assigning the one PR; clean abort leaving no orphan branch/PR; single-run lockfile at `.git/whittle.lock`.
- **Run constraints:** one rule per run; one instance per PR; ≤300 lines net; silence is success; no drive-by changes; dedup against own open PRs by branch prefix; conform to the target repo's `AGENTS.md`/`CLAUDE.md` if present; never open a red PR.
- **Unattended:** fully autonomous (no mid-run prompts); every wait bounded (Vercel poll ≤90s); ends with a one-line outcome summary.
- **PR shape:** author `marcus@ffern.co`, no `Co-Authored-By` trailer, no bot prefix; assignee `@me`; branch `<rule>/<short-slug>`; Conventional Commits title; body sections **What** / **Why this is behaviour-preserving** / **How to test**; no labels; no footer.
- **Starter rules:** `canonical-tailwind-classes`, `flatten-else-after-return`, `unreachable-code-removal`.

---

### Task 1: Scaffold the toolkit skeleton

**Files:**
- Create: `~/.config/agents/skills/whittle/SKILL.md`
- Create: `~/.config/agents/skills/whittle/rules/` (directory, via the rule files below)
- Create: `~/.config/agents/skills/whittle/README.md`

**Interfaces:**
- Produces: the skill folder structure and a valid `SKILL.md` frontmatter that Claude Code discovers as the `whittle` skill. Frontmatter keys: `name: whittle`, `description: <trigger description>`. The body is filled in by Tasks 5–9; this task only establishes the file with valid frontmatter and section headers.

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p ~/.config/agents/skills/whittle/rules
```

- [ ] **Step 2: Write SKILL.md frontmatter + section skeleton**

Create `~/.config/agents/skills/whittle/SKILL.md` with this exact frontmatter (mirrors the convention in `ffern-engineering/.agents/skills/*/SKILL.md` — `name`, `description`; `allowed-tools` lists the tools whittle needs so the skill self-documents its permission surface):

```markdown
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

## Safety rails (read first — non-negotiable)

## Invocation

## Per-run procedure

## Local verification

## PR format

## Resolving preview links

## Outcome summary

## Rules
```

- [ ] **Step 3: Verify the skill is discoverable**

Run: `ls -la ~/.config/agents/skills/whittle/ && head -5 ~/.config/agents/skills/whittle/SKILL.md`
Expected: directory listing shows `rules/`, `SKILL.md`; the head shows the frontmatter opening `---` and `name: whittle`.

- [ ] **Step 4: Commit**

```bash
cd ~/.config && git add agents/skills/whittle && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "feat(whittle): scaffold skill skeleton"
```

---

### Task 2: Write the README (setup, permissions, ffern config)

**Files:**
- Modify: `~/.config/agents/skills/whittle/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: human setup instructions. Defines the ffern-specific config values the SKILL.md references by name: Vercel team scope `ffern`, Storybook project `ffern-ui`, app project `ffern.co`, Storybook base path convention `/?path=/story/<storyId>`.

- [ ] **Step 1: Write the README**

Create `~/.config/agents/skills/whittle/README.md`:

````markdown
# whittle

A personal, on-demand maintenance skill. Fire `/whittle` (or `/whittle <rule>`)
inside any repo to open one small, behaviour-preserving, self-authored PR.

## Install

Symlink the skill into Claude Code's user-level skills dir:

```sh
ln -s ~/.config/agents/skills/whittle ~/.claude/skills/whittle
```

The skill then resolves in every project. No target repo ever sees it.

## Running unattended (screen)

whittle is designed to run inside `claude` in a detached `screen` session. An
interactive permission prompt would stall an unattended run, so start the session
with the tools it needs pre-allowed: `git`, `gh`, `turbo`/`tsc`, and file edits.
Either run in a trusted/allowlisted session or pre-approve those tools.

## Per-repo config (ffern defaults)

whittle resolves preview links from the PR's Vercel deployment statuses. For the
ffern monorepo:

- Vercel team scope slug: `ffern`
- Storybook project: `ffern-ui` (deep links use `/?path=/story/<storyId>`)
- App project: `ffern.co` (deep links append the affected route)

In a repo without these, the Storybook/preview lines are simply omitted.
````

- [ ] **Step 2: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/README.md && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "docs(whittle): add README with setup and ffern config"
```

---

### Task 3: Write rule — flatten-else-after-return

**Files:**
- Create: `~/.config/agents/skills/whittle/rules/flatten-else-after-return.md`

**Interfaces:**
- Produces: a rule file the SKILL.md indexes. Rule-file contract (every rule file has these headed sections): `# <rule-name>`, `## Goal`, `## Why behaviour-preserving`, `## Precondition`, `## In scope`, `## Find` (a concrete grep/glob starting point), `## Guards (skip if any apply)`.

- [ ] **Step 1: Write the rule file**

Create `~/.config/agents/skills/whittle/rules/flatten-else-after-return.md`:

````markdown
# flatten-else-after-return

## Goal
Remove an `else` / `else if` whose preceding `if` branch always exits
(`return` or `throw`), dedenting the else body.

```ts
// before
if (x) {
  return a;
} else {
  doB();
}

// after
if (x) {
  return a;
}
doB();
```

## Why behaviour-preserving
The `if` branch unconditionally exits the function, so control can only reach the
else body when the condition was false — identical to falling through after the
`if`. Provably equivalent control flow on every input.

## Precondition
None — portable to any JS/TS repo.

## In scope
`.ts` / `.tsx` files under the repo's source dirs. Pick ONE clean instance.

## Find
Grep for `else` immediately following a block whose last statement is `return`
or `throw`. A practical starting point:

```sh
rg -n --type ts -U 'return[^\n]*;\s*\n\s*\}\s*else\b' apps packages
```

Then read each hit to confirm the `if` branch's exit is unconditional.

## Guards (skip if any apply)
- The `if` branch does not *unconditionally* exit (e.g. the `return` is itself
  inside a nested `if`).
- An `else if` chain where flattening would change which branches evaluate.
- The `if` and `else` bodies declare clashing `const`/`let` names that would
  collide once the else body is dedented into the parent scope.
- The transformation would exceed the 300-line ceiling or tangle with
  surrounding code.
````

- [ ] **Step 2: Verify the find command resolves**

Run: `cd ~/Sites/ffern-engineering && rg -n --type ts -U 'return[^\n]*;\s*\n\s*\}\s*else\b' apps packages | head`
Expected: zero or more matches print without error (validates the grep is well-formed; matches are candidates, not a requirement).

- [ ] **Step 3: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/rules/flatten-else-after-return.md && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "feat(whittle): add flatten-else-after-return rule"
```

---

### Task 4: Write rules — unreachable-code-removal and canonical-tailwind-classes

**Files:**
- Create: `~/.config/agents/skills/whittle/rules/unreachable-code-removal.md`
- Create: `~/.config/agents/skills/whittle/rules/canonical-tailwind-classes.md`

**Interfaces:**
- Produces: two more rule files following the same section contract defined in Task 3.

- [ ] **Step 1: Write unreachable-code-removal.md**

Create `~/.config/agents/skills/whittle/rules/unreachable-code-removal.md`:

````markdown
# unreachable-code-removal

## Goal
Remove statements that can never execute because they follow an unconditional
`return` / `throw` / `break` / `continue` in the same block.

## Why behaviour-preserving
Unreachable statements never run, so removing them cannot change behaviour.

## Precondition
None — portable.

## In scope
`.ts` / `.tsx` files under the repo's source dirs. Pick ONE clean instance.

## Find
```sh
rg -n --type ts -U '\b(return|throw|break|continue)\b[^\n]*;\s*\n\s*[A-Za-z_$]' apps packages | head
```
Read each hit: confirm the exit statement is the last *reachable* statement of an
unconditional path and that what follows it in the same block is genuinely dead.

## Guards (skip if any apply)
- The "dead" code is actually reachable (the prior exit sits inside a nested
  conditional or loop, not the unconditional path).
- The following code is a hoisted `function` / `type` / `var` *declaration* used
  elsewhere in scope.
- Removing it would orphan an import still used elsewhere (leave imports alone —
  out of scope for this rule).
- Any doubt about reachability — skip.
````

- [ ] **Step 2: Write canonical-tailwind-classes.md**

Create `~/.config/agents/skills/whittle/rules/canonical-tailwind-classes.md`:

````markdown
# canonical-tailwind-classes

## Goal
Replace ONE arbitrary-px Tailwind spacing/sizing class with its canonical scale
equivalent (`gap-[8px]` → `gap-2`, `mt-[16px]` → `mt-4`, `md:-mt-[8px]!` →
`md:-mt-2!`).

## Why behaviour-preserving
Token-level equivalence — the repo's `@theme` only adds *named* spacing tokens;
the numeric 4× scale is unmodified, so the arbitrary value and the scale class
compile to identical CSS.

## Precondition
Repo has a Tailwind config (e.g. `packages/tailwind-config/` or a
`tailwind.config.*` / `@theme` in CSS). If absent, this rule finds nothing.

## In scope
Files under `apps/ffern.co/**` and `packages/ffern-components/**`. Spacing/sizing
prefixes only: `m,mx,my,mt,mr,mb,ml,ms,me, p,px,py,pt,pr,pb,pl,ps,pe, gap,gap-x,
gap-y, space-x,space-y, w,h,size,min-w,max-w,min-h,max-h, top,right,bottom,left,
start,end, inset,inset-x,inset-y, translate-x,translate-y, scroll-m*,scroll-p*`.
Preserve variant chains (`md:`, `hover:`…), the negative prefix, and trailing `!`.

## Canonical scale (px → N)
`0→0, 2→0.5, 4→1, 6→1.5, 8→2, 10→2.5, 12→3, 14→3.5, 16→4, 20→5, 24→6, 28→7,
32→8, 36→9, 40→10, 44→11, 48→12, 56→14, 64→16, 80→20, 96→24, 112→28, 128→32,
144→36, 160→40, 176→44, 192→48, 208→52, 224→56, 240→60, 256→64, 288→72, 320→80,
384→96`. Values absent from this table have no equivalent — leave them.

## Find
```sh
rg -n -e '(^|[\s"'"'"'`])(-?)(m|mx|my|mt|mr|mb|ml|p|px|py|pt|pr|pb|pl|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|max-w|min-h|max-h|top|right|bottom|left|inset|translate-x|translate-y)-\[\d+px\]' apps/ffern.co packages/ffern-components | head
```

## Guards (skip if any apply)
- Class built dynamically / via template interpolation.
- Px value not on the canonical scale.
- Prefix not on the in-scope list (esp. `text-*`, `rounded-*`, `border-*`,
  `ring-*`, colour arbitraries).
- Non-px unit (`rem`, `%`, `vh`, `calc(...)`, `var(...)`).
- Multi-value arbitrary (`p-[8px_16px]`).
- Test files (`*.test.*`, `*.spec.*`), stories (`*.stories.*`), `__mocks__/`.
- The string isn't a Tailwind class context (regex, log message, comment).
````

- [ ] **Step 3: Verify both find commands resolve**

Run:
```bash
cd ~/Sites/ffern-engineering && \
rg -n --type ts -U '\b(return|throw|break|continue)\b[^\n]*;\s*\n\s*[A-Za-z_$]' apps packages | head -3 && \
rg -n -e '(^|[\s"'"'"'`])(-?)(mt|mb|gap|px|py|p|w|h)-\[\d+px\]' apps/ffern.co packages/ffern-components | head -3
```
Expected: both commands run without regex errors (matches optional).

- [ ] **Step 4: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/rules && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "feat(whittle): add unreachable-code and canonical-tailwind rules"
```

---

### Task 5: SKILL.md — Overview, Safety rails, Invocation

**Files:**
- Modify: `~/.config/agents/skills/whittle/SKILL.md` (the `## Overview`, `## Safety rails`, `## Invocation` sections)

**Interfaces:**
- Consumes: the rule files (Tasks 3–4) by name.
- Produces: the doctrine, the safety rails, and the two invocation modes. Defines the branch-name format `<rule>/<short-slug>` that all later sections reference.

- [ ] **Step 1: Fill the Overview section**

Replace the empty `## Overview` with:

```markdown
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
```

- [ ] **Step 2: Fill the Safety rails section**

Replace the empty `## Safety rails` with (copy the Global Constraints safety rails verbatim into imperative skill voice):

```markdown
## Safety rails (read first — non-negotiable)

These override everything. An unattended agent must never destroy work.

1. **Pre-flight.** Take a lockfile: if `.git/whittle.lock` exists, print
   `whittle: another run holds the lock — exiting.` and STOP. Otherwise create it.
   Then confirm `git status --porcelain` is empty; if the tree is dirty, release
   the lock and STOP with `whittle: working tree is dirty — aborting.`
2. **Never push to `main`** or the repo's default branch. Only ever push the run
   branch `<rule>/<short-slug>` that this run creates.
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
```

- [ ] **Step 3: Fill the Invocation section**

Replace the empty `## Invocation` with:

```markdown
## Invocation

- **Targeted — `/whittle <rule>`:** work that specific rule (one of the names under
  `## Rules`).
- **Bare — `/whittle`:** survey the rules and pick the one with the cleanest
  available instance. Ranking heuristic (cheapest signal first): prefer a rule with
  a candidate that is (a) a single-line change, (b) in a file with the fewest other
  candidates, (c) in a leaf component/page with a clear set of affected routes. Stop
  at the first rule that yields one clean, guard-passing instance.

Branch for the run: `<rule>/<short-slug>`, where `<short-slug>` is a 2–4
word kebab summary of the target (e.g. the component or file name + change).
```

- [ ] **Step 4: Verify section content present**

Run: `grep -c "Doctrine\|Safety rails\|whittle.lock\|/whittle <rule>" ~/.config/agents/skills/whittle/SKILL.md`
Expected: a count ≥ 4 (each anchor present).

- [ ] **Step 5: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/SKILL.md && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "feat(whittle): doctrine, safety rails, invocation"
```

---

### Task 6: SKILL.md — Per-run procedure

**Files:**
- Modify: `~/.config/agents/skills/whittle/SKILL.md` (the `## Per-run procedure` section)

**Interfaces:**
- Consumes: the safety rails and branch format from Task 5; the local-verification and PR-format sections (Tasks 7–8) by reference.
- Produces: the numbered procedure the skill follows top to bottom.

- [ ] **Step 1: Fill the Per-run procedure section**

Replace the empty `## Per-run procedure` with:

```markdown
## Per-run procedure

Follow in order. Stop (silently, releasing the lock) at any "no clean instance".

1. **Pre-flight safety check** (lockfile + clean tree — see Safety rails).
2. Read the target repo's `AGENTS.md` / `CLAUDE.md` if present; conform to it.
3. Resolve the rule: the named one, or (bare) auto-pick per the Invocation
   heuristic.
4. **Dedup** against my own open PRs for this rule; skip instances already in
   flight:
   `gh pr list --author "@me" --state open --search "head:<rule>/" --json number,headRefName,files`
5. Run the rule's `## Find`; for each candidate apply the rule's `## Guards`. Pick
   ONE clean instance. None? Release lock and STOP — silence is success.
6. **Create + checkout** `<rule>/<short-slug>`.
7. Apply the fix (single instance only). Re-read the surrounding code to confirm
   behaviour-preservation per the rule's `## Why behaviour-preserving`.
8. **Verify locally** (see Local verification). If it fails and you cannot fix it
   within scope, `git checkout main && git branch -D <branch>`, release lock, STOP.
9. Commit (author `marcus@ffern.co`, no co-author trailer, Conventional Commits
   title) and push the run branch.
10. Open the PR assigned to me (see PR format).
11. Resolve preview links and edit them into the body (see Resolving preview links).
12. Release the lock. Print the outcome summary.
```

- [ ] **Step 2: Verify**

Run: `grep -n "Pre-flight safety check\|Dedup\|Create + checkout\|Verify locally\|Release the lock" ~/.config/agents/skills/whittle/SKILL.md`
Expected: each step phrase appears once.

- [ ] **Step 3: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/SKILL.md && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "feat(whittle): per-run procedure"
```

---

### Task 7: SKILL.md — Local verification

**Files:**
- Modify: `~/.config/agents/skills/whittle/SKILL.md` (the `## Local verification` section)

**Interfaces:**
- Consumes: nothing new.
- Produces: the exact commands the skill runs to gate the PR, scoped to the changed package via turbo `--filter`.

- [ ] **Step 1: Fill the Local verification section**

Replace the empty `## Local verification` with:

```markdown
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
```

- [ ] **Step 2: Verify**

Run: `grep -n "turbo run format\|--filter=<pkg>\|Never open a red PR" ~/.config/agents/skills/whittle/SKILL.md`
Expected: each phrase present.

- [ ] **Step 3: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/SKILL.md && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "feat(whittle): local verification gate"
```

---

### Task 8: SKILL.md — PR format + outcome summary

**Files:**
- Modify: `~/.config/agents/skills/whittle/SKILL.md` (the `## PR format` and `## Outcome summary` sections)

**Interfaces:**
- Consumes: the branch format (Task 5).
- Produces: the exact `gh pr create` invocation and the three-section body template; the final outcome-summary format.

- [ ] **Step 1: Fill the PR format section**

Replace the empty `## PR format` with:

````markdown
## PR format

Reads like a PR I opened by hand.

- **Commit/author:** `git commit` as `marcus@ffern.co`. No `Co-Authored-By`
  trailer. Conventional Commits subject, no bot prefix —
  e.g. `refactor: drop redundant else after early return in CheckoutSummary`.
- **Open it assigned to me, no labels:**

  ```sh
  gh pr create --assignee "@me" --base main \
    --head "<rule>/<short-slug>" \
    --title "<conventional-commits subject>" \
    --body-file <tmpfile>
  ```

- **Body — exactly these three sections, no footer:**

  ```markdown
  ## What
  <One paragraph: what was wrong, what changed.>

  ## Why this is behaviour-preserving
  - <The provable-equivalence argument for THIS change, from the rule.>
  - <Scope: N file(s); typecheck + lint pass locally.>

  ## How to test
  - **Pages affected:** <resolved preview links at the affected route(s)>
  - **Tester state:** <logged out / logged-in member / active subscription /
    mid-checkout / locale… or "None" if static>
  - **Storybook:** <resolved story preview link, or omit if no story>
  ```

Build "Pages affected" by tracing importers of the changed file up to page entry
points (`apps/ffern.co/src/pages/**`). Infer "Tester state" from those pages
(portal → logged-in member; checkout → active basket; marketing → None).
````

- [ ] **Step 2: Fill the Outcome summary section**

Replace the empty `## Outcome summary` with:

```markdown
## Outcome summary

End every run with exactly one line so a `screen` reattach shows the result:

- Opened a PR: `whittle: opened <pr-url> — <rule>: <one-line what>.`
- Nothing to do: `whittle: no clean instance found — nothing opened.`
- Aborted: `whittle: aborted — <reason>.`
```

- [ ] **Step 3: Verify**

Run: `grep -n 'gh pr create --assignee\|## How to test\|whittle: opened\|whittle: no clean instance' ~/.config/agents/skills/whittle/SKILL.md`
Expected: each phrase present.

- [ ] **Step 4: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/SKILL.md && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "feat(whittle): PR format and outcome summary"
```

---

### Task 9: SKILL.md — Resolving preview links + Rule index

**Files:**
- Modify: `~/.config/agents/skills/whittle/SKILL.md` (the `## Resolving preview links` and `## Rules` sections)

**Interfaces:**
- Consumes: the PR (Task 8) — the deployment statuses attach to its head SHA.
- Produces: the bounded Vercel-poll procedure and the rule index linking the three `rules/*.md` files.

- [ ] **Step 1: Fill the Resolving preview links section**

Replace the empty `## Resolving preview links` with:

````markdown
## Resolving preview links

Preview URLs are NOT constructible from the branch name (Vercel truncates long
branches and appends a hash). Resolve them from the PR's deployment statuses after
push. Bounded to ~90s total; never block longer.

1. Get the head SHA: `gh pr view <num> --json headRefOid --jq .headRefOid`.
2. Poll deployments (up to ~90s, ~6 tries × 15s):

   ```sh
   gh api "repos/{owner}/{repo}/deployments?sha=<sha>" \
     --jq '.[] | {env: .environment, id: .id}'
   gh api "repos/{owner}/{repo}/deployments/<id>/statuses" \
     --jq '.[0] | {state, url: .environment_url}'
   ```

   (Or read `gh pr view <num> --json statusCheckRollup` and take the Vercel
   checks' `targetUrl`s.)
3. Match by project: the **`ffern-ui`** deployment is Storybook; the **`ffern.co`**
   deployment is the app. Team scope: `ffern`.
4. Compose deep links and `gh pr edit <num> --body-file <updated>`:
   - App page: `<ffern.co-url>/<affected-route>`
   - Storybook: `<ffern-ui-url>/?path=/story/<storyId>` where `storyId` =
     kebab-cased story `title` + `--<export>` (e.g. `title: "Components/FfernButton"`
     → `components-ffernbutton--default`).
5. **Fallback:** if not READY within the window, set the lines to
   `App & Storybook previews: see the Vercel checks on this PR.` Do not block.
````

- [ ] **Step 2: Fill the Rules index**

Replace the empty `## Rules` with:

```markdown
## Rules

Each rule is a self-contained file in `rules/`. Read the target rule's file for its
Goal, Why-behaviour-preserving, Precondition, In scope, Find, and Guards.

- `flatten-else-after-return` — drop an `else` after an unconditional `if` exit.
- `unreachable-code-removal` — remove statements after an unconditional exit.
- `canonical-tailwind-classes` — arbitrary-px Tailwind class → canonical scale.

To add a rule: drop a new `rules/<name>.md` following the same section contract and
add a line here. No code changes needed.
```

- [ ] **Step 3: Verify the whole SKILL.md has no empty sections**

Run:
```bash
awk '/^## /{h=$0; getline; if ($0 ~ /^## / || $0 ~ /^---/ || $0=="") print "EMPTY: " h}' ~/.config/agents/skills/whittle/SKILL.md
```
Expected: no `EMPTY:` lines printed.

- [ ] **Step 4: Commit**

```bash
cd ~/.config && git add agents/skills/whittle/SKILL.md && git -c user.email="marcus@ffern.co" -c user.name="Marcus Michaels" commit -m "feat(whittle): preview-link resolution and rule index"
```

---

### Task 10: Activate and smoke-test discovery

**Files:**
- Create: symlink `~/.claude/skills/whittle` → `~/.config/agents/skills/whittle`

**Interfaces:**
- Consumes: the complete skill (Tasks 1–9).
- Produces: an active, discoverable `whittle` skill. This task does NOT run whittle against the repo (Marcus does the live test) — it only confirms the skill is wired in and its frontmatter/structure is valid.

- [ ] **Step 1: Create the symlink**

```bash
ln -s ~/.config/agents/skills/whittle ~/.claude/skills/whittle
```

- [ ] **Step 2: Verify the symlink resolves to the skill**

Run: `readlink ~/.claude/skills/whittle && head -3 ~/.claude/skills/whittle/SKILL.md && ls ~/.claude/skills/whittle/rules`
Expected: the symlink target prints; the frontmatter `---` / `name: whittle` shows; the three rule files list.

- [ ] **Step 3: Lint the frontmatter is well-formed**

Run:
```bash
sed -n '1,6p' ~/.claude/skills/whittle/SKILL.md
```
Expected: opening `---`, a `name: whittle` line, a `description:` line, an `allowed-tools:` line, closing `---`.

- [ ] **Step 4: Final commit (if the symlink lives in a tracked dotfiles area; otherwise note it's machine-local)**

The symlink is under `~/.claude/` (machine-local, typically gitignored from the dotfiles repo). No commit needed — record in the README that activation is a one-time local `ln -s`.

Handoff: Marcus runs the live acceptance test himself — e.g. `/whittle flatten-else-after-return` inside `~/Sites/ffern-engineering` — and inspects the resulting PR for correctness, behaviour-preservation, formatting, assignee, and the resolved preview links.
