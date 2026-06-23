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
