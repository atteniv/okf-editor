import { useStore } from "./store";

interface PullResultDialogProps {
  /** Open a pulled doc in the editor (dialog closes first). */
  onSelect: (path: string) => void;
}

const KIND_LABELS: Record<string, string> = {
  M: "Updated",
  A: "Added",
  D: "Removed",
  R: "Renamed",
};

/**
 * Shown after "Pull Updates from GitHub" brings changes down: lists what
 * just changed on this computer so the pull is never silent. (When there
 * was nothing to pull, the panel shows a one-line notice instead.)
 */
export function PullResultDialog({ onSelect }: PullResultDialogProps) {
  const { pullResult, clearPullResult } = useStore();
  if (pullResult === null) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog conflict-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Updates from GitHub</h3>
        <p className="dialog-hint">
          {pullResult.length === 1
            ? "1 file on this computer was updated"
            : `${pullResult.length} files on this computer were updated`}{" "}
          with the latest from GitHub:
        </p>

        <ul className="pull-result-list">
          {pullResult.map((file) => (
            <li key={file.path}>
              <button
                onClick={() => {
                  if (file.kind !== "D" && file.path.endsWith(".md")) {
                    clearPullResult();
                    onSelect(file.path);
                  }
                }}
                title={file.path}
              >
                <span className={`git-badge b-${file.kind}`}>{file.kind}</span>
                <span className="git-change-path">{file.path}</span>
                <span className="pull-kind">
                  {KIND_LABELS[file.kind] ?? "Changed"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="dialog-actions">
          <button className="primary" onClick={clearPullResult}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
