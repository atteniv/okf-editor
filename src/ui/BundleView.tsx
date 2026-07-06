import { useMemo, useState } from "react";
import { groupByType } from "../core/bundle";
import { splitFrontmatter } from "../core/frontmatter";
import { renderMarkdown } from "../core/markdown";
import { Editor } from "./Editor";
import { FrontmatterForm } from "./FrontmatterForm";
import { useStore, type ViewMode } from "./store";

const UNTYPED_LABEL = "(no type)";
const MODES: { key: ViewMode; label: string }[] = [
  { key: "edit", label: "Edit" },
  { key: "split", label: "Split" },
  { key: "preview", label: "Preview" },
];

export function BundleView() {
  const {
    root,
    docs,
    selectedPath,
    selectDoc,
    closeBundle,
    viewMode,
    setViewMode,
    draft,
    dirty,
    conflict,
    error,
    schema,
    schemaError,
    onEditBody,
    onEditFrontmatter,
    resolveConflict,
  } = useStore();
  const [showForm, setShowForm] = useState(true);
  const groups = groupByType(docs);
  const selected = selectedPath !== null ? docs.get(selectedPath) : undefined;
  const split = draft !== null ? splitFrontmatter(draft) : null;

  return (
    <div className="bundle-view">
      <aside className="sidebar">
        <header>
          <button onClick={() => void closeBundle()} title="Back to start">
            ←
          </button>
          <span className="bundle-name" title={root ?? ""}>
            {root?.split("/").at(-1)}
          </span>
        </header>
        <nav className="doc-tree">
          {[...groups.entries()].map(([type, group]) => (
            <section key={type || UNTYPED_LABEL}>
              <h2>
                {type || UNTYPED_LABEL} <span className="count">{group.length}</span>
              </h2>
              <ul>
                {group.map((doc) => (
                  <li key={doc.path}>
                    <button
                      className={doc.path === selectedPath ? "selected" : ""}
                      onClick={() => void selectDoc(doc.path)}
                      title={doc.path}
                    >
                      {doc.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <section className="doc-pane">
        {selected && selectedPath !== null && draft !== null && split !== null ? (
          <>
            <header className="doc-toolbar">
              <div className="doc-meta">
                <span className="doc-path">{selected.path}</span>
                <span className={dirty ? "save-state dirty" : "save-state"}>
                  {dirty ? "●" : "Saved"}
                </span>
              </div>
              <div className="mode-toggle">
                <button
                  className={showForm ? "selected" : ""}
                  onClick={() => setShowForm(!showForm)}
                  title="Toggle frontmatter form"
                >
                  Frontmatter
                </button>
                {MODES.map(({ key, label }) => (
                  <button
                    key={key}
                    className={viewMode === key ? "selected" : ""}
                    onClick={() => setViewMode(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </header>

            {conflict && (
              <div className="conflict-banner">
                <span>
                  This document changed on disk while you were editing.
                </span>
                <button onClick={() => void resolveConflict("reload")}>
                  Reload from disk
                </button>
                <button onClick={() => void resolveConflict("keep-mine")}>
                  Keep mine
                </button>
              </div>
            )}
            {error && <div className="error-banner">{error}</div>}
            {schemaError && <div className="error-banner">{schemaError}</div>}

            {showForm && (
              <FrontmatterForm
                frontmatterRaw={split.frontmatterRaw}
                schema={schema}
                docPaths={[...docs.keys()]}
                onChange={onEditFrontmatter}
              />
            )}

            <div className={`work-area ${viewMode}`}>
              {viewMode !== "preview" && (
                <Editor
                  docPath={selectedPath}
                  value={split.body}
                  onChange={onEditBody}
                />
              )}
              {viewMode !== "edit" && <Preview source={draft} />}
            </div>
          </>
        ) : (
          <p className="empty">Select a document from the tree.</p>
        )}
      </section>
    </div>
  );
}

function Preview({ source }: { source: string }) {
  // Preview renders the prose body; frontmatter isn't prose.
  const html = useMemo(
    () => renderMarkdown(splitFrontmatter(source).body),
    [source],
  );
  // Safe: renderMarkdown is the app's single, always-sanitizing
  // markdown pipeline (DESIGN §9).
  return (
    <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
