import type { DocMeta } from "./bundle";

/**
 * Nested directory structure for the folder view of the sidebar
 * (docs/DESIGN.md §6.1 — the toggle counterpart to group-by-type).
 */

export interface TreeDir {
  /** Directory name ("" for the bundle root). */
  name: string;
  /** Bundle-relative directory path ("" for the root). */
  path: string;
  dirs: TreeDir[];
  files: DocMeta[];
}

/**
 * Build the directory tree from the doc index. Directories sort
 * alphabetically; files sort with `index.md` first (a directory's cover
 * page), then alphabetically by filename.
 */
export function buildFileTree(docs: Map<string, DocMeta>): TreeDir {
  const root: TreeDir = { name: "", path: "", dirs: [], files: [] };
  const dirIndex = new Map<string, TreeDir>([["", root]]);

  const ensureDir = (path: string): TreeDir => {
    const existing = dirIndex.get(path);
    if (existing !== undefined) return existing;
    const parentPath = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "";
    const parent = ensureDir(parentPath);
    const dir: TreeDir = {
      name: path.slice(path.lastIndexOf("/") + 1),
      path,
      dirs: [],
      files: [],
    };
    parent.dirs.push(dir);
    dirIndex.set(path, dir);
    return dir;
  };

  for (const doc of docs.values()) {
    const dirPath = doc.path.includes("/")
      ? doc.path.slice(0, doc.path.lastIndexOf("/"))
      : "";
    ensureDir(dirPath).files.push(doc);
  }

  for (const dir of dirIndex.values()) {
    dir.dirs.sort((a, b) => a.name.localeCompare(b.name));
    dir.files.sort((a, b) => {
      const aIndex = fileName(a.path) === "index.md";
      const bIndex = fileName(b.path) === "index.md";
      if (aIndex !== bIndex) return aIndex ? -1 : 1;
      return fileName(a.path).localeCompare(fileName(b.path));
    });
  }
  return root;
}

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Directory paths that contain (transitively) any of the given doc paths. */
export function dirsContaining(paths: Iterable<string>): Set<string> {
  const dirs = new Set<string>();
  for (const path of paths) {
    let current = path;
    while (current.includes("/")) {
      current = current.slice(0, current.lastIndexOf("/"));
      dirs.add(current);
    }
  }
  return dirs;
}
