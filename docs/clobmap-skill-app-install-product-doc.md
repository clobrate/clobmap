# Install the Claude Code skill from the app — Product Document

Status: **Implemented** — 2026-09-29 (decisions S1–S6 resolved). Branch: `dev/kchava/skillEasilyAvailable`.
Author: Kiran (with Claude)
Related: [`clobmap-cli-bundled-product-doc.md`](./clobmap-cli-bundled-product-doc.md) (the CLI install this extends, D3/D6/O3), [`clobmap-skill-product-doc.md`](./clobmap-skill-product-doc.md) (the skill itself), [`../skills/clobmap/SKILL.md`](../skills/clobmap/SKILL.md), [`../next-steps.md`](../next-steps.md) (step 3).

---

## 1. Summary

Extend the desktop app's existing, consent-based **Settings → Command-line
tool** flow so it can also install clobmap's **Claude Code skill** into
`~/.claude/skills/clobmap/`. One click gives a customer both the `clobmap`
command _and_ the knowledge Claude Code needs to use it — without them ever
learning what a `SKILL.md` is, cloning this repo, or typing `claude plugin …`.

## 2. Problem / motivation

Customers install a `.dmg` / `.msi` / `.deb`. Since v2.2.0 that gives them a
working `clobmap` CLI, but Claude Code doesn't know it exists:

- The skill lives in `skills/clobmap/SKILL.md` in a repo customers never clone.
- The plugin marketplace (step 2) works, but only for people who already know
  to run `claude plugin marketplace add clobrate/clobmap`. Nothing in the app
  points there.
- Without the skill, Claude either doesn't reach for `clobmap` at all or
  hand-edits `.clobmap.yaml` — the one thing SKILL.md forbids.

The app is the one clobmap surface every customer has, and it **already asks
permission to install something onto their machine** (`cli_tool.rs`). Adding
the skill to that same flow is the cheapest path to every customer.

## 3. Key fact that makes this cheap

**The skill's content already ships in every installer.** `sea-config.json`
embeds `skills/clobmap/SKILL.md` as an asset in the CLI binary (`clobmap docs`
prints it). The app doesn't need to download anything or bundle a new resource
— it only needs to _write_ that text to where Claude Code looks. And because
the text is built from the same commit as the app, the skill always matches the
CLI it describes (version parity for free).

## 4. Goals

- **One click, both pieces.** Installing the CLI from the app can also install
  the skill, in the same consent moment.
- **Never silent** (inherits D3). `~/.claude/` belongs to another product;
  nothing is written there without an explicit click.
- **Reversible.** A visible Remove button that deletes exactly what we wrote.
- **Stays current.** After an app update, an installed skill reflects the new
  CLI's commands.
- **Doesn't clobber.** A skill folder we didn't create (e.g. a developer's
  symlink to this repo) is detected and left alone (the O3 precedent).
- **Honest when Claude Code isn't there.** No writes into a `~/.claude/` the
  user doesn't have.

## 5. Non-goals

- **Not** installing or configuring Claude Code itself.
- **Not** editing Claude Code's settings, plugin registry, or any file outside
  `~/.claude/skills/clobmap/`.
- **Not** other agents (Cursor, Copilot, Codex). A skill is Claude-Code-shaped;
  the broader play is an MCP server (`clobmap-skill-product-doc.md` §11).
- **Not** Cowork / cloud sessions / routines — personal-scope skills don't load
  there. Only the Anthropic directory listing (step 4) reaches those.
- **Not** mobile (iOS has no CLI and no Claude Code).

## 6. Target users / scenarios

| Who                                                         | Today                                                                         | After                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| New customer who uses Claude Code                           | Installs app → CLI prompt → has `clobmap`, Claude doesn't know                | Same prompt offers the skill too; one click → Claude uses `clobmap`            |
| Existing customer, CLI already installed                    | Never sees the first-run prompt again (it only shows when the CLI is missing) | Settings shows a separate "Claude Code skill" row with its own Install (S4)    |
| Customer without Claude Code                                | —                                                                             | Skill option is hidden from the prompt; Settings says Claude Code wasn't found |
| Developer with a repo symlink at `~/.claude/skills/clobmap` | Works                                                                         | App detects a folder it didn't write and refuses to touch it                   |
| Someone who installed via the marketplace plugin            | Has `/clobmap:clobmap`                                                        | Settings help text says the plugin and the app skill are alternatives (S5)     |

## 7. Solution overview

### What gets written

```
~/.claude/skills/clobmap/
├── SKILL.md                  ← embedded text, byte-for-byte
└── .clobmap-install.json     ← ownership marker: {"installedBy":"clobmap","version":"2.3.0"}
```

The marker is how the app knows the folder is **ours**: we may overwrite or
remove a folder that has it, and never one that doesn't. Claude Code ignores
files a skill doesn't reference, so the marker doesn't affect the skill.

On Windows the base is `%USERPROFILE%\.claude\`.

### UX

**First-run prompt** (`CliInstallPrompt`), when Claude Code is detected:

> Install the `clobmap` command-line tool?
> Edit your maps from the terminal — handy for scripts and AI agents.
> ☑ Also teach Claude Code to use it (adds a skill to `~/.claude/skills`)
> **[Install now]** [Later] [Don't ask again]

When Claude Code isn't detected, the checkbox line isn't shown and the prompt
is unchanged.

**Settings → Command-line tool** gains a second row:

| State                   | Shown                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Claude Code not found   | "Claude Code skill — Claude Code not found on this computer." (no button)                     |
| Not installed           | "Claude Code skill — Not installed" **[Install]**                                             |
| Installed (ours)        | "Claude Code skill — Installed at ~/.claude/skills/clobmap" **[Remove]**                      |
| Folder exists, not ours | "A different `clobmap` skill is already installed at … (not created by clobmap)." (no button) |

### Staying current

On every desktop launch, if the skill folder is **ours** and the marker's
version differs from the app's, rewrite `SKILL.md` and the marker (S3). No
prompt: the user already consented to _having_ the skill; this keeps it true to
the CLI they now have. If the folder is gone, do nothing (they removed it).

### Detecting Claude Code

"Claude Code is present" = the directory `~/.claude/` exists. It's created the
first time Claude Code runs, it's exactly the directory we'd be writing into,
and it needs no process spawning. Limitation: a user who relocated it via
`CLAUDE_CONFIG_DIR` isn't detected, because GUI apps don't inherit shell
environment variables. They can still use the marketplace route.

## 8. Architecture

All of it lives next to the existing CLI installer, in Rust:

- `src-tauri/src/skill_tool.rs` (new) — `skill_status`, `skill_install`,
  `skill_uninstall`, and `skill_refresh` (launch-time). SKILL.md is compiled in
  with `include_str!("../../skills/clobmap/SKILL.md")`, the same file the SEA
  build embeds, so both come from one commit.
- Registered in `lib.rs` beside `cli_tool::*`.
- Frontend: `CliInstallPrompt.tsx` (checkbox) and `SettingsMenu.tsx`
  (`CliToolSection` gets the second row).
- CLI: a `skill` subcommand in `skills/clobmap/cli.ts` (S1), reading SKILL.md
  from the same place `clobmap docs` does.

No elevation is ever needed: everything is under the user's home directory.

## 9. Decisions

Resolved by Kiran, 2026-09-29.

- **S1 — Rust in the app, plus a CLI subcommand.** The app's Settings and
  prompt use Rust (`skill_tool.rs`, SKILL.md compiled in with `include_str!`),
  so they work in `npm run tauri dev` and need no process spawning. The CLI
  also gets `clobmap skill install | uninstall | status`, for users who want to
  do it from a terminal: Linux `.deb` users, people who'd rather not open the
  app, and scripts. It's listed in `clobmap --help` and documented in the
  READMEs. Both entry points follow the shared contract below, so either one
  recognizes and maintains what the other installed.
- **S2 — Copy + marker, all platforms.** A symlink into the app bundle breaks
  when the app moves, needs developer mode on Windows, and looks the same as a
  developer's own repo symlink.
- **S3 — Silent refresh after app updates**, only when the marker says the
  folder is ours.
- **S4 — Settings only; no extra prompt for existing users.** Settings lists
  the CLI and the skill as **independent** rows, each with its own
  Install/Remove, so a customer who already has the CLI installs the skill
  there with one click. New users still get the checkbox in the first-run
  prompt (S6).
- **S5 — Don't detect the marketplace plugin.** The Settings row's help text
  says the plugin and the app-installed skill are alternatives. Revisit if it
  causes real confusion.
- **S6 — The first-run checkbox is checked by default** when Claude Code is
  detected.

### Shared contract (Rust and CLI)

Both entry points must behave identically on these points; each side's tests
cover every row.

| Rule               | Value                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Skill folder       | `<claude dir>/skills/clobmap/`                                                                                  |
| Claude dir         | App: `~/.claude` (`%USERPROFILE%\.claude` on Windows). CLI: `$CLAUDE_CONFIG_DIR` if set, else the same default  |
| Files written      | `SKILL.md` (the text bundled with that build) and `.clobmap-install.json`                                       |
| Marker             | `{"installedBy":"clobmap","version":"<x.y.z>"}` — the same for both, so each treats the other's install as ours |
| Ours               | A real directory (not a symlink) whose marker parses and has `installedBy == "clobmap"`                         |
| Foreign            | Anything else at the path. Install and uninstall refuse with the same message, and nothing is modified          |
| Claude dir missing | Refuse; never create it                                                                                         |
| Write              | Temp sibling folder, then rename into place                                                                     |
| Uninstall          | Removes only the skill folder, only if ours; absent counts as success                                           |

The CLI reads `CLAUDE_CONFIG_DIR` because it runs in the user's shell; the app
can't, because GUI apps don't inherit shell variables. So a skill installed
into a custom config dir is only refreshed when the user re-runs
`clobmap skill install` after an update.

## 10. Success criteria

- On a machine with Claude Code, a fresh app install + **Install now** (box
  checked) leaves `~/.claude/skills/clobmap/SKILL.md` identical to the bundled
  one, and a new Claude Code session lists the `clobmap` skill.
- **Remove** deletes that folder and nothing else; Settings shows Not installed.
- A pre-existing folder without our marker (or any symlink) is never modified.
- On a machine without `~/.claude/`, nothing is written and no skill UI is
  offered.
- After updating the app to a version with a changed SKILL.md, the installed
  copy matches the new one after the next launch.

## 11. Risks & mitigations

| Risk                                                             | Mitigation                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writing into another product's directory feels invasive          | Explicit checkbox + button; exact path shown; Remove button; nothing outside `skills/clobmap/`                                                                |
| Claude Code changes where personal skills live                   | Single path constant; the marketplace route is unaffected as a fallback                                                                                       |
| Clobbering a developer's own skill                               | Marker check; refuse on any symlink or marker-less folder                                                                                                     |
| Stale skill after app update                                     | Launch-time refresh (S3)                                                                                                                                      |
| Duplicate skill with the plugin                                  | Documented as alternatives (S5)                                                                                                                               |
| App uninstall leaves the skill behind (macOS has no uninstaller) | Documented: remove from Settings first, or `rm -rf ~/.claude/skills/clobmap`. The skill is harmless without the CLI: Claude would just find `clobmap` missing |

## 12. Rollout

Ships in the next minor release, desktop only. Implementation plan:
[`clobmap-skill-app-install-implementation-plan.md`](./clobmap-skill-app-install-implementation-plan.md).
