import { useMemo, useState } from "react";
import { groupByType, parseDoc } from "../core/bundle";
import { splitFrontmatter } from "../core/frontmatter";
import { lintDoc, type Diagnostic } from "../core/lint";
import { relativize } from "../core/links";
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
    problems,
    onEditBody,
    onEditFrontmatter,
    resolveConflict,
  } = useStore();
  const [showForm, setShowForm] = useState(true);
  const groups = groupByType(docs);
  const selected = selectedPath !== null ? docs.get(selectedPath) : undefined;
  const split = draft !== null ? splitFrontmatter(draft) : null;

  // Live lint of the current draft (unsaved edits included).
  const draftDiagnostics = useMemo<Diagnostic[]>(() => {
    if (draft === null || selectedPath === null) return [];
    return lintDoc(parseDoc({ path: selectedPath, content: draft }), docs, schema);
  }, [draft, selectedPath, docs, schema]);
  const frontmatterDiagnostics = draftDiagnostics.filter(
    (d) => d.where === "frontmatter",
  );

  // Autocomplete candidates, relative to the open doc.
  const linkTargets = useMemo(() => {
    if (selectedPath === null) return [];
    return [...docs.keys()]
      .filter((path) => path !== selectedPath)
      .map((path) => relativize(selectedPath, path))
      .sort();
  }, [docs, selectedPath]);

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
                      {problems.has(doc.path) && (
                        <span className="problem-dot" title="Has lint findings" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <ProblemsPanel
          problems={problems}
          onOpen={(path) => void selectDoc(path)}
        />
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
            {frontmatterDiagnostics.length > 0 && (
              <ul className="fm-diagnostics">
                {frontmatterDiagnostics.map((d, i) => (
                  <li key={i} className={d.severity}>
                    {d.message} <span className="rule">{d.rule}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className={`work-area ${viewMode}`}>
              {viewMode !== "preview" && (
                <Editor
                  docPath={selectedPath}
                  value={split.body}
                  onChange={onEditBody}
                  diagnostics={draftDiagnostics}
                  linkTargets={linkTargets}
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

function ProblemsPanel({
  problems,
  onOpen,
}: {
  problems: Map<string, Diagnostic[]>;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = [...problems.values()].reduce((n, d) => n + d.length, 0);
  if (total === 0) return null;

  return (
    <section className="problems">
      <button className="problems-header" onClick={() => setOpen(!open)}>
        Problems <span className="count">{total}</span>
        <span className="chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="problems-list">
          {[...problems.entries()].map(([path, diagnostics]) => (
            <li key={path}>
              <button onClick={() => onOpen(path)} title={path}>
                <span className="problem-path">{path}</span>
                <ul>
                  {diagnostics.map((d, i) => (
                    <li key={i} className={d.severity}>
                      {d.message}
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
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
