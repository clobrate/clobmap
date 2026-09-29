//! "Install command-line tool" — put the bundled `clobmap` CLI (shipped as a
//! Tauri sidecar next to the app binary) onto the user's PATH, VS Code style.
//!
//! Consent-based (D3/D6): the frontend calls these; nothing runs on its own.
//! Native `std`/`osascript`/PowerShell only — no shell-plugin capability.

use std::path::{Path, PathBuf};

#[derive(serde::Serialize)]
pub struct CliStatus {
    /// A `clobmap` resolves on the user's PATH.
    installed: bool,
    /// ...and it resolves to OUR bundled sidecar (vs a foreign `clobmap`, O3).
    is_ours: bool,
    /// The PATH entry found (if any).
    path: Option<String>,
    /// Our bundled sidecar path (None in dev, where there's no bundle).
    target: Option<String>,
}

/// The bundled sidecar: Tauri places `externalBin` next to the app executable,
/// named `clobmap-cli` (triple suffix stripped). It's exposed on PATH as the
/// `clobmap` command via a symlink/copy — the crate itself is named `clobmap`,
/// so the sidecar can't share that name.
fn sidecar_path() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let name = if cfg!(windows) { "clobmap-cli.exe" } else { "clobmap-cli" };
    let p = dir.join(name);
    p.exists().then_some(p)
}

/// The on-PATH command name. On Linux the GUI binary is already `/usr/bin/clobmap`,
/// so the CLI is exposed as `clobmap-cli` to avoid shadowing the app launcher;
/// on macOS/Windows the GUI binary isn't on PATH, so the CLI is plain `clobmap`.
fn command_name() -> &'static str {
    if cfg!(target_os = "linux") {
        if cfg!(windows) {
            "clobmap-cli.exe"
        } else {
            "clobmap-cli"
        }
    } else if cfg!(windows) {
        "clobmap.exe"
    } else {
        "clobmap"
    }
}

/// First `name` found as a file across the given PATH value (pure/testable).
fn find_in_paths(path_var: Option<std::ffi::OsString>, name: &str) -> Option<PathBuf> {
    let path = path_var?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|c| c.is_file())
}

/// First matching command found on the process PATH.
fn which_on_path() -> Option<PathBuf> {
    find_in_paths(std::env::var_os("PATH"), command_name())
}

/// True iff both resolve (through symlinks) to the same file.
fn same_file(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

#[tauri::command]
pub fn cli_status() -> CliStatus {
    let target = sidecar_path();
    let found = which_on_path();
    let is_ours = match (&found, &target) {
        (Some(f), Some(t)) => same_file(f, t),
        _ => false,
    };
    CliStatus {
        installed: found.is_some(),
        is_ours,
        path: found.map(|p| p.display().to_string()),
        target: target.map(|p| p.display().to_string()),
    }
}

#[tauri::command]
pub fn cli_install() -> Result<String, String> {
    let target =
        sidecar_path().ok_or_else(|| "Bundled clobmap binary not found next to the app.".to_string())?;
    #[cfg(unix)]
    {
        install_unix(&target)
    }
    #[cfg(windows)]
    {
        install_windows(&target)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = target;
        Err("Unsupported platform.".to_string())
    }
}

#[tauri::command]
pub fn cli_uninstall() -> Result<(), String> {
    #[cfg(unix)]
    {
        uninstall_unix()
    }
    #[cfg(windows)]
    {
        uninstall_windows()
    }
    #[cfg(not(any(unix, windows)))]
    {
        Err("Unsupported platform.".to_string())
    }
}

// ---- macOS / Linux: symlink into /usr/local/bin (on the default PATH) ----

#[cfg(unix)]
fn unix_link() -> PathBuf {
    Path::new("/usr/local/bin").join(command_name())
}

/// O3: our installs are always symlinks, so a real (non-symlink) file at the
/// target is a foreign `clobmap` — refuse rather than clobber it. A stale
/// symlink of ours, or nothing there, is fine to replace.
#[cfg(unix)]
fn ensure_replaceable(dst: &Path) -> Result<(), String> {
    if let Ok(meta) = std::fs::symlink_metadata(dst) {
        if !meta.file_type().is_symlink() {
            return Err(format!(
                "A different '{}' already exists at {} (not created by clobmap). Remove it first, then retry.",
                command_name(),
                dst.display()
            ));
        }
    }
    Ok(())
}

#[cfg(unix)]
fn install_unix(target: &Path) -> Result<String, String> {
    use std::os::unix::fs::symlink;
    let link = unix_link();
    let dst = link.as_path();
    if let Some(parent) = dst.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    ensure_replaceable(dst)?; // O3: don't clobber a foreign non-symlink `clobmap`
    let _ = std::fs::remove_file(dst); // best-effort; replaced below if it fails
    if symlink(target, dst).is_ok() {
        return Ok(dst.display().to_string());
    }
    // Not writable without privilege → elevate on macOS, guide manually on Linux.
    #[cfg(target_os = "macos")]
    {
        elevated(&format!(
            "mkdir -p '{}' && ln -sf '{}' '{}'",
            dst.parent().unwrap().display(),
            target.display(),
            dst.display()
        ))?;
        Ok(dst.display().to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(format!(
            "Couldn't write {dst}. Run this once with sudo:\n  sudo ln -sf '{src}' '{dst}'",
            dst = dst.display(),
            src = target.display()
        ))
    }
}

#[cfg(unix)]
fn uninstall_unix() -> Result<(), String> {
    let link = unix_link();
    let dst = link.as_path();
    if std::fs::symlink_metadata(dst).is_err() {
        return Ok(()); // nothing there
    }
    if std::fs::remove_file(dst).is_ok() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        elevated(&format!("rm -f '{}'", dst.display()))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(format!(
            "Couldn't remove {dst}. Run: sudo rm -f '{dst}'",
            dst = dst.display()
        ))
    }
}

/// Run a shell snippet with administrator privileges (single macOS prompt).
#[cfg(target_os = "macos")]
fn elevated(script: &str) -> Result<(), String> {
    let osa = format!("do shell script \"{}\" with administrator privileges", script.replace('"', "\\\""));
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(osa)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Authorization was cancelled or failed.".to_string())
    }
}

// ---- Windows: copy into %LOCALAPPDATA%\clobmap\bin and edit the user PATH ----

#[cfg(windows)]
fn win_bin_dir() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not set.".to_string())?;
    Ok(Path::new(&base).join("clobmap").join("bin"))
}

#[cfg(windows)]
fn run_powershell(script: &str) -> Result<(), String> {
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("PowerShell command failed.".to_string())
    }
}

#[cfg(windows)]
fn install_windows(target: &Path) -> Result<String, String> {
    let bindir = win_bin_dir()?;
    std::fs::create_dir_all(&bindir).map_err(|e| e.to_string())?;
    let dst = bindir.join("clobmap.exe");
    std::fs::copy(target, &dst).map_err(|e| e.to_string())?;
    // Add bindir to the USER Path (no admin needed), idempotently.
    let script = format!(
        "$d='{}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){{$p=''}}; if(($p -split ';') -notcontains $d){{ [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $d), 'User') }}",
        bindir.display()
    );
    run_powershell(&script)?;
    Ok(dst.display().to_string())
}

#[cfg(windows)]
fn uninstall_windows() -> Result<(), String> {
    let bindir = win_bin_dir()?;
    let _ = std::fs::remove_file(bindir.join("clobmap.exe"));
    let script = format!(
        "$d='{}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if($p){{ [Environment]::SetEnvironmentVariable('Path', (($p -split ';' | Where-Object {{ $_ -ne $d -and $_ -ne '' }}) -join ';'), 'User') }}",
        bindir.display()
    );
    run_powershell(&script)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("clob-cli-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn command_name_is_platform_appropriate() {
        let n = command_name();
        assert!(!n.is_empty());
        if cfg!(target_os = "linux") {
            assert!(n.starts_with("clobmap-cli"), "linux CLI must not shadow the GUI binary");
        } else {
            assert!(n.starts_with("clobmap"));
        }
    }

    #[test]
    fn find_in_paths_locates_a_command() {
        let dir = scratch("which");
        let name = command_name();
        fs::write(dir.join(name), b"#!/bin/sh\n").unwrap();
        let path_var = std::env::join_paths([&dir]).unwrap();
        assert_eq!(find_in_paths(Some(path_var), name), Some(dir.join(name)));
        assert!(find_in_paths(Some(std::ffi::OsString::from("")), name).is_none());
        assert!(find_in_paths(None, name).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn same_file_follows_symlinks_and_distinguishes() {
        let dir = scratch("same");
        let real = dir.join("real");
        fs::write(&real, b"x").unwrap();
        let link = dir.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert!(same_file(&link, &real), "symlink resolves to its target");
        let other = dir.join("other");
        fs::write(&other, b"y").unwrap();
        assert!(!same_file(&real, &other));
    }

    #[cfg(unix)]
    #[test]
    fn ensure_replaceable_refuses_foreign_file_but_allows_symlink_or_absent() {
        let dir = scratch("o3");
        // A real (non-symlink) file → refuse (O3).
        let foreign = dir.join("foreign");
        fs::write(&foreign, b"#!/bin/sh\n").unwrap();
        assert!(ensure_replaceable(&foreign).is_err());
        // A symlink (our kind of install) → fine to replace.
        let link = dir.join("link");
        std::os::unix::fs::symlink(&foreign, &link).unwrap();
        assert!(ensure_replaceable(&link).is_ok());
        // Nothing there → fine.
        assert!(ensure_replaceable(&dir.join("absent")).is_ok());
    }
}
