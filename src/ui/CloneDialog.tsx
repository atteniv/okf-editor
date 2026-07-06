import { useEffect, useState } from "react";
import { tauriPlatform as platform } from "../platform";
import { useStore } from "./store";

interface CloneDialogProps {
  onClose: () => void;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  const detail = (err as { message?: string } | null)?.message;
  return detail ?? String(err);
}

function isAuthFailure(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "auth_failed";
}

/** Repo name from a clone URL: …/owner/name(.git) → name. */
function repoNameFrom(url: string): string {
  const tail = url.split("/").filter(Boolean).at(-1) ?? "";
  return tail.replace(/\.git$/, "");
}

export function CloneDialog({ onClose }: CloneDialogProps) {
  const { openBundle, setSettingsOpen } = useStore();
  const [url, setUrl] = useState("");
  const [repos, setRepos] = useState<
    { full_name: string; clone_url: string; private: boolean }[]
  >([]);
  const [destParent, setDestParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState(false);

  // Repo picker fills in when a GitHub token is configured; otherwise
  // the dialog is plain URL + destination.
  useEffect(() => {
    platform
      .githubListRepos()
      .then(setRepos)
      .catch(() => setRepos([]));
  }, []);

  const name = repoNameFrom(url);
  const ready = url.trim() !== "" && destParent !== null && name !== "" && !busy;

  const clone = async () => {
    if (!ready || destParent === null) return;
    const dest = `${destParent}/${name}`;
    setBusy(true);
    setError(null);
    setAuthHint(false);
    try {
      await platform.gitClone(url.trim(), dest);
    } catch (err) {
      setBusy(false);
      setError(describe(err));
      setAuthHint(isAuthFailure(err));
      return;
    }
    setBusy(false);
    onClose();
    await openBundle(dest);
  };

  return (
    <div className="dialog-overlay" onClick={busy ? undefined : onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Clone a repository</h3>
        <label>
          Repository URL
          <input
            autoFocus
            list="clone-repos"
            value={url}
            placeholder="https://github.com/owner/repo.git"
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
          <datalist id="clone-repos">
            {repos.map((repo) => (
              <option key={repo.full_name} value={repo.clone_url}>
                {repo.full_name}
                {repo.private ? " (private)" : ""}
              </option>
            ))}
          </datalist>
        </label>
        {repos.length === 0 && (
          <p className="dialog-hint">
            Connect GitHub in Settings to pick from your repositories — or
            paste any clone URL.
          </p>
        )}

        <label>
          Clone into
          <div className="dest-row">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void platform.pickFolder().then((dir) => {
                  if (dir !== null) setDestParent(dir);
                })
              }
            >
              Choose folder…
            </button>
            <span className="dest-path">
              {destParent !== null
                ? `${destParent}/${name || "…"}`
                : "no destination chosen"}
            </span>
          </div>
        </label>

        {error !== null && (
          <p className="dialog-error">
            {error}
            {authHint && (
              <>
                {" "}
                <button
                  className="link-button"
                  onClick={() => {
                    onClose();
                    setSettingsOpen(true);
                  }}
                >
                  Update your GitHub token in Settings
                </button>
              </>
            )}
          </p>
        )}

        <div className="dialog-actions">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={!ready} onClick={() => void clone()}>
            {busy ? "Cloning…" : "Clone"}
          </button>
        </div>
      </div>
    </div>
  );
}
