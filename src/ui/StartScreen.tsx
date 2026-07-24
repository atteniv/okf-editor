import { useEffect, useState } from "react";
import {
  formatRecentLocation,
  loadRecentRemotes,
} from "../core/recents";
import { tauriPlatform as platform } from "../platform";
import { CloneDialog } from "./CloneDialog";
import { NewBundleDialog } from "./NewBundleDialog";
import { SampleBundleDialog } from "./SampleBundleDialog";
import { useStore } from "./store";

export function StartScreen() {
  const {
    openFolder,
    openBundle,
    removeRecent,
    recents,
    error,
    githubReady,
    aiReady,
    perplexityReady,
    setSettingsOpen,
  } = useStore();
  const [cloning, setCloning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [choosingSample, setChoosingSample] = useState(false);
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
        <button className="secondary sample-action" onClick={() => setChoosingSample(true)}>
          Try a sample bundle…
        </button>
      </div>

      <section className="first-time-guide" aria-labelledby="first-time-title">
        <div className="first-time-heading">
          <div>
            <h2 id="first-time-title">First time here?</h2>
            <p>Set up your accounts once, then open or create a knowledge bundle.</p>
          </div>
          <button className="primary" onClick={() => setSettingsOpen(true)}>
            Set up accounts &amp; keys
          </button>
        </div>

        <ol className="setup-list">
          <li>
            <div className="setup-copy">
              <strong>Connect GitHub</strong>
              <span>
                For shared bundles, you need a free{" "}
                <a href="https://github.com/signup">GitHub account</a> and a
                personal access token. Settings walks you through creating a
                least-privilege token and stores it safely in your computer's
                keychain.
              </span>
            </div>
            <span className={`setup-status ${githubReady ? "ready" : "needed"}`}>
              {githubReady ? "Connected" : "Needed for GitHub sync"}
            </span>
          </li>
          <li>
            <div className="setup-copy">
              <strong>Add AI assistance with OpenRouter</strong>
              <span>
                Create an <a href="https://openrouter.ai">OpenRouter account</a>,
                add credit, and create an API key for drafting, document chat,
                and merge help.
              </span>
            </div>
            <span className={`setup-status ${aiReady ? "ready" : "optional"}`}>
              {aiReady ? "Connected" : "Optional · Not set up"}
            </span>
          </li>
          <li>
            <div className="setup-copy">
              <strong>Research websites with Perplexity</strong>
              <span>
                Only needed to build a new bundle from a public website. API
                billing is separate from a Perplexity Pro subscription.
              </span>
            </div>
            <span
              className={`setup-status ${perplexityReady ? "ready" : "optional"}`}
            >
              {perplexityReady ? "Connected" : "Optional · Not set up"}
            </span>
          </li>
        </ol>

        <p className="first-time-next">
          <strong>Then:</strong> clone a repository, open a bundle folder, or
          create a new bundle. Edit your documents and use <strong>Save Changes</strong>{" "}
          to commit and upload them.
        </p>
      </section>

      {cloning && <CloneDialog onClose={() => setCloning(false)} />}
      {creating && <NewBundleDialog onClose={() => setCreating(false)} />}
      {choosingSample && (
        <SampleBundleDialog onClose={() => setChoosingSample(false)} />
      )}

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
