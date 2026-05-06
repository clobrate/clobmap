# clobmap v0.1.0 Codebase Analysis

Date: 2026-05-05
Repository version observed: `0.1.0`
Working tree status: clean

## Executive summary

`clobmap` is a real product codebase, not a scaffold. The core editing loop is implemented end to end: YAML parsing, comment-preserving tree mutations, a React Flow mind-map editor, file open/save, recent files, auto-save, update checks, error recovery, and a web fallback path are all present.

The strongest part of the system is the frontend model/store layer. The weakest part is architectural drift between docs and implementation, especially around platform boundaries and bundle composition. The app behaves like a frontend-first product with a very thin Rust shell, while the design docs still describe a more Rust-owned backend. That is not inherently bad, but the docs should stop implying something different.

## Snapshot

- Primary stack: `React 19`, `TypeScript`, `Vite`, `Zustand`, `CodeMirror 6`, `React Flow`, `Dagre`, `Tauri v2`
- Approximate source size reviewed: `6396` lines across `src/`, `src-tauri/src/`, `scripts/`, and GitHub workflows
- Frontend source files: `62`
- Rust source files: `2`
- Tests: `9` files, `139` passing tests
- Coverage config scope: `src/model/**/*.ts` only

## What is implemented

### Product behavior

- YAML and mind-map are both live editing surfaces.
- Invalid YAML does not destroy the last valid canvas state.
- Structural edits from the canvas reserialize back to YAML.
- YAML AST patching preserves comments and ordering where possible.
- File open/save/save-as, recent files, dirty tracking, external file reload, and auto-save are implemented.
- Split view, split orientation, font sizing, theme preference, and update checks are implemented.
- Desktop-specific support includes updater wiring, log folder access, single-instance forwarding, and OS-driven file opening.
- Web-specific support includes File System Access API when available and download fallback otherwise.

### Code organization

- `src/model/`: schema validation, YAML parse/serialize, tree ops, AST patching, diffing
- `src/store/`: document and UI state
- `src/components/`: editor, canvas, menus, split panes, update banner, error boundary
- `src/lib/`: storage adapters, file actions, settings, theme, updater, telemetry, OS open bridge
- `src-tauri/src/`: minimal runtime shell and a few commands

## Architecture assessment

### What is working well

- The document model is cleanly separated from the UI.
- Tree operations are explicit and defensive via `OpError`.
- The document store handles dirty state, undo/redo, parse state, and save baseline coherently.
- Storage is abstracted behind a `StorageAdapter`, which keeps desktop and web paths mostly isolated.
- Privacy-sensitive telemetry work is better thought through than typical early-stage apps.
- Release automation and updater packaging are already in place, which is unusually mature for `v0.1.0`.

### Important architectural reality

The codebase is frontend-centric.

- The Rust side does not own file I/O, YAML validation, or recent-files logic.
- Those responsibilities live mostly in TypeScript through Tauri plugins and browser adapters.
- Rust is currently a bootstrap and OS-integration layer, not an application logic layer.

This is a valid architecture, but it means `design.md` is partially stale.

## Verification results

I ran the advertised quality checks locally:

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test` ✅
- `npm run test:coverage` ✅
- `npm run build:web` ✅

Observed test result:

- `9` test files passed
- `139` tests passed

Observed coverage result:

- Statements: `100%`
- Branches: `98.27%`
- Functions: `100%`
- Lines: `100%`

Important qualifier: coverage is only configured for `src/model/**/*.ts`, so this is model-layer coverage, not whole-app coverage.

## Strongest areas

### 1. Model correctness

`src/model/` is the most reliable part of the codebase.

- YAML parsing validates schema and duplicate IDs.
- Structural mutations are pure and predictable.
- AST-based application preserves comments across edits.
- There is a property-style mutation test, not just happy-path fixtures.

This is a strong foundation for a dual-view editor.

### 2. State flow

The app-level state model is easy to follow.

- `useDocumentStore` owns document truth, parse state, dirty state, undo/redo, and save baseline.
- `useUIStore` owns transient UI state such as view mode, selection, clipboard, and settings.
- `App.tsx` wires platform lifecycle concerns in one place.

This separation is practical and maintainable for the current size.

### 3. Product hardening for an early release

Several production concerns are already handled:

- error boundary with recovery/report flow
- rotating desktop logs
- opt-in crash reporting
- updater workflow
- release workflow
- file association and single-instance behavior

## Main risks and gaps

### 1. Web bundle includes desktop-oriented dependencies

This is the clearest technical issue in the current architecture.

- `src/lib/storage/index.ts` statically imports both `tauriStorage` and `webStorage`.
- `tauriStorage` statically imports Tauri plugin packages.
- The web build therefore cannot fully shake out desktop-only code.

Evidence:

- `npm run build:web` emitted Vite warnings about mixed static and dynamic Tauri imports.
- The main web chunk is `923.66 kB` minified, with a chunk-size warning.

Impact:

- larger download for web users
- slower startup
- muddier platform separation

Recommended fix:

- switch to build-time platform aliasing or lazy platform module loading
- avoid any top-level import of Tauri-only modules from code that ships to the web bundle

### 2. Documentation drift

The docs are ahead of or sideways to implementation in a few places.

- `design.md` describes Rust-owned file I/O and validation; actual implementation uses frontend adapters plus Tauri plugins.
- `src/i18n/strings.ts` claims user-facing strings should be centralized, but nothing imports it yet.
- `PRIVACY.md` says draft persistence is web-only, but `src/lib/draft.ts` uses `localStorage` in shared frontend code, so desktop webviews also use it.
- `PRIVACY.md` is dated `2026-05-06`, which is later than the analysis date `2026-05-05`.

Impact:

- harder onboarding
- weaker trust in docs as operational truth
- privacy statements may become misleading if not kept exact

### 3. Test strength is narrower than the headline suggests

The codebase is well tested where it matters most, but not broadly tested.

- coverage thresholds only cover `src/model/`
- store tests exist, but UI/integration coverage is light
- file I/O flows, updater flows, menu interactions, and platform-specific behavior are not deeply exercised by automated tests

Recommended next step:

- add browser-level tests around open/save, split view, keyboard editing, and invalid-YAML recovery

### 4. Security posture is permissive

`src-tauri/tauri.conf.json` sets:

- `"security": { "csp": null }`

For a Tauri app, disabling CSP may be acceptable during rapid development, but it should be revisited before broader distribution.

### 5. Internationalization is only scaffolding

The repo contains `src/i18n/strings.ts`, but it is currently unused.

Impact:

- the app is not actually on an i18n path yet
- future translation work will still require a literal-string extraction pass

## Product maturity estimate

Relative to the docs, the repository genuinely looks close to the claimed `v0.1.0` release state. It does not look half-built. The implemented code supports the README's main product claims.

The main caveat is that maturity is concentrated in:

- the model layer
- desktop/web plumbing
- release mechanics

It is less concentrated in:

- UI test automation
- bundle optimization
- documentation accuracy

## Recommended priorities

### Priority 1

Fix platform-boundary bundling.

- split `web` and `tauri` modules at build time
- keep Tauri packages out of the web bundle unless actually needed

### Priority 2

Bring docs back in sync with the code.

- update `design.md` to describe the current frontend-heavy architecture
- correct `PRIVACY.md` storage claims
- either adopt `src/i18n/strings.ts` or remove the claim that the app already centralizes user-facing copy

### Priority 3

Add a small integration test layer.

- invalid YAML recovery
- keyboard editing from canvas
- open/save flows
- split-mode interactions
- external reload behavior where testable

### Priority 4

Review desktop security defaults.

- re-evaluate `csp: null`
- confirm only required Tauri capabilities are exposed

## Final assessment

This is a solid `0.1.0` codebase with an unusually strong model core and better-than-average release hardening. The implementation quality is highest where data integrity matters most. The main engineering debt is not broken core logic; it is platform separation, bundle shape, and documentation drift.

If those three areas are tightened, the project moves from "promising early release" to "cleanly maintainable product baseline."
