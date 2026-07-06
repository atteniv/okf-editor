import { useStore } from "./store";

export function StartScreen() {
  const { openFolder, openBundle, recents, error, setSettingsOpen } = useStore();

  return (
    <main className="start-screen">
      <button
        className="settings-corner"
        onClick={() => setSettingsOpen(true)}
        title="Settings (⌘,)"
      >
        ⚙ Settings
      </button>
      <h1>OKF Editor</h1>
      <p>A local-first, schema-aware editor for Open Knowledge Format bundles.</p>

      <button className="primary" onClick={() => void openFolder()}>
        Open bundle folder…
      </button>

      {error && <p className="error">{error}</p>}

      {recents.length > 0 && (
        <section className="recents">
          <h2>Recent</h2>
          <ul>
            {recents.map((root) => (
              <li key={root}>
                <button onClick={() => void openBundle(root)} title={root}>
                  {root.split("/").at(-1) || root}
                  <span className="path">{root}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
