use std::process::Command;

use serde::Serialize;

use crate::error::{AppError, ErrorCode};
use crate::secrets;

/// Git integration, MVP shape (docs/DESIGN.md §7.3): shell out to system
/// git with ARGUMENT VECTORS — never through a shell, so there is no
/// injection surface. The GitHub token is never placed in argv or the
/// remote URL (argv is world-readable on many systems); remote operations
/// get a GIT_ASKPASS script that answers from an environment variable set
/// only on the child process, populated from the OS keychain.
const TOKEN_NAME: &str = "github-token";
const TOKEN_ENV: &str = "OKF_GIT_TOKEN";

fn git_base(root: Option<&str>) -> Command {
    let mut cmd = Command::new("git");
    if let Some(root) = root {
        cmd.arg("-C").arg(root);
    }
    // Never fall into an interactive prompt inside the app.
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd
}

/// Materialize the askpass helper (contains NO secret — it echoes the
/// token from the child's environment) and return its path.
#[cfg(unix)]
fn ensure_askpass() -> Result<std::path::PathBuf, AppError> {
    use std::os::unix::fs::PermissionsExt;
    let dir = std::env::temp_dir().join("okf-editor-askpass");
    std::fs::create_dir_all(&dir)?;
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    let path = dir.join("askpass.sh");
    let script = "#!/bin/sh\ncase \"$1\" in\n  Username*) printf 'x-access-token' ;;\n  *) printf '%s' \"$OKF_GIT_TOKEN\" ;;\nesac\n";
    std::fs::write(&path, script)?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
    Ok(path)
}

#[cfg(windows)]
fn ensure_askpass() -> Result<std::path::PathBuf, AppError> {
    let dir = std::env::temp_dir().join("okf-editor-askpass");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("askpass.bat");
    let script = "@echo off\r\necho.%1 | findstr /b /c:\"Username\" >nul && (echo x-access-token) || (echo %OKF_GIT_TOKEN%)\r\n";
    std::fs::write(&path, script)?;
    Ok(path)
}

/// Attach credentials for remote operations when a token exists. An
/// unavailable keychain (headless Linux without a Secret Service, CI)
/// degrades to "no token": local/public remotes still work, and a remote
/// that truly needs auth fails with a classified auth error instead.
fn with_credentials(cmd: &mut Command) -> Result<(), AppError> {
    if let Ok(Some(token)) = secrets::get(TOKEN_NAME) {
        let askpass = ensure_askpass()?;
        cmd.env("GIT_ASKPASS", askpass);
        cmd.env(TOKEN_ENV, token);
    }
    Ok(())
}

fn run(mut cmd: Command, action: &str) -> Result<String, AppError> {
    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError {
                code: ErrorCode::NotConfigured,
                message: "git is not installed (or not on PATH)".into(),
            }
        } else {
            AppError::from(e)
        }
    })?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Classify on both streams: merge-conflict notices ("CONFLICT …")
        // go to stdout, not stderr.
        let combined = format!("{stderr}\n{stdout}");
        let detail = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        Err(AppError {
            code: classify(&combined),
            message: format!("git {action} failed: {detail}"),
        })
    }
}

fn classify(stderr: &str) -> ErrorCode {
    let lower = stderr.to_lowercase();
    if lower.contains("conflict") {
        ErrorCode::Conflict
    } else if lower.contains("authentication")
        || lower.contains("401")
        || lower.contains("403")
        || lower.contains("could not read username")
    {
        ErrorCode::AuthFailed
    } else {
        ErrorCode::Io
    }
}

// ---- commands ----

#[derive(Serialize)]
pub struct GitInfo {
    pub version: String,
}

#[tauri::command]
pub fn git_detect() -> Result<Option<GitInfo>, AppError> {
    let mut cmd = git_base(None);
    cmd.arg("--version");
    match cmd.output() {
        Ok(output) if output.status.success() => Ok(Some(GitInfo {
            version: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        })),
        _ => Ok(None),
    }
}

#[derive(Serialize, Debug, PartialEq)]
pub struct FileChange {
    /// Bundle-relative path (forward slashes, as git reports).
    pub path: String,
    /// Two-letter porcelain XY code, or "??" for untracked.
    pub status: String,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: i64,
    pub behind: i64,
    pub changes: Vec<FileChange>,
    /// True when the directory is inside a git work tree at all.
    pub is_repo: bool,
}

/// Parse `git status --porcelain=v2 --branch` output (pure — unit tested).
pub fn parse_status(output: &str) -> GitStatus {
    let mut status = GitStatus {
        branch: String::new(),
        ahead: 0,
        behind: 0,
        changes: Vec::new(),
        is_repo: true,
    };
    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            status.branch = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            for part in rest.split_whitespace() {
                if let Some(n) = part.strip_prefix('+') {
                    status.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    status.behind = n.parse().unwrap_or(0);
                }
            }
        } else if let Some(rest) = line.strip_prefix("? ") {
            status.changes.push(FileChange {
                path: rest.to_string(),
                status: "??".to_string(),
            });
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            // "1 XY sub mH mI mW hH hI path" / "2 … path\torig" (rename)
            let fields: Vec<&str> = line.splitn(9, ' ').collect();
            if fields.len() == 9 {
                let path = fields[8].split('\t').next().unwrap_or(fields[8]);
                status.changes.push(FileChange {
                    path: path.to_string(),
                    status: fields[1].to_string(),
                });
            }
        }
    }
    status
}

#[tauri::command]
pub fn git_status(root: String) -> Result<GitStatus, AppError> {
    let mut probe = git_base(Some(&root));
    probe.args(["rev-parse", "--is-inside-work-tree"]);
    if probe.output().map(|o| !o.status.success()).unwrap_or(true) {
        return Ok(GitStatus {
            branch: String::new(),
            ahead: 0,
            behind: 0,
            changes: Vec::new(),
            is_repo: false,
        });
    }
    let mut cmd = git_base(Some(&root));
    cmd.args(["status", "--porcelain=v2", "--branch"]);
    Ok(parse_status(&run(cmd, "status")?))
}

#[tauri::command]
pub fn git_commit(root: String, message: String, signoff: bool) -> Result<(), AppError> {
    let mut add = git_base(Some(&root));
    add.args(["add", "--all"]);
    run(add, "add")?;
    let mut cmd = git_base(Some(&root));
    cmd.args(["commit", "-m", &message]);
    if signoff {
        cmd.arg("--signoff");
    }
    run(cmd, "commit")?;
    Ok(())
}

#[tauri::command]
pub fn git_pull(root: String) -> Result<(), AppError> {
    let mut cmd = git_base(Some(&root));
    cmd.args(["pull", "--no-rebase"]);
    with_credentials(&mut cmd)?;
    run(cmd, "pull")?;
    Ok(())
}

#[tauri::command]
pub fn git_push(root: String, branch: Option<String>) -> Result<(), AppError> {
    let mut cmd = git_base(Some(&root));
    // -u so the first push of a new repo/branch sets upstream tracking
    // (harmless on subsequent pushes).
    cmd.args(["push", "-u", "origin"]);
    match branch {
        Some(branch) => {
            cmd.arg(branch);
        }
        None => {
            cmd.arg("HEAD");
        }
    }
    with_credentials(&mut cmd)?;
    run(cmd, "push")?;
    Ok(())
}

fn ref_exists(root: &str, reference: &str) -> bool {
    let mut cmd = git_base(Some(root));
    cmd.args(["show-ref", "--verify", "--quiet", reference]);
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

/// The repo's "home" branch, without needing the user to know main vs
/// master: origin's declared default (set on clone) → local main →
/// local master → the current branch.
#[tauri::command]
pub fn git_default_branch(root: String) -> Result<String, AppError> {
    let mut cmd = git_base(Some(&root));
    cmd.args(["symbolic-ref", "refs/remotes/origin/HEAD"]);
    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let full = String::from_utf8_lossy(&output.stdout);
            if let Some(name) = full.trim().strip_prefix("refs/remotes/origin/") {
                return Ok(name.to_string());
            }
        }
    }
    if ref_exists(&root, "refs/heads/main") {
        return Ok("main".into());
    }
    if ref_exists(&root, "refs/heads/master") {
        return Ok("master".into());
    }
    Ok(git_status(root)?.branch)
}

/// Local branch names.
#[tauri::command]
pub fn git_list_branches(root: String) -> Result<Vec<String>, AppError> {
    let mut cmd = git_base(Some(&root));
    cmd.args(["branch", "--format=%(refname:short)"]);
    Ok(run(cmd, "branch --list")?
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

/// Switch to an existing branch (git refuses if changes would be lost).
/// Existence is validated first so the bare branch name can't be
/// misread as a path by checkout.
#[tauri::command]
pub fn git_switch_branch(root: String, name: String) -> Result<(), AppError> {
    if !ref_exists(&root, &format!("refs/heads/{name}")) {
        return Err(AppError {
            code: ErrorCode::NotFound,
            message: format!("no local branch named {name}"),
        });
    }
    let mut cmd = git_base(Some(&root));
    cmd.args(["checkout", &name]);
    run(cmd, "checkout")?;
    Ok(())
}

/// Paths currently in a conflicted (unmerged) state.
#[tauri::command]
pub fn git_conflicted_files(root: String) -> Result<Vec<String>, AppError> {
    let mut cmd = git_base(Some(&root));
    cmd.args(["diff", "--name-only", "--diff-filter=U"]);
    Ok(run(cmd, "diff")?
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect())
}

#[derive(Serialize)]
pub struct ConflictVersions {
    /// Our side (what the user had). None if the file didn't exist locally.
    pub ours: Option<String>,
    /// Their side (what GitHub has). None if deleted remotely.
    pub theirs: Option<String>,
}

fn show_stage(root: &str, stage: u8, path: &str) -> Option<String> {
    let mut cmd = git_base(Some(root));
    cmd.args(["show", &format!(":{stage}:{path}")]);
    match cmd.output() {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).into_owned())
        }
        _ => None,
    }
}

/// Both sides of a conflicted file (index stages 2 and 3).
#[tauri::command]
pub fn git_conflict_versions(root: String, path: String) -> Result<ConflictVersions, AppError> {
    Ok(ConflictVersions {
        ours: show_stage(&root, 2, &path),
        theirs: show_stage(&root, 3, &path),
    })
}

/// Abort an in-progress merge, restoring the pre-pull state.
#[tauri::command]
pub fn git_merge_abort(root: String) -> Result<(), AppError> {
    let mut cmd = git_base(Some(&root));
    cmd.args(["merge", "--abort"]);
    run(cmd, "merge --abort")?;
    Ok(())
}

/// The origin remote URL, if one is configured.
#[tauri::command]
pub fn git_remote_url(root: String) -> Result<Option<String>, AppError> {
    let mut cmd = git_base(Some(&root));
    cmd.args(["remote", "get-url", "origin"]);
    match cmd.output() {
        Ok(output) if output.status.success() => Ok(Some(
            String::from_utf8_lossy(&output.stdout).trim().to_string(),
        )),
        Ok(_) => Ok(None), // no origin configured
        Err(e) => Err(AppError::from(e)),
    }
}

/// Point origin at `url` (add or update).
#[tauri::command]
pub fn git_set_remote(root: String, url: String) -> Result<(), AppError> {
    let existing = git_remote_url(root.clone())?;
    let mut cmd = git_base(Some(&root));
    if existing.is_some() {
        cmd.args(["remote", "set-url", "origin", "--", &url]);
    } else {
        cmd.args(["remote", "add", "origin", "--", &url]);
    }
    run(cmd, "remote")?;
    Ok(())
}

#[tauri::command]
pub fn git_create_branch(root: String, name: String) -> Result<(), AppError> {
    let mut cmd = git_base(Some(&root));
    cmd.args(["checkout", "-b", &name]);
    run(cmd, "checkout -b")?;
    Ok(())
}

/// Initialize a fresh repo (creates the directory), default branch `main`.
#[tauri::command]
pub fn git_init(dest: String) -> Result<(), AppError> {
    let mut cmd = git_base(None);
    cmd.args(["init", "-b", "main", "--", &dest]);
    run(cmd, "init")?;
    Ok(())
}

#[tauri::command]
pub fn git_clone(url: String, dest: String) -> Result<(), AppError> {
    let mut cmd = git_base(None);
    cmd.args(["clone", "--", &url, &dest]);
    with_credentials(&mut cmd)?;
    run(cmd, "clone")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn sh(dir: &Path, args: &[&str]) -> String {
        let mut cmd = git_base(Some(dir.to_str().unwrap()));
        cmd.args(args)
            .env("GIT_AUTHOR_NAME", "Test")
            .env("GIT_AUTHOR_EMAIL", "t@example.com")
            .env("GIT_COMMITTER_NAME", "Test")
            .env("GIT_COMMITTER_EMAIL", "t@example.com");
        run(cmd, "test").unwrap()
    }

    fn init_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        sh(dir.path(), &["init", "-b", "main"]);
        sh(dir.path(), &["config", "user.name", "Test"]);
        sh(dir.path(), &["config", "user.email", "t@example.com"]);
        std::fs::write(dir.path().join("index.md"), "# hello\n").unwrap();
        sh(dir.path(), &["add", "--all"]);
        sh(dir.path(), &["commit", "-m", "init"]);
        dir
    }

    #[test]
    fn parses_porcelain_v2() {
        let raw = "# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 abc def guides/a.md\n1 A. N... 000000 100644 100644 000 def new.md\n? untracked.md\n";
        let status = parse_status(raw);
        assert_eq!(status.branch, "main");
        assert_eq!(status.ahead, 2);
        assert_eq!(status.behind, 1);
        assert_eq!(
            status.changes,
            vec![
                FileChange {
                    path: "guides/a.md".into(),
                    status: ".M".into()
                },
                FileChange {
                    path: "new.md".into(),
                    status: "A.".into()
                },
                FileChange {
                    path: "untracked.md".into(),
                    status: "??".into()
                },
            ]
        );
    }

    #[test]
    fn status_reports_changes_and_non_repos() {
        let dir = init_repo();
        std::fs::write(dir.path().join("index.md"), "# changed\n").unwrap();
        std::fs::write(dir.path().join("new.md"), "x").unwrap();
        let status = git_status(dir.path().to_string_lossy().into_owned()).unwrap();
        assert!(status.is_repo);
        assert_eq!(status.branch, "main");
        let paths: Vec<&str> = status.changes.iter().map(|c| c.path.as_str()).collect();
        assert!(paths.contains(&"index.md"));
        assert!(paths.contains(&"new.md"));

        let plain = tempfile::tempdir().unwrap();
        let status = git_status(plain.path().to_string_lossy().into_owned()).unwrap();
        assert!(!status.is_repo);
    }

    #[test]
    fn commit_with_signoff_stages_everything() {
        let dir = init_repo();
        std::fs::write(dir.path().join("doc.md"), "content\n").unwrap();
        git_commit(
            dir.path().to_string_lossy().into_owned(),
            "add doc".into(),
            true,
        )
        .unwrap();
        let log = sh(dir.path(), &["log", "-1", "--format=%B"]);
        assert!(log.contains("add doc"));
        assert!(log.contains("Signed-off-by: Test <t@example.com>"));
        let status = git_status(dir.path().to_string_lossy().into_owned()).unwrap();
        assert!(status.changes.is_empty());
    }

    #[test]
    fn push_pull_round_trip_via_local_bare_remote() {
        let bare = tempfile::tempdir().unwrap();
        let mut cmd = git_base(Some(bare.path().to_str().unwrap()));
        cmd.args(["init", "--bare", "-b", "main"]);
        run(cmd, "init bare").unwrap();

        let a = init_repo();
        sh(
            a.path(),
            &["remote", "add", "origin", bare.path().to_str().unwrap()],
        );
        git_push(a.path().to_string_lossy().into_owned(), Some("main".into())).unwrap();

        // Second clone pulls the pushed commit.
        let b_parent = tempfile::tempdir().unwrap();
        let b_path = b_parent.path().join("clone");
        git_clone(
            bare.path().to_string_lossy().into_owned(),
            b_path.to_string_lossy().into_owned(),
        )
        .unwrap();
        assert!(b_path.join("index.md").exists());

        // Push from A again; B pulls it.
        std::fs::write(a.path().join("second.md"), "two\n").unwrap();
        git_commit(
            a.path().to_string_lossy().into_owned(),
            "second".into(),
            false,
        )
        .unwrap();
        git_push(a.path().to_string_lossy().into_owned(), Some("main".into())).unwrap();
        sh(&b_path, &["config", "user.name", "Test"]);
        sh(&b_path, &["config", "user.email", "t@example.com"]);
        git_pull(b_path.to_string_lossy().into_owned()).unwrap();
        assert!(b_path.join("second.md").exists());
    }

    #[test]
    fn default_branch_detection_chain() {
        // init'd with main
        let dir = init_repo();
        let root = dir.path().to_string_lossy().into_owned();
        assert_eq!(git_default_branch(root.clone()).unwrap(), "main");

        // origin/HEAD wins when present, even over local main
        sh(
            dir.path(),
            &["update-ref", "refs/remotes/origin/trunk", "HEAD"],
        );
        sh(
            dir.path(),
            &[
                "symbolic-ref",
                "refs/remotes/origin/HEAD",
                "refs/remotes/origin/trunk",
            ],
        );
        assert_eq!(git_default_branch(root).unwrap(), "trunk");

        // master-only repo
        let old = tempfile::tempdir().unwrap();
        let old_root = old.path().to_string_lossy().into_owned();
        {
            let mut cmd = git_base(Some(&old_root));
            cmd.args(["init", "-b", "master"]);
            run(cmd, "init").unwrap();
        }
        sh(old.path(), &["config", "user.name", "T"]);
        sh(old.path(), &["config", "user.email", "t@e.com"]);
        std::fs::write(old.path().join("a.md"), "x").unwrap();
        sh(old.path(), &["add", "--all"]);
        sh(old.path(), &["commit", "-m", "i"]);
        assert_eq!(git_default_branch(old_root).unwrap(), "master");
    }

    #[test]
    fn branch_list_and_switch() {
        let dir = init_repo();
        let root = dir.path().to_string_lossy().into_owned();
        git_create_branch(root.clone(), "topic".into()).unwrap();
        let branches = git_list_branches(root.clone()).unwrap();
        assert!(branches.contains(&"main".to_string()));
        assert!(branches.contains(&"topic".to_string()));

        git_switch_branch(root.clone(), "main".into()).unwrap();
        assert_eq!(git_status(root.clone()).unwrap().branch, "main");

        let err = git_switch_branch(root, "nope".into()).unwrap_err();
        assert_eq!(err.code, ErrorCode::NotFound);
    }

    #[test]
    fn conflict_lifecycle_versions_and_abort() {
        // Two clones of one bare remote edit the same line.
        let bare = tempfile::tempdir().unwrap();
        let mut cmd = git_base(Some(bare.path().to_str().unwrap()));
        cmd.args(["init", "--bare", "-b", "main"]);
        run(cmd, "init bare").unwrap();

        let a = init_repo();
        let a_root = a.path().to_string_lossy().into_owned();
        sh(
            a.path(),
            &["remote", "add", "origin", bare.path().to_str().unwrap()],
        );
        git_push(a_root.clone(), Some("main".into())).unwrap();

        let b_parent = tempfile::tempdir().unwrap();
        let b_path = b_parent.path().join("b");
        git_clone(
            bare.path().to_string_lossy().into_owned(),
            b_path.to_string_lossy().into_owned(),
        )
        .unwrap();
        let b_root = b_path.to_string_lossy().into_owned();
        sh(&b_path, &["config", "user.name", "B"]);
        sh(&b_path, &["config", "user.email", "b@e.com"]);

        // B changes and pushes; A changes the same file and pulls → conflict.
        std::fs::write(b_path.join("index.md"), "# theirs\n").unwrap();
        git_commit(b_root, "their change".into(), false).unwrap();
        {
            let mut cmd = git_base(Some(&b_path.to_string_lossy()));
            cmd.args(["push", "origin", "main"]);
            run(cmd, "push").unwrap();
        }
        std::fs::write(a.path().join("index.md"), "# ours\n").unwrap();
        git_commit(a_root.clone(), "our change".into(), false).unwrap();

        let err = git_pull(a_root.clone()).unwrap_err();
        assert_eq!(err.code, ErrorCode::Conflict);

        let conflicted = git_conflicted_files(a_root.clone()).unwrap();
        assert_eq!(conflicted, vec!["index.md".to_string()]);

        let versions = git_conflict_versions(a_root.clone(), "index.md".into()).unwrap();
        assert_eq!(versions.ours.as_deref(), Some("# ours\n"));
        assert_eq!(versions.theirs.as_deref(), Some("# theirs\n"));

        // Abort restores the pre-pull state (our committed content intact).
        git_merge_abort(a_root.clone()).unwrap();
        assert!(git_conflicted_files(a_root.clone()).unwrap().is_empty());
        assert_eq!(
            std::fs::read_to_string(a.path().join("index.md")).unwrap(),
            "# ours\n"
        );

        // Resolve for real: pull again, choose a resolution, commit clears it.
        let _ = git_pull(a_root.clone());
        std::fs::write(a.path().join("index.md"), "# merged\n").unwrap();
        git_commit(a_root.clone(), "merge updates".into(), false).unwrap();
        assert!(git_conflicted_files(a_root).unwrap().is_empty());
    }

    #[test]
    fn remote_url_roundtrip_and_absence() {
        let dir = init_repo();
        let root = dir.path().to_string_lossy().into_owned();
        assert_eq!(git_remote_url(root.clone()).unwrap(), None);
        git_set_remote(root.clone(), "https://example.com/a/b.git".into()).unwrap();
        assert_eq!(
            git_remote_url(root.clone()).unwrap().as_deref(),
            Some("https://example.com/a/b.git")
        );
        // set-url path (origin already exists)
        git_set_remote(root.clone(), "https://example.com/c/d.git".into()).unwrap();
        assert_eq!(
            git_remote_url(root).unwrap().as_deref(),
            Some("https://example.com/c/d.git")
        );
    }

    #[test]
    fn create_branch_switches_head() {
        let dir = init_repo();
        git_create_branch(dir.path().to_string_lossy().into_owned(), "topic".into()).unwrap();
        let status = git_status(dir.path().to_string_lossy().into_owned()).unwrap();
        assert_eq!(status.branch, "topic");
    }

    #[cfg(unix)]
    #[test]
    fn askpass_script_answers_username_and_password() {
        let path = ensure_askpass().unwrap();
        let user = Command::new(&path)
            .arg("Username for 'https://github.com':")
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&user.stdout), "x-access-token");
        let pass = Command::new(&path)
            .arg("Password for 'https://x-access-token@github.com':")
            .env(TOKEN_ENV, "tok-123")
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&pass.stdout), "tok-123");
    }
}
