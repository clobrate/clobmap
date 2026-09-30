//! "Claude Code skill" — copy clobmap's SKILL.md into `~/.claude/skills/clobmap/`
//! so Claude Code knows how to drive the `clobmap` CLI.
//!
//! Consent-based (S3/S6 in docs/clobmap-skill-app-install-product-doc.md): the
//! frontend calls these; nothing runs on its own. Follows the shared contract in
//! that doc's §9, which `clobmap skill …` implements too — keep them in step.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

/// The skill text, from the same commit as the CLI it describes (the SEA build
/// embeds this same file), so the installed skill always matches the CLI.
const SKILL_MD: &str = include_str!("../../skills/clobmap/SKILL.md");
/// Ownership marker written next to SKILL.md. A folder is ours iff it has one.
const MARKER: &str = ".clobmap-install.json";
/// Shared with the CLI, so each recognizes the other's install as ours.
const INSTALLED_BY: &str = "clobmap";
const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(serde::Serialize)]
pub struct SkillStatus {
    /// `~/.claude` exists, i.e. Claude Code has run on this machine.
    claude_detected: bool,
    /// Something exists at the skill folder (ours or not).
    installed: bool,
    /// ...and it's a folder we wrote (marker present and valid).
    is_ours: bool,
    /// The skill folder, for display.
    path: String,
    /// The app version that wrote it, when ours.
    version: Option<String>,
}

#[derive(serde::Deserialize)]
struct Marker {
    #[serde(rename = "installedBy")]
    installed_by: String,
    version: String,
}

#[derive(Debug, PartialEq)]
enum Ownership {
    Absent,
    Ours { version: String },
    Foreign,
}

fn home_dir() -> Result<PathBuf, String> {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| format!("{var} is not set."))
}

fn claude_dir(home: &Path) -> PathBuf {
    home.join(".claude")
}

fn skill_dir(home: &Path) -> PathBuf {
    claude_dir(home).join("skills").join("clobmap")
}

/// Ours = a real directory (not a symlink) holding a marker we wrote. Anything
/// else at the path is foreign — including a developer's symlink to the repo.
fn ownership(dir: &Path) -> Ownership {
    let meta = match fs::symlink_metadata(dir) {
        Ok(m) => m,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ownership::Absent,
        Err(_) => return Ownership::Foreign, // can't inspect it → don't touch it
    };
    if !meta.is_dir() {
        return Ownership::Foreign; // a symlink or a plain file
    }
    let marker = fs::read_to_string(dir.join(MARKER))
        .ok()
        .and_then(|s| serde_json::from_str::<Marker>(&s).ok());
    match marker {
        Some(m) if m.installed_by == INSTALLED_BY => Ownership::Ours { version: m.version },
        _ => Ownership::Foreign,
    }
}

fn foreign_error(dir: &Path) -> String {
    format!(
        "A different 'clobmap' skill already exists at {} (not created by clobmap). Remove it first, then retry.",
        dir.display()
    )
}

fn status_in(home: &Path) -> SkillStatus {
    let dir = skill_dir(home);
    let own = ownership(&dir);
    SkillStatus {
        claude_detected: claude_dir(home).is_dir(),
        installed: own != Ownership::Absent,
        is_ours: matches!(own, Ownership::Ours { .. }),
        path: dir.display().to_string(),
        version: match own {
            Ownership::Ours { version } => Some(version),
            _ => None,
        },
    }
}

/// Write SKILL.md + marker into a temp sibling, then swap it into place, so
/// Claude Code never reads a half-written skill.
fn install_in(home: &Path) -> Result<String, String> {
    install_with(home, &|from, to| fs::rename(from, to))
}

/// `install_in` with the rename step injectable, so tests can make the swap
/// fail part-way and check the rollback.
fn install_with(
    home: &Path,
    rename: &dyn Fn(&Path, &Path) -> std::io::Result<()>,
) -> Result<String, String> {
    let claude = claude_dir(home);
    if !claude.is_dir() {
        return Err(format!(
            "Claude Code wasn't found on this computer (no {}).",
            claude.display()
        ));
    }
    let dir = skill_dir(home);
    let own = ownership(&dir);
    if own == Ownership::Foreign {
        return Err(foreign_error(&dir));
    }
    let skills = dir.parent().expect("skill dir has a parent");
    fs::create_dir_all(skills).map_err(|e| e.to_string())?;

    let pid = std::process::id();
    let tmp = skills.join(format!(".clobmap.tmp-{pid}"));
    let _ = fs::remove_dir_all(&tmp);
    let write = || -> std::io::Result<()> {
        fs::create_dir(&tmp)?;
        fs::write(tmp.join("SKILL.md"), SKILL_MD)?;
        let marker = serde_json::json!({ "installedBy": INSTALLED_BY, "version": VERSION });
        fs::write(tmp.join(MARKER), format!("{marker}\n"))?;
        Ok(())
    };
    if let Err(e) = write() {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e.to_string());
    }

    // Renaming a directory over an existing one fails on Windows, so move the
    // old copy aside first, then drop it once the new one is in place.
    let old = skills.join(format!(".clobmap.old-{pid}"));
    let had_ours = matches!(own, Ownership::Ours { .. });
    if had_ours {
        let _ = fs::remove_dir_all(&old);
        if let Err(e) = rename(&dir, &old) {
            let _ = fs::remove_dir_all(&tmp);
            return Err(e.to_string());
        }
    }
    if let Err(e) = rename(&tmp, &dir) {
        if had_ours {
            let _ = rename(&old, &dir); // put the previous copy back
        }
        let _ = fs::remove_dir_all(&tmp);
        return Err(e.to_string());
    }
    let _ = fs::remove_dir_all(&old);
    Ok(dir.display().to_string())
}

fn uninstall_in(home: &Path) -> Result<(), String> {
    let dir = skill_dir(home);
    match ownership(&dir) {
        Ownership::Absent => Ok(()),
        Ownership::Foreign => Err(foreign_error(&dir)),
        Ownership::Ours { .. } => fs::remove_dir_all(&dir).map_err(|e| e.to_string()),
    }
}

/// S3: after an app update, bring a skill we installed up to this version's
/// SKILL.md, so it keeps matching the CLI. Only ever touches our own folder;
/// a missing folder means the user removed it, so it stays removed.
/// Returns whether anything was rewritten.
fn refresh_in(home: &Path) -> Result<bool, String> {
    match ownership(&skill_dir(home)) {
        Ownership::Ours { version } if version != VERSION => install_in(home).map(|_| true),
        _ => Ok(false),
    }
}

/// Launch-time entry point (desktop `setup`). Never surfaces errors to the
/// user — they didn't ask for anything just now — only logs them.
pub fn refresh_on_launch() {
    match home_dir().and_then(|home| refresh_in(&home)) {
        Ok(true) => log::info!("Refreshed Claude Code skill to {VERSION}"),
        Ok(false) => {}
        Err(e) => log::warn!("Couldn't refresh Claude Code skill: {e}"),
    }
}

#[tauri::command]
pub fn skill_status() -> Result<SkillStatus, String> {
    Ok(status_in(&home_dir()?))
}

#[tauri::command]
pub fn skill_install() -> Result<String, String> {
    install_in(&home_dir()?)
}

#[tauri::command]
pub fn skill_uninstall() -> Result<(), String> {
    uninstall_in(&home_dir()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh fake home; `with_claude` creates `~/.claude` in it.
    fn home(tag: &str, with_claude: bool) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("clob-skill-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        if with_claude {
            fs::create_dir(dir.join(".claude")).unwrap();
        }
        dir
    }

    fn write_marker(dir: &Path, body: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(MARKER), body).unwrap();
    }

    #[test]
    fn ownership_absent_ours_and_foreign() {
        let h = home("own", true);
        let dir = skill_dir(&h);
        assert_eq!(ownership(&dir), Ownership::Absent);

        write_marker(&dir, r#"{"installedBy":"clobmap","version":"1.0.0"}"#);
        assert_eq!(
            ownership(&dir),
            Ownership::Ours {
                version: "1.0.0".into()
            }
        );

        write_marker(&dir, r#"{"installedBy":"someone-else","version":"1.0.0"}"#);
        assert_eq!(ownership(&dir), Ownership::Foreign, "wrong installedBy");

        write_marker(&dir, "not json");
        assert_eq!(ownership(&dir), Ownership::Foreign, "garbage marker");

        fs::remove_file(dir.join(MARKER)).unwrap();
        assert_eq!(
            ownership(&dir),
            Ownership::Foreign,
            "folder without a marker"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_is_foreign_even_to_a_marked_folder() {
        let h = home("link", true);
        let real = h.join("repo-skill");
        write_marker(&real, r#"{"installedBy":"clobmap","version":"1.0.0"}"#);
        let dir = skill_dir(&h);
        fs::create_dir_all(dir.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&real, &dir).unwrap();
        assert_eq!(ownership(&dir), Ownership::Foreign);
        assert!(install_in(&h).is_err());
        assert!(uninstall_in(&h).is_err());
        assert!(real.join(MARKER).exists(), "the link target is untouched");
    }

    #[test]
    fn install_writes_skill_and_marker_creating_skills_dir() {
        let h = home("install", true);
        let path = install_in(&h).unwrap();
        let dir = skill_dir(&h);
        assert_eq!(path, dir.display().to_string());
        assert_eq!(fs::read_to_string(dir.join("SKILL.md")).unwrap(), SKILL_MD);
        assert_eq!(
            ownership(&dir),
            Ownership::Ours {
                version: VERSION.into()
            }
        );
        let leftovers: Vec<_> = fs::read_dir(dir.parent().unwrap())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(
            leftovers,
            vec![std::ffi::OsString::from("clobmap")],
            "no temp dirs left"
        );
    }

    #[test]
    fn install_refuses_without_claude_and_creates_nothing() {
        let h = home("noclaude", false);
        let err = install_in(&h).unwrap_err();
        assert!(err.contains("Claude Code wasn't found"), "{err}");
        assert!(!claude_dir(&h).exists(), "never creates ~/.claude");
    }

    #[test]
    fn install_is_idempotent_and_replaces_an_older_copy_of_ours() {
        let h = home("again", true);
        let dir = skill_dir(&h);
        write_marker(&dir, r#"{"installedBy":"clobmap","version":"0.0.1"}"#);
        fs::write(dir.join("SKILL.md"), "stale").unwrap();
        fs::write(dir.join("extra.txt"), "old file").unwrap();

        install_in(&h).unwrap();
        install_in(&h).unwrap();
        assert_eq!(fs::read_to_string(dir.join("SKILL.md")).unwrap(), SKILL_MD);
        assert!(
            !dir.join("extra.txt").exists(),
            "the old copy is replaced whole"
        );
        assert_eq!(
            ownership(&dir),
            Ownership::Ours {
                version: VERSION.into()
            }
        );
    }

    #[test]
    fn install_and_uninstall_refuse_a_foreign_folder_and_leave_it_alone() {
        let h = home("foreign", true);
        let dir = skill_dir(&h);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("SKILL.md"), "someone else's").unwrap();

        let err = install_in(&h).unwrap_err();
        assert!(err.contains("not created by clobmap"), "{err}");
        assert!(uninstall_in(&h).is_err());
        assert_eq!(
            fs::read_to_string(dir.join("SKILL.md")).unwrap(),
            "someone else's"
        );
    }

    #[test]
    fn uninstall_removes_only_our_folder() {
        let h = home("uninstall", true);
        install_in(&h).unwrap();
        let sibling = claude_dir(&h).join("skills").join("other");
        fs::create_dir_all(&sibling).unwrap();

        uninstall_in(&h).unwrap();
        assert!(!skill_dir(&h).exists());
        assert!(sibling.exists(), "other skills untouched");
        uninstall_in(&h).unwrap(); // absent counts as success
    }

    #[test]
    fn status_reports_each_state() {
        let h = home("status", false);
        let s = status_in(&h);
        assert!(!s.claude_detected && !s.installed && !s.is_ours);

        fs::create_dir(claude_dir(&h)).unwrap();
        assert!(status_in(&h).claude_detected);

        install_in(&h).unwrap();
        let s = status_in(&h);
        assert!(s.installed && s.is_ours);
        assert_eq!(s.version.as_deref(), Some(VERSION));
        assert_eq!(s.path, skill_dir(&h).display().to_string());

        fs::remove_file(skill_dir(&h).join(MARKER)).unwrap();
        let s = status_in(&h);
        assert!(s.installed && !s.is_ours && s.version.is_none());
    }

    /// A rename that fails on call number `fail_on` (1-based) and otherwise
    /// renames for real.
    fn failing_rename(fail_on: usize) -> impl Fn(&Path, &Path) -> std::io::Result<()> {
        let calls = std::cell::Cell::new(0);
        move |from, to| {
            calls.set(calls.get() + 1);
            if calls.get() == fail_on {
                Err(std::io::Error::other("injected rename failure"))
            } else {
                fs::rename(from, to)
            }
        }
    }

    fn entries(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn failed_final_swap_restores_the_previous_copy() {
        let h = home("swap-fail", true);
        let dir = skill_dir(&h);
        write_marker(&dir, r#"{"installedBy":"clobmap","version":"0.0.1"}"#);
        fs::write(dir.join("SKILL.md"), "old skill").unwrap();

        // Call 1 (current copy → .old) succeeds; call 2 (temp → skill dir) fails.
        let err = install_with(&h, &failing_rename(2)).unwrap_err();
        assert!(err.contains("injected"), "{err}");
        assert_eq!(
            fs::read_to_string(dir.join("SKILL.md")).unwrap(),
            "old skill"
        );
        assert_eq!(
            ownership(&dir),
            Ownership::Ours {
                version: "0.0.1".into()
            }
        );
        assert_eq!(
            entries(dir.parent().unwrap()),
            vec!["clobmap"],
            "no temp/old dirs left"
        );
    }

    #[test]
    fn failed_move_aside_leaves_the_current_copy_and_no_temp_dir() {
        let h = home("aside-fail", true);
        let dir = skill_dir(&h);
        write_marker(&dir, r#"{"installedBy":"clobmap","version":"0.0.1"}"#);
        fs::write(dir.join("SKILL.md"), "old skill").unwrap();

        assert!(install_with(&h, &failing_rename(1)).is_err());
        assert_eq!(
            fs::read_to_string(dir.join("SKILL.md")).unwrap(),
            "old skill"
        );
        assert_eq!(entries(dir.parent().unwrap()), vec!["clobmap"]);
    }

    #[test]
    fn failed_first_install_leaves_nothing_behind() {
        let h = home("first-fail", true);
        assert!(install_with(&h, &failing_rename(1)).is_err());
        assert_eq!(
            entries(&claude_dir(&h).join("skills")),
            Vec::<String>::new()
        );
    }

    /// Make `dir` unreadable/unwritable for the test's duration. Returns false
    /// when permissions aren't enforced (e.g. running as root), so the caller
    /// can skip rather than assert on behavior it can't provoke.
    #[cfg(unix)]
    fn lock(dir: &Path) -> bool {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o000)).unwrap();
        fs::read_dir(dir).is_err()
    }

    #[cfg(unix)]
    fn unlock(dir: &Path) {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_path_it_cannot_inspect_is_foreign() {
        let h = home("eacces", true);
        let skills = claude_dir(&h).join("skills");
        fs::create_dir_all(&skills).unwrap();
        if !lock(&skills) {
            unlock(&skills);
            return; // permissions not enforced here
        }
        let own = ownership(&skills.join("clobmap"));
        let install = install_in(&h);
        unlock(&skills);
        assert_eq!(own, Ownership::Foreign);
        assert!(install.unwrap_err().contains("not created by clobmap"));
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_write_cleans_up_its_temp_dir() {
        use std::os::unix::fs::PermissionsExt;
        let h = home("write-fail", true);
        let skills = claude_dir(&h).join("skills");
        fs::create_dir_all(&skills).unwrap();
        // Read + execute but no write: the skill path can be inspected (absent),
        // but creating the temp dir fails.
        fs::set_permissions(&skills, fs::Permissions::from_mode(0o555)).unwrap();
        if fs::create_dir(skills.join("probe")).is_ok() {
            unlock(&skills);
            return; // permissions not enforced here
        }
        let result = install_in(&h);
        unlock(&skills);
        assert!(result.is_err());
        assert_eq!(entries(&skills), Vec::<String>::new());
    }

    /// Cross-check with the CLI (`skills/clobmap/skill-install.ts`): both parse
    /// the same committed marker and write byte-identical marker text, so each
    /// treats the other's install as ours.
    #[test]
    fn marker_matches_the_cli_contract() {
        let fixture = include_str!("../../skills/clobmap/__tests__/fixtures/skill-marker.json");
        let h = home("fixture", true);
        let dir = skill_dir(&h);
        write_marker(&dir, fixture);
        assert_eq!(
            ownership(&dir),
            Ownership::Ours {
                version: "1.2.3".into()
            }
        );

        install_in(&h).unwrap();
        assert_eq!(
            fs::read_to_string(dir.join(MARKER)).unwrap(),
            fixture.replace("1.2.3", VERSION),
            "same bytes the CLI's markerText() writes"
        );
    }

    #[test]
    fn refresh_rewrites_an_older_copy_of_ours() {
        let h = home("refresh-old", true);
        let dir = skill_dir(&h);
        write_marker(&dir, r#"{"installedBy":"clobmap","version":"0.0.1"}"#);
        fs::write(dir.join("SKILL.md"), "stale").unwrap();

        assert_eq!(refresh_in(&h), Ok(true));
        assert_eq!(fs::read_to_string(dir.join("SKILL.md")).unwrap(), SKILL_MD);
        assert_eq!(
            ownership(&dir),
            Ownership::Ours {
                version: VERSION.into()
            }
        );
    }

    #[test]
    fn refresh_leaves_a_current_copy_untouched() {
        let h = home("refresh-same", true);
        install_in(&h).unwrap();
        let skill = skill_dir(&h).join("SKILL.md");
        fs::write(&skill, "edited, same version").unwrap();

        assert_eq!(refresh_in(&h), Ok(false));
        assert_eq!(
            fs::read_to_string(&skill).unwrap(),
            "edited, same version",
            "same version → no rewrite"
        );
    }

    #[test]
    fn refresh_never_touches_absent_or_foreign() {
        let h = home("refresh-foreign", true);
        assert_eq!(refresh_in(&h), Ok(false));
        assert!(!skill_dir(&h).exists(), "a removed skill stays removed");

        let dir = skill_dir(&h);
        write_marker(&dir, r#"{"installedBy":"someone-else","version":"0.0.1"}"#);
        fs::write(dir.join("SKILL.md"), "theirs").unwrap();
        assert_eq!(refresh_in(&h), Ok(false));
        assert_eq!(fs::read_to_string(dir.join("SKILL.md")).unwrap(), "theirs");
    }

    #[test]
    fn refresh_without_claude_dir_is_a_no_op() {
        let h = home("refresh-noclaude", false);
        assert_eq!(refresh_in(&h), Ok(false));
        assert!(!claude_dir(&h).exists());
    }
}
