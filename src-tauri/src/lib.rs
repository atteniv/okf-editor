// The Rust command boundary (docs/DESIGN.md §7). Keep it thin: fs, watcher,
// secrets, and AI streaming now; git and github land in M2.

mod ai;
mod error;
mod fs;
mod secrets;
mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(watch::WatchState::default())
        .manage(ai::AiState::default())
        .invoke_handler(tauri::generate_handler![
            fs::bundle_scan,
            fs::doc_read,
            fs::doc_write,
            fs::doc_rename,
            fs::doc_delete,
            watch::watch_start,
            watch::watch_stop,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::secret_exists,
            ai::ai_chat,
            ai::ai_cancel,
            ai::ai_models,
            ai::ai_key_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
