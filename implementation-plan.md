# Clobmap — Implementation Plan

**Status:** Draft v0.1
**Date:** 2026-05-04
**Companion to:** `design.md`

This plan takes the project from empty directory to **production-ready, signed, auto-updating cross-platform release**. Each phase is logically self-contained with explicit exit criteria. A phase is **not done** until every criterion is met — no "we'll fix it later."

Time estimates assume one developer at ~15 hrs/week. Treat them as ranges, not commitments.

---

## Phase 0 — Scaffold & Development Environment

**Goal:** A buildable, runnable Tauri + React + TypeScript project on the developer's primary OS.

**Work**

- Run `npm create tauri-app@latest` → React + TS + Vite template (scaffold into the existing repo, do not nest a new repo).
- Update `.gitignore` to cover Tauri/Node artifacts (`node_modules/`, `src-tauri/target/`, `dist/`, `dist-web/`, `.DS_Store`).
- Configure ESLint + Prettier + TypeScript strict mode.
- Set up Tailwind CSS (or commit to CSS Modules — pick one).
- Add `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-store` plugins.
- Wire one trivial `#[tauri::command]` (e.g. `ping`) called from React to verify IPC.
- Confirm hot reload works in dev mode.
- First commit landing the scaffold; push to remote if one is configured.

**Exit criteria**

- [ ] `npm run tauri dev` opens a working window on macOS.
- [ ] Frontend invokes `ping` command, displays Rust response.
- [ ] `npm run tauri build` produces a `.app` / `.dmg` bundle.
- [ ] `npm run lint` and `tsc --noEmit` pass with zero errors.
- [ ] Scaffold committed; `git status` is clean and no Tauri build artifacts are tracked.

**Estimate:** 2–4 days

---

## Phase 1 — Core Data Model

**Goal:** Pure-TypeScript tree model and YAML serde, fully tested, no UI yet.

**Work**

- Define `Node` and `Document` TypeScript types matching the schema in `design.md`.
- Implement `parseYaml(text) → Result<Document, ParseError>` using the `yaml` npm package (Document API to preserve comments/order).
- Implement `serializeYaml(doc) → string` that round-trips faithfully.
- Implement tree operations: `addChild`, `addSibling`, `deleteNode`, `moveNode`, `updateText`, `findById`.
- Implement `diffTrees(oldTree, newTree)` returning structural changes (for animation later).
- ID generation: monotonic counter persisted with the document.

**Exit criteria**

- [ ] All tree ops covered by unit tests (Vitest).
- [ ] Round-trip test: parse → serialize → parse produces identical tree for ≥10 fixture files.
- [ ] Comment preservation test: a YAML file with comments survives a structural edit.
- [ ] Parse errors return line/column info, never throw.
- [ ] Test coverage on `src/model/` ≥ 90%.

**Estimate:** 4–6 days

---

## Phase 2 — YAML Editor View

**Goal:** A working YAML editor with live parsing and error feedback. Single-view mode only.

**Work**

- Integrate CodeMirror 6 with YAML syntax highlighting.
- Wire editor → store → parser; debounce 150ms.
- Display parse errors inline (gutter marker + tooltip with message).
- Show "valid" / "invalid" status indicator.
- Zustand store holding: `{ yamlText, parsedDoc, parseError, isDirty }`.

**Exit criteria**

- [ ] User can type YAML; tree state updates in store.
- [ ] Invalid YAML shows error at correct line, last valid tree retained.
- [ ] No re-parses when text hasn't changed.
- [ ] Editor handles 1000-line documents without input lag (>30 fps typing).
- [ ] Undo/redo within editor works (CodeMirror's built-in is fine).

**Estimate:** 3–5 days

---

## Phase 3 — Mind-Map View (Read-Only)

**Goal:** Render the parsed tree as a mind-map. No editing yet.

**Work**

- Integrate React Flow.
- Custom node component: rounded rectangle, text label, hover affordances stubbed (no actions yet).
- Layout algorithm: horizontal tree (left-to-right). Use `dagre` or custom recursive layout.
- Pan/zoom/fit-to-screen built-in.
- Layout cache keyed by node `id` so positions persist across re-renders.
- Empty state: friendly illustration when document has only a root.

**Exit criteria**

- [ ] Loading a fixture YAML renders a correct mind-map.
- [ ] Pan and zoom work on mouse, trackpad, and touch.
- [ ] 500-node document renders in <500ms and pans at 60fps.
- [ ] Resizing the window does not jump existing node positions.
- [ ] Light/dark mode both look intentional (not just inverted).

**Estimate:** 5–7 days

---

## Phase 4 — Mind-Map Editing

**Goal:** All node operations available from the canvas.

**Work**

- Selection state (single-select first; multi-select deferred).
- Keyboard shortcuts: `Tab` (add child), `Enter` (add sibling), `F2` (rename), `Delete`, `Space` (collapse), `Cmd/Ctrl+0` (fit).
- Inline rename (double-click → input element overlay).
- Drag-and-drop to reparent.
- Context menu (right-click): add child, add sibling, delete, collapse, edit note.
- Undo/redo across the document state (not just text).

**Exit criteria**

- [ ] Every operation in `design.md` §6 keyboard table works.
- [ ] Drag-to-reparent updates YAML correctly.
- [ ] Undo/redo restores tree exactly (verified by deep equality test).
- [ ] No focus traps — `Esc` always returns to canvas selection.
- [ ] Manual test pass: 30-minute editing session without crash or visual glitch.

**Estimate:** 7–10 days

---

## Phase 5 — Toggle & Bidirectional Sync

**Goal:** YAML view and mind-map view are equally authoritative. Edits in either propagate.

**Work**

- Toggle button + `Cmd/Ctrl+/` shortcut.
- Split-view mode for windows ≥1200px wide.
- When mind-map edits: re-serialize YAML, replace text in CodeMirror without losing cursor position if possible.
- When YAML edits: parse, diff, apply minimal patch to tree, preserve layout for unchanged IDs.
- Parse-error tolerance: mind-map view freezes on the last valid tree, shows a subtle banner.

**Exit criteria**

- [ ] Round-trip property test: 100 random tree mutations via mind-map produce YAML that parses back to the same tree.
- [ ] Editing YAML mid-typing (incomplete syntax) never crashes the canvas.
- [ ] Split view: edits in one pane reflect in the other within 200ms.
- [ ] Comments and field ordering in the YAML survive mind-map edits where possible.
- [ ] Toggle preserves selection: if node X is selected in mind-map, switching to YAML places cursor on its line.

**Estimate:** 5–7 days

---

## Phase 6 — File I/O (Desktop)

**Goal:** Open, save, save-as, recent files, dirty-state tracking.

**Work**

- Rust commands: `open_file(path)`, `save_file(path, contents)`, `show_open_dialog()`, `show_save_dialog()`.
- Frontend storage adapter: `tauri.ts` implementing a `StorageAdapter` interface.
- Track dirty state in store; warn on close/quit if unsaved.
- Recent files menu, persisted via `tauri-plugin-store`.
- File watcher (Rust `notify` crate via Tauri): on external change, prompt "reload from disk?" if no unsaved changes, else flag conflict.
- Window title shows filename + dirty indicator.

**Exit criteria**

- [ ] Cmd+O / Cmd+S / Cmd+Shift+S work and behave like native apps.
- [ ] Closing window with unsaved changes prompts to save.
- [ ] External edit (e.g. via `vim`) reloads cleanly.
- [ ] Recent files survive app restart.
- [ ] Round-trip a 5MB YAML file in <1s.

**Estimate:** 4–6 days

---

## Phase 7 — Web Build

**Goal:** Same React app runs as a static site in the browser. No Tauri APIs called.

**Work**

- Storage adapter `web.ts`: File System Access API where supported (Chromium); file picker + download fallback (Safari/Firefox).
- IndexedDB draft buffer for auto-save.
- Build script `npm run build:web` outputs `dist-web/` static files.
- Environment detection: feature-flag adapter selection at module load.
- Service worker for offline use (optional, but small).

**Exit criteria**

- [ ] `npm run build:web` produces a static site that opens in Chrome, Safari, Firefox.
- [ ] All editing features work in browser; only file I/O paths differ.
- [ ] Browser version handles refresh: draft is restored from IndexedDB.
- [ ] Lighthouse score: Performance ≥90, Accessibility ≥95.

**Estimate:** 4–5 days

---

## Phase 8 — UI Polish & Accessibility

**Goal:** App feels deliberate and is usable by keyboard-only and screen-reader users.

**Work**

- Light/dark theme follows OS, manual override in settings.
- Settings panel (minimal: theme, font size, layout direction, auto-save toggle).
- Empty state and onboarding (one-time intro overlay).
- Window state persistence (size, position, last-open file).
- Keyboard navigation through the mind-map (arrow keys move selection across siblings/parents/children).
- ARIA roles on canvas nodes; screen-reader announces selection changes.
- Focus indicators visible at all times.

**Exit criteria**

- [ ] App is fully operable with keyboard only, no mouse needed.
- [ ] Axe accessibility scan: zero critical or serious violations.
- [ ] VoiceOver (macOS) reads node text on selection.
- [ ] Tested at 200% OS zoom — no clipping or unreadable text.
- [ ] All user-facing strings extracted to a single i18n module (even if only English ships).

**Estimate:** 5–7 days

---

## Phase 9 — Auto-Update Infrastructure

**Goal:** Desktop app checks for updates, downloads, and installs them with user consent. Mobile uses store updates (out of scope for this phase).

**Work**

- Add `tauri-plugin-updater` to project.
- Generate update signing keypair (`tauri signer generate`); store private key in CI secrets.
- Configure `tauri.conf.json` with updater endpoints and the public key.
- **Update server / hosting:** start with **GitHub Releases** as the update endpoint (Tauri supports this out of the box via a `latest.json` manifest hosted on the release).
  - On every tagged release, CI publishes platform-specific binaries + a signed `latest.json`.
- Frontend update flow:
  - On launch (after 30s) and once per 24h: call `checkUpdate()`.
  - If available: show non-modal banner "Update v1.2.3 available — release notes / install / later".
  - User-initiated check from Help menu.
  - On install: download, verify signature, install, prompt to relaunch.
- Handle failure modes: no network, corrupt download, signature mismatch (refuse install, log).
- Update channel support: `stable` and `beta` (config-only; `beta` opt-in via setting).

**Exit criteria**

- [ ] Local end-to-end test: app v1.0.0 detects, downloads, verifies, and installs v1.0.1.
- [ ] Tampered `latest.json` (wrong signature) is rejected without installing.
- [ ] Offline launch does not block startup or show errors.
- [ ] Update available banner is dismissible and re-appears on next check.
- [ ] Release notes from `latest.json` render in the banner.
- [ ] Documented runbook in `RELEASING.md` for cutting a release.

**Estimate:** 5–7 days

---

## Phase 10 — Cross-Platform Desktop Builds & Signing

**Goal:** Signed, notarized, installable builds for macOS, Windows, and Linux.

**Work**

- **macOS:** Apple Developer account, code signing certificate, notarization via `notarytool`. Build `.dmg` and `.app`.
- **Windows:** code signing certificate (EV or OV — OV is fine for v1, will trigger SmartScreen warnings until reputation builds). Build `.msi` and `.exe`.
- **Linux:** AppImage (universal), `.deb` (Debian/Ubuntu), optionally Flatpak later. No signing required for AppImage; `.deb` can be GPG-signed.
- Test on real machines (or VMs):
  - macOS: latest + one major version back.
  - Windows: 10 + 11.
  - Linux: Ubuntu LTS + Fedora (or Arch).

**Exit criteria**

- [ ] Signed macOS build passes Gatekeeper on a fresh machine (no "unidentified developer" warning).
- [ ] Notarization staple verified (`spctl --assess`).
- [ ] Signed Windows installer runs without admin prompt and SmartScreen does not block (warning acceptable until reputation builds).
- [ ] AppImage runs on Ubuntu LTS without dependency install.
- [ ] All three platforms produce binaries via the same release tag.
- [ ] Binary sizes documented; macOS bundle <30MB.

**Estimate:** 7–10 days (lots of one-time setup pain)

---

## Phase 11 — CI/CD & Release Pipeline

**Goal:** A git tag triggers signed, notarized, published releases on all desktop platforms.

**Work**

- GitHub Actions workflows:
  - PR: lint, type-check, unit tests, build smoke-test (one platform).
  - Push to main: full test suite + nightly build artifact.
  - Tag `v*`: matrix build on macOS, Windows, Linux runners; sign; notarize; publish to GitHub Releases; generate signed `latest.json`.
- Secrets: signing keys, Apple ID, notarization credentials, updater private key.
- Release script that bumps version in `package.json`, `Cargo.toml`, and `tauri.conf.json` atomically.
- Auto-generated changelog from conventional commits.

**Exit criteria**

- [ ] Tagging `v1.0.0-test` produces three signed installers + `latest.json` on a draft GitHub release.
- [ ] An older installed version, with the new release published, auto-updates successfully end-to-end.
- [ ] CI runs in <20 minutes for the full release pipeline.
- [ ] Failed signing or notarization fails the release (no half-broken artifacts published).
- [ ] Rollback procedure documented (delete release + `latest.json`).

**Estimate:** 4–6 days

---

## Phase 12 — Observability & Error Reporting

**Goal:** When something breaks in production, we know about it without users having to file bugs.

**Work**

- Crash reporting: integrate **Sentry** (or similar) for both Rust panics and JS errors.
- **Privacy-respecting by default:** opt-in telemetry, off by default. No identifiable data, no document contents ever sent.
- Local log files (Tauri's `tauri-plugin-log`) — accessible via Help → "Open log folder".
- "Report issue" menu item that pre-fills a GitHub issue with system info (no document contents).
- Error boundary in React: any render crash shows a friendly recovery screen with "report" button.

**Exit criteria**

- [ ] Forced Rust panic appears in Sentry dashboard within 1 minute (when telemetry enabled).
- [ ] Forced JS error caught by error boundary; user can recover without restarting app.
- [ ] Telemetry can be toggled off; toggling off stops all network calls (verified by network inspector).
- [ ] Privacy policy committed to repo, linked from settings.
- [ ] Logs rotate (max 10MB total disk usage).

**Estimate:** 3–4 days

---

## Phase 13 — Mobile (iOS & Android)

**Goal:** Same app on phones and tablets via Tauri v2 mobile.

**Work**

- Initialize Tauri mobile targets (`tauri ios init`, `tauri android init`).
- Touch-first gesture pass for mind-map (pinch-zoom, two-finger pan, long-press for context menu).
- Adaptive layout: split view never on mobile; toggle button always visible.
- Mobile keyboard handling for inline rename.
- Storage: app sandbox + iOS Files / Android Storage Access Framework integration.
- Auto-update on mobile is **handled by the App Store / Play Store** — disable Tauri's in-app updater on mobile builds.
- App Store / Play Store listings, screenshots, privacy declarations.

**Exit criteria**

- [ ] App runs on iOS simulator, Android emulator, and at least one real device per platform.
- [ ] Touch gestures feel comparable to native apps (subjective but tested with ≥3 users).
- [ ] No desktop-only UI elements visible on mobile (e.g., right-click menus).
- [ ] TestFlight build accepted by Apple.
- [ ] Internal-track Google Play build installed and runnable.
- [ ] Privacy nutrition labels / data safety form submitted accurately.

**Estimate:** 3–4 weeks

---

## Phase 14 — Production Hardening

**Goal:** Last-mile work to make the app safe to put in front of paying or many users.

**Work**

- **Security review** of `tauri.conf.json` capabilities — minimum necessary permissions only.
- Audit IPC commands: input validation, no path traversal, no arbitrary file reads.
- `npm audit` and `cargo audit` clean; CVE policy documented.
- Performance pass: profile a 5000-node document, fix hot spots.
- Memory leak check: 1-hour fuzz session (random edits) shows stable memory.
- Documentation:
  - User-facing: `docs/getting-started.md`, keyboard shortcuts cheat sheet.
  - Contributor-facing: `CONTRIBUTING.md`, `ARCHITECTURE.md`.
- License: pick one (MIT? Apache-2.0? Source-available?), add `LICENSE` file.
- Privacy policy + terms (even if simple).

**Exit criteria**

- [ ] Tauri capability allowlist reviewed; no `**` wildcards on filesystem unless justified.
- [ ] All `#[tauri::command]` handlers validate inputs.
- [ ] Zero high-severity findings in `npm audit` and `cargo audit`.
- [ ] 5000-node mind-map: pan stays at 60fps, edits commit in <50ms.
- [ ] Memory after 1-hour fuzz within 1.5x of starting baseline (no growing leak).
- [ ] LICENSE, README, CONTRIBUTING, CHANGELOG, privacy policy all present.

**Estimate:** 1–2 weeks

---

## Phase 15 — Launch

**Goal:** Public 1.0.0 release.

**Work**

- Tag `v1.0.0`.
- Landing page (one-pager: what it is, screenshots, download links, "open in browser").
- Submit to Hacker News / Product Hunt / niche communities (PKM, productivity, indie dev).
- Monitor crash dashboard, GitHub issues, Discord/forum.
- Prepare a v1.0.1 patch branch in advance for the inevitable launch-day bug.

**Exit criteria**

- [ ] `v1.0.0` GitHub release published with signed binaries for all desktop platforms.
- [ ] App available on App Store and Play Store (or in review).
- [ ] Web build live at the project URL.
- [ ] Auto-update from a v1.0.0-rc to v1.0.0 verified post-launch on a real machine.
- [ ] First 24 hours: monitored, no critical regressions, or hotfix shipped.

**Estimate:** 1 week of launch work + ongoing

---

## Total Time Estimate

| Phase              | Range      |
| ------------------ | ---------- |
| 0. Scaffold        | 2–4 days   |
| 1. Data model      | 4–6 days   |
| 2. YAML editor     | 3–5 days   |
| 3. Mind-map (read) | 5–7 days   |
| 4. Mind-map (edit) | 7–10 days  |
| 5. Toggle & sync   | 5–7 days   |
| 6. File I/O        | 4–6 days   |
| 7. Web build       | 4–5 days   |
| 8. Polish & a11y   | 5–7 days   |
| 9. Auto-update     | 5–7 days   |
| 10. Sign & build   | 7–10 days  |
| 11. CI/CD          | 4–6 days   |
| 12. Observability  | 3–4 days   |
| 13. Mobile         | 15–20 days |
| 14. Hardening      | 5–10 days  |
| 15. Launch         | 5+ days    |

**Desktop + web v1 (skip mobile):** ~13–17 weeks at 15 hrs/week.
**Full cross-platform v1:** ~18–22 weeks.

---

## Phase Dependencies

```
0 → 1 → 2 ─┐
         ├→ 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 14 → 15
         │                                              ↑
         └──────────────── 13 (mobile) ─────────────────┘
```

Phase 13 (mobile) can start any time after Phase 8 in parallel with the desktop release path; it must rejoin before Phase 14.

---

## Definition of "Production-Ready" (end state)

An app is production-ready when **all** of these are true:

- Signed, notarized installers for macOS, Windows, Linux.
- Web build live and stable.
- iOS and Android builds in stores (or this is explicitly deferred to v1.1).
- Auto-update working end-to-end on desktop with signature verification.
- CI publishes a release from a git tag with no manual steps.
- Crash reporting wired up; opt-in telemetry respects privacy.
- Accessibility: keyboard-only operable, screen-reader compatible.
- Performance: 5000-node maps stay smooth.
- Documented: user docs, contributor docs, license, privacy policy.
- A rollback plan exists and has been rehearsed.
