// The Rust command boundary (docs/DESIGN.md §7). Keep it thin: fs now;
// watch, git, secrets, github land in later M1/M2 weeks.

mod error;
mod fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            fs::bundle_scan,
            fs::doc_read,
            fs::doc_write
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
