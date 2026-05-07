# Contributing to clobmap

Thanks for considering a contribution. clobmap is a small, opinionated
project — patches that fit the spirit of the existing code are very
welcome; large rewrites are a tougher sell.

## Setup

Prereqs and one-time install: see the **Run it** section in the
[README](./README.md#run-it). TL;DR:

```bash
npm install
npm run tauri dev    # native window with hot reload
# or
npm run dev          # Vite dev server (web only)
```

## Before you open a PR

Run all four locally — CI will fail your PR if any of them fail:

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest, ~140 tests
npm run build        # frontend production build
```

The `src/model/` directory has a **90% coverage gate** on lines, branches,
functions, and statements. If you change anything under `src/model/`,
either keep it covered or update the gate (and explain why in the PR).

## Code style

- TypeScript strict mode is on; we don't use `any` casually. If you need
  to escape the type system, leave a one-line comment explaining why.
- We default to **no comments**. Add one only when the *why* is
  non-obvious — a hidden constraint, a workaround, behavior that would
  surprise a reader. Don't comment what the code already says.
- React: function components only, hooks-based, Zustand for cross-tree
  state. No class components, no Redux, no Context API.
- Don't add features, refactors, or abstractions beyond what the task
  requires. Three similar lines is better than a premature abstraction.
- Don't introduce backwards-compat shims unless you're explicitly asked
  to maintain compatibility.

## Repository conventions

- Branch names: `dev/<your-handle>/<short-topic>`. Branches merge to
  `main` via squash.
- Commits: a one-line subject, then a blank line, then a paragraph or
  two explaining the *why*. Don't list every file you touched.
- We don't require sign-off / DCO / CLA.
- License: by contributing you agree your changes are released under
  the project's [GPL-3.0 license](./LICENSE).

## Where to start reading

- [README](./README.md) — what clobmap is and what's shipped.
- [docs/getting-started.md](./docs/getting-started.md) — what a mind
  map is and how to use the app.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the codebase fits
  together. Read this before any non-trivial PR.
- [implementation-plan.md](./implementation-plan.md) — phased plan,
  current status, and what we're explicitly not doing yet.
- [RELEASING.md](./RELEASING.md) — desktop release process. Maintainers
  only.

## What kinds of PRs work well

- Bug fixes with a regression test.
- Small UX polish that survives the README's "minimalistic" framing.
- Performance improvements that come with a measurement (see
  `scripts/gen-large-doc.mjs` and the `PERF=1` Vitest run for our
  rough rig).
- Docs improvements.

## What's harder to land

- New top-level features that aren't on the implementation plan —
  open an issue first to discuss.
- Style/formatting churn unrelated to the change.
- New runtime dependencies. We've kept the dep tree small on purpose;
  every addition needs a justification.

## Reporting bugs

Open an issue: <https://github.com/clobrate/clobmap/issues>. The app
has a built-in **Settings → Report an issue** flow that pre-fills with
the React error boundary's traceback when relevant.
