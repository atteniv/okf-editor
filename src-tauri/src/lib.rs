// The Rust command boundary (docs/DESIGN.md §7). Keep it thin: fs, watcher,
// secrets, and AI streaming now; git and github land in M2.

mod ai;
mod error;
mod fs;
mod git;
mod github;
mod secrets;
mod watch;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Native menu: the app menu carries Settings… (Cmd+,); Edit and
            // Window keep the standard bindings a custom menu would drop.
            let settings = MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;
            let app_menu = SubmenuBuilder::new(app, "OKF Editor")
                .about(None)
                .separator()
                .item(&settings)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .fullscreen()
                .close_window()
                .build()?;
            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "settings" {
                let _ = app.emit("okf://open-settings", ());
            }
        })
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
            ai::ai_key_status,
            git::git_detect,
            git::git_status,
            git::git_commit,
            git::git_pull,
            git::git_push,
            git::git_create_branch,
            git::git_clone,
            git::git_init,
            github::github_verify,
            github::github_list_repos
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
