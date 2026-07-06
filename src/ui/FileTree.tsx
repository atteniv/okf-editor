import { useState } from "react";
import type { Diagnostic } from "../core/lint";
import { fileName, type TreeDir } from "../core/filetree";

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
        <span className="chevron">{isCollapsed ? "▸" : "▾"}</span>
        <FolderIcon open={!isCollapsed} />
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
          {dir.files.map((file) => (
            <li key={file.path} role="treeitem">
              <button
                className={`tree-file ${file.path === rest.selectedPath ? "selected" : ""}`}
                onClick={() => rest.onSelect(file.path)}
                title={`${file.title} — ${file.path}`}
              >
                <FileIcon />
                <span className="tree-label">{fileName(file.path)}</span>
                {rest.problems.has(file.path) && (
                  <span className="problem-dot" title="Has lint findings" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" aria-hidden="true">
      {open ? (
        <path
          fill="currentColor"
          d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2l1.3 1.5H13A1.5 1.5 0 0 1 14.5 5v.5H4.1a1.5 1.5 0 0 0-1.44 1.08L1.5 10.6V3.5Zm.4 9.5 1.63-5.42A.5.5 0 0 1 4.1 6.5h10.03a.5.5 0 0 1 .48.64L13.2 12.5a.7.7 0 0 1-.67.5H1.9Z"
        />
      ) : (
        <path
          fill="currentColor"
          d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2l1.3 1.5H13A1.5 1.5 0 0 1 14.5 5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12v-8.5Z"
        />
      )}
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        d="M4 1.75h5.5L12.25 4.5V14A.25.25 0 0 1 12 14.25H4A.25.25 0 0 1 3.75 14V2A.25.25 0 0 1 4 1.75Z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1" d="M9.5 2v2.75h2.75" />
    </svg>
  );
}
