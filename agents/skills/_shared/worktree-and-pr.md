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

No labels. Commit with your normal git identity, with no `Co-Authored-By` trailer. The PR
body structure is the caller's (whittle and tinker differ).

## Teardown

`cd` out of `$WT`, then `git worktree remove --force "$WT"` + `git worktree prune`.
**When** to tear down is caller-specific: whittle does it immediately after opening
the PR; tinker keeps the worktree alive through its CI watch-loop and tears down at
the end.
