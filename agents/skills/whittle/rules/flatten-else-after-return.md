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
