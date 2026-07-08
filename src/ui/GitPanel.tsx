import { useState } from "react";
import { useStore } from "./store";
import { ConflictDialog } from "./ConflictDialog";
import { PullResultDialog } from "./PullResultDialog";

interface GitTabProps {
  onSelect: (path: string) => void;
  onPublish: () => void;
}

/** Compact status letter from a porcelain XY code. */
export function badgeFor(status: string): string {
  if (status === "??") return "U";
  const significant = status.replace(/\./g, "");
  return significant.charAt(0) || "M";
}

/**
 * The git tab, trunk-only by design (DESIGN §7.3): Save commits AND
 * uploads; Pull Updates brings down teammates' changes; conflicts get the
 * guided resolution dialog. No branching UI — the one branch affordance
 * is the "back to main" rescue when a repo arrives on a side branch.
 */
export function GitTabContent({ onSelect, onPublish }: GitTabProps) {
  const {
    git,
    gitRemote,
    gitDefaultBranch,
    gitBusy,
    gitError,
    gitConflicts,
    pullNotice,
    commitAll,
    pullUpdates,
    switchBranch,
    setSettingsOpen,
    refreshGit,
  } = useStore();
  const [messageText, setMessageText] = useState("");
  const [signoff, setSignoff] = useState(
    () => localStorage.getItem("okf-editor.git-signoff") === "1",
  );
  const [resolving, setResolving] = useState(false);

  if (git === null || !git.is_repo) return null;

  const changes = git.changes;
  const canCommit = changes.length > 0 && messageText.trim() !== "" && !gitBusy;
  const authFailed = gitError !== null && /auth|401|403|credential/i.test(gitError);

  const doCommit = async () => {
    if (await commitAll(messageText.trim(), signoff)) setMessageText("");
  };

  return (
    <div className="git-body">
      {gitRemote === null ? (
        <button className="git-publish primary" onClick={onPublish}>
          Publish to GitHub…
        </button>
      ) : (
        <div className="git-actions">
          <button
            disabled={gitBusy || gitConflicts !== null}
            onClick={() => void pullUpdates()}
            title="Gets the latest changes from GitHub (and uploads any of yours that are waiting)"
          >
            {gitBusy ? "Working…" : "Pull Updates from GitHub"}
          </button>
          {gitDefaultBranch !== null &&
            git.branch !== gitDefaultBranch &&
            changes.length === 0 && (
              <button
                onClick={() => void switchBranch(gitDefaultBranch)}
                title={`This bundle is on a side branch — switch back to ${gitDefaultBranch}`}
              >
                ↩ back to {gitDefaultBranch}
              </button>
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

      {gitConflicts !== null && (
        <div className="conflict-banner">
          <span>
            Your changes and GitHub&apos;s overlap in {gitConflicts.length}{" "}
            {gitConflicts.length === 1 ? "file" : "files"}.
          </span>
          <button onClick={() => setResolving(true)}>Resolve…</button>
        </div>
      )}

      {changes.length > 0 && gitConflicts === null && (
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

      {changes.length > 0 && gitConflicts === null && (
        <div className="git-commit">
          <textarea
            value={messageText}
            rows={2}
            placeholder="Describe your changes…"
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
              title={
                gitRemote !== null
                  ? "Commits and uploads to GitHub (⌘Enter)"
                  : "Creates a git commit (⌘Enter)"
              }
            >
              Save Changes / Commit
            </button>
          </div>
        </div>
      )}

      {pullNotice !== null && <p className="git-notice">✓ {pullNotice}</p>}

      {changes.length === 0 && git.ahead === 0 && git.behind === 0 && gitConflicts === null && (
        <p className="git-clean">All changes saved and in sync.</p>
      )}

      {gitError !== null && (
        <p className="git-error">
          {gitError}
          {authFailed && (
            <>
              {" "}
              <button className="link-button" onClick={() => setSettingsOpen(true)}>
                Update your GitHub token
              </button>
            </>
          )}
        </p>
      )}

      {resolving && <ConflictDialog onClose={() => setResolving(false)} />}
      <PullResultDialog onSelect={onSelect} />
    </div>
  );
}

export function BranchIcon() {
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

export function WarnIcon() {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        d="M8 2.5 14 13H2L8 2.5Z"
      />
      <path stroke="currentColor" strokeWidth="1.3" d="M8 6.5V9.5" />
      <circle cx="8" cy="11.4" r="0.4" fill="currentColor" stroke="currentColor" />
    </svg>
  );
}
