import { useEffect, useMemo, useRef, useState } from "react";
import { generateDocMessages } from "../core/ai";
import { groupByType, parseDoc } from "../core/bundle";
import { buildFileTree, dirsContaining } from "../core/filetree";
import { splitFrontmatter } from "../core/frontmatter";
import { lintDoc, type Diagnostic, type QuickFix } from "../core/lint";
import { relativize } from "../core/links";
import { renderMarkdown } from "../core/markdown";
import { loadModel, streamChat } from "./aiClient";
import { BundleOverview } from "./BundleOverview";
import { ChatPanel, SparkleIcon } from "./ChatPanel";
import { Editor } from "./Editor";
import { FileOpDialogs, type FileOp } from "./FileOpDialogs";
import { FileTree } from "./FileTree";
import { badgeFor, GitPanel } from "./GitPanel";
import { PublishDialog } from "./PublishDialog";
import { FrontmatterForm } from "./FrontmatterForm";
import { QuickOpen } from "./QuickOpen";
import { useStore, type ViewMode } from "./store";
import { useVerticalResize } from "./useVerticalResize";

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
    allFiles,
    treeMode,
    setTreeMode,
    onEditBody,
    onEditFrontmatter,
    resolveConflict,
    createDoc,
    createFolder,
    renameDoc,
    deleteDoc,
  } = useStore();
  const [showForm, setShowForm] = useState(true);
  const [fileOp, setFileOp] = useState<FileOp | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem("okf-editor.sidebar-width"));
    return Number.isFinite(saved) && saved >= 180 ? saved : 260;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("okf-editor.sidebar-collapsed") === "1",
  );

  const toggleSidebar = () =>
    setSidebarCollapsed((collapsed) => {
      localStorage.setItem("okf-editor.sidebar-collapsed", collapsed ? "0" : "1");
      return !collapsed;
    });

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    document.body.classList.add("resizing");
    const onMove = (move: MouseEvent) => {
      const width = Math.min(520, Math.max(180, startWidth + move.clientX - startX));
      setSidebarWidth(width);
    };
    const onUp = (up: MouseEvent) => {
      const width = Math.min(520, Math.max(180, startWidth + up.clientX - startX));
      localStorage.setItem("okf-editor.sidebar-width", String(width));
      document.body.classList.remove("resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const editorInsertRef = useRef<((text: string) => void) | null>(null);
  const editorNavRef = useRef<((from: number, to: number) => void) | null>(null);
  const [pendingNav, setPendingNav] = useState<{
    path: string;
    from: number;
    to: number;
  } | null>(null);
  const aiReady = useStore((s) => s.aiReady);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const git = useStore((s) => s.git);
  const [publishing, setPublishing] = useState(false);

  // path → status-letter badge for the tree.
  const gitBadges = useMemo(() => {
    const badges = new Map<string, string>();
    for (const change of git?.changes ?? []) {
      badges.set(change.path, badgeFor(change.status));
    }
    return badges;
  }, [git]);

  // Keyboard shortcuts: Cmd/Ctrl+S save, Cmd/Ctrl+N new doc, Cmd/Ctrl+P open.
  const saveNow = useStore((s) => s.saveNow);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveNow();
      } else if (key === "n") {
        e.preventDefault();
        const state = useStore.getState();
        const dir =
          state.selectedPath !== null && state.selectedPath.includes("/")
            ? state.selectedPath.slice(0, state.selectedPath.lastIndexOf("/"))
            : "";
        setFileOp({ kind: "new-doc", dirPath: dir });
      } else if (key === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveNow]);
  const groups = groupByType(docs);
  const fileTree = useMemo(
    () => buildFileTree(allFiles, docs),
    [allFiles, docs],
  );
  const problemDirs = useMemo(
    () => dirsContaining(problems.keys()),
    [problems],
  );
  const selected = selectedPath !== null ? docs.get(selectedPath) : undefined;
  const split = draft !== null ? splitFrontmatter(draft) : null;

  // The draft as a parsed doc (live lint + chat grounding).
  const draftDoc = useMemo(
    () =>
      draft !== null && selectedPath !== null
        ? parseDoc({ path: selectedPath, content: draft })
        : null,
    [draft, selectedPath],
  );
  const draftDiagnostics = useMemo<Diagnostic[]>(
    () => (draftDoc !== null ? lintDoc(draftDoc, docs, schema) : []),
    [draftDoc, docs, schema],
  );
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

  // Flush a problems-panel jump once the target doc's editor is mounted.
  useEffect(() => {
    if (
      pendingNav !== null &&
      pendingNav.path === selectedPath &&
      editorNavRef.current !== null
    ) {
      editorNavRef.current(pendingNav.from, pendingNav.to);
      setPendingNav(null);
    }
  }, [pendingNav, selectedPath, draft]);

  /** Jump to a diagnostic: open its doc, then scroll to the range. */
  const jumpToProblem = (path: string, diagnostic: Diagnostic) => {
    void selectDoc(path);
    if (diagnostic.where === "body" && diagnostic.from !== undefined) {
      setPendingNav({ path, from: diagnostic.from, to: diagnostic.to ?? diagnostic.from });
    }
  };

  /** Apply a lint quick fix (create-doc keeps you where you are). */
  const applyQuickFix = (fix: QuickFix) => {
    if (fix.kind === "create-doc") {
      const dirPath = fix.targetPath.includes("/")
        ? fix.targetPath.slice(0, fix.targetPath.lastIndexOf("/"))
        : "";
      const filename = fix.targetPath.slice(fix.targetPath.lastIndexOf("/") + 1);
      const stem = filename.replace(/\.md$/, "");
      const title = stem
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      const type = Object.keys(schema.types).includes("guide")
        ? "guide"
        : (Object.keys(schema.types)[0] ?? "guide");
      void createDoc({ dirPath, type, title, filename, select: false });
    }
  };

  /** Create + optionally stream AI-generated body into the new doc. */
  const handleCreateDoc = async (args: {
    dirPath: string;
    type: string;
    title: string;
    filename: string;
    aiPrompt?: string;
  }) => {
    await createDoc(args);
    if (args.aiPrompt === undefined) return;
    const model = loadModel();
    if (model === "") {
      setAiError("Pick a default model in AI settings to generate content.");
      return;
    }
    const state = useStore.getState();
    if (state.draft === null) return; // creation failed; store shows the error
    const baseBody = splitFrontmatter(state.draft).body;
    let generated = "";
    setAiBusy(true);
    setAiError(null);
    await streamChat(
      model,
      generateDocMessages(schema, args.type, args.title, args.aiPrompt),
      {
        onDelta: (text) => {
          generated += text;
          useStore.getState().onEditBody(baseBody + generated);
        },
        onDone: () => setAiBusy(false),
        onError: (detail) => {
          setAiBusy(false);
          setAiError(detail);
        },
      },
    );
  };

  const columns = `${sidebarCollapsed ? "0px" : `${sidebarWidth}px`} 1fr${showChat ? " 340px" : ""}`;

  return (
    <div className="bundle-view" style={{ gridTemplateColumns: columns }}>
      {sidebarCollapsed && (
        <button
          className="sidebar-expand"
          onClick={toggleSidebar}
          title="Show sidebar (⌘B)"
        >
          »
        </button>
      )}
      <aside className="sidebar">
        <header>
          <button onClick={() => void closeBundle()} title="Back to start">
            ←
          </button>
          <span className="bundle-name" title={root ?? ""}>
            {root?.split("/").at(-1)}
          </span>
          <div className="tree-toggle">
            <button onClick={toggleSidebar} title="Hide sidebar (⌘B)">
              «
            </button>
            <button
              className={treeMode === "folder" ? "selected" : ""}
              onClick={() => setTreeMode("folder")}
              title="Folder view"
            >
              Files
            </button>
            <button
              className={treeMode === "type" ? "selected" : ""}
              onClick={() => setTreeMode("type")}
              title="Group by type"
            >
              Types
            </button>
          </div>
        </header>
        <nav className="doc-tree">
          {treeMode === "folder" ? (
            <FileTree
              tree={fileTree}
              rootName={root?.split("/").at(-1) ?? "bundle"}
              selectedPath={selectedPath}
              problems={problems}
              problemDirs={problemDirs}
              gitBadges={gitBadges}
              onSelect={(path) => void selectDoc(path)}
              onFileOp={setFileOp}
            />
          ) : (
            [...groups.entries()].map(([type, group]) => (
              <section key={type || UNTYPED_LABEL}>
                <h2>
                  {type || UNTYPED_LABEL}{" "}
                  <span className="count">{group.length}</span>
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
                          <span
                            className="problem-dot"
                            title="Has lint findings"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </nav>

        <GitPanel
          onSelect={(path) => void selectDoc(path)}
          onPublish={() => setPublishing(true)}
        />
        <ProblemsPanel
          problems={problems}
          onJump={jumpToProblem}
          onFix={applyQuickFix}
        />
        <div
          className="sidebar-resizer"
          onMouseDown={startSidebarResize}
          onDoubleClick={toggleSidebar}
          title="Drag to resize · double-click or ⌘B to collapse"
        />
      </aside>

      {fileOp !== null && (
        <FileOpDialogs
          op={fileOp}
          schema={schema}
          aiReady={aiReady}
          onClose={() => setFileOp(null)}
          onCreateDoc={(args) => void handleCreateDoc(args)}
          onCreateFolder={(dir, name) => void createFolder(dir, name)}
          onRename={(from, to) => void renameDoc(from, to)}
          onDelete={(path) => void deleteDoc(path)}
        />
      )}
      {quickOpen && (
        <QuickOpen
          docs={docs}
          onSelect={(path) => void selectDoc(path)}
          onClose={() => setQuickOpen(false)}
        />
      )}
      {publishing && <PublishDialog onClose={() => setPublishing(false)} />}

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
                  className={`sparkle-button ${showChat ? "selected" : ""}`}
                  onClick={() => setShowChat(!showChat)}
                  title="AI assistant"
                >
                  <SparkleIcon />
                </button>
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
            {aiError && (
              <div className="error-banner">
                AI: {aiError}{" "}
                <button onClick={() => setAiError(null)}>dismiss</button>
              </div>
            )}
            {aiBusy && (
              <div className="ai-busy-banner">Generating with AI…</div>
            )}

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
                  registerInsert={(insert) => {
                    editorInsertRef.current = insert;
                  }}
                  registerNavigate={(navigate) => {
                    editorNavRef.current = navigate;
                  }}
                  onQuickFix={applyQuickFix}
                />
              )}
              {viewMode !== "edit" && <Preview source={draft} />}
            </div>
          </>
        ) : docs.size === 0 ? (
          <div className="empty">
            <p>This bundle has no documents yet.</p>
            <button
              className="primary"
              onClick={() => setFileOp({ kind: "new-doc", dirPath: "" })}
            >
              Create your first document
            </button>
          </div>
        ) : (
          <>
            <button
              className="sparkle-button empty-sparkle"
              onClick={() => setShowChat(!showChat)}
              title="AI assistant"
            >
              <SparkleIcon />
            </button>
            <BundleOverview docs={docs} onOpen={(path) => void selectDoc(path)} />
          </>
        )}
      </section>

      {showChat && (
        <ChatPanel
          schema={schema}
          doc={draftDoc}
          docs={docs}
          aiReady={aiReady}
          onOpenSettings={() => setSettingsOpen(true)}
          onInsert={
            selectedPath !== null && viewMode !== "preview"
              ? (text) => editorInsertRef.current?.(text)
              : null
          }
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}

function ProblemsPanel({
  problems,
  onJump,
  onFix,
}: {
  problems: Map<string, Diagnostic[]>;
  onJump: (path: string, diagnostic: Diagnostic) => void;
  onFix: (fix: QuickFix) => void;
}) {
  const [open, setOpen] = useState(false);
  const { height, startResize } = useVerticalResize(
    "okf-editor.problems-height",
    240,
  );
  const total = [...problems.values()].reduce((n, d) => n + d.length, 0);
  if (total === 0) return null;

  return (
    <section className="problems">
      {open && (
        <div
          className="section-resizer"
          onMouseDown={startResize}
          title="Drag to resize"
        />
      )}
      <button className="problems-header" onClick={() => setOpen(!open)}>
        Problems <span className="count">{total}</span>
        <span className="chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="problems-list" style={{ height }}>
          {[...problems.entries()].map(([path, diagnostics]) => (
            <li key={path}>
              <span className="problem-path">{path}</span>
              <ul>
                {diagnostics.map((d, i) => (
                  <li key={i} className={`problem-row ${d.severity}`}>
                    <button
                      className="problem-jump"
                      title="Jump to problem"
                      onClick={() => onJump(path, d)}
                    >
                      {d.message}
                    </button>
                    {d.fix !== undefined && (
                      <button
                        className="problem-fix"
                        title="Create the missing document"
                        onClick={() => onFix(d.fix!)}
                      >
                        Create
                      </button>
                    )}
                  </li>
                ))}
              </ul>
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
