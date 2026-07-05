use std::path::{Component, Path, PathBuf};

use ignore::WalkBuilder;
use serde::Serialize;

use crate::error::AppError;

/// Resolve `rel` inside `root`, refusing anything that escapes the bundle
/// (docs/DESIGN.md §7.1). Rejects absolute paths and `..` components up
/// front, then canonicalizes to catch symlink escapes. Tauri's FS scope is
/// defense in depth on top of this, not a substitute for it.
pub fn resolve_in_root(root: &Path, rel: &str) -> Result<PathBuf, AppError> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(AppError::path_outside_bundle(rel));
    }
    if rel_path
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::Prefix(_)))
    {
        return Err(AppError::path_outside_bundle(rel));
    }
    let root = root.canonicalize()?;
    let joined = root.join(rel_path);

    // Canonicalize the deepest existing ancestor so symlinks can't smuggle
    // the path outside the root (the file itself may not exist yet on write).
    let mut existing = joined.clone();
    while !existing.exists() {
        existing = match existing.parent() {
            Some(parent) => parent.to_path_buf(),
            None => return Err(AppError::path_outside_bundle(rel)),
        };
    }
    if !existing.canonicalize()?.starts_with(&root) {
        return Err(AppError::path_outside_bundle(rel));
    }
    Ok(joined)
}

#[derive(Serialize)]
pub struct ScanEntry {
    /// Bundle-relative path with forward slashes.
    pub path: String,
    pub content: String,
}

/// Walk the bundle and return every markdown file with its content.
/// Honors .gitignore and skips dot-directories (.git etc.) via the `ignore`
/// crate's defaults.
#[tauri::command]
pub fn bundle_scan(root: String) -> Result<Vec<ScanEntry>, AppError> {
    let root_path = Path::new(&root).canonicalize()?;
    let mut entries = Vec::new();
    for result in WalkBuilder::new(&root_path).build() {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue, // unreadable entry: skip, don't fail the scan
        };
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let is_markdown = entry
            .path()
            .extension()
            .is_some_and(|ext| ext == "md" || ext == "markdown");
        if !is_markdown {
            continue;
        }
        let Ok(rel) = entry.path().strip_prefix(&root_path) else {
            continue;
        };
        let Ok(content) = std::fs::read_to_string(entry.path()) else {
            continue; // non-UTF-8 or unreadable: skip
        };
        entries.push(ScanEntry {
            path: rel.to_string_lossy().replace('\\', "/"),
            content,
        });
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

#[tauri::command]
pub fn doc_read(root: String, rel_path: String) -> Result<String, AppError> {
    let path = resolve_in_root(Path::new(&root), &rel_path)?;
    Ok(std::fs::read_to_string(path)?)
}

#[tauri::command]
pub fn doc_write(root: String, rel_path: String, content: String) -> Result<(), AppError> {
    let path = resolve_in_root(Path::new(&root), &rel_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(std::fs::write(path, content)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    fn bundle() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("guides")).unwrap();
        std::fs::write(
            dir.path().join("guides/a.md"),
            "---\ntype: guide\n---\n\n# A\n",
        )
        .unwrap();
        std::fs::write(dir.path().join("notes.txt"), "not markdown").unwrap();
        dir
    }

    #[test]
    fn scan_returns_only_markdown_with_relative_paths() {
        let dir = bundle();
        let entries = bundle_scan(dir.path().to_string_lossy().into_owned()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "guides/a.md");
        assert!(entries[0].content.contains("type: guide"));
    }

    #[test]
    fn scan_skips_git_dir_and_gitignored_files() {
        let dir = bundle();
        std::fs::create_dir(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join(".git/fake.md"), "x").unwrap();
        std::fs::write(dir.path().join(".gitignore"), "ignored.md\n").unwrap();
        std::fs::write(dir.path().join("ignored.md"), "x").unwrap();
        let entries = bundle_scan(dir.path().to_string_lossy().into_owned()).unwrap();
        assert_eq!(entries.len(), 1, "only guides/a.md should survive");
    }

    #[test]
    fn read_and_write_round_trip() {
        let dir = bundle();
        let root = dir.path().to_string_lossy().into_owned();
        doc_write(root.clone(), "new/doc.md".into(), "hello".into()).unwrap();
        assert_eq!(doc_read(root, "new/doc.md".into()).unwrap(), "hello");
    }

    #[test]
    fn rejects_parent_dir_traversal() {
        let dir = bundle();
        let err = doc_read(
            dir.path().to_string_lossy().into_owned(),
            "../outside.md".into(),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::PathOutsideBundle);
    }

    #[test]
    fn rejects_absolute_paths() {
        let dir = bundle();
        let err = doc_write(
            dir.path().to_string_lossy().into_owned(),
            "/tmp/evil.md".into(),
            "x".into(),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::PathOutsideBundle);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dir = bundle();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        let err = doc_write(
            dir.path().to_string_lossy().into_owned(),
            "link/escape.md".into(),
            "x".into(),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::PathOutsideBundle);
    }
}
