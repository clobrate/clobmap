use std::env;

#[cfg(desktop)]
use tauri::Emitter;

#[cfg(target_os = "macos")]
use tauri::RunEvent;

/// Returns the first non-flag argv value if it looks like a file path.
/// Used by the frontend to detect "user double-clicked a .clobmap.yaml file".
fn pending_open_path_inner() -> Option<String> {
    env::args()
        .skip(1)
        .find(|arg| !arg.starts_with('-') && !arg.is_empty())
}

#[tauri::command]
fn ping() -> String {
    "pong from rust".to_string()
}

#[tauri::command]
fn pending_open_path() -> Option<String> {
    pending_open_path_inner()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                // Forward incoming argv to the already-running instance so the
                // user can "open" a second .clobmap.yaml without launching a
                // second window.
                let _ = app.emit("clobmap://open-files", args);
            }))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    let context = tauri::generate_context!();
    let app = builder
        .invoke_handler(tauri::generate_handler![ping, pending_open_path])
        .build(context)
        .expect("error while building tauri application");

    // RunEvent::Opened only exists on macOS; on other desktops there's nothing
    // to handle at runtime, and on mobile we just need to call .run().
    #[cfg(target_os = "macos")]
    app.run(|handle, event| {
        if let RunEvent::Opened { urls } = event {
            // Finder asks the running app to open one or more files.
            let paths: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
            let _ = handle.emit("clobmap://open-files", paths);
        }
    });

    #[cfg(not(target_os = "macos"))]
    app.run(|_, _| {});
}
