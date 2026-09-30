# Install the Claude Code skill from the app — Phased Implementation Plan

Status: **Implemented** — 2026-09-29 (Phases 1–6; manual pass per `manual-testing-guide.md` §20 pending). Branch: `dev/kchava/skillEasilyAvailable`.
Author: Kiran (with Claude)
Product doc: [`clobmap-skill-app-install-product-doc.md`](./clobmap-skill-app-install-product-doc.md) (the _what/why_, decisions S1–S6, and the **shared contract** in §9). All S-refs point there.

---

## Goal (recap)

Let clobmap write its `SKILL.md` into `~/.claude/skills/clobmap/` with explicit
consent, from the app (Settings row + first-run checkbox) or from the terminal
(`clobmap skill install`). Remove it on request, keep it current after app
updates, and never touch a skill folder clobmap didn't create.

## Guiding architecture (read first)

### Where it lives

| Path                                    | Role                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `src-tauri/src/skill_tool.rs` (new)     | `skill_status` / `skill_install` / `skill_uninstall` / `skill_refresh` |
| `src-tauri/src/lib.rs`                  | Register the commands beside `cli_tool::*`; call refresh from `setup`  |
| `skills/clobmap/skill-install.ts` (new) | CLI-side status/install/uninstall, same contract                       |
| `skills/clobmap/cli.ts`                 | `skill` subcommand dispatch + `--help` lines                           |
| `src/components/SettingsMenu.tsx`       | Independent "Claude Code skill" row in `CliToolSection` (S4)           |
| `src/components/CliInstallPrompt.tsx`   | "Also teach Claude Code" checkbox (S6)                                 |

### Status shape (both sides)

```rust
pub struct SkillStatus {
    claude_detected: bool,   // the Claude dir is a directory
    installed: bool,         // <claude dir>/skills/clobmap exists (any kind)
    is_ours: bool,           // real dir + marker with installedBy == "clobmap"
    path: String,            // for display
    version: Option<String>, // marker version when ours
}
```

The CLI's `clobmap skill status --json` prints the same fields, camelCased.

### Non-negotiables

- **One contract, two implementations.** Product doc §9's table is the spec.
  Both test suites cover every row of it, so Rust and TypeScript can't drift
  apart unnoticed.
- **Never write without an explicit action**, except the launch-time refresh of
  a folder that is already ours (S3).
- **Write nothing outside `<claude dir>/skills/clobmap/`.** Create `skills/` if
  missing; never create the Claude dir itself.
- **Atomic replace.** Temp sibling folder, then rename, so Claude Code never
  reads a half-written SKILL.md.

### Testing strategy

Rust unit tests with the home directory injected (functions take `home: &Path`;
the `#[tauri::command]` wrappers pass the real one), in the scratch-dir style of
`cli_tool.rs`. Vitest for the CLI side, with a temp dir as `CLAUDE_CONFIG_DIR`,
next to the existing `skills/clobmap/__tests__` suites. Vitest for the Settings
row and prompt, with `invoke` mocked like `CliInstallPrompt.test.tsx`. One
cross-check test: a folder written by each side is recognized as ours by the
other (commit a fixture marker and assert both parsers accept it).

---

## Phase 1 — `skill_tool.rs`: status, install, uninstall

- `const SKILL_MD: &str = include_str!("../../skills/clobmap/SKILL.md");`
- Marker `.clobmap-install.json`:
  `{"installedBy":"clobmap","version":"<CARGO_PKG_VERSION>"}`.
- `home_dir()`: `HOME` on unix, `USERPROFILE` on Windows. Check whether `dirs`
  is already in the dependency tree before adding it.
- `ownership(dir) -> Absent | Ours{version} | Foreign`: a symlink is Foreign;
  a directory without a parseable, matching marker is Foreign.
- `install(home)`: require `~/.claude` → refuse if Foreign → write `SKILL.md` +
  marker to `skills/.clobmap.tmp-<pid>/` → remove any old ours-dir → rename.
- `uninstall(home)`: Absent → Ok; Foreign → Err; Ours → `remove_dir_all`.

**Tests:** absent / ours / foreign (dir without marker, symlink, garbage
marker, wrong `installedBy`); install into a missing `skills/`; refuse when
`~/.claude` is missing; install twice is idempotent; uninstall removes only that
folder; written SKILL.md equals `SKILL_MD` byte-for-byte.

**DoD:** `cargo test` green; commands callable from devtools in `tauri dev`.

## Phase 2 — Launch-time refresh (S3)

- `skill_refresh(home)`: if Ours and marker version != `CARGO_PKG_VERSION`,
  re-run the install write. Absent/Foreign → no-op. Errors are logged, never
  shown.
- Call once from Tauri `setup` (desktop only), off the main thread.

**Tests:** older-version ours → rewritten; same version → untouched (mtime
unchanged); foreign/absent → untouched.

## Phase 3 — CLI subcommand (S1)

```
clobmap skill status [--json]
clobmap skill install [--json]
clobmap skill uninstall [--json]
```

- `skill-install.ts` implements the same contract. SKILL.md text comes from the
  same source as `docsText()` (SEA asset, or the file in a repo checkout);
  version from `__CLOBMAP_VERSION__` (or `package.json` under `tsx`).
- Claude dir = `$CLAUDE_CONFIG_DIR` if set, else `~/.claude`.
- Human output names the exact path, e.g.
  `Installed Claude Code skill → /Users/me/.claude/skills/clobmap`. Errors use
  the same wording as the app. Exit 1 on refusal.
- `--help`: add a "Claude Code" group listing the three commands.
- `skill` isn't a document command (no `<file>` argument), so dispatch it
  before file-argument parsing, like `docs`.

**Tests:** every contract row via `run(argv)` with a temp `CLAUDE_CONFIG_DIR`;
`--help` lists `skill`; the cross-check fixture; the compiled-binary e2e
(`CLOBMAP_BIN`) runs `skill status --json`.

## Phase 4 — Settings row (S4, S5)

- `CliToolSection` fetches `skill_status` alongside `cli_status` and renders the
  skill as an **independent row** with its own Install / Remove, in the four
  states from product doc §7. It works whether or not the CLI is installed.
- Help text: "Lets Claude Code use the clobmap command. Same as the
  `clobmap@clobmap` plugin — install one or the other."

**Tests:** one Vitest case per state; Install and Remove call the right command
and refresh status; the skill row works with the CLI not installed.

## Phase 5 — First-run prompt checkbox (S6)

- `CliInstallPrompt` also fetches `skill_status`. If `claude_detected` and the
  skill isn't installed, show the checkbox, checked by default. **Install now**
  runs `cli_install`, then `skill_install` if checked. Report each result
  separately; a skill failure must not hide a CLI success.
- Unchanged when Claude Code isn't detected.

**Tests:** checkbox hidden without Claude; checked → both commands; unchecked
→ only `cli_install`; a skill error still shows the CLI success.

## Phase 6 — Docs + release

- `README.md` (Headless CLI → Use it from Claude Code): three routes — app
  Settings, `clobmap skill install`, the marketplace plugin — and that they're
  alternatives.
- `skills/clobmap/README.md`: the `skill` subcommand.
- `skills/clobmap/SKILL.md` command reference: add `skill status|install|uninstall`.
- `docs/manual-testing-guide.md`: product doc §10 as manual steps on macOS and
  Windows, including a machine without `~/.claude`.
- `CHANGELOG.md` entry; mark step 3 done in `next-steps.md`.

## Testing plan (summary)

| Layer      | What                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust unit  | Contract rows, refresh, against a scratch home                                                                                                                                                                    |
| Vitest CLI | Contract rows via `run(argv)`; `--help`; cross-check fixture                                                                                                                                                      |
| Vitest UI  | Settings row states; prompt checkbox                                                                                                                                                                              |
| Manual     | Fresh macOS + Windows install, with and without Claude Code; a dev symlink at the path is refused by both app and CLI; updating from an older build refreshes the copy; a new Claude Code session lists the skill |

## Suggested commit sequence

1. `feat(skill): skill_tool.rs with status/install/uninstall + tests` (Phase 1)
2. `feat(skill): refresh installed skill after app update` (Phase 2)
3. `feat(cli): clobmap skill status|install|uninstall` (Phase 3)
4. `feat(settings): Claude Code skill row` (Phase 4)
5. `feat(onboarding): offer the skill in the CLI install prompt` (Phase 5)
6. `docs: installing the Claude Code skill` (Phase 6)

## Out of scope (v1)

Detecting the marketplace plugin (S5); a one-time prompt for existing CLI users
(S4); the app honoring `CLAUDE_CONFIG_DIR`; cleanup on app uninstall; mobile.
