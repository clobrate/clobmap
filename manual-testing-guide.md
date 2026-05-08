# Manual testing guide

The unit-test suite covers the pure-logic core (model, layout, navigation,
state stores). Things that depend on the DOM, native dialogs, the file
system, the auto-updater, the canvas pointer surface, or device-specific
behavior aren't unit-tested with high confidence — they're verified
manually. This document is the canonical pre-release checklist for those
surfaces.

Run on at least:
- macOS (Apple Silicon, dark + light)
- Linux (Ubuntu, GNOME, light only is fine)
- Windows 10/11 (light only is fine)
- iOS device build (iPhone via `xcrun devicectl device install app`)
- Web build at <https://clobmap.com/app>

For each release, walk every section. For patch releases, walk only the
sections that touch the changed surface (use git diff to decide).

---

## 1. App boot & cold-launch order

| # | Check | Pass criteria |
|---|---|---|
| 1.1 | Launch with no draft, no last-open file | Welcome wedding-planning seed loads. Banner with "A mind map breaks a topic into branches…" appears (first launch only). |
| 1.2 | Edit any node, force-quit (don't save), relaunch | Draft restored exactly. |
| 1.3 | Open a file, save it, quit, relaunch | The same file reopens (desktop only). |
| 1.4 | Relaunch with a file argv (`open file.clobmap.yaml` from Finder) | That file opens, takes precedence over draft / last-open. |
| 1.5 | Dismiss the welcome banner, relaunch | Banner does **not** reappear (localStorage flag). Dirty edit also auto-hides it. |

---

## 2. File menu

| # | Check | Pass criteria |
|---|---|---|
| 2.1 | File → New (`Cmd/Ctrl+N`) | Desktop: opens new tab with "Untitled" seed. Mobile: replaces active doc in place after discard prompt. |
| 2.2 | File → New tab (`Cmd/Ctrl+T`) | Desktop only — new "Untitled" tab. Hidden in iOS file menu. |
| 2.3 | File → Open (`Cmd/Ctrl+O`) | Native picker; YAML extension filter (desktop) / no filter (iOS). Picked file loads in new tab on desktop. |
| 2.4 | File → Save (`Cmd/Ctrl+S`) | Desktop: writes silently to current path. iOS: re-prompts the picker every time (security-scoped URL limitation). |
| 2.5 | File → Save As (`Cmd/Ctrl+Shift+S`) | Picker; suggested filename based on doc title; saves; tab name updates. |
| 2.6 | Recent files | Up to 10 entries in File menu's "Recent" section, most-recent first. |
| 2.7 | Auto-save toggle in ⚙ Settings (desktop only — iOS hidden) | When on, dirty doc saves after ~1s pause. Tab dirty-dot clears. |
| 2.8 | External edit detected | Edit the open file in vim, save. Desktop: prompt to reload. Mobile: no watcher (intentional). |

---

## 3. Tabs (desktop)

| # | Check | Pass criteria |
|---|---|---|
| 3.1 | Single tab open | Tab strip is hidden. |
| 3.2 | Open second tab via `Cmd+T` or File→New tab | Strip appears with both tabs. New tab is active. |
| 3.3 | Click an inactive tab | Switch happens; previous tab's snapshot preserved (re-clicking shows the same content + selection). |
| 3.4 | Edit on tab A, switch to tab B, switch back | Changes preserved on A. Undo stack still works on A. |
| 3.5 | Dirty tab: `Cmd+W` | Confirm prompt: "Discard unsaved changes?". |
| 3.6 | Close last tab | A fresh "Untitled" tab is auto-seeded — canvas isn't blank. |
| 3.7 | Close active middle-of-strip tab | Switches to the right neighbor. If none, left. |
| 3.8 | Open file via File→Open while active tab is empty Untitled | Replaces in place (no new-tab cruft). |
| 3.9 | Open file while active tab has content | Spawns a new tab. |

---

## 4. Mind-map canvas — pointer & keyboard

| # | Check | Pass criteria |
|---|---|---|
| 4.1 | Click a node | Selection ring appears (emerald). Single click does NOT enter edit mode. |
| 4.2 | Double-click a node | Inline rename input opens, focused, selection across the existing text. |
| 4.3 | `F2` on selected node | Same as double-click. |
| 4.4 | `Tab` on selected node | New child appears, auto-renaming, canvas pans to keep it visible. Soft keyboard pops on iOS. Zoom level preserved. |
| 4.5 | `Enter` on selected node (not root) | New sibling, auto-renaming. Same pan + zoom-preserve behavior. |
| 4.6 | `Enter` on root | No-op (root can't have a sibling). |
| 4.7 | Arrow keys (`↑↓` siblings, `←` parent, `→` first child) | Selection moves; canvas smoothly pans (~150 ms) to keep target visible; zoom level preserved. |
| 4.8 | `→` on a collapsed node | Auto-expands then moves into first child. |
| 4.9 | `Space` on a node with children | Toggles collapse/expand. Hidden-descendants count badge appears next to chevron when collapsed. |
| 4.10 | `Delete` / `Backspace` on a non-root node | Removes node + descendants. Selection clears. |
| 4.11 | `Delete` / `Backspace` on root | No-op (root protected). |
| 4.12 | `Cmd+0` | Fit to view. |
| 4.13 | `Cmd+Z` / `Cmd+Shift+Z` | Undo / redo. Each tab has independent history. |
| 4.14 | Click chevron on a node | Toggles collapse/expand without selecting/dragging. |
| 4.15 | Drag node onto another node | Reparents (illegal drops snap back). |
| 4.16 | `Cmd+X` then `Cmd+V` on target | Cut/paste subtree (long-range reparent). Source dims while in clipboard. |
| 4.17 | `Esc` | Cancels rename / clears clipboard / closes context menu (clean states only). |
| 4.18 | Right-click | Context menu opens at cursor with full action set. |
| 4.19 | Wheel scroll | Pan. Pinch / Cmd+wheel zooms. |

---

## 5. Inline rename

| # | Check | Pass criteria |
|---|---|---|
| 5.1 | Single-line rename | `Enter` commits. `Esc` cancels. |
| 5.2 | Multi-line: type `Shift+Enter` mid-text | Inserts a newline; textarea auto-grows up to node's maxHeight. |
| 5.3 | Type past maxWidth | Wraps inside the node (no horizontal overflow). |
| 5.4 | Type past maxHeight | Textarea scrolls within the node — node itself doesn't grow past max. |
| 5.5 | Click outside input | Commits and closes. |
| 5.6 | Brand-new node (after Tab/Enter) | Input is focused with text pre-selected on first paint, no extra click required. |

---

## 6. Notes popup

The popup is the largest manual-test surface. Walk every row.

### 6.1 Open / close

| # | Check | Pass criteria |
|---|---|---|
| 6.1.1 | Press `N` on selected node | Popup opens, textarea focused. |
| 6.1.2 | Right-click → Edit notes… | Same. |
| 6.1.3 | Click notepad icon (only visible on nodes with existing notes) | Same. |
| 6.1.4 | `Cmd+N` while notes popup open | Does **not** open a new file. (Popup short-circuits the global Cmd+N handler.) |
| 6.1.5 | Cmd+T / Cmd+W while popup open | Does **not** open / close tabs. |
| 6.1.6 | Press `Space` while typing in popup | Inserts a space — does not toggle node collapse. |

### 6.2 Edit / preview modes

| # | Check | Pass criteria |
|---|---|---|
| 6.2.1 | Default mode | Edit (full-pane textarea). |
| 6.2.2 | Click "Preview" button | Switches to full-pane rendered Markdown. |
| 6.2.3 | Click "Edit" from preview | Returns to edit at the same cursor + scroll position you left from. |
| 6.2.4 | Double-click anywhere in preview | Switches to edit mode and places caret near the clicked text (heuristic — last ~30 chars matched in source). |
| 6.2.5 | Markdown rendering | `# H1`, `## H2`, `**bold**`, `*italic*`, `` `code` ``, ```` ``` ```` code blocks, `- bullets`, `1. numbers`, `[links](url)`, `> blockquotes`, `---` rules all render correctly with scoped CSS. |
| 6.2.6 | `#Heading` (no space after #) | Renders as literal text — that's CommonMark spec. |
| 6.2.7 | Read-only sidecar (iOS / web with path-ref) | Opens in preview only; toggle hidden; Save button disabled; explanatory message visible. |

### 6.3 Auto-save & accidental-close

| # | Check | Pass criteria |
|---|---|---|
| 6.3.1 | Type something | Footer shows "Unsaved changes" (amber). |
| 6.3.2 | Stop typing for 1 s | "Saving…" briefly, then "Saved automatically" (emerald). Popup stays open. |
| 6.3.3 | Click backdrop while dirty | **Nothing happens** (popup persists). |
| 6.3.4 | Press Esc while dirty | **Nothing happens** (popup persists). |
| 6.3.5 | Wait for auto-save → click backdrop | Popup closes. |
| 6.3.6 | Cmd+Enter | Saves and closes regardless of dirty state. |
| 6.3.7 | Cancel button | Closes regardless of dirty state (explicit user intent). |

### 6.4 Resize

| # | Check | Pass criteria |
|---|---|---|
| 6.4.1 | Drag bottom-right corner | Popup resizes smoothly. Min ~20% of viewport, max ~80%. |
| 6.4.2 | Close + reopen | Last resized dimensions restored. |
| 6.4.3 | Resize browser window narrower | Popup clamps to new viewport bounds. |

### 6.5 Font-size controls

| # | Check | Pass criteria |
|---|---|---|
| 6.5.1 | Click `A+` button | Both edit textarea and preview text get larger. |
| 6.5.2 | Click `A−` | Both shrink. |
| 6.5.3 | Click the number badge | Resets to 14. |
| 6.5.4 | `Cmd+=` / `Cmd++` | Larger; browser viewport zoom does NOT trigger. |
| 6.5.5 | `Cmd+-` | Smaller. |
| 6.5.6 | `Cmd+0` | Reset to 14. |
| 6.5.7 | Close + reopen | Last font size restored. |

### 6.6 Inline ↔ sidecar transition (desktop)

| # | Check | Pass criteria |
|---|---|---|
| 6.6.1 | Save 200-char inline note | YAML's `notes:` field contains the literal text. |
| 6.6.2 | Save 1500-char inline note | Above 800 chars: clobmap auto-extracts to `./.<docBase>_<nodeId>_<safeText>.md`, replaces YAML field with that path. The .md file exists on disk next to the doc (hidden, filename starts with `.`). |
| 6.6.3 | Reopen the popup on that node | Loads the sidecar content correctly. |
| 6.6.4 | Manually paste path `./shared.md` into YAML, save | Multiple nodes pointing at the same path. Open one, edit, save → both nodes "see" the new content. (Last-write-wins; documented.) |
| 6.6.5 | Browser / iOS over 800 chars | Save button disabled with "Over limit — install desktop for sidecar files" hint. |

### 6.7 Notepad indicator icon

| # | Check | Pass criteria |
|---|---|---|
| 6.7.1 | Node with no notes | No icon. |
| 6.7.2 | Node with non-empty notes | Small notepad SVG visible at the right edge of the node. |
| 6.7.3 | Empty / whitespace-only notes string | Treated as no-notes; icon hidden. |
| 6.7.4 | Click the icon | Opens the popup for that node. Stops propagation (does not also fire node click). |

---

## 7. Export (File → Export)

PNG/SVG/PDF require the Mind-map view to be visible (those menu items are
disabled in YAML-only view with a tooltip). Markdown works in any view.

| # | Check | Pass criteria |
|---|---|---|
| 7.1 | Export → PNG | 2048-px-wide PNG, retina-sharp, full map captured (not just visible viewport). React Flow chrome (controls, minimap, dotted background) excluded from the image. Theme background applied. |
| 7.2 | Export → SVG | Vector, scales infinitely. Open in browser; zoom in — text stays crisp. |
| 7.3 | Export → PDF | Single page sized to map's aspect ratio. Image fills the page. |
| 7.4 | Export → Markdown outline | `# Title` then nested bullet list matching tree shape. Notes (if any) appear as blockquotes under their node. |
| 7.5 | Export with a 5000-node fixture | All four formats complete in <10 s; PNG file <5 MB; PDF reasonable size. |
| 7.6 | iOS export | Document picker opens; user picks location; file written. |
| 7.7 | Web export | Triggers a browser download (no native dialog). |

---

## 8. Settings menu (⚙)

| # | Check | Pass criteria |
|---|---|---|
| 8.1 | Theme: System / Light / Dark | Applies immediately; persists across launches. |
| 8.2 | Font size slider (10–24) | Applies to YAML editor; persists. |
| 8.3 | Auto-save toggle | Hidden on iOS. On desktop, actually fires saves. |
| 8.4 | Telemetry toggle (only when `VITE_SENTRY_DSN` is set) | Off by default. Enabling it loads Sentry SDK. |
| 8.5 | Check for updates | Tauri only. Polls GitHub Releases. Shows update banner if newer; "Up to date" otherwise (briefly). |
| 8.6 | Open log folder | Tauri desktop only. Opens the app's log directory in Finder/Explorer. |
| 8.7 | Privacy notice link | Opens PRIVACY.md in browser via shell:allow-open scope. |
| 8.8 | Report an issue | Opens prefilled GitHub issue template. |

---

## 9. View modes & split

| # | Check | Pass criteria |
|---|---|---|
| 9.1 | Toggle (`Cmd+/`) cycles | YAML → Split → Mind-map → YAML (mobile: only YAML and Mind-map). |
| 9.2 | Split orientation in Settings | Horizontal / vertical; persists. |
| 9.3 | Drag splitter | Resizes; ratio clamps to 0.2–0.8; persists. |
| 9.4 | Edit YAML, see mind-map update | Debounced ~150 ms after last keystroke. Inline parse error doesn't crash the canvas; last-good tree stays rendered. |
| 9.5 | Select node in canvas, switch to YAML | CodeMirror cursor jumps to that node's line. |

---

## 10. iOS-specific (run on the iPhone build)

| # | Check | Pass criteria |
|---|---|---|
| 10.1 | First launch | Loads bundled welcome doc — no Local Network permission prompt for self-contained .ipa. |
| 10.2 | Long-press a node | Context menu appears (~500 ms hold; 12 px movement tolerance). |
| 10.3 | Long-press → Add child | Soft keyboard auto-pops on the new node's rename input. |
| 10.4 | Tap a node | Selects (single tap doesn't enter edit). |
| 10.5 | Double-tap a node | Enters rename. |
| 10.6 | Pinch | Zooms the mind-map. Does not zoom the page (viewport-fit=cover, user-scalable=no). |
| 10.7 | Two-finger pan | Pans the canvas. |
| 10.8 | Save As → iCloud Drive | Document picker opens; file lands in iCloud Drive. |
| 10.9 | File → Save (after Save As) | Re-prompts the picker (security-scoped URLs). Documented limitation. |
| 10.10 | Auto-save toggle | Not visible in Settings (correctly hidden on iOS). |
| 10.11 | Notes popup | Opens; long-press on node → context menu → Edit notes…; keyboard pops auto. |
| 10.12 | Notes — sidecar path-ref | Read-only with explanatory message ("Sidecar notes files aren't accessible on iOS builds yet."). |
| 10.13 | Header Dynamic Island clearance | App content respects safe area top. |
| 10.14 | Home-indicator clearance | App content respects safe area bottom. |
| 10.15 | "clobmap" wordmark hidden | At iPhone width — only File menu + view toggle + ⚙. |

---

## 11. Auto-update (desktop)

The updater can only be smoke-tested across two real releases. After
shipping a new version:

| # | Check | Pass criteria |
|---|---|---|
| 11.1 | Existing N-1 install, default 24 h scheduled poll | Within 24 h of new release publish, banner appears. |
| 11.2 | Manual ⚙ → Check for updates with new release published | Banner appears immediately. |
| 11.3 | "Up to date" path (no new release) | Status indicator shows briefly, then idle. |
| 11.4 | Click Install & Relaunch | Downloads the platform-specific update bundle, verifies minisign signature against embedded pubkey, applies, app relaunches at new version. |
| 11.5 | "Later" button | Banner dismisses; reappears at next scheduled check. |

---

## 12. Updater signature failure path

Hard to trigger without a deliberate setup. To validate before a release:

| # | Check | Pass criteria |
|---|---|---|
| 12.1 | Manually corrupt the `.sig` file in the GitHub release assets | Updater banner refuses to install; reports verification error. |
| 12.2 | Restore correct signature | Next check succeeds. |

---

## 13. Web-specific (clobmap.com/app)

| # | Check | Pass criteria |
|---|---|---|
| 13.1 | First visit clobmap.com/ | Landing page (no JS) loads in <500 ms. |
| 13.2 | "Open in browser" button | Navigates to clobmap.com/app — SPA loads. |
| 13.3 | File → Open | If browser supports File System Access API (Chromium), uses native picker. Safari / Firefox: falls back to `<input type="file">`. |
| 13.4 | File → Save | FSA: writes back to the same handle. Otherwise: triggers a download. |
| 13.5 | Refresh after edits | Draft persists (localStorage). |
| 13.6 | Open from `/app/` direct URL | SPA loads; landing not shown. |
| 13.7 | CSP behavior | DevTools network tab shows no CSP violations. |

---

## 14. Performance (any platform)

Generate a large fixture: `node scripts/gen-large-doc.mjs 5000 /tmp/big.clobmap.yaml`.

| # | Check | Pass criteria |
|---|---|---|
| 14.1 | Open `/tmp/big.clobmap.yaml` | First paint <1 s; no UI freeze. |
| 14.2 | Pan around with arrow keys | Smooth — feels >40 fps. (`onlyRenderVisibleElements` keeps DOM bounded.) |
| 14.3 | Add a child via Tab | Edit cycle <100 ms perceived (model layer alone is ~26 ms; React Flow render adds the rest). |
| 14.4 | Undo / redo | Same. |
| 14.5 | Memory after 30 min of mixed editing | No unbounded growth (run in DevTools Memory tab; record snapshots before/after). |
| 14.6 | Switch to YAML view on the 5k doc | CodeMirror loads the 500 KB file; scrolling is smooth. |

---

## 15. Cross-platform smoke-test matrix

For every release, run §1, §2, §4 (subset), §6 on:

- [ ] macOS arm64 (signed installer)
- [ ] macOS x86_64 (signed installer)
- [ ] Windows x64 (.msi or .exe)
- [ ] Linux x64 (.deb or .AppImage)
- [ ] iOS device (signed via personal team for sideload)
- [ ] clobmap.com/app on Chromium (Chrome / Edge)
- [ ] clobmap.com/app on Safari (macOS, iOS)
- [ ] clobmap.com/app on Firefox

For patch releases scoped to one surface, only that row is required.

---

## What's excluded from manual testing

- The pure model layer (parse / serialize / apply / ops / diff /
  navigation / layout / tabs store / document store / UI store) is
  unit-tested at >95% line coverage in `src/**/__tests__/`. Bug there
  should manifest as a failing CI test, not in manual testing.
- The notes pure helpers (`isPathReference`,
  `suggestedSidecarFilename`) are also unit-tested.
- The 5000-node generated fixture exercises the model layer's perf
  characteristics (`PERF=1 npx vitest run src/model/__tests__/perf.test.ts`).

---

## Updating this guide

When you add a feature:
1. Decide what's confidently unit-testable (extract pure helpers if
   needed) and add tests.
2. Add a manual-test row here for what isn't.
3. Cross-reference it from the PR description.
