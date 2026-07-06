/**
 * Outbound-link extraction for the bundle index (docs/DESIGN.md §6.5).
 * Markdown links only for now; wiki-links arrive with the config toggle.
 */

export interface OutLink {
  /** Normalized bundle-relative target path. */
  target: string;
  /** The raw link destination as written in the source. */
  raw: string;
  /** Offsets of the destination text within the doc body. */
  from: number;
  to: number;
}

// [text](dest) and ![alt](dest), with an optional "title".
const LINK_RE = /!?\[[^\]]*\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g;

const EXTERNAL_RE = /^[a-z][a-z0-9+.-]*:/i; // http:, mailto:, etc.

/**
 * Extract links from a doc body and resolve them relative to the doc's
 * bundle-relative path. External URLs and pure-anchor links are skipped.
 */
export function extractLinks(docPath: string, body: string): OutLink[] {
  const links: OutLink[] = [];
  for (const match of body.matchAll(LINK_RE)) {
    const raw = match[1];
    if (EXTERNAL_RE.test(raw) || raw.startsWith("#")) continue;
    const withoutAnchor = raw.split("#")[0];
    if (withoutAnchor === "") continue;
    const target = resolveRelative(docPath, decodeURI(withoutAnchor));
    if (target !== null) {
      const from = match.index + match[0].indexOf("(") + 1;
      links.push({ target, raw, from, to: from + raw.length });
    }
  }
  return links;
}

/**
 * Resolve `dest` against the directory of `fromPath` (both POSIX-style,
 * bundle-relative). Returns null if the path escapes the bundle root —
 * such links are simply broken, never resolved outside.
 */
export function resolveRelative(fromPath: string, dest: string): string | null {
  const base = fromPath.split("/").slice(0, -1);
  const parts = dest.startsWith("/") ? [] : [...base];
  const segments = dest.startsWith("/") ? dest.slice(1).split("/") : dest.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null; // escapes the bundle
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

/**
 * The relative path from `fromPath`'s directory to `targetPath` — what link
 * autocomplete inserts.
 */
export function relativize(fromPath: string, targetPath: string): string {
  const fromDir = fromPath.split("/").slice(0, -1);
  const target = targetPath.split("/");
  let common = 0;
  while (
    common < fromDir.length &&
    common < target.length - 1 &&
    fromDir[common] === target[common]
  ) {
    common++;
  }
  const ups = fromDir.length - common;
  return [...Array<string>(ups).fill(".."), ...target.slice(common)].join("/");
}
