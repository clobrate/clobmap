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

/// First `clobmap[.exe]` found on PATH.
fn which_on_path() -> Option<PathBuf> {
    let name = if cfg!(windows) { "clobmap.exe" } else { "clobmap" };
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|c| c.is_file())
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
const UNIX_LINK: &str = "/usr/local/bin/clobmap";

#[cfg(unix)]
fn install_unix(target: &Path) -> Result<String, String> {
    use std::os::unix::fs::symlink;
    let dst = Path::new(UNIX_LINK);
    if let Some(parent) = dst.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
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
    let dst = Path::new(UNIX_LINK);
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
