import { useState } from "react";
import type { Diagnostic } from "../core/lint";
import type { TreeDir } from "../core/filetree";

interface FileTreeProps {
  tree: TreeDir;
  /** Bundle folder name, shown as the root node. */
  rootName: string;
  selectedPath: string | null;
  problems: Map<string, Diagnostic[]>;
  /** Directories with findings somewhere beneath them. */
  problemDirs: Set<string>;
  onSelect: (path: string) => void;
}

/**
 * File-manager-style folder tree (DESIGN §6.1's folder view). Hand-rolled:
 * our data is already indexed, and a recursive component is smaller than
 * any tree library's integration surface. Revisit (react-arborist) when
 * drag-to-move lands with the rename machinery.
 */
export function FileTree({
  tree,
  rootName,
  selectedPath,
  problems,
  problemDirs,
  onSelect,
}: FileTreeProps) {
  // Directories default open; user toggles are remembered per path
  // for the lifetime of the view. "" is the root.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const shared = { collapsed, toggle, selectedPath, problems, problemDirs, onSelect };

  return (
    <ul className="file-tree" role="tree">
      <DirNode dir={tree} label={rootName} {...shared} />
    </ul>
  );
}

interface NodeProps {
  collapsed: Set<string>;
  toggle: (path: string) => void;
  selectedPath: string | null;
  problems: Map<string, Diagnostic[]>;
  problemDirs: Set<string>;
  onSelect: (path: string) => void;
}

function DirNode({
  dir,
  label,
  ...rest
}: NodeProps & { dir: TreeDir; label?: string }) {
  const isCollapsed = rest.collapsed.has(dir.path);
  const hasFindingsInside =
    dir.path === "" ? rest.problems.size > 0 : rest.problemDirs.has(dir.path);
  return (
    <li role="treeitem" aria-expanded={!isCollapsed}>
      <button className="tree-dir" onClick={() => rest.toggle(dir.path)}>
        <span className="chevron">{isCollapsed ? "›" : "⌄"}</span>
        <span className="tree-label">{label ?? dir.name}</span>
        {isCollapsed && hasFindingsInside && (
          <span className="problem-dot" title="Has lint findings inside" />
        )}
      </button>
      {!isCollapsed && (
        <ul role="group">
          {dir.dirs.map((child) => (
            <DirNode key={child.path} dir={child} {...rest} />
          ))}
          {dir.files.map((file) =>
            file.doc !== undefined ? (
              <li key={file.path} role="treeitem">
                <button
                  className={`tree-file ${file.path === rest.selectedPath ? "selected" : ""}`}
                  onClick={() => rest.onSelect(file.path)}
                  title={`${file.doc.title} — ${file.path}`}
                >
                  <FileIcon />
                  <span className="tree-label">{file.name}</span>
                  {rest.problems.has(file.path) && (
                    <span className="problem-dot" title="Has lint findings" />
                  )}
                </button>
              </li>
            ) : (
              <li key={file.path} role="treeitem">
                {/* Non-markdown bundle file: visible, not (yet) openable. */}
                <span className="tree-file tree-file-inert" title={file.path}>
                  <FileIcon />
                  <span className="tree-label">{file.name}</span>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </li>
  );
}

/** "</>"-style source-file glyph, matching the reference design. */
function FileIcon() {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"
      />
    </svg>
  );
}
