# Bundled clobmap CLI — Phased Implementation Plan

Status: **Proposed** — 2026-09-28. Branch: TBD (suggest `feature/bundled-cli`).
Author: Kiran (with Claude)
Product doc: [`clobmap-cli-bundled-product-doc.md`](./clobmap-cli-bundled-product-doc.md) (the *what/why* + decisions D1–D6). All §/D-refs point there unless noted.

---

## Goal (recap)

Ship the clobmap CLI **inside the desktop app** so installing the app is the only
setup (D1). Compile the existing `skills/clobmap/` CLI to a **self-contained Node
SEA binary** (D4), bundle it as a **signed Tauri sidecar** (unconditionally, D5),
and put `clobmap` on the user's `PATH` via **installer-time hooks + a
consent-based in-app action with first-run detection** (D3, D6). Same code as the
repo CLI — one `src/model` source of truth (D2).

## Guiding architecture (read first)

### The compile pipeline

```
skills/clobmap/cli.ts
   │  esbuild --bundle --platform=node --format=cjs   (inlines all pure-TS deps)
   ▼
dist-cli/clobmap.cjs           (+ __CLOBMAP_VERSION__ injected, SKILL.md as SEA asset)
   │  node --experimental-sea-config → clobmap.blob
   │  copy node binary → postject inject blob → (macOS) codesign
   ▼
dist-cli/clobmap-<target-triple>[.exe]     (self-contained; no Node needed)
   │  staged into src-tauri/binaries/
   ▼
tauri.conf.json bundle.externalBin  →  signed + notarized + packaged per installer
   │
   ▼
in-app / installer PATH step  →  `clobmap` on the user's PATH
```

### Where it lives

| Path | Role |
|------|------|
| `scripts/build-cli.mjs` | Orchestrates bundle → SEA blob → inject → (mac) sign. |
| `sea-config.json` | Node SEA config (main, output blob, `SKILL.md` asset). |
| `dist-cli/` | Build output (git-ignored). |
| `src-tauri/binaries/clobmap-<triple>[.exe]` | Staged sidecar the Tauri bundler picks up. |
| `src-tauri/src/cli_tool.rs` | Tauri commands: `cli_status` / `cli_install` / `cli_uninstall`. |
| `src/components/…Settings…` + a first-run prompt | The consent UX (D6). |

### Non-negotiables

- **One source of truth.** The binary is built from `skills/clobmap/cli.ts`; the
  existing `run(argv)` unit + recipe + process-e2e suites keep gating behavior.
  No logic is re-implemented.
- **Signed everywhere.** The sidecar is code-signed + notarized like the app
  (macOS), or Gatekeeper/SmartScreen blocks it.
- **Consent-based PATH.** Never modified silently (D3).

### Testing strategy

- Reuse the existing `skills/clobmap/__tests__` suites unchanged (they test the
  source).
- Add a **compiled-binary e2e**: parametrize `cli-process.e2e.test.ts` with
  `CLOBMAP_BIN` so the same assertions run against the SEA binary in CI.
- Add a **version-parity** CI assertion: `clobmap --version` == app version.
- **Clean-machine smoke** (no Node) per OS before release.

---

## Phase 0 — `build:cli`: bundle + Node SEA compile (local proof)

**Goal:** turn `cli.ts` into a standalone binary on the dev's own OS.

- Add `esbuild` bundle: `skills/clobmap/cli.ts` → `dist-cli/clobmap.cjs`
  (`--bundle --platform=node --format=cjs --target=node20`). All pure-TS deps
  inline (verified: only `src/model`, `src/lib/notes*`).
- Inject version at build: `--define:__CLOBMAP_VERSION__='"<pkg.version>"'`; add
  a `--version` command to `cli.ts` reading it (declare the global for TS).
- Embed docs: add `SKILL.md` as a **SEA asset**; add a `clobmap docs` command
  that prints it via `sea.getAsset` (falls back to the on-disk file when run
  from source).
- `scripts/build-cli.mjs`: bundle → `node --experimental-sea-config sea-config.json`
  → copy `process.execPath` → `postject` inject the blob (with
  `--macho-segment-name NODE_SEA` on macOS) → macOS `codesign --remove-signature`
  then ad-hoc `codesign -s -` for local runs.
- npm scripts: `build:cli` (full), plus `typecheck` already covers `cli.ts`.

Representative `sea-config.json`:

```json
{
  "main": "dist-cli/clobmap.cjs",
  "output": "dist-cli/clobmap.blob",
  "disableExperimentalSEAWarning": true,
  "assets": { "SKILL.md": "skills/clobmap/SKILL.md" }
}
```

**DoD:** on the dev's OS, `./dist-cli/clobmap --version`, `--help`, `docs`, and a
real `new → add-child → tree` cycle all work with **no repo/node_modules
present** (test by copying the binary to `/tmp` and running there). Size delta
recorded in the product doc.

## Phase 1 — Tauri sidecar: bundle + sign + notarize

**Goal:** the signed binary ships inside every installer and runs from within the
installed app bundle.

- `tauri.conf.json` → `bundle.externalBin: ["binaries/clobmap"]`. Tauri resolves
  per target triple, so the build stages
  `src-tauri/binaries/clobmap-<triple>[.exe]`.
- In `release.yml`, before `tauri-action`, run `build:cli` **on each matrix
  runner** (native SEA per platform) and stage the binary to the triple path.
- macOS: ensure the sidecar is signed with the app identity + **hardened
  runtime**, and that notarization covers it (it's embedded in the `.app`).
  Verify `codesign -vvv` + `spctl` on the built bundle.
- Verify the CLI runs from inside the *installed* bundle (e.g. macOS
  `…/Contents/MacOS/clobmap`).

**DoD:** each platform's installer contains a working, signed `clobmap`; launched
from inside the installed app it passes `--version`; macOS `spctl`/notarization
checks pass on a clean Mac.

## Phase 2 — PATH: in-app action (all OSes) + installer-time (Win/Linux)

**Goal:** one click (or an automatic installer step) puts `clobmap` on `PATH`.

- Rust `src-tauri/src/cli_tool.rs` with `#[tauri::command]`s:
  - `cli_status() -> { installed, path, isOurs }` — probe (`which`/`where`) and
    confirm the resolved binary is ours (compare to the bundled path / a version
    handshake), covering **O3** (a foreign `clobmap` → `isOurs=false`, warn).
  - `cli_install()` — macOS/Linux: symlink the sidecar → `/usr/local/bin/clobmap`
    (write directly if permitted, else prompt for elevation via
    `osascript`/`pkexec`); Windows: copy to `%LOCALAPPDATA%\clobmap\bin` and add
    to **user** `PATH` (HKCU\Environment) + broadcast `WM_SETTINGCHANGE`.
  - `cli_uninstall()` — reverse it.
- Register the new fs/shell capabilities in `src-tauri/capabilities/default.json`
  as needed (symlink/registry ops).
- Installer-time PATH (no click needed):
  - **Windows** NSIS/WiX: add the bin dir to user `PATH` on install, remove on
    uninstall.
  - **Linux** `.deb`/`.rpm`: postinstall symlink into `/usr/local/bin`,
    postremove cleanup.
  - **macOS `.dmg` / AppImage**: no installer hook → in-app action is the path.
- Frontend: **⚙ → Settings → "Command-line tool"** section — live status from
  `cli_status`, **Install / Uninstall** buttons, and the resolved path.

**DoD:** on all three OSes, the Settings action installs/uninstalls `clobmap`
(verified in a fresh terminal); Windows/Linux package installs put it on `PATH`
automatically; a pre-existing foreign `clobmap` is detected and warned (O3).

## Phase 3 — First-run detection + consent prompt (D6)

**Goal:** zero-effort for the willing, never silent.

- On launch, call `cli_status()`. If `!installed` and the user hasn't chosen
  "don't ask again", show a **one-time dismissible prompt**:
  *"Install the `clobmap` command-line tool…?"* → **[Install now] / [Later] /
  [Don't ask again]**.
- Persist the choice in the settings store (`saveCliPromptPref` analog).
- "Install now" runs `cli_install` and confirms the path; "Later"/"Don't ask
  again" dismiss; Settings (Phase 2) remains the always-available entry point.
- Re-probe each launch so a moved/removed binary re-surfaces the offer (unless
  suppressed).

**DoD:** a fresh install shows the prompt exactly once; each choice is respected
across restarts; Settings reflects live status; nothing installs without a click.

## Phase 4 — Self-documenting, version parity, compiled-binary e2e

**Goal:** the binary is discoverable + provably correct in CI.

- `clobmap --version` prints the injected version; **CI asserts it equals the app
  version** (read `package.json`), failing the build on drift.
- `clobmap docs` prints the embedded `SKILL.md` so agents self-discover with no
  repo.
- Parametrize `cli-process.e2e.test.ts` with `CLOBMAP_BIN`; a CI job builds the
  binary and runs the same process-level assertions against it (per OS).
- Finalize **O3** behavior (detect + warn; never overwrite a foreign `clobmap`).

**DoD:** version-parity + compiled-binary e2e are green in CI on all platforms;
`--version`/`--help`/`docs` all correct.

## Phase 5 — Docs + release

**Goal:** ship it and document the new reality.

- Update `README.md` (the CLI now comes with the app — no clone needed),
  `skills/clobmap/README.md` (add the "installed with the app" path alongside the
  repo path), `docs/getting-started.md` (a "Use it from the terminal" blurb), and
  `RELEASING.md` (the new `build:cli` + sidecar + notarization steps).
- `CHANGELOG.md` [Unreleased] → Added: bundled CLI.
- Ship in a **minor release** (next `2.x.0`). Clean-VM smoke per OS: install →
  first-run prompt → `clobmap --help` in a fresh terminal.

**DoD:** released; on clean macOS/Windows/Linux machines with no Node, installing
the app yields a working `clobmap` after one click; docs updated.

---

## Testing plan (summary)

- **Unchanged:** `skills/clobmap/__tests__` (source-level unit/branch/recipe/e2e).
- **New:** compiled-binary e2e (`CLOBMAP_BIN`), version-parity CI check, macOS
  signing/notarization verification (`codesign`/`spctl`), clean-machine smoke.
- Coverage gate unaffected (the build step ships no new instrumented source).

## Risks & mitigations

- **macOS notarization of the sidecar** → fold into the existing notarize step;
  verify with `spctl` on a clean Mac (Phase 1 DoD).
- **Node SEA friction (stability-1, signing)** → Bun `--compile` fallback (D4);
  isolate all of it in `scripts/build-cli.mjs` so a swap is one file.
- **PATH elevation** → write-if-possible, prompt only when needed; Settings
  Uninstall + a documented manual one-liner as backup.
- **Version drift** → CI parity assertion (Phase 4).
- **Installer size (~+50–90 MB)** → accepted (D5); record the real delta.
- **Windows PATH propagation** → broadcast `WM_SETTINGCHANGE`; note that already-
  open terminals need a restart.

## Suggested commit / phase sequence

0. `build:cli` — esbuild bundle + SEA compile + `--version`/`docs` (local proof).
1. Tauri `externalBin` sidecar + release.yml build/sign/notarize.
2. `cli_tool.rs` commands + Settings UI + installer-time PATH (Win/Linux).
3. First-run detection + consent prompt.
4. `--version` parity CI + compiled-binary e2e + O3 finalize.
5. Docs + release.

Each phase is independently shippable-to-`main` behind the fact that nothing is
user-visible until Phase 2's Settings entry and Phase 3's prompt land.

## Out of scope (v1)

- npm-published `clobmap` (complementary; product doc §15).
- GUI command palette / in-app scripting surface.
- MCP server (deferred).
- Auto-update of the CLI independent of the app (it ships with the app; app
  update replaces it).
