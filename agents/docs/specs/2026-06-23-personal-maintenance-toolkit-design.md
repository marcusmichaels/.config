# whittle — Personal Maintenance Toolkit Design

**Date:** 2026-06-23
**Author:** Marcus Michaels
**Status:** Design — approved, pending spec review

---

## Summary

`whittle` is a personal, on-demand Claude Code skill that produces **small,
behaviour-preserving, me-authored PRs**: a quiet side channel of real
contributions under my own name. I fire it from inside whatever repo I'm working
in; it picks one clean fix, verifies it locally, and opens a PR assigned to me
that's trivial to review and easy to test.

It is **repo-agnostic**. It carries its own rule catalogue and has **no runtime
dependency on any single repo** — in particular it does not read this repo's
`SPIRITMENDER.md` (that file only exists here; it was used as inspiration while
designing whittle and is otherwise irrelevant to it). At runtime whittle grounds
itself in the *target* repo's standards doc (`AGENTS.md` / `CLAUDE.md`) when one
exists, and each rule self-gates on its own preconditions so rules that don't
apply to a repo simply find nothing.

Name: **`whittle`**, fired as `/whittle`. A verb that telegraphs the constraint —
shave one small thing off, carefully, by hand.

---

## Doctrine (the top hard rule)

**Behaviour-preserving by default.** Every change must be *provably equivalent* at
runtime — if a reviewer can construct any input where the old and new code differ,
the rule is out.

**The one exception:** fixing an existing, obvious bug — where the current
behaviour is demonstrably wrong and the correct behaviour is unambiguous. Not "I
think this is better," not "this might be safer" — an actual, evident defect. When
in doubt, it is not obvious; skip it.

This doctrine is why the following are permanently **out of scope** (they change
behaviour on some inputs):
- Adding `try/catch` / `.catch` to unhandled promises (changes error propagation —
  can defeat an intentional fail-loud path).
- Swapping a `@deprecated` symbol for its replacement (the replacement is not
  guaranteed behaviourally identical).
- `a && a.b` → `a?.b` (differ when `a` is a non-nullish falsy like `0` / `""`).
- `x || ""` → `x ?? ""` (same falsy-value trap).

---

## Safety rails (non-destructive — non-negotiable)

An unattended agent must never be able to destroy work. These override everything:

- **Never touch the primary checkout.** whittle does all its work in an **ephemeral
  git worktree** (see Architecture), so the checkout I'm actively coding in is never
  read, written, branch-switched, or stashed. This is what lets me keep working on
  my feature while whittle runs.
- **Always work off fresh `origin/main` in the worktree.** The worktree is created
  with `git worktree add <tmp> -b <rule>/<slug> origin/main` after a
  `git fetch`. No edits ever happen outside that worktree; if it can't be created,
  abort.
- **Never push to `main`** (or the default branch). whittle only ever pushes the run
  branch it created (`<rule>/<slug>`).
- **Never force-push, never rewrite history, never delete branches** — not its own,
  and especially not anyone else's.
- **Never run destructive git** — no `reset --hard`, no `clean -fd`, no
  `checkout -- .` that discards changes, no `branch -D` on shared branches.
- **Edits are scoped to the single target instance.** No bulk deletes, no `rm -rf`,
  no touching files outside the one fix.
- **No remote/account-level mutations** beyond opening the one PR and assigning it
  to me (no closing PRs, no editing others' PRs, no repo settings, no releases).
- **Clean abort on mid-run failure.** If something fails after the worktree exists,
  unwind: never leave a pushed branch with no PR or a half-formed PR. **Always
  remove the worktree on exit** (`git worktree remove --force` + `git worktree
  prune`), success or abort — it is disposable scratch space.
- **One run at a time.** Take a lockfile in the **common** git dir
  (`$(git rev-parse --git-common-dir)/whittle.lock`, shared across worktrees) at the
  start; if it exists, exit immediately. This stops two concurrent `screen` runs
  from racing the same instance before either opens its PR (the open-PR dedup only
  catches already-opened PRs). Release the lock on exit, success or abort.

## Other hard constraints

- **One rule per run.** Work only the rule in play (named, or auto-picked). No
  opportunistic fixes.
- **One instance per PR.** Find at most one clean instance; fix it; stop. (A rule
  may declare a higher batch limit; none in the starter set do.)
- **Silence is success.** No clean instance → no PR. Never invent work.
- **No drive-by changes.** No incidental refactors, renames, or formatting in
  unrelated files.
- **Net-change ceiling: ≤300 lines.** If a fix needs more, skip it.
- **Dedup against my own open PRs** by branch prefix before picking a target.
- **Conform to the target repo's standards doc** (`AGENTS.md` / `CLAUDE.md`) if one
  exists.
- **CI is the authoritative gate.** Local checks are a fast best-effort pre-flight
  (see Local verification); the PR's GitHub checks are the source of truth. Don't
  knowingly open an obviously-broken PR, but a worktree env hiccup in local
  typecheck/lint does not block — CI will catch real failures.

---

## Architecture

### Where it lives & how it's wired

- `~/.config/agents/` — home for the toolkit. It is **not its own git repo**; it is
  tracked by my existing `~/.config` dotfiles repo, so it syncs with my other
  machine config.
  - `docs/specs/` — this design doc and future specs.
  - `skills/whittle/` — the skill itself (`SKILL.md`, rule files, README).
- Activate by symlinking the skill into Claude Code's user-level skills dir:
  ```sh
  ln -s ~/.config/agents/skills/whittle ~/.claude/skills/whittle
  ```
  This mirrors the symlink discipline ffern's `.agents/` uses to mount into
  `.claude/`. Resolving at the user level means whittle is available in every
  project and **no target repo ever sees it**.

### Carries its own catalogue, grounded by the repo

- The **rules live in the toolkit** (`skills/whittle/`), authored fresh for whittle
  (not copied from `SPIRITMENDER.md`).
- At runtime whittle reads the target repo's standards doc (`AGENTS.md` /
  `CLAUDE.md`) when present, to conform to that repo's conventions (commit style,
  logger usage, naming). Absent that, it leans on each rule's own definition.
- **Rules self-gate.** Each rule declares preconditions (e.g. canonical-classes
  needs a Tailwind config). Where a precondition isn't met, the rule finds no
  candidates — silence is success. So repo-specific rules lie dormant elsewhere
  rather than erroring.

### Isolation via an ephemeral worktree

whittle never works in my primary checkout, so I can keep coding my feature while
it runs. Each run:

1. `git fetch origin` (so `origin/main` is current).
2. `git worktree add <tmp> -b <rule>/<slug> origin/main` — a fresh checkout
   of latest main on the run branch. `<tmp>` lives **outside the repo** (e.g.
   `~/.cache/whittle/<repo-name>/<slug>`) so it never appears in my working dir or
   `git status`.
3. **Dependencies — reuse, don't reinstall (option B).** A fresh worktree has no
   `node_modules`. Rather than run a full install, symlink them from the primary
   checkout: the root `node_modules`, plus each workspace's `node_modules`
   (`apps/*`, `packages/*`). Near-instant. whittle changes no dependencies, so the
   primary checkout's modules are valid for the change. Local verification is
   therefore **best-effort**; the PR's GitHub CI is the authoritative gate.
   (Caveat: turbo may write caches into the shared `node_modules/.cache` — harmless,
   but a known cross-write with the primary checkout.)
4. Do all work in `<tmp>`; commit; push the run branch; open the PR.
5. **Always** tear down: `git worktree remove --force <tmp>` + `git worktree prune`.
   The branch persists on the remote for the PR; the local scratch checkout is gone.

The single-run lockfile lives in the **common** git dir (shared by all worktrees),
so concurrent runs are still serialised.

---

## Behaviour

### Execution context — unattended

whittle is fired inside `claude` running in a detached `screen` session, so a run
must complete start-to-finish with no operator present:

- **Fully autonomous.** No mid-run checkpoints or "should I proceed?" prompts. The
  skill decides, acts, and either opens the PR or exits silently.
- **Every wait is bounded.** The Vercel preview poll caps at ~90s; nothing else
  blocks. A run can never hang waiting on a person or a build.
- **Ends with a one-line outcome summary**, so reattaching to the session shows the
  result at a glance: the PR URL + one-line what-it-did, or
  `No clean instance found — nothing opened.`
- **Runs under pre-allowed permissions.** Because an interactive permission prompt
  would stall an unattended run, fire whittle in a session where git, `gh`, `turbo`
  /`tsc`, and file edits are already permitted. (README documents this; it's a
  harness/settings concern, not skill logic.)

### Invocation (both modes)

- **Targeted:** `/whittle <rule>` — works that specific rule.
- **Bare:** `/whittle` — surveys the repo and picks the rule with the **cleanest
  available instance** (smallest, lowest-risk candidate). The "I've got 5 minutes,
  find me something" mode.

### Per-run procedure

1. **Pre-flight.** Take the lockfile in the common git dir; if held, exit. (No
   clean-tree check needed — whittle never touches the primary checkout.)
2. Read the target repo's standards doc (`AGENTS.md` / `CLAUDE.md`) if present.
3. Resolve the rule (named, or auto-pick cleanest available).
4. Dedup: list my own open PRs by branch prefix; avoid instances already in flight.
   ```sh
   gh pr list --author "@me" --state open \
     --search "head:<rule>/" --json number,title,headRefName,files
   ```
5. Find candidates (search the primary checkout read-only); pick the cleanest.
6. **Create the ephemeral worktree:** `git fetch origin`, then
   `git worktree add <tmp> -b <rule>/<slug> origin/main`. From here, all
   work happens in `<tmp>`. Symlink `node_modules` from the primary checkout
   (root + each workspace).
7. Apply the fix in the worktree. Verify behaviour-preservation by reading the
   surrounding code.
8. **Verify locally** (best-effort — see below).
9. Commit, then push the run branch (never `main`).
10. Open the PR assigned to me, with a provisional "How to test" section.
11. Resolve Vercel preview URLs from the PR's deployment statuses and edit the
    resolved deep links into the body (see "How to test" below).
12. **Tear down the worktree** (`git worktree remove --force <tmp>` + prune),
    release the lock, and print a one-line outcome summary.

---

## Local verification (best-effort; CI is the gate)

whittle works in a worktree whose `node_modules` are symlinked from my primary
checkout (option B), so checks run fast. The PR's GitHub CI is the authoritative
gate — local checks just catch the obvious before pushing:

- Always: `turbo run format` on the changed files (Biome) — the committed diff must
  be correctly formatted.
- Best-effort: `turbo run check-types --filter=<pkg>` (or `tsc` directly on the
  affected package). If it surfaces an error clearly caused by the change, fix it or
  abandon the instance.
- Best-effort: `turbo run lint --filter=<pkg>`.

If typecheck/lint can't run cleanly because of the symlinked-worktree environment
(not the change itself), don't block — note "verified by CI" and proceed. Never
*knowingly* open an obviously-broken PR.

---

## PR identity & format

These must read like PRs I opened by hand.

- **Author:** my real identity — `marcus@ffern.co`, normal `git commit`. **No**
  `Co-Authored-By` trailer (standing preference). No bot prefix anywhere.
- **Assignee:** me — `gh pr create --assignee @me`.
- **Branch:** `<rule>/<short-slug>` — obviously my branch, still groups by
  rule for the dedup search.
- **Title:** plain Conventional Commits — e.g.
  `refactor: drop redundant else after early return in CheckoutSummary`.
- **Labels:** none.
- **Body — three sections, no footer:**

  ```markdown
  ## What
  <One paragraph: what was wrong, what changed.>

  ## Why this is behaviour-preserving
  - <The provable-equivalence argument for this specific change.>
  - <Scope: N file(s), typecheck + lint pass locally.>

  ## How to test
  - **Pages affected:** <preview links at the affected route(s) — see below>
  - **Tester state:** <what the user must be in: logged out / logged-in member /
    active subscription / mid-checkout / specific locale, etc. "None" if static.>
  - **Storybook:** <preview link to the changed component's story — see below;
    omit if no story exists>
  ```

### Building "How to test"

- **Pages affected:** trace importers of the changed file up to page entry points
  (`apps/ffern.co/src/pages/**` in ffern; the repo's route dir generally). List the
  affected routes. If the change is in a widely-used leaf component, name the most
  relevant pages and say it's shared.
- **Tester state:** infer required auth/user state from those pages (e.g. portal
  pages need a logged-in member; checkout needs an active basket). State "None" for
  purely static/marketing pages.
- **Preview links — resolved from Vercel, not constructed.** The branch-alias URL
  is **not** deterministically derivable: for long branches Vercel truncates and
  appends a hash (observed: branch
  `spiritmender/pure-component-migration/enquiry-shell` →
  `ffern-ui-git-spiritmender-pure-component-migration-7eab37-ffern.vercel.app`, with
  the trailing segment dropped). So the skill **resolves** the real URLs after push:
  1. Open the PR (this triggers Vercel preview builds).
  2. Poll the PR's deployment statuses for a bounded time (~90s):
     ```sh
     gh api "repos/{owner}/{repo}/deployments?sha=<headSha>" \
       --jq '.[] | {env: .environment, id: .id}'
     gh api "repos/{owner}/{repo}/deployments/<id>/statuses" \
       --jq '.[0] | {state, url: .environment_url}'
     ```
     (Equivalently read `gh pr view --json statusCheckRollup` for the Vercel check
     `target_url`s.)
  3. Identify deployments by project: **`ffern-ui`** is Storybook, the app project
     (**`ffern.co`**) is the page preview. Team scope slug is `ffern`.
  4. Compose deep links and edit them into the PR body:
     - **App page:** `<ffern.co-preview-url>/<affected-route>`
     - **Storybook:** `<ffern-ui-preview-url>/?path=/story/<storyId>` where
       `storyId` is the kebab-cased story `title` + `--<export>` (Storybook
       convention), e.g. `title: "Components/FfernButton"` →
       `.../?path=/story/components-ffernbutton--default`.
  5. **Fallback:** if previews aren't ready within the poll window, write
     "App & Storybook previews: see the Vercel checks on this PR" instead of
     blocking. Never hold the PR open waiting.

---

## Starter rule catalogue

Fresh rules authored for whittle. All three sit firmly in the behaviour-preserving
camp. Each PR fixes **one** instance.

### `canonical-tailwind-classes`

**Goal:** Replace an arbitrary-px Tailwind spacing/sizing class with its canonical
scale equivalent (`gap-[8px]` → `gap-2`, `mt-[16px]` → `mt-4`).

**Why behaviour-preserving:** token-level equivalence — the default 4× spacing
scale is unmodified, so the two classes compile to identical CSS.

**Precondition (self-gate):** repo has a Tailwind config.

**In scope:** spacing/sizing prefixes only — `m*`, `p*`, `gap*`, `space-*`, `w`,
`h`, `size`, `min/max-w/h`, `top/right/bottom/left`, `inset*`, `translate-x/y`,
`scroll-m*`, `scroll-p*`. Include responsive/state variant chains, the negative
prefix, and trailing `!`.

**Canonical scale (px → N):** `0→0, 2→0.5, 4→1, 6→1.5, 8→2, 10→2.5, 12→3, 14→3.5,
16→4, 20→5, 24→6, 28→7, 32→8, 36→9, 40→10, 44→11, 48→12, 56→14, 64→16, 80→20,
96→24, 112→28, 128→32, 144→36, 160→40, 176→44, 192→48, 208→52, 224→56, 240→60,
256→64, 288→72, 320→80, 384→96`. Values not in this table have no equivalent —
leave them.

**Guards (skip if any apply):** class built dynamically / via interpolation; value
not on the scale; prefix not on the in-scope list (esp. `text-*`, `rounded-*`,
`border-*`, colours); non-px units (`rem`, `%`, `calc()`, `var()`); multi-value
arbitraries (`p-[8px_16px]`); the string isn't a Tailwind class context.

### `flatten-else-after-return`

**Goal:** Remove an `else`/`else if` whose preceding `if` branch always exits
(`return` / `throw`), dedenting the else body. `if (x) return a; else { B }` →
`if (x) return a; B`.

**Why behaviour-preserving:** the `if` branch unconditionally exits, so control can
only reach the else body when the condition was false — identical to falling
through after the `if`. Provably equivalent control flow.

**Precondition (self-gate):** none — portable to any JS/TS repo.

**Guards (skip if any apply):** the `if` branch does not *unconditionally* exit (a
conditional return inside it doesn't count); there's an `else if` chain where
flattening would change which branches are evaluated; the `if`/`else` bodies
declare clashing `const`/`let` names that would collide once dedented; the
transformation would exceed the line ceiling or tangle with surrounding code.

### `unreachable-code-removal`

**Goal:** Remove statements that can never execute because they follow an
unconditional `return` / `throw` / `break` / `continue` in the same block.

**Why behaviour-preserving:** unreachable statements never run, so removing them
cannot change behaviour.

**Precondition (self-gate):** none — portable.

**Guards (skip if any apply):** the "dead" code is actually reachable (the prior
exit is inside a nested conditional/loop, not unconditional); the removed code is a
function/type/var *declaration* that is hoisted and used elsewhere in scope;
removing it orphans an import still used elsewhere (leave imports to a separate
concern); any doubt about reachability — skip.

---

## Components / units

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `~/.config/agents/` | Toolkit home; tracked by the `.config` dotfiles repo | git (parent), my GitHub |
| `skills/whittle/SKILL.md` | Driver: invocation, dedup, per-run procedure, verification, PR format, testing-notes + preview-URL resolver | `gh`, `turbo`/`tsc`; target repo's `AGENTS.md`/`CLAUDE.md` if present |
| `skills/whittle/rules/*.md` | The three rule definitions (goal, why-safe, precondition, scope, guards) | — |
| `skills/whittle/README.md` | Symlink-setup instructions; Vercel project/scope names for preview resolution | — |
| Symlink → `~/.claude/skills/whittle` | Makes the skill globally available to Claude Code | Claude Code skill discovery |

---

## Decisions (resolved)

- **Name:** `whittle`, fired as `/whittle`.
- **Home:** `~/.config/agents/`, tracked by the `.config` dotfiles repo (no own git).
- **Catalogue:** carried by the toolkit; fresh rules, not copied from
  `SPIRITMENDER.md`; no runtime dependency on any single repo.
- **Doctrine:** behaviour-preserving by default; sole exception is fixing an
  obvious existing bug.
- **Starter rules:** `canonical-tailwind-classes`, `flatten-else-after-return`,
  `unreachable-code-removal`.
- **Bare mode:** picks the cleanest available instance (not random).
- **Isolation:** all work happens in an ephemeral git worktree off fresh
  `origin/main` (outside the repo), so the primary checkout is never touched and I
  can keep coding. `node_modules` reused from the primary checkout via symlink
  (option B); worktree always torn down on exit.
- **PR:** authored by + assigned to me; branch `<rule>/<slug>`; Conventional
  Commits title; What / Why-behaviour-preserving / How-to-test body; no labels, no
  footer.
- **Preview links:** resolved from the PR's Vercel deployment statuses (ffern-ui =
  Storybook, ffern.co = app), not constructed from the branch name; graceful
  fallback to "see the Vercel checks" if not ready.
- **Verification:** local format + best-effort typecheck/lint; GitHub CI is the
  authoritative gate.
