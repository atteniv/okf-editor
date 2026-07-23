import { useEffect, useState } from "react";
import {
  formatRecentLocation,
  loadRecentRemotes,
} from "../core/recents";
import { tauriPlatform as platform } from "../platform";
import { CloneDialog } from "./CloneDialog";
import { NewBundleDialog } from "./NewBundleDialog";
import { useStore } from "./store";

export function StartScreen() {
  const { openFolder, openBundle, removeRecent, recents, error } = useStore();
  const [cloning, setCloning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [recentRemotes, setRecentRemotes] = useState<
    Record<string, string | null>
  >({});

  useEffect(() => {
    let active = true;
    void loadRecentRemotes(recents, (root) =>
      platform.gitRemoteUrl(root),
    ).then((remotes) => {
      if (active) setRecentRemotes(remotes);
    });
    return () => {
      active = false;
    };
  }, [recents]);

  return (
    <main className="start-screen">
      <img className="app-logo" src="/logo.png" alt="" width={96} height={96} />
      <h1>OKF Editor</h1>
      <p>A local-first, schema-aware editor for Open Knowledge Format bundles.</p>

      <div className="start-actions">
        <button className="primary" onClick={() => setCreating(true)}>
          New bundle…
        </button>
        <button className="secondary" onClick={() => void openFolder()}>
          Open bundle folder…
        </button>
        <button className="secondary" onClick={() => setCloning(true)}>
          Clone repository…
        </button>
      </div>
      {cloning && <CloneDialog onClose={() => setCloning(false)} />}
      {creating && <NewBundleDialog onClose={() => setCreating(false)} />}

      {error && <p className="error">{error}</p>}

      {recents.length > 0 && (
        <section className="recents">
          <h2>Recent</h2>
          <ul>
            {recents.map((root) => {
              const name = root.split(/[\\/]/).at(-1) || root;
              const remote = recentRemotes[root];
              const location = formatRecentLocation(root, remote);
              return (
                <li key={root}>
                  <button
                    className="recent-open"
                    onClick={() => void openBundle(root)}
                    title={root}
                  >
                    {name}
                    <span className="path">{root}</span>
                    {remote && (
                      <span className="path">Remote: {location}</span>
                    )}
                  </button>
                  <button
                    className="recent-remove"
                    onClick={() => removeRecent(root)}
                    aria-label={`Remove ${name} from recent projects`}
                    title="Remove from recents"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
