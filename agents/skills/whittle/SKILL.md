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

1. **Pre-flight lock.** Take a lockfile in the COMMON git dir
   (`$(git rev-parse --git-common-dir)/whittle.lock`, shared across worktrees): if
   it exists, print `whittle: another run holds the lock — exiting.` and STOP.
   Otherwise create it. (No clean-tree check — whittle never touches the primary
   checkout, so it doesn't matter if I have uncommitted work.)
2. **Never touch the primary checkout.** ALL work happens in an ephemeral git
   worktree (see Per-run procedure). Never edit, branch-switch, stash, or `git add`
   in the checkout the user is coding in. Searching it read-only (grep/glob) is fine.
3. **Never push to `main`** or the default branch. Only ever push the run branch
   `<rule>/<short-slug>` created in the worktree.
4. **Never** force-push, rewrite history, delete branches, or run destructive git
   (`reset --hard`, `clean -fd`, `checkout -- .`).
5. **Edits scoped to the single target instance.** No bulk deletes, no `rm -rf`, no
   touching files outside the one fix.
6. **No remote/account mutations** beyond opening the one PR and assigning it to me.
7. **Always tear down + unlock on exit.** On success OR any abort: remove the
   worktree (`git worktree remove --force <tmp>` + `git worktree prune`) and release
   the lockfile. Never leave a pushed branch with no PR or a half-formed PR.

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

## Per-run procedure

Follow in order. Stop (silently, tearing down + releasing the lock) at any "no
clean instance".

1. **Pre-flight lock** (common-dir lockfile — see Safety rails).
2. Read the target repo's `AGENTS.md` / `CLAUDE.md` if present; conform to it.
3. Resolve the rule: the named one, or (bare) auto-pick per the Invocation
   heuristic.
4. **Dedup** against my own open PRs for this rule; skip instances already in
   flight:
   `gh pr list --author "@me" --state open --search "head:<rule>/" --json number,headRefName,files`
5. Run the rule's `## Find` against the primary checkout **read-only**; for each
   candidate apply the rule's `## Guards`. Pick ONE clean instance and note its
   file path. None? Release lock and STOP — silence is success.
6. **Create the ephemeral worktree** (see snippet below). All later steps run
   inside `$WT`, never the primary checkout.
7. In `$WT`, **re-confirm the candidate exists in the `origin/main` checkout** (the
   step-5 search hit the primary checkout, which may carry my uncommitted WIP). If
   it's gone, tear down and STOP — silence is success. Otherwise apply the fix
   (single instance only) and re-read the surrounding code to confirm
   behaviour-preservation per the rule's `## Why behaviour-preserving`.
8. **Verify locally** (best-effort — see Local verification).
9. Commit (author `marcus@ffern.co`, no co-author trailer, Conventional Commits
   title) and push the run branch from `$WT`.
10. Open the PR assigned to me (see PR format).
11. Resolve preview links and edit them into the body (see Resolving preview links).
12. **Tear down:** `cd` out of `$WT`, `git worktree remove --force "$WT"`,
    `git worktree prune`. Release the lock. Print the outcome summary.

### Worktree setup snippet

```sh
MAIN="$(git rev-parse --show-toplevel)"
REPO="$(basename "$MAIN")"
SLUG="<short-slug>"
WT="$HOME/.cache/whittle/$REPO/$SLUG"

git -C "$MAIN" fetch origin
git -C "$MAIN" worktree add "$WT" -b "<rule>/$SLUG" origin/main

# Reuse node_modules from the primary checkout (option B — no install):
ln -s "$MAIN/node_modules" "$WT/node_modules"
# plus each workspace's node_modules (the worktree already has the source tree):
( cd "$MAIN" && find apps packages -maxdepth 2 -type d -name node_modules -prune 2>/dev/null ) \
  | while read -r d; do ln -s "$MAIN/$d" "$WT/$d"; done
```

If `git worktree add` fails (e.g. branch exists), pick a fresh slug or abort
cleanly. Always reach step 12 teardown even on abort.

## Local verification

Runs inside `$WT`, whose `node_modules` are symlinked from the primary checkout, so
it's fast. **GitHub CI on the PR is the authoritative gate** — local checks just
catch the obvious before pushing.

1. **Format** the changed files: `turbo run format` (Biome). The committed diff must
   be correctly formatted — do this always.
2. **Determine the changed package** — the workspace whose dir contains the edited
   file (read its nearest `package.json` `name`). Call it `<pkg>`.
3. **Best-effort typecheck:** `turbo run check-types --filter=<pkg>` (or
   `tsc --noEmit -p` on the package's `tsconfig.json`).
4. **Best-effort lint:** `turbo run lint --filter=<pkg>`.

If typecheck/lint surfaces an error clearly caused by the change, fix it within the
single-instance scope or abandon the instance (clean abort + teardown). If it can't
run cleanly because of the symlinked-worktree environment (not the change itself),
don't block — note "verified by CI" and proceed. Never *knowingly* open an
obviously-broken PR.

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

## Outcome summary

End every run with exactly one line so a `screen` reattach shows the result:

- Opened a PR: `whittle: opened <pr-url> — <rule>: <one-line what>.`
- Nothing to do: `whittle: no clean instance found — nothing opened.`
- Aborted: `whittle: aborted — <reason>.`

## Rules

Each rule is a self-contained file in `rules/`. Read the target rule's file for its
Goal, Why-behaviour-preserving, Precondition, In scope, Find, and Guards.

- `flatten-else-after-return` — drop an `else` after an unconditional `if` exit.
- `unreachable-code-removal` — remove statements after an unconditional exit.
- `canonical-tailwind-classes` — arbitrary-px Tailwind class → canonical scale.

To add a rule: drop a new `rules/<name>.md` following the same section contract and
add a line here. No code changes needed.
