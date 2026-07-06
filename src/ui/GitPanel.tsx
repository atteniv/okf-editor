import { useState } from "react";
import { useStore } from "./store";

interface GitPanelProps {
  onSelect: (path: string) => void;
  onPublish: () => void;
}

/** Compact status letter from a porcelain XY code. */
export function badgeFor(status: string): string {
  if (status === "??") return "U";
  const significant = status.replace(/\./g, "");
  return significant.charAt(0) || "M";
}

/** GitHub compare URL for the current branch, when derivable. */
function compareUrl(remote: string | null, branch: string): string | null {
  if (remote === null || branch === "" || branch === "main") return null;
  const base = remote.replace(/\.git$/, "");
  if (!base.startsWith("https://")) return null;
  return `${base}/compare/${branch}?expand=1`;
}

export function GitPanel({ onSelect, onPublish }: GitPanelProps) {
  const {
    git,
    gitRemote,
    gitBusy,
    gitError,
    commitAll,
    syncRemote,
    createBranch,
    setSettingsOpen,
    refreshGit,
  } = useStore();
  const [open, setOpen] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [signoff, setSignoff] = useState(
    () => localStorage.getItem("okf-editor.git-signoff") === "1",
  );
  const [branchInput, setBranchInput] = useState<string | null>(null);

  if (git === null || !git.is_repo) return null;

  const changes = git.changes;
  const canCommit = changes.length > 0 && messageText.trim() !== "" && !gitBusy;
  const prUrl = compareUrl(gitRemote, git.branch);
  const authFailed = gitError !== null && /auth|401|403|credential/i.test(gitError);

  const doCommit = async () => {
    if (await commitAll(messageText.trim(), signoff)) setMessageText("");
  };

  return (
    <section className="git-panel">
      <button className="problems-header" onClick={() => setOpen(!open)}>
        <BranchIcon />
        <span className="git-branch">{git.branch || "(no branch)"}</span>
        {git.ahead > 0 && <span className="git-ab">↑{git.ahead}</span>}
        {git.behind > 0 && <span className="git-ab">↓{git.behind}</span>}
        {changes.length > 0 && <span className="count">{changes.length}</span>}
        <span className="chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="git-body">
          {gitRemote === null ? (
            <button className="git-publish primary" onClick={onPublish}>
              Publish to GitHub…
            </button>
          ) : (
            <div className="git-actions">
              <button
                disabled={gitBusy || (git.ahead === 0 && git.behind === 0 && changes.length === 0)}
                onClick={() => void syncRemote()}
                title="Pull, then push"
              >
                {gitBusy ? "Syncing…" : "Sync"}
              </button>
              {branchInput === null ? (
                <button onClick={() => setBranchInput("")} title="New branch">
                  ⎇ branch
                </button>
              ) : (
                <input
                  autoFocus
                  className="git-branch-input"
                  value={branchInput}
                  placeholder="branch name"
                  onChange={(e) => setBranchInput(e.target.value)}
                  onBlur={() => setBranchInput(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && branchInput.trim() !== "") {
                      void createBranch(branchInput.trim());
                      setBranchInput(null);
                    } else if (e.key === "Escape") {
                      setBranchInput(null);
                    }
                  }}
                />
              )}
              {prUrl !== null && (
                <a href={prUrl} target="_blank" rel="noreferrer" className="git-pr">
                  Open PR ↗
                </a>
              )}
              <button
                onClick={() => void refreshGit()}
                title="Refresh status"
                className="git-refresh"
              >
                ⟳
              </button>
            </div>
          )}

          {changes.length > 0 && (
            <ul className="git-changes">
              {changes.map((change) => (
                <li key={change.path}>
                  <button
                    onClick={() =>
                      change.path.endsWith(".md") ? onSelect(change.path) : undefined
                    }
                    title={change.path}
                  >
                    <span className={`git-badge b-${badgeFor(change.status)}`}>
                      {badgeFor(change.status)}
                    </span>
                    <span className="git-change-path">{change.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {changes.length > 0 && (
            <div className="git-commit">
              <textarea
                value={messageText}
                rows={2}
                placeholder="Commit message…"
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canCommit) {
                    e.preventDefault();
                    void doCommit();
                  }
                }}
              />
              <div className="git-commit-row">
                <label className="git-signoff">
                  <input
                    type="checkbox"
                    checked={signoff}
                    onChange={(e) => {
                      setSignoff(e.target.checked);
                      localStorage.setItem(
                        "okf-editor.git-signoff",
                        e.target.checked ? "1" : "0",
                      );
                    }}
                  />
                  sign-off (DCO)
                </label>
                <button
                  className="primary"
                  disabled={!canCommit}
                  onClick={() => void doCommit()}
                >
                  Commit
                </button>
              </div>
            </div>
          )}

          {changes.length === 0 && git.ahead === 0 && git.behind === 0 && (
            <p className="git-clean">Everything committed and in sync.</p>
          )}

          {gitError !== null && (
            <p className="git-error">
              {gitError}
              {authFailed && (
                <>
                  {" "}
                  <button
                    className="link-button"
                    onClick={() => setSettingsOpen(true)}
                  >
                    Update your GitHub token
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function BranchIcon() {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        d="M4.5 3.5v6m0 0c0 2 1.5 3 3.5 3h1.5m-5-9a1.5 1.5 0 1 0 0-.01M4.5 12.5a1.5 1.5 0 1 0 0 .01M11 12.5a1.5 1.5 0 1 0 .01 0M11 5v3"
      />
      <circle cx="11" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
