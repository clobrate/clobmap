# Clobmap — Brainstorming Notes

Session date: 2026-05-04

## Project Goal

Build a cross-platform mind-mapping app that runs on **iOS, macOS, browser, Android, Windows, and Linux**.

Key requirements:
- Minimalistic interface
- Toggle between **YAML** and **mind-map** representations of the same content

---

## Q1: What stack should I use?

**Recommendation:** Flutter or Tauri + a web frontend.

- **Flutter** — best native feel + single codebase across all six targets, but you write Dart.
- **Tauri + web frontend** — stay in TypeScript/React, ship a tiny binary; iOS/Android support is newer and rougher.

**Data model suggestion for the YAML ↔ mind-map toggle:**
Make YAML the source of truth (a tree of nodes with `children:`) and render the mind-map as a view over it. Edits in either mode round-trip through the same data structure.

---

## Q2: Tell me more about Flutter vs Tauri + web frontend

### Flutter

**History**
- Built by Google, announced 2015, stable 1.0 in late 2018.
- Originally mobile-only (iOS/Android), expanded to web (2021), then Windows/macOS/Linux desktop (2022).
- Uses **Dart** (also Google) and its own rendering engine (Skia, now Impeller).
- Does *not* use native UI widgets — it paints pixels itself.

**Adoption**
- Large. Used by Google Pay, BMW, Alibaba, Toyota's infotainment, eBay Motors, Nubank.
- ~170k GitHub stars. Strong package ecosystem on pub.dev.
- Probably the most-used cross-platform mobile framework after React Native.

**Future outlook**
- Mixed signals. Google laid off part of the Flutter team in 2024, spooking the community.
- Community fork (**Flock**) emerged as insurance.
- Google still ships it in Fuchsia and uses it internally.
- Realistically: not going anywhere soon, but no longer Google's flagship bet.

**Support model**
- Google-led, open source (BSD).
- Stable release channel, well-documented, official plugins for VS Code and Android Studio.
- Commercial support via third parties (Very Good Ventures, Invertase).

### Tauri + Web Frontend

**History**
- Started 2019–2020 as a lightweight Electron alternative.
- v1.0 released June 2022.
- **v2.0 released October 2024** — added iOS and Android support.
- Backend is **Rust**; frontend is any web stack (React, Svelte, Vue, vanilla).
- Uses the OS's native webview (WebKit on Apple, WebView2 on Windows, WebKitGTK on Linux) instead of bundling Chromium → binaries are ~3–10 MB vs Electron's ~100 MB+.

**Adoption**
- Smaller but growing fast. ~85k GitHub stars.
- Used by 1Password's CLI tooling, Cloudflare's warp-diag, various indie/dev-tool apps.
- Strong traction in Rust and indie-dev communities.
- Mobile adoption still early — most production Tauri apps are desktop-only.

**Future outlook**
- Trending up.
- Backed by the **Tauri Foundation** (under the Commons Conservancy, similar to Blender).
- Funded partly by NLnet and CrabNebula (a commercial company spun out by core maintainers).
- Main risk: webview inconsistency across platforms — Safari's WebKit lags Chromium on some web APIs, so you'll occasionally hit "works on Windows, broken on macOS" issues.

**Support model**
- Community + foundation governance, MIT/Apache.
- CrabNebula offers paid support, signing/notarization services, CI/CD product (CrabNebula Cloud).
- Not tied to a single mega-corp — model similar to Blender or Godot.

### Quick comparison

| | Flutter | Tauri + Web |
|---|---|---|
| Language | Dart | Rust + JS/TS |
| UI | Custom-rendered | Native webview |
| Binary size | 15–40 MB | 3–10 MB |
| Mobile maturity | Excellent | New (v2, late 2024) |
| Desktop maturity | Good | Excellent |
| Web target | Yes (heavy) | Web is the source |
| Hot reload | Excellent | Good (Vite etc.) |
| Hiring pool | Dart-only | Any web dev |
| Governance risk | Google priorities | Foundation, smaller team |

### Read for this use case (mind-mapping app)

A mind-mapping app is **rendering-heavy** (many nodes, lines, drag/zoom/pan). Both stacks can do it, but:

- **Flutter** — pixel-perfect control and identical behavior everywhere; great for a custom canvas with smooth gestures.
- **Tauri + web** — mature web libraries (React Flow, D3, tldraw engine) already solve the hard parts of mind-map rendering. Likely faster to ship.

**If you want to leverage existing JS graph/canvas libraries → Tauri + web is the faster path.**
**If you want the most polished mobile experience and don't mind Dart → Flutter.**

---

## Q3: Ramp-up time for both?

Assumes a competent developer new to both stacks. Numbers are calendar weeks at ~10–15 hrs/week before shipping real features confidently.

### Flutter

- **Time to "hello world":** hours
- **Time to productive:** 3–6 weeks
- **Time to fluent:** 3–6 months

**What you have to learn:**
- **Dart** (1–2 weeks) — easy if you know Java/TypeScript/Swift. Not a real obstacle.
- **Widget tree mental model** (2–3 weeks) — the actual ramp-up. Everything is a widget. Stateless vs stateful, `BuildContext`, `build()` re-running on every change.
- **State management** (1–2 weeks) — no canonical answer. Provider, Riverpod, Bloc, GetX. Most teams land on Riverpod or Bloc. Decision fatigue is real.
- **Layout system** (ongoing) — `Row`/`Column`/`Expanded`/`Flex` are powerful but error-prone. "Unbounded height" errors are a rite of passage.
- **Platform channels** (only if needed) — Kotlin/Swift glue. Rarely needed for a mind-map app.

**Friction:**
- Tooling is good but heavy (Android Studio + emulators eat RAM).
- iOS builds require a Mac and Xcode.
- Hot reload is genuinely excellent.

### Tauri + Web Frontend

- **Time to "hello world":** hours
- **Time to productive:** 1–4 weeks (if you know web) / 8–12 weeks (if you don't)
- **Time to fluent:** 2–4 months

**What you have to learn (already know React/TS):**
- **Tauri's Rust glue** (3–7 days) — `invoke()` from JS, `#[tauri::command]` to expose functions, v2 capability/permission system (stricter than v1).
- **Just enough Rust** (1–2 weeks) — for a mind-map app, Rust side is mostly file I/O, YAML parsing (`serde_yaml`), maybe sync. Can mostly copy-paste from Tauri docs.
- **Bundling/signing per platform** (~1 week of scattered pain) — code signing on macOS, notarization, Windows installers, AppImage on Linux.
- **Webview quirks** (ongoing) — Safari WebKit on iOS/macOS occasionally differs from Chromium on Windows/Linux.

**Worst case (no web background):** add 4–8 weeks for React/TypeScript fundamentals.

**Friction:**
- Mobile (v2) docs still thin — reading GitHub issues, not polished tutorials.
- Rust cold compile is slow (5–10 min), fast incrementally.
- IPC boundary is async-only; designing the JS↔Rust contract takes thought.

### Side-by-side

| | Flutter | Tauri + Web |
|---|---|---|
| Prerequisites | None really | Web stack helpful |
| New language | Dart (easy) | Rust (hard, but minimal exposure) |
| First working build | Hours | Hours |
| Ship something usable | 3–6 weeks | 1–4 weeks (with web bg) |
| Fluent | 3–6 months | 2–4 months |
| Steepest part | Widget tree + state mgmt | Rust + bundling per platform |
| Docs | Excellent | Good (mobile thin) |
| Hot reload | Best in class | Good (Vite + Rust restart) |

### Honest take

- **Already know React/TS** → Tauri ramps faster. Thin Rust wrapper + web code you already know.
- **Starting fresh on both** → Flutter is more *self-contained*. One language, one framework, one set of docs.
- **Native mobile background (Swift/Kotlin)** → Flutter feels familiar faster than expected.

---

## Open Decisions

- [ ] Pick stack (Flutter vs Tauri + web)
- [ ] Confirm YAML schema for nodes (id, text, children, metadata?)
- [ ] Decide on canvas/graph library (if Tauri: React Flow, tldraw, D3, custom?)
- [ ] Decide on storage model (local files? sync? cloud?)
- [ ] Decide on minimum platform set for v1 (e.g. ship web + macOS first, mobile later?)
