import { useState } from "react";
import type { Diagnostic } from "../core/lint";
import { fileName, type TreeDir } from "../core/filetree";

interface FileTreeProps {
  tree: TreeDir;
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
  selectedPath,
  problems,
  problemDirs,
  onSelect,
}: FileTreeProps) {
  // Directories default open; user toggles are remembered per path
  // for the lifetime of the view.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <ul className="file-tree" role="tree">
      <TreeChildren
        dir={tree}
        collapsed={collapsed}
        toggle={toggle}
        selectedPath={selectedPath}
        problems={problems}
        problemDirs={problemDirs}
        onSelect={onSelect}
      />
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

function TreeChildren({ dir, ...rest }: NodeProps & { dir: TreeDir }) {
  return (
    <>
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
            <span className="tree-label">{fileName(file.path)}</span>
            {rest.problems.has(file.path) && (
              <span className="problem-dot" title="Has lint findings" />
            )}
          </button>
        </li>
      ))}
    </>
  );
}

function DirNode({ dir, ...rest }: NodeProps & { dir: TreeDir }) {
  const isCollapsed = rest.collapsed.has(dir.path);
  return (
    <li role="treeitem" aria-expanded={!isCollapsed}>
      <button className="tree-dir" onClick={() => rest.toggle(dir.path)}>
        <span className="chevron">{isCollapsed ? "▸" : "▾"}</span>
        <span className="tree-label">{dir.name}/</span>
        {isCollapsed && rest.problemDirs.has(dir.path) && (
          <span className="problem-dot" title="Has lint findings inside" />
        )}
      </button>
      {!isCollapsed && (
        <ul role="group">
          <TreeChildren dir={dir} {...rest} />
        </ul>
      )}
    </li>
  );
}
