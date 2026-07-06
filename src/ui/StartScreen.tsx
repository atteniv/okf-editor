import { useState } from "react";
import { CloneDialog } from "./CloneDialog";
import { NewBundleDialog } from "./NewBundleDialog";
import { useStore } from "./store";

export function StartScreen() {
  const { openFolder, openBundle, recents, error } = useStore();
  const [cloning, setCloning] = useState(false);
  const [creating, setCreating] = useState(false);

  return (
    <main className="start-screen">
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
