# Bundled clobmap CLI — Product Document

Status: **Proposed** — 2026-09-28. Branch: TBD.
Author: Kiran (with Claude)
Related: [`clobmap-skill-product-doc.md`](./clobmap-skill-product-doc.md) (the CLI this ships), [`../skills/clobmap/SKILL.md`](../skills/clobmap/SKILL.md) (command reference), [`../RELEASING.md`](../RELEASING.md) (release pipeline), [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

---

## 1. Summary

Ship the **clobmap CLI** (today the `skills/clobmap/` toolkit) **inside the
desktop app installer**, as a self-contained executable, so that **installing
the app is the only step** needed to get a working `clobmap` command. No
`git clone`, no `npm install`, no Node, no GitHub account.

The current CLI runs via `tsx skills/clobmap/cli.ts` and requires a repo clone
with dev dependencies. This doc proposes compiling it to a standalone binary,
bundling that binary with the Tauri app, and giving users a one-click way to put
`clobmap` on their `PATH`.

## 2. Problem / motivation

The CLI is the right way to author `.clobmap.yaml` from scripts and AI agents,
but its distribution is developer-only:

- **Non-developers** can't use it at all — cloning a repo and running `npm` is a
  non-starter.
- **Developers** can, but the ceremony (clone → `npm install` → run from repo
  root) is friction, and it couples the tool to a working Node toolchain.
- **AI agents** running on a user's machine (Claude Code, Codex, etc.) can only
  reach the CLI if the repo happens to be checked out — so the "an agent edits
  my mind maps" story doesn't work for ordinary users.

The desktop app is already downloaded, signed, and notarized on every platform.
It is the natural delivery vehicle: if the CLI rides along, everyone who has the
app has the CLI.

## 3. Goals

- **Zero-setup CLI.** After installing the app, `clobmap` works in a terminal
  with no npm/Node/GitHub — for both non-devs and devs.
- **Same behavior as the repo CLI.** Identical commands, identical output,
  identical lossless round-trip. One source of truth (the `src/model` layer).
- **Enable agents on any machine.** A locally-running AI agent can invoke
  `clobmap` against the user's documents because it's on `PATH`.
- **Signed & trusted.** The shipped binary is code-signed / notarized like the
  app, so the OS doesn't block it.
- **Self-documenting.** `clobmap --help` (and a docs command) give the full
  reference without the repo, so agents can self-discover.
- **Version parity.** The CLI version always matches the app it shipped with.

## 4. Non-goals

- **Not** reimplementing the model layer in Rust — that would fork the single
  source of truth (`src/model`). The CLI stays JS/TS, compiled.
- **Not** a background daemon, local server, or IPC bridge to the running app.
  The CLI edits files on disk; the app's existing file-watcher reflects changes.
- **Not** auto-adding to `PATH` silently — PATH changes are consented (installer
  prompt or in-app action), never done behind the user's back.
- **Not** an npm-published package (that's a separate, complementary option;
  see §13). This doc is specifically about shipping *in the app*.

## 5. Target users / scenarios

- **Non-dev, agent-driven.** A user installs clobmap, runs Claude Code / Codex
  locally, and asks it to reorganize a `.clobmap.yaml`. The agent calls
  `clobmap` (on `PATH`) — no repo, no npm.
- **Non-dev, recipe-driven.** A user pastes a couple of commands from a guide or
  a colleague; they just work.
- **Developer, quick edits.** A dev scripts bulk edits (`clobmap apply --ops …`)
  from any directory, without cloning clobmap itself.
- **Power user, automation.** Cron / CI / shell scripts that generate or mutate
  documents call the bundled binary.

## 6. Solution overview

Three pieces:

1. **Compile the CLI to a self-contained binary** — bundle `cli.ts` + its pure
   TS deps into one JS file (`esbuild`), then produce a native executable with
   an embedded JS runtime (no Node required on the target machine).
2. **Bundle the binary with the app** — declare it as a Tauri **sidecar**
   (`bundle.externalBin`) so it's signed/notarized and packaged into every
   installer, per platform.
3. **Put it on `PATH`** — the installer does it where it can (Windows, Linux
   package managers); everywhere else an in-app **"Install command-line tool"**
   menu item creates the link (the VS Code `code` pattern).

The result: `clobmap <command> <file>` runs from any terminal after install.

## 7. Architecture

```
skills/clobmap/cli.ts  ──esbuild bundle──▶  dist-cli/clobmap.mjs  (single file, all TS inlined)
                                                    │
                                       compile (embed JS runtime)
                                                    ▼
                          clobmap-<target-triple>  (native, self-contained binary)
                                                    │
                                    tauri.conf.json → bundle.externalBin
                                                    ▼
                        signed + notarized + packaged into .dmg / .msi / .exe / .deb / .rpm / .AppImage
```

- The bundle step is trivial and low-risk because the CLI imports **only pure
  TS** (`src/model`, `src/model/types`, `src/lib/notes`, `src/lib/notesFolder`)
  — no Tauri, React, or browser globals (verified 2026-09-28).
- The compiled binary is the *same code* the repo CLI runs; behavior can't
  diverge. Tests (`skills/clobmap/__tests__`) continue to gate `run(argv)`.

## 8. The compile step — options & recommendation

The binary needs an embedded JS runtime so the user needs no Node. Candidates:

| Option | Pros | Cons |
|--------|------|------|
| **Node SEA** (Single Executable App, Node 20+) | No new toolchain (Node already in CI); builds the native binary on each matrix runner; signable | API is stability-1 (experimental); on macOS the blob-injected binary must be **re-signed**; ~80–90 MB |
| **Bun** `bun build --compile` | One command; can **cross-compile** all targets from one host; smallest ergonomics | Adds Bun to CI; ~55–90 MB; newer runtime, occasional Node-API gaps |
| **Deno** `deno compile` | Single binary; good cross-compile | Adds Deno; Node-compat caveats |
| ~~`pkg`~~ | — | Archived/deprecated; avoid |

**Recommendation: Node SEA**, because the release matrix already runs
`setup-node` on each native OS, each job can emit its own signed binary, and it
adds no new toolchain. **Bun** is the fallback if SEA's signing/stability proves
painful — it cross-compiles cleanly. *(This is the main decision to confirm; see
§11.)*

Either way, the size cost (an embedded runtime) is real — see §10.

## 9. Getting it on `PATH` (per platform)

The "easy for everyone" promise lives here.

- **Windows** — the **NSIS / MSI installer adds the CLI to the per-user `PATH`**
  at install time (no admin needed). Uninstall removes it. Fully automatic.
- **Linux `.deb` / `.rpm`** — a **postinstall script symlinks** the bundled
  binary into `/usr/local/bin/clobmap` (removed on uninstall). Automatic.
- **Linux AppImage** — portable, no installer hook → covered by the in-app menu
  (below) or a printed one-liner.
- **macOS `.dmg`** — drag-install has **no postinstall hook**, so PATH is set by
  an **in-app menu item**: **⚙ → "Install `clobmap` command line tool"**, which
  symlinks the sidecar into `/usr/local/bin` (VS Code's exact pattern), plus an
  **Uninstall** counterpart. Prompts for privilege only if the target isn't
  user-writable.

The **in-app "Install command-line tool" action is the universal fallback** on
every platform, so there's always a one-click path even where the installer
can't do it.

## 10. Distribution size

Embedding a JS runtime adds **~40–90 MB** per installer (the app itself is
~10 MB). Mitigations / stances:

- Accept it as the cost of "no Node required" — it's a one-time download.
- Ship the CLI as a **separately downloadable** companion in the release assets
  too, so the size hit is opt-in for users who don't want it. *(Open question,
  §11.)*
- SEA (reuses the Node binary) tends to be leaner than bundling a second runtime.

Measure the real delta in Phase 1 before committing to defaults.

## 11. Decisions

Resolved:

- **D1 — Path A (bundle in the app).** Chosen by the user 2026-09-28 over the
  npm-package route: the goal is zero-setup for non-devs *and* devs, with no npm
  or GitHub.
- **D2 — Keep the CLI in JS/TS, compiled.** No Rust reimplementation; preserve
  the single `src/model` source of truth.
- **D3 — Consent-based PATH.** Never modify `PATH` silently; installer prompt or
  explicit in-app action.

Open (to confirm during Phase 1):

- **O1 — Compiler: Node SEA vs Bun.** Recommend SEA; revisit if signing/size is
  worse than Bun in practice.
- **O2 — Always-bundle vs optional component.** Bundle unconditionally, or make
  the CLI an optional installer component / separate asset to control size?
- **O3 — Binary name collisions.** `clobmap` on `PATH` — confirm no conflict;
  decide behavior if a different `clobmap` already exists.

## 12. Success criteria

- On a **clean machine with no Node**, installing the app and running the
  one-click PATH step yields a working `clobmap --help` in a fresh terminal, on
  macOS, Windows, and Linux.
- `clobmap` output is **byte-identical** to the repo CLI for the same inputs
  (shared test corpus).
- A locally-running agent (Claude Code / Codex) can complete a multi-step
  authoring task by calling `clobmap`, with only the app installed.
- The shipped binary passes **Gatekeeper / SmartScreen** (signed, notarized) —
  no "unidentified developer" block.
- `clobmap --version` equals the app version.

## 13. Risks & mitigations

- **Installer bloat (embedded runtime).** → Measure early (§10); consider an
  optional component (O2); prefer SEA.
- **macOS notarization of the sidecar.** The extra binary must be signed +
  notarized or it's blocked. → Fold into the existing notarization step in
  `release.yml`; verify on a clean Mac.
- **SEA stability / signing friction.** → Bun fallback (O1).
- **PATH-install privileges.** `/usr/local/bin` may need elevation. → Follow the
  VS Code pattern (write if possible, prompt only when needed); offer a manual
  one-liner as backup.
- **Version drift between app and bundled CLI.** → Build the CLI from the same
  checkout in the same release job; assert `clobmap --version == app version` in
  CI.
- **Cross-platform CLI bugs surfacing only in the binary** (paths, line
  endings). → The `cli-process.e2e.test.ts` process-level suite already spawns
  the real CLI; extend it to run against the *compiled* binary in CI.

## 14. Rollout (phased)

- **Phase 1 — Compile locally.** `npm run build:cli` (esbuild bundle → SEA/Bun
  compile). `clobmap --version` / `--help` work as a standalone binary on the
  dev's OS. Measure size. Confirm O1/O2.
- **Phase 2 — Bundle as a sidecar.** Wire `bundle.externalBin` in
  `tauri.conf.json`; build the binary per matrix target in `release.yml`; sign +
  notarize it alongside the app. Verify it runs from inside the installed bundle.
- **Phase 3 — Put it on PATH.** In-app "Install / Uninstall command-line tool"
  action (all platforms) + installer-time PATH for Windows/Linux packages.
- **Phase 4 — Self-documenting + parity.** `clobmap --help` full reference and a
  `clobmap docs` (or bundled `SKILL.md` resource); CI parity check for version;
  extend the process-e2e suite to test the compiled binary.
- **Phase 5 — Docs + release.** Update README, `skills/clobmap/README.md`,
  `getting-started.md`, and `RELEASING.md`; ship in a minor release; verify on
  clean VMs for each OS.

## 15. Out of scope

- Publishing an npm package (`npx clobmap`) — a complementary distribution that
  can be added later for the npm-native audience; not required by this doc.
- A GUI command palette / in-app scripting surface.
- MCP server (already deferred; see the skill product doc).
