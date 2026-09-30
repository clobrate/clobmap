# Next steps — getting the clobmap skill to actual users

Captured 2026-09-28. Open question: our customers install a `.dmg`; they never
clone this repo, so nothing today tells them `skills/clobmap/SKILL.md` exists or
puts it anywhere Claude Code looks.

## State of play

- **v2.2.1 is released** and fixes the macOS CLI crash (missing `allow-jit`
  entitlement under the hardened runtime). Verified against the published
  `.dmg`: `clobmap --help` runs, `spctl` reports `Notarized Developer ID`.
- **The skill is installed on Kiran's machine only**, as a symlink:
  `~/.claude/skills/clobmap` → `skills/clobmap/`. Symlinked skill folders are an
  officially supported pattern. Remove with `rm ~/.claude/skills/clobmap`.
  This does nothing for anyone else.
- **Update 2026-09-29:** steps 1–3 below are done on
  `dev/kchava/skillEasilyAvailable` — the repo is a plugin marketplace, and the
  app / `clobmap skill install` can install the skill. Step 4 is what's left.

## How skill distribution actually works

A bare `SKILL.md` is a file, not a package — it has no distribution story.
Distribution happens through **plugins**. Claude Code's discovery locations:

| Route | Reach | Updates |
| --- | --- | --- |
| `~/.claude/skills/<name>/` | One machine | Manual |
| `<repo>/.claude/skills/<name>/` | People who clone *that repo* | `git pull` |
| **Own marketplace** — git repo with `.claude-plugin/marketplace.json` | Anyone who can clone the repo | `claude plugin update`, or auto-update (off by default) |
| **Anthropic's directory** — submit at `claude.ai/directory/manage` | claude.ai, Cowork, *and* Claude Code via account sync (loads as `<name>@synced`) | Automatic once a version is published |

The repo route is the one that doesn't fit us — customers don't clone. The
directory route needs a paid claude.ai plan plus a review pass.

## Our advantage

The app **already asks permission to install something onto the user's
machine**. `src-tauri/src/cli_tool.rs` has the whole apparatus: `cli_status`,
`cli_install`, `cli_uninstall`, foreign-binary detection, and the
`ensure_replaceable` guard that refuses to clobber a non-symlink `clobmap`.

So the highest-leverage move is to extend **Settings → Command-line tool** to
also write `~/.claude/skills/clobmap/`. One click installs both the command and
the skill. The customer never needs to learn what a SKILL.md is — which answers
"how do they find out about it": they don't have to. The docs call this
"ship a plugin with your own tool".

## Plan, in order

1. ✅ **Done.** **Fix the SKILL.md examples.** Prerequisite, cheap, do this first. Nearly all
   ~20 examples use `npm run clobmap -- …` (the repo form), which is broken for
   anyone who never clones. The "Running it" section (line ~35) documents the
   PATH form but every example contradicts it. Lead with bare `clobmap …`.
2. ✅ **Done.** **Add a marketplace to this repo** — `.claude-plugin/marketplace.json` plus a
   `plugin.json`. Close to free, since `skills/clobmap/` already exists. Buys two
   README lines:
   ```bash
   claude plugin marketplace add clobrate/clobmap
   claude plugin install clobmap@clobmap
   ```
   Worth doing even alongside step 3 — it's the path for people who want the
   skill without installing a desktop app. Validate with
   `claude plugin validate --strict .`.
3. **Wire the app installer to drop the skill.** The real UX win and the most
   work: needs consent, an uninstall path, and a "Claude Code isn't installed"
   case. Deserves its own product doc + implementation plan before any code.
   ✅ **Done** — see
   [`docs/clobmap-skill-app-install-product-doc.md`](./docs/clobmap-skill-app-install-product-doc.md)
   and its implementation plan. Manual pass (`manual-testing-guide.md` §20)
   still pending.
4. **Submit to Anthropic's directory** once 1–3 are solid. Requires a paid
   claude.ai plan and a GitHub repo holding the plugin.

## Caveats to decide on before committing

- **`~/.claude/` belongs to another product.** Writing there must be
  consent-based and reversible, exactly like the PATH install already is — never
  a silent side effect of installing the app. The existing flow is the right
  precedent to copy.
- **Personal-scope skills don't load in Cowork or cloud sessions**, routines
  included. Step 3 alone leaves that gap; only a directory listing or a
  committed project skill closes it.
- **A skill is Claude-Code-shaped.** It does nothing for Cursor, Copilot, or
  other agents. [`docs/clobmap-skill-product-doc.md`](./docs/clobmap-skill-product-doc.md)
  §11 already flags an **MCP server** as the broader distribution play (deferred,
  and it wraps the same core we've built). That's the route that reaches more
  clients — worth revisiting against step 4.
- **Naming snag.** Frontmatter is `name: clobmap`, and plugin skills are
  namespaced `/<plugin>:<skill>` — a plugin also named `clobmap` yields
  `/clobmap:clobmap`. Pick distinct names *now*: plugin names are effectively
  permanent, and a rename orphans every existing install unless migrated via a
  `renames` map in the marketplace file.

## Also noticed, unrelated

`RELEASING.md`'s sanity checks say to expect `xcrun stapler validate` to pass on
the `.dmg`. It doesn't — tauri-action staples the `.app`, not the disk image.
Gatekeeper accepts the app either way (`source=Notarized Developer ID`), so this
is a doc bug, not a shipping problem. Pre-existing, not introduced by v2.2.1.
