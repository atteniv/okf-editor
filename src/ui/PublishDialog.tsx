import { useState } from "react";
import { tauriPlatform as platform } from "../platform";
import { useStore } from "./store";

interface PublishDialogProps {
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

/**
 * Publish a local, remote-less bundle to GitHub. Tries API repo creation;
 * tokens without repo-create permission (our recommended least-privilege
 * fine-grained PATs) fall back to connect-an-existing-empty-repo.
 */
export function PublishDialog({ onClose }: PublishDialogProps) {
  const { root, publishTo } = useStore();
  const defaultName = root?.split("/").at(-1) ?? "";
  const [name, setName] = useState(defaultName);
  const [isPrivate, setIsPrivate] = useState(true);
  const [mode, setMode] = useState<"create" | "connect">("create");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAndPush = async () => {
    setBusy(true);
    setError(null);
    try {
      const repo = await platform.githubCreateRepo(name.trim(), isPrivate);
      if (await publishTo(repo.clone_url)) {
        onClose();
        return;
      }
      setError(useStore.getState().gitError ?? "Push failed");
    } catch (err) {
      if (isAuthFailure(err)) {
        setMode("connect");
        setError(
          "Your token can't create repositories — that's expected with a least-privilege token. Create an empty repo on GitHub and paste its URL below.",
        );
      } else {
        setError(describe(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const connectAndPush = async () => {
    setBusy(true);
    setError(null);
    if (await publishTo(url.trim())) {
      onClose();
    } else {
      setError(useStore.getState().gitError ?? "Push failed");
    }
    setBusy(false);
  };

  return (
    <div className="dialog-overlay" onClick={busy ? undefined : onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Publish to GitHub</h3>

        {mode === "create" ? (
          <>
            <label>
              Repository name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="fm-field-check radio-row">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              Private repository
            </label>
            <p className="dialog-hint">
              Creates the repository under your account, points this bundle at
              it, and pushes.{" "}
              <button className="link-button" onClick={() => setMode("connect")}>
                Have a repo already? Connect it instead.
              </button>
            </p>
            {error !== null && <p className="dialog-error">{error}</p>}
            <div className="dialog-actions">
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || name.trim() === ""}
                onClick={() => void createAndPush()}
              >
                {busy ? "Publishing…" : "Create & push"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="dialog-hint">
              1. <a href="https://github.com/new" target="_blank" rel="noreferrer">
                Create an empty repository on GitHub
              </a>{" "}
              (no README — this bundle already has history).
              <br />
              2. Paste its URL here; the app connects it and pushes.
            </p>
            <label>
              Repository URL
              <input
                autoFocus
                value={url}
                placeholder="https://github.com/you/your-bundle.git"
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            {error !== null && <p className="dialog-error">{error}</p>}
            <div className="dialog-actions">
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || url.trim() === ""}
                onClick={() => void connectAndPush()}
              >
                {busy ? "Publishing…" : "Connect & push"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
