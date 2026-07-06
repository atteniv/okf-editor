import {
  Document,
  isMap,
  isNode,
  isScalar,
  parseDocument,
  Scalar,
  type Pair,
} from "yaml";

/**
 * Frontmatter handling with round-trip safety (docs/DESIGN.md §6.4).
 *
 * Edits are SURGICAL: we locate the edited node's byte range in the original
 * text via the yaml AST and splice in the new value, leaving every other byte
 * untouched. Re-stringifying the whole document (doc.toString()) is avoided
 * because it normalizes formatting far from the edit — refolds block scalars,
 * respaces flow collections — which violates minimal-diff. The document API
 * remains only as a fallback for shapes the splicer doesn't handle. The
 * guarantee is enforced by frontmatter.roundtrip.test.ts.
 */

export type ScalarValue = string | number | boolean;
export type FieldValue = ScalarValue | ScalarValue[] | null;

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

/** Read the OKF `type` field (the one required OKF frontmatter field). */
export function getType(frontmatterRaw: string | null): string | null {
  if (frontmatterRaw === null) return null;
  const value = parseDocument(frontmatterRaw).get("type");
  return typeof value === "string" ? value : null;
}

/**
 * Set a single top-level key and return the updated YAML text, touching
 * only that key's bytes. The only sanctioned write path for frontmatter.
 */
export function setKey(
  frontmatterRaw: string,
  key: string,
  value: FieldValue,
): string {
  const doc = parseDocument(frontmatterRaw);
  const pair = findTopLevelPair(doc, key);

  if (pair === null) {
    // New key: append a line; nothing else moves.
    const base =
      frontmatterRaw === "" || frontmatterRaw.endsWith("\n")
        ? frontmatterRaw
        : frontmatterRaw + "\n";
    return base + renderPair(key, value) + "\n";
  }

  // Scalar → scalar: splice just the value text (keeps inline comments).
  const valueRange = nodeRange(pair.value);
  if (isScalar(pair.value) && valueRange !== undefined && isScalarValue(value)) {
    const [start, end] = valueRange;
    return (
      frontmatterRaw.slice(0, start) +
      renderScalar(value, pair.value) +
      frontmatterRaw.slice(end)
    );
  }

  // Empty value (`key:`): insert after the colon.
  if (pair.value === null || pair.value === undefined) {
    const keyEnd = keyRange(pair)?.[1];
    const colon = keyEnd !== undefined ? frontmatterRaw.indexOf(":", keyEnd) : -1;
    if (colon !== -1 && isScalarValue(value)) {
      return (
        frontmatterRaw.slice(0, colon + 1) +
        " " +
        renderScalar(value) +
        frontmatterRaw.slice(colon + 1)
      );
    }
  }

  // Everything else (lists, kind changes): replace the pair's region.
  // Block-collection ranges include their trailing newline — leave it be,
  // renderPair emits no trailing newline.
  const start = keyRange(pair)?.[0];
  let end = valueRange?.[1];
  while (end !== undefined && end > 0 && frontmatterRaw[end - 1] === "\n") {
    end--;
  }
  if (start !== undefined && end !== undefined) {
    return (
      frontmatterRaw.slice(0, start) +
      renderPair(key, value) +
      frontmatterRaw.slice(end)
    );
  }

  // Fallback: document API (may normalize formatting).
  doc.set(key, value);
  return doc.toString();
}

/** Delete a single top-level key (its lines only) and return the YAML text. */
export function deleteKey(frontmatterRaw: string, key: string): string {
  const doc = parseDocument(frontmatterRaw);
  const pair = findTopLevelPair(doc, key);
  if (pair === null) return frontmatterRaw;

  const keyStart = keyRange(pair)?.[0];
  const valueEnd = nodeRange(pair.value ?? pair.key)?.[1];
  if (keyStart === undefined || valueEnd === undefined) {
    doc.delete(key); // fallback
    return doc.toString();
  }
  const lineStart = frontmatterRaw.lastIndexOf("\n", keyStart - 1) + 1;
  const nextNewline = frontmatterRaw.indexOf("\n", valueEnd);
  const lineEnd = nextNewline === -1 ? frontmatterRaw.length : nextNewline + 1;
  return frontmatterRaw.slice(0, lineStart) + frontmatterRaw.slice(lineEnd);
}

// ---- internals ----

function findTopLevelPair(doc: Document, key: string): Pair | null {
  if (!isMap(doc.contents)) return null;
  return (
    doc.contents.items.find(
      (item) => isScalar(item.key) && item.key.value === key,
    ) ?? null
  );
}

function nodeRange(
  node: unknown,
): readonly [number, number, number] | undefined {
  return isNode(node) && node.range != null ? node.range : undefined;
}

function keyRange(pair: Pair): readonly [number, number, number] | undefined {
  return nodeRange(pair.key);
}

function isScalarValue(value: unknown): value is ScalarValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

const PLAIN_SAFE = /^[A-Za-z0-9](?:[A-Za-z0-9 _./@-]*[A-Za-z0-9_./@-])?$/;
const PLAIN_RESERVED =
  /^(true|false|null|yes|no|on|off|~|[+-]?\d[\d_]*(\.\d*)?([eE][+-]?\d+)?)$/i;

/** Render one scalar, preferring the style of the node it replaces. */
function renderScalar(value: ScalarValue, oldNode?: Scalar): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (oldNode?.type === Scalar.QUOTE_SINGLE && !value.includes("'")) {
    return `'${value}'`;
  }
  if (oldNode?.type === Scalar.QUOTE_DOUBLE) {
    return JSON.stringify(value);
  }
  if (PLAIN_SAFE.test(value) && !PLAIN_RESERVED.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

/** Render a whole `key: value` fragment (no trailing newline). */
function renderPair(key: string, value: FieldValue): string {
  if (value === null) return `${key}:`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    const items = value.map((item) => `  - ${renderScalar(item)}`);
    return `${key}:\n${items.join("\n")}`;
  }
  return `${key}: ${renderScalar(value)}`;
}
