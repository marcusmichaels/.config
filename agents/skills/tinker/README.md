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
