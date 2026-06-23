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
