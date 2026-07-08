import { useEffect, useState } from "react";
import { mergeConflictMessages } from "../core/ai";
import { tauriPlatform as platform } from "../platform";
import { loadModel, streamChat } from "./aiClient";
import { useStore } from "./store";

interface ConflictDialogProps {
  onClose: () => void;
}

interface FileState {
  ours: string | null;
  theirs: string | null;
  resolution: "mine" | "github" | "ai" | null;
  aiBusy: boolean;
  error: string | null;
}

/**
 * Guided merge resolution: per conflicted file, keep mine / use GitHub's /
 * let AI combine both. Cancel aborts the merge and restores the pre-pull
 * state — nothing is lost by backing out.
 */
export function ConflictDialog({ onClose }: ConflictDialogProps) {
  const { root, schema, aiReady, gitConflicts, abortMerge, finishMerge } =
    useStore();
  const files = gitConflicts ?? [];
  const [states, setStates] = useState<Map<string, FileState>>(new Map());
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (root === null) return;
    for (const path of files) {
      void platform
        .gitConflictVersions(root, path)
        .then((versions) =>
          setStates((prev) =>
            new Map(prev).set(path, {
              ours: versions.ours,
              theirs: versions.theirs,
              resolution: null,
              aiBusy: false,
              error: null,
            }),
          ),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const update = (path: string, patch: Partial<FileState>) =>
    setStates((prev) => {
      const current = prev.get(path);
      if (current === undefined) return prev;
      return new Map(prev).set(path, { ...current, ...patch });
    });

  const resolve = async (path: string, choice: "mine" | "github") => {
    if (root === null) return;
    const state = states.get(path);
    if (state === undefined) return;
    const content =
      choice === "mine" ? (state.ours ?? state.theirs) : (state.theirs ?? state.ours);
    try {
      await platform.writeDoc(root, path, content ?? "");
      update(path, { resolution: choice, error: null });
    } catch (err) {
      update(path, { error: String((err as { message?: string })?.message ?? err) });
    }
  };

  const aiMerge = async (path: string) => {
    if (root === null) return;
    const state = states.get(path);
    if (state === undefined || state.ours === null || state.theirs === null) return;
    const model = loadModel();
    if (model === "") {
      update(path, { error: "Pick a default model in Settings (⌘,) first." });
      return;
    }
    update(path, { aiBusy: true, error: null });
    let merged = "";
    await streamChat(
      model,
      mergeConflictMessages(schema, path, state.ours, state.theirs),
      {
        onDelta: (t) => {
          merged += t;
        },
        onDone: () => {
          void platform
            .writeDoc(root, path, merged.trim() + "\n")
            .then(() => update(path, { resolution: "ai", aiBusy: false }))
            .catch((err: unknown) =>
              update(path, {
                aiBusy: false,
                error: String((err as { message?: string })?.message ?? err),
              }),
            );
        },
        onError: (detail) => update(path, { aiBusy: false, error: detail }),
      },
    );
  };

  const allResolved =
    files.length > 0 &&
    files.every((path) => states.get(path)?.resolution != null);

  const finish = async () => {
    setFinishing(true);
    if (await finishMerge()) onClose();
    else setFinishing(false);
  };

  const cancel = async () => {
    await abortMerge();
    onClose();
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog conflict-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Resolve overlapping changes</h3>
        <p className="dialog-hint">
          These files were changed both here and on GitHub. For each one,
          choose which version to keep — or let AI combine them. You can
          review any result in the editor before finishing.
        </p>

        <ul className="conflict-list">
          {files.map((path) => {
            const state = states.get(path);
            return (
              <li key={path}>
                <div className="conflict-file">
                  <span className="problem-path">{path}</span>
                  {state?.resolution != null && (
                    <span className="ok">
                      ✓{" "}
                      {state.resolution === "mine"
                        ? "kept yours"
                        : state.resolution === "github"
                          ? "using GitHub's"
                          : "AI-merged"}
                    </span>
                  )}
                </div>
                {state === undefined ? (
                  <span className="dialog-hint">Loading…</span>
                ) : (
                  <div className="conflict-actions">
                    <button
                      disabled={state.aiBusy}
                      onClick={() => void resolve(path, "mine")}
                    >
                      Keep mine
                    </button>
                    <button
                      disabled={state.aiBusy}
                      onClick={() => void resolve(path, "github")}
                    >
                      Use GitHub&apos;s
                    </button>
                    {aiReady && state.ours !== null && state.theirs !== null && (
                      <button
                        disabled={state.aiBusy}
                        onClick={() => void aiMerge(path)}
                        title="AI combines both versions; you can review before finishing"
                      >
                        {state.aiBusy ? "Merging…" : "✦ Merge with AI"}
                      </button>
                    )}
                  </div>
                )}
                {state?.error != null && (
                  <p className="dialog-error">{state.error}</p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="dialog-actions">
          <button onClick={() => void cancel()} disabled={finishing}>
            Cancel (undo the pull)
          </button>
          <button
            className="primary"
            disabled={!allResolved || finishing}
            onClick={() => void finish()}
          >
            {finishing ? "Finishing…" : "Finish — save & upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
