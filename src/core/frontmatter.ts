import { Document, parseDocument } from "yaml";

/**
 * Frontmatter handling with round-trip safety (docs/DESIGN.md §6.4).
 *
 * All edits go through the yaml Document API so comments, key order, quoting
 * style, and unknown keys survive parse → edit → stringify. The parity tests
 * in frontmatter.test.ts assert minimal diffs on edit.
 */

export interface SplitDoc {
  /** Raw YAML between the --- fences, without the fences. Null if no block. */
  frontmatterRaw: string | null;
  /** Markdown body after the frontmatter block (or the whole file). */
  body: string;
}

const FENCE = "---";

/** Split a markdown file into its frontmatter block and body. */
export function splitFrontmatter(source: string): SplitDoc {
  if (!source.startsWith(FENCE + "\n") && source !== FENCE) {
    return { frontmatterRaw: null, body: source };
  }
  const closeAt = source.indexOf("\n" + FENCE, FENCE.length);
  if (closeAt === -1) {
    // Unterminated fence — treat the whole file as body rather than guessing.
    return { frontmatterRaw: null, body: source };
  }
  const frontmatterRaw = source.slice(FENCE.length + 1, closeAt);
  let body = source.slice(closeAt + 1 + FENCE.length);
  if (body.startsWith("\n")) body = body.slice(1);
  return { frontmatterRaw, body };
}

/** Reassemble a markdown file from frontmatter YAML and body. */
export function joinFrontmatter(frontmatterRaw: string | null, body: string): string {
  if (frontmatterRaw === null) return body;
  const yamlBlock = frontmatterRaw.endsWith("\n")
    ? frontmatterRaw
    : frontmatterRaw + "\n";
  return `${FENCE}\n${yamlBlock}${FENCE}\n${body}`;
}

/** Parse frontmatter YAML preserving formatting. */
export function parseFrontmatter(frontmatterRaw: string): Document {
  return parseDocument(frontmatterRaw);
}

/**
 * Set a single top-level key, preserving everything else, and return the
 * updated YAML text. The only sanctioned write path for frontmatter.
 */
export function setKey(frontmatterRaw: string, key: string, value: unknown): string {
  const doc = parseDocument(frontmatterRaw);
  doc.set(key, value);
  return doc.toString();
}

/** Delete a single top-level key and return the updated YAML text. */
export function deleteKey(frontmatterRaw: string, key: string): string {
  const doc = parseDocument(frontmatterRaw);
  doc.delete(key);
  return doc.toString();
}

/** Read the OKF `type` field (the one required OKF frontmatter field). */
export function getType(frontmatterRaw: string | null): string | null {
  if (frontmatterRaw === null) return null;
  const value = parseDocument(frontmatterRaw).get("type");
  return typeof value === "string" ? value : null;
}
