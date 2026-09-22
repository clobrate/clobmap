# Functional test automation — brainstorming

The manual testing guide ([`manual-testing-guide.md`](./manual-testing-guide.md))
covers ~250 checks across 16 sections. This doc captures options for
automating most of those, what each tool buys, and what to do first.

Three layers matter here, each covering a different chunk of the guide.

---

## Layer 1 — Component tests (React Testing Library + jsdom)

**What it catches:** anything that lives entirely in the browser DOM and
doesn't need real navigation, file dialogs, or the canvas pointer surface.
Mounts a single React component in a fake DOM, drives it via `userEvent`,
asserts on the rendered tree.

| Manual section | Coverage |
|---|---|
| §5 Inline rename | ✅ all checks |
| §6 Notes popup | ✅ ~80% (everything except sidecar file I/O) |
| §6.7 Notepad icon states | ✅ all |
| §16 Layout-mode toggle | ✅ the Settings UI parts |
| §8 Settings menu items | ✅ all |
| §9 View toggle | ✅ all |

**Tools:** `@testing-library/react`, `@testing-library/user-event`,
`happy-dom` (or `jsdom`). Already Vitest-compatible — wires into our
existing test suite.

**Cost:** ~half a day to set up the harness; tests are quick to write
afterward (10–30 LOC each).

---

## Layer 2 — Browser end-to-end (Playwright)

**What it catches:** full SPA behavior in a real browser. Boots the
production web build (`dist-web/`) on a localhost server, drives it via
Chromium / Firefox / WebKit. Real DOM, real layout, real keyboard/mouse,
real `localStorage`, real File System Access API (where supported). Has
built-in trace recording, screenshots, and video — debugging is much
easier than RTL when something goes wrong on a flow that spans many
components.

| Manual section | Coverage |
|---|---|
| §1 App boot order | ✅ |
| §2 File menu | ✅ (web build paths — Chromium FSA, fallback download) |
| §3 Tabs | ✅ |
| §4 Mind-map canvas pointer + keyboard | ✅ |
| §5 Inline rename | ✅ (better than RTL because real Tab/Enter timing) |
| §6 Notes popup | ✅ (without sidecar I/O) |
| §7 Export | ✅ Markdown definitely; PNG/SVG/PDF as "file gets downloaded" assertions |
| §9 View modes & split | ✅ |
| §13 Web-specific | ✅ |
| §16 Layout mode | ✅ including drag-to-reposition + auto-switch |

This is the **highest-ROI single tool** — it covers the bulk of the
guide.

**Cost:** ~1 day for setup (Playwright config, CI matrix, dev server
fixture, helpers for our recurring patterns like "select node n5");
afterward each manual check converts to ~10–40 LOC.

---

## Layer 3 — Native desktop / iOS

**What it catches:** the Tauri-specific surface that web E2E can't
reach.

| Manual section | Tooling |
|---|---|
| §2 native file dialogs (open/save) | WebDriverIO + `tauri-driver` |
| §8 Open log folder | Same |
| §11 Auto-update banner + Install & Relaunch | Same — but real updater needs two real releases |
| §12 Signature failure path | Same |
| §10 iOS-specific | Maestro (cross-platform, recommended over XCUITest for indie scope) or XCUITest if you want pure-Apple |
| §15 Cross-platform smoke matrix | Combination |

**Cost:** Significant. Tauri-driver setup + a CI matrix that boots the
full native app on macOS / Windows / Linux runners is real engineering
work — call it 3–5 days total. iOS is its own project on top of that.

**Honest take: defer this layer.** The web E2E already exercises the
same React tree that the desktop app renders; bugs in the Rust shell are
rare and easy to manual-check.

---

## Recommended order

**Week 1:** Playwright for the web build. ~70% of the manual guide goes
from "Kiran clicks through it before each release" to "CI catches
regressions on every push." Single CI runner (Linux), Chromium for the
bulk + Firefox/WebKit for breadth on critical flows.

**Week 2 (or backfill as you touch components):** RTL tests for the
popup-heavy components — NotesPopup auto-save guard, font-controls,
edit/preview toggle, modal escape rules. These are too fiddly to test in
Playwright (lots of internal state) and they're where clobmap takes the
most regressions today.

**Future (when iOS volume justifies it):** Maestro for iOS happy-path.
Skip Tauri-driver unless you ship enough updater bugs to justify the
setup.

---

## What automation will *not* catch

These remain manual on release day no matter what:

- **Visual aesthetics** — icon design, color contrast, font choice.
  Needs human eyes or visual-regression tooling like Percy / Chromatic.
- **Real auto-update across two real releases** — the updater plugin's
  HTTPS + minisign chain only works when the GitHub Release is actually
  published with the right assets. You'd need a "test release" channel
  to gate this in CI.
- **Performance feel** — `pan stays at 60fps` is hard to assert
  deterministically. Lighthouse CI gives a number but doesn't catch
  perceived jank.
- **iOS-specific gestures** — long-press timing, soft-keyboard
  behavior. Maestro can fake them but not perfectly.

---

## Concrete next step

Pull-the-thread starting move: **add Playwright + a single smoke test
that boots the web build, opens the welcome doc, adds a child via Tab,
saves, reopens, asserts the child is there.** Once that runs in CI, the
rest is incremental — convert one manual section per PR.

Suggested initial scaffolding:

```
clobmap/
├── e2e/
│   ├── playwright.config.ts
│   ├── helpers/
│   │   ├── fixtures.ts          # web-build dev-server fixture
│   │   └── mindmap.ts           # selectNode(id), addChild(label), …
│   └── tests/
│       ├── smoke.spec.ts        # 5-step happy path
│       ├── tabs.spec.ts         # §3
│       ├── canvas.spec.ts       # §4
│       └── notes-popup.spec.ts  # §6
```

CI: a single `playwright` job in `.github/workflows/ci.yml`, gated on
`npm run build:web` succeeding (so we test the same artifact users get).

---

## What's worth deciding before starting

- **Headed vs headless.** Headless on CI for speed, headed locally for
  debugging. Playwright supports both with the same suite.
- **Visual regression?** Percy / Chromatic / Playwright snapshots? Not
  needed for v1; revisit if visual bugs become a recurring pattern.
- **Test selectors strategy.** Use `data-testid` attributes on
  long-lived nodes (TabStrip, MindMapNode, NotesPopup buttons), or rely
  on accessible roles + names? Accessible-roles approach is more
  robust to refactors but takes more thought per test. Recommend
  starting with `data-testid` and migrating where useful.
- **CI parallelism.** Playwright can shard tests across runners. For
  v1, single shard is fine; revisit if total runtime exceeds ~5 min.
