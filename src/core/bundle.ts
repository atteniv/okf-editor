import { getType, parseFrontmatter, splitFrontmatter } from "./frontmatter";
import { extractLinks, type OutLink } from "./links";

/**
 * The in-memory bundle index (docs/DESIGN.md §4). Built from a full scan,
 * kept fresh incrementally by watcher events (M1 week 2).
 */

export interface ScanEntry {
  path: string;
  /** Markdown files carry content; other bundle files are path-only. */
  content: string | null;
}

export interface DocMeta {
  path: string;
  /** OKF `type` frontmatter field; null when absent. */
  type: string | null;
  /** frontmatter title ?? first H1 ?? filename stem. */
  title: string;
  tags: string[];
  frontmatterRaw: string | null;
  body: string;
  /** The full file source — what the editor edits. */
  source: string;
  links: OutLink[];
}

export interface BundleIndex {
  docs: Map<string, DocMeta>;
  /** target path -> paths of docs linking to it (graph-ready, DESIGN §4). */
  backlinks: Map<string, string[]>;
}

export function parseDoc(entry: { path: string; content: string }): DocMeta {
  const { frontmatterRaw, body } = splitFrontmatter(entry.content);
  return {
    path: entry.path,
    type: getType(frontmatterRaw),
    title: deriveTitle(entry.path, frontmatterRaw, body),
    tags: deriveTags(frontmatterRaw),
    frontmatterRaw,
    body,
    source: entry.content,
    links: extractLinks(entry.path, body),
  };
}

export function buildIndex(entries: ScanEntry[]): BundleIndex {
  const docs = new Map<string, DocMeta>();
  for (const entry of entries) {
    if (entry.content === null) continue; // non-markdown: tree-only
    docs.set(entry.path, parseDoc({ path: entry.path, content: entry.content }));
  }
  return { docs, backlinks: buildBacklinks(docs) };
}

export function buildBacklinks(docs: Map<string, DocMeta>): Map<string, string[]> {
  const backlinks = new Map<string, string[]>();
  for (const doc of docs.values()) {
    for (const link of doc.links) {
      const sources = backlinks.get(link.target) ?? [];
      if (!sources.includes(doc.path)) sources.push(doc.path);
      backlinks.set(link.target, sources);
    }
  }
  return backlinks;
}

/** Group doc paths by `type` for the tree view; null types group under "". */
export function groupByType(docs: Map<string, DocMeta>): Map<string, DocMeta[]> {
  const groups = new Map<string, DocMeta[]>();
  const sorted = [...docs.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
  for (const doc of sorted) {
    const key = doc.type ?? "";
    const group = groups.get(key) ?? [];
    group.push(doc);
    groups.set(key, group);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function deriveTitle(
  path: string,
  frontmatterRaw: string | null,
  body: string,
): string {
  if (frontmatterRaw !== null) {
    const title = parseFrontmatter(frontmatterRaw).get("title");
    if (typeof title === "string" && title.trim() !== "") return title;
  }
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  const stem = path.split("/").at(-1) ?? path;
  return stem.replace(/\.(md|markdown)$/, "");
}

function deriveTags(frontmatterRaw: string | null): string[] {
  if (frontmatterRaw === null) return [];
  const tags = parseFrontmatter(frontmatterRaw).toJS()?.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string");
}
