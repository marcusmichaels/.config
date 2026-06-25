# tinker — Collaborative-then-Autonomous Fix Agent Design

**Date:** 2026-06-25
**Author:** Marcus Michaels
**Status:** Design — approved, pending spec review

---

## Summary

`tinker` is a personal Claude Code skill (sibling to [[whittle]]) for **real,
behaviour-changing work I brief it on** — typically a bug that needs investigating
before it can be fixed (e.g. the portal showing "returns window closed" when it
isn't). It works *with* me interactively to understand the problem, then — on my
explicit go — detaches and works *on its own*: builds the fix in an isolated
worktree, opens a PR assigned to me, and shepherds that PR's **CI checks** to green,
stopping tidily as a draft if it can't.

Where whittle is silent end-to-end and picks tiny *behaviour-preserving* fixes from
a rule catalogue, tinker is **collaborative up front, autonomous after**, and takes
an arbitrary task whose whole point is to *change* behaviour (fix the bug).

Name: **`tinker`**, fired as `/tinker` — a tinker diagnoses *and* mends. Run it in a
`screen` session: interactive while you're there, autonomous (no questions) after
you approve and detach.

---

## Lifecycle

1. **`/tinker <description>`** — interactive session.
2. **Investigate + Q&A** — explore the codebase **read-only**, ask clarifying
   questions, explore more; ask-then-explore or explore-then-ask, in any order,
   iterating with me until the root cause and the fix are clear.
3. **Gate (explicit "go").** Present a brief — *root cause · the fix I intend ·
   files I'll touch · how CI will prove it* — and **wait**. I approve (or ask for a
   tweak), **then detach**. Nothing is written until I say go.
4. **Autonomous build.** Worktree off fresh `origin/main` → implement the fix →
   `turbo run format` → commit → push → open the PR (assigned to me; body =
   Root cause / The fix / How to test, with preview deep-links).
5. **CI watch-loop.** Poll the PR's checks until they settle; on a failure, pull the
   logs, fix in the worktree, commit, push, re-poll — **up to 3 fix attempts**.
6. **Terminate.** Checks green → done. Still red after 3 attempts → convert the PR to
   **draft** and post a comment listing what's failing + what was tried. Either way:
   tear down the worktree, print a one-line outcome summary.

---

## The two phases

### Phase 1 — interactive investigation (I'm present)

- Read-only exploration of the repo (grep/glob/read; run read-only commands). No
  edits, no branch, no worktree yet.
- Free-form Q&A: it may ask before exploring or explore before asking, and loop.
- Goal: a shared, confident understanding of the **root cause** and an agreed
  **fix approach**.
- Conforms to the target repo's standards doc (`AGENTS.md` / `CLAUDE.md`).

### The gate (the seam)

It produces a short **build brief** and stops, doing nothing until I reply "go":

```
Root cause: <what's actually wrong, with file:line evidence>
The fix:    <what it will change and why that addresses the root cause>
Files:      <the files it expects to touch>
Verify:     <which CI checks will prove it; any manual QA I should do>
```

This is deliberately the last thing I see before I detach — so I approve a concrete
plan, not a half-formed hunch. If I ask for a tweak, it revises the brief and waits
again.

### Phase 2 — autonomous build + CI tending (I've detached)

No questions from here. If it hits genuine ambiguity it could not have foreseen,
it makes the most reasonable decision, notes it in the PR body, and presses on —
it never blocks waiting for input. The worktree, build, push, and PR follow the
**shared machinery** (below). Then the CI watch-loop runs (below).

---

## CI watch-loop

- After opening the PR, get the head SHA and poll its checks:
  `gh pr checks <num>` / the status-check rollup. Bounded polling (checks usually
  settle in minutes); never wait unboundedly.
- **On a failing check:** fetch its logs (`gh run view --log-failed` or the check's
  `targetUrl`), diagnose, fix in the *same* worktree/branch, commit, push, re-poll.
- **Attempt cap: 3.** Each attempt is one diagnose→fix→push cycle for the current
  red check(s).
- **Green → done.** All required checks pass → the PR is ready; tear down.
- **Stuck (still red after 3) → draft + summary.** `gh pr ready --undo` to convert
  to draft; post a PR comment: which check is failing, the error, and each fix it
  tried. Tear down the worktree. A stuck run is still useful — I get the
  investigation, the attempted fix, and exactly which check beat it.
- The **worktree persists through this whole loop** (unlike whittle, which tears
  down right after opening the PR) so follow-up commits are possible.

---

## PR shape

Like a PR I opened by hand, but framed for a behaviour-*changing* fix.

- **Author/assignee:** `hello@marcusmichaels.com`, no `Co-Authored-By` trailer; assigned to
  me; no labels.
- **Branch:** `fix/<slug>` (conventional type inferred from the task — `fix/`,
  `feat/`, `chore/` — defaulting to `fix/` for bug work). The branch name is the
  claim ticket for parallel-safety, exactly as in the shared machinery.
- **Title:** Conventional Commits — e.g. `fix: stop portal showing returns window
  closed when it is open`.
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

There is **no** "Why behaviour-preserving" section — tinker changes behaviour on
purpose. Correctness is established by the CI checks it drives to green, plus my
manual QA via "How to test".

---

## Verification

- **No local typecheck/lint.** CI is both the gate and the signal tinker acts on
  (the watch-loop), so local type/lint checks are redundant.
- **`turbo run format`** before committing — instant, and avoids burning a CI cycle
  on a stray formatting nit.
- Everything else is proven by CI.

---

## Shared machinery (extracted; DRY)

The worktree + PR plumbing is now used by **two** skills (whittle and tinker), so it
moves into one playbook both reference instead of being duplicated:

- **New file:** `~/.config/agents/skills/_shared/worktree-and-pr.md` — the canonical
  procedure for: creating the ephemeral worktree off `origin/main`, claim-by-branch
  parallel-safety, `node_modules` symlink reuse (option B) + per-run `TURBO_CACHE_DIR`,
  git-lock retries, pushing, opening the PR assigned to me, resolving Vercel preview
  deep-links (ffern-ui = Storybook, ffern.co = app), and worktree teardown.
- `_shared/` is **not** symlinked into `~/.claude/skills/`, so Claude never loads it
  as a standalone skill. Both SKILL.md files reference it by **absolute path**
  (`~/.config/agents/skills/_shared/worktree-and-pr.md`) so resolution doesn't depend
  on the symlinked location.
- **whittle is refactored** to reference the shared doc instead of carrying its own
  copies of those steps. whittle keeps its own specifics (rule catalogue,
  behaviour-preserving doctrine, immediate teardown, `<rule>/<slug>` branch).
- **tinker references the same doc** but overrides: branch `fix/<slug>`, worktree
  **persists** through the CI loop (teardown deferred to loop end), no local
  typecheck/lint.

Each skill's SKILL.md owns what's unique to it; the shared doc owns the common
plumbing. One source of truth, no drift.

---

## Safety rails

Inherits the shared, non-destructive rails (never push `main`/default; always work
in the ephemeral worktree, never the primary checkout; claim-by-branch; never
force-push / rewrite history / delete others' branches; no destructive git; no
remote mutations beyond the one PR; clean teardown on exit). Plus tinker-specific:

- **Nothing is written before the gate.** Phase 1 is strictly read-only; no worktree,
  branch, or edit exists until I say "go".
- **No questions after the gate.** Once I detach, it never blocks on input — it
  decides, documents, and proceeds, or stops tidily (draft + summary).
- **Behaviour change is the point**, so the behaviour-preserving doctrine does NOT
  apply — but the change must be scoped to the agreed brief. No drive-by edits beyond
  what the fix needs.
- **Stuck = draft, not abandon.** Preserve the work; never silently bin it.

---

## Home & wiring

Identical to whittle:

- Lives at `~/.config/agents/skills/tinker/` (tracked by the `.config` dotfiles repo).
- Symlinked into Claude Code's user skills dir:
  `ln -s ~/.config/agents/skills/tinker ~/.claude/skills/tinker`.
- Runs inside `claude` in a `screen` session; needs git/`gh`/`turbo` and file edits
  pre-allowed so the autonomous phase doesn't stall on a permission prompt.

---

## Components / units

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `skills/tinker/SKILL.md` | Driver: lifecycle, investigation + gate, CI watch-loop, PR shape, tinker-specific safety | `_shared/worktree-and-pr.md`, `gh`, `turbo`, target repo `AGENTS.md`/`CLAUDE.md` |
| `skills/tinker/README.md` | Setup (symlink, screen, pre-allowed tools) | — |
| `skills/_shared/worktree-and-pr.md` | Canonical worktree + PR + preview-link plumbing, referenced by whittle and tinker | `git`, `gh` |
| `skills/whittle/SKILL.md` (refactored) | References the shared doc; keeps rule catalogue + behaviour-preserving doctrine + immediate teardown | `_shared/worktree-and-pr.md` |
| Symlink → `~/.claude/skills/tinker` | Makes tinker discoverable | Claude Code skill discovery |

---

## Decisions (resolved)

- **Name:** `tinker`, fired as `/tinker`.
- **Trigger model:** interactive investigation + Q&A, then an explicit brief-and-go
  gate, then silent autonomous build (run in `screen`; detach after the gate).
- **Scope:** real behaviour-changing tasks (bugs/features needing investigation);
  arbitrary, no rule catalogue.
- **Verification:** no local typecheck/lint; `format` only; CI is the gate and the
  signal.
- **CI watch-loop:** poll checks, fix failures in-worktree, ≤3 attempts; green →
  done; stuck → PR to draft + summary comment.
- **Comments:** out of scope — CI checks only (Copilot/human comments ignored).
- **PR:** assigned to me; branch `fix/<slug>`; Conventional Commits title; body =
  Root cause / The fix / How to test; no labels; no footer.
- **Worktree:** persists through the CI loop, torn down at loop end.
- **Shared machinery:** extracted to `_shared/worktree-and-pr.md`; whittle refactored
  to reference it; both skills override only their specifics.
