import { useState } from "react";
import { SAMPLE_BUNDLES, loadSampleBundle } from "../core/samples";
import { tauriPlatform as platform } from "../platform";
import { useStore } from "./store";

interface SampleBundleDialogProps {
  onClose(): void;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SampleBundleDialog({ onClose }: SampleBundleDialogProps) {
  const openBundle = useStore((state) => state.openBundle);
  const [selectedId, setSelectedId] = useState(SAMPLE_BUNDLES[0].id);
  const selected = SAMPLE_BUNDLES.find((sample) => sample.id === selectedId)!;
  const [parent, setParent] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseDestination = async () => {
    const destination = await platform.pickFolder();
    if (destination !== null) setParent(destination);
  };

  const createCopy = async () => {
    if (parent === null || creating) return;
    setCreating(true);
    setError(null);
    const root = `${parent}/${selected.folderName}`;
    try {
      let folderExists = false;
      try {
        await platform.scanBundle(root);
        folderExists = true;
      } catch {
        // A missing destination is expected; gitInit creates it below.
      }
      if (folderExists) {
        throw new Error(
          `A folder named “${selected.folderName}” already exists in that location. Choose another destination or rename the existing folder.`,
        );
      }

      const files = await loadSampleBundle(selected.id);
      await platform.gitInit(root);
      for (const file of files) {
        await platform.writeDoc(root, file.path, file.content);
      }
      try {
        await platform.gitCommit(root, `Create editable ${selected.title} sample`, false);
      } catch {
        // Missing Git identity does not prevent local sample exploration.
      }
      onClose();
      await openBundle(root);
    } catch (caught) {
      setError(describe(caught));
      setCreating(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog sample-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="sample-dialog-title">Choose a sample bundle</h3>
        <p className="dialog-hint">
          The editor creates your own editable copy. The packaged examples stay
          unchanged, so it is safe to experiment.
        </p>

        <div className="sample-options">
          {SAMPLE_BUNDLES.map((sample) => (
            <label
              key={sample.id}
              className={`sample-option ${selectedId === sample.id ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="sample"
                value={sample.id}
                checked={selectedId === sample.id}
                onChange={() => {
                  setSelectedId(sample.id);
                  setError(null);
                }}
              />
              <span className="sample-option-copy">
                <strong>{sample.title}</strong>
                <span>{sample.description}</span>
                {sample.sourceUrl === null ? (
                  <small>{sample.sourceLabel}</small>
                ) : (
                  <small>
                    <a href={sample.sourceUrl}>{sample.sourceLabel}</a>
                  </small>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="sample-destination">
          <button className="secondary" onClick={() => void chooseDestination()}>
            Choose destination…
          </button>
          <span className="dest-path">
            {parent === null
              ? "No destination selected"
              : `${parent}/${selected.folderName}`}
          </span>
        </div>

        {error !== null && <p className="dialog-error">{error}</p>}

        <div className="dialog-actions">
          <button onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={parent === null || creating}
            onClick={() => void createCopy()}
          >
            {creating ? "Creating copy…" : "Create editable copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
