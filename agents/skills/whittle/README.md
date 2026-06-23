# whittle

A personal, on-demand maintenance skill. Fire `/whittle` (or `/whittle <rule>`)
inside any repo to open one small, behaviour-preserving, self-authored PR.

## Install

Symlink the skill into Claude Code's user-level skills dir:

```sh
ln -s ~/.config/agents/skills/whittle ~/.claude/skills/whittle
```

The skill then resolves in every project. No target repo ever sees it.

## Running unattended (screen) while you keep coding

whittle is designed to run inside `claude` in a detached `screen` session. It does
all its work in an **ephemeral git worktree** checked out from fresh `origin/main`
(under `~/.cache/whittle/`), so your primary checkout is never touched — you can
keep coding your feature in parallel, uncommitted changes and all. The worktree is
torn down at the end of every run. `node_modules` are symlinked from your primary
checkout (no reinstall); GitHub CI on the PR is the authoritative check.

An interactive permission prompt would stall an unattended run, so start the
session with the tools it needs pre-allowed: `git`, `gh`, `turbo`/`tsc`, and file
edits. Either run in a trusted/allowlisted session or pre-approve those tools.

## Per-repo config (ffern defaults)

whittle resolves preview links from the PR's Vercel deployment statuses. For the
ffern monorepo:

- Vercel team scope slug: `ffern`
- Storybook project: `ffern-ui` (deep links use `/?path=/story/<storyId>`)
- App project: `ffern.co` (deep links append the affected route)

In a repo without these, the Storybook/preview lines are simply omitted.
