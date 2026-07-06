import type { DocMeta } from "./bundle";
import { joinFrontmatter } from "./frontmatter";
import { relativize } from "./links";

/**
 * Link rewriting for rename/move (docs/DESIGN.md §6.5): when a doc moves,
 * every inbound link is retargeted, and the moved doc's own relative links
 * are recomputed. Edits are offset-based splices into the body — same
 * minimal-diff discipline as frontmatter editing.
 */

/** Full new file sources, keyed by (old) doc path. Apply then save each. */
export function rewriteLinksForRename(
  docs: Map<string, DocMeta>,
  backlinks: Map<string, string[]>,
  oldPath: string,
  newPath: string,
): Map<string, string> {
  const updates = new Map<string, string>();

  // Inbound: every doc that links to oldPath points at newPath instead.
  for (const sourcePath of backlinks.get(oldPath) ?? []) {
    if (sourcePath === oldPath) continue; // self-links handled below
    const source = docs.get(sourcePath);
    if (source === undefined) continue;
    const newBody = replaceTargets(source, oldPath, (anchor) =>
      relativize(sourcePath, newPath) + anchor,
    );
    updates.set(sourcePath, joinFrontmatter(source.frontmatterRaw, newBody));
  }

  // Own links: if the doc changed directory, its relative links shift.
  const moved = docs.get(oldPath);
  if (moved !== undefined && dirOf(oldPath) !== dirOf(newPath)) {
    let body = moved.body;
    // Splice from the end so earlier offsets stay valid.
    for (const link of [...moved.links].sort((a, b) => b.from - a.from)) {
      const anchor = anchorOf(link.raw);
      const target = link.target === oldPath ? newPath : link.target;
      const newRaw = relativize(newPath, target) + anchor;
      body = body.slice(0, link.from) + newRaw + body.slice(link.to);
    }
    updates.set(oldPath, joinFrontmatter(moved.frontmatterRaw, body));
  }

  return updates;
}

function replaceTargets(
  source: DocMeta,
  targetPath: string,
  makeRaw: (anchor: string) => string,
): string {
  let body = source.body;
  const matching = source.links
    .filter((link) => link.target === targetPath)
    .sort((a, b) => b.from - a.from); // splice from the end
  for (const link of matching) {
    body =
      body.slice(0, link.from) + makeRaw(anchorOf(link.raw)) + body.slice(link.to);
  }
  return body;
}

function anchorOf(raw: string): string {
  const hash = raw.indexOf("#");
  return hash === -1 ? "" : raw.slice(hash);
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}
