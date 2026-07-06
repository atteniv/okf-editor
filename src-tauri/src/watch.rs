use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::error::AppError;

/// Debounce window: coalesce bursts of fs events (editor saves, git
/// checkouts) into one notification (docs/DESIGN.md §7.2).
const DEBOUNCE: Duration = Duration::from_millis(200);

#[derive(Default)]
pub struct WatchState(Mutex<HashMap<String, RecommendedWatcher>>);

#[derive(Clone, Serialize)]
struct FsChangedPayload {
    root: String,
    /// Bundle-relative paths (forward slashes) of changed markdown/config
    /// files. The frontend re-reads each and updates or evicts its index
    /// entry — event kinds are deliberately not distinguished (DESIGN §7.2).
    paths: Vec<String>,
}

/// Filter raw watcher paths down to the ones the index cares about:
/// inside the root, not under .git, and markdown or editor config.
fn relevant_paths(root: &Path, event_paths: &[PathBuf]) -> Vec<String> {
    let mut out: HashSet<String> = HashSet::new();
    for path in event_paths {
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        let rel = rel.to_string_lossy().replace('\\', "/");
        if rel.starts_with(".git/") || rel.contains("/.git/") {
            continue;
        }
        let interesting =
            rel.ends_with(".md") || rel.ends_with(".markdown") || rel == ".okf-editor.json";
        if interesting {
            out.insert(rel);
        }
    }
    let mut sorted: Vec<String> = out.into_iter().collect();
    sorted.sort();
    sorted
}

#[tauri::command]
pub fn watch_start(app: AppHandle, state: State<WatchState>, root: String) -> Result<(), AppError> {
    let canonical = Path::new(&root).canonicalize()?;
    let mut watchers = state.0.lock().expect("watcher lock poisoned");
    if watchers.contains_key(&root) {
        return Ok(());
    }

    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher =
        notify::recommended_watcher(tx).map_err(|e| AppError::from(std::io::Error::other(e)))?;
    watcher
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|e| AppError::from(std::io::Error::other(e)))?;
    watchers.insert(root.clone(), watcher);
    drop(watchers);

    // Debounce thread: exits when the watcher is dropped (channel closes).
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut paths: Vec<PathBuf> = first.map(|e| e.paths).unwrap_or_default();
            let deadline = Instant::now() + DEBOUNCE;
            while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
                match rx.recv_timeout(remaining) {
                    Ok(Ok(event)) => paths.extend(event.paths),
                    Ok(Err(_)) => continue,
                    Err(_) => break, // window elapsed (or channel closed)
                }
            }
            let relevant = relevant_paths(&canonical, &paths);
            if !relevant.is_empty() {
                let _ = app.emit(
                    "okf://fs-changed",
                    FsChangedPayload {
                        root: root.clone(),
                        paths: relevant,
                    },
                );
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn watch_stop(state: State<WatchState>, root: String) {
    // Dropping the watcher closes the channel; the debounce thread exits.
    state.0.lock().expect("watcher lock poisoned").remove(&root);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_to_markdown_and_config_inside_root() {
        let root = Path::new("/bundle");
        let paths = vec![
            PathBuf::from("/bundle/guides/a.md"),
            PathBuf::from("/bundle/.okf-editor.json"),
            PathBuf::from("/bundle/notes.txt"),
            PathBuf::from("/bundle/.git/objects/x.md"),
            PathBuf::from("/elsewhere/b.md"),
        ];
        assert_eq!(
            relevant_paths(root, &paths),
            vec![".okf-editor.json".to_string(), "guides/a.md".to_string()]
        );
    }

    #[test]
    fn deduplicates_coalesced_events() {
        let root = Path::new("/bundle");
        let paths = vec![PathBuf::from("/bundle/a.md"), PathBuf::from("/bundle/a.md")];
        assert_eq!(relevant_paths(root, &paths), vec!["a.md".to_string()]);
    }
}
