import type { DocMeta } from "./bundle";
import { fieldsForType, type SchemaConfig } from "./schema";

/**
 * Prompt construction for the AI assistant (pure TS — testable, no IO).
 * The privacy contract: whatever these functions embed is exactly what
 * leaves the machine (to OpenRouter, under the user's own key).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const BASE_PROMPT = `You are the writing assistant inside OKF Editor, a desktop editor for Open Knowledge Format (OKF) bundles. OKF documents are markdown files with YAML frontmatter; the only required frontmatter field is \`type\`. Write clear, well-structured markdown prose. Use relative markdown links between documents when referencing other documents in the bundle.`;

/** System prompt, grounded in the open document and any @-referenced docs. */
export function systemPrompt(
  schema: SchemaConfig,
  doc: DocMeta | null,
  references: DocMeta[] = [],
): string {
  const parts = [BASE_PROMPT];
  const types = Object.keys(schema.types);
  if (types.length > 0) {
    parts.push(`Document types in this bundle's schema: ${types.join(", ")}.`);
  }
  if (schema.tagVocabulary.length > 0) {
    parts.push(`Preferred tag vocabulary: ${schema.tagVocabulary.join(", ")}.`);
  }
  if (doc !== null) {
    parts.push(
      `The user has this document open (path: ${doc.path}):\n\n` +
        "```markdown\n" +
        doc.source +
        "\n```",
    );
  }
  for (const reference of references) {
    if (reference.path === doc?.path) continue;
    parts.push(
      `The user referenced this bundle document (path: ${reference.path}):\n\n` +
        "```markdown\n" +
        reference.source +
        "\n```",
    );
  }
  return parts.join("\n\n");
}

export interface PlannedDoc {
  path: string;
  type: string;
  title: string;
  brief: string;
}

/** Messages asking the model to PLAN a new bundle (structure only). */
export function planBundleMessages(
  schema: SchemaConfig,
  bundleName: string,
  description: string,
): ChatMessage[] {
  const types = Object.keys(schema.types).join(", ");
  return [
    { role: "system", content: systemPrompt(schema, null) },
    {
      role: "user",
      content:
        `Plan the initial structure for a new OKF bundle named "${bundleName}".\n\n` +
        `What the bundle should cover:\n${description}\n\n` +
        `Respond with ONLY a JSON object, no prose or code fences:\n` +
        `{"docs": [{"path": "dir/file.md", "type": "one of: ${types}", ` +
        `"title": "Doc title", "brief": "one sentence on what it covers"}]}\n\n` +
        `Rules: 4 to 8 documents; include an index.md at the root (type index); ` +
        `group related docs in directories; kebab-case filenames.`,
    },
  ];
}

/** Lenient plan parse: accepts fenced/prefixed output around the JSON. */
export function parseBundlePlan(text: string): PlannedDoc[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const docs = (parsed as { docs?: unknown }).docs;
  if (!Array.isArray(docs)) return null;
  const valid = docs.filter(
    (d): d is PlannedDoc =>
      typeof d === "object" &&
      d !== null &&
      typeof (d as PlannedDoc).path === "string" &&
      (d as PlannedDoc).path.endsWith(".md") &&
      !(d as PlannedDoc).path.startsWith("/") &&
      !(d as PlannedDoc).path.includes("..") &&
      typeof (d as PlannedDoc).type === "string" &&
      typeof (d as PlannedDoc).title === "string" &&
      typeof (d as PlannedDoc).brief === "string",
  );
  return valid.length > 0 ? valid : null;
}

/** Messages asking the model to merge two conflicting document versions. */
export function mergeConflictMessages(
  schema: SchemaConfig,
  path: string,
  ours: string,
  theirs: string,
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt(schema, null) },
    {
      role: "user",
      content:
        `The document "${path}" was edited in two places at once and the versions conflict. ` +
        `Merge them into ONE document that preserves the intent of both — keep additions from ` +
        `each side, and where the same passage differs, prefer the more complete or more recent-looking wording. ` +
        `Output ONLY the merged document (frontmatter and body), with no commentary and no code fences.\n\n` +
        `MY VERSION:\n\`\`\`markdown\n${ours}\n\`\`\`\n\n` +
        `THE VERSION FROM GITHUB:\n\`\`\`markdown\n${theirs}\n\`\`\``,
    },
  ];
}

/** `@[path]` tokens in a chat message → the docs they reference. */
export function extractReferences(
  text: string,
  docs: Map<string, DocMeta>,
): DocMeta[] {
  const references: DocMeta[] = [];
  for (const match of text.matchAll(/@\[([^\]]+)\]/g)) {
    const doc = docs.get(match[1]);
    if (doc !== undefined && !references.includes(doc)) references.push(doc);
  }
  return references;
}

/**
 * Messages for generate-on-create: the model writes the body to follow the
 * already-created skeleton (frontmatter and H1 stay editor-owned).
 */
export function generateDocMessages(
  schema: SchemaConfig,
  type: string,
  title: string,
  userPrompt: string,
): ChatMessage[] {
  const fields = fieldsForType(schema, type)
    .map((f) => f.key)
    .join(", ");
  return [
    { role: "system", content: systemPrompt(schema, null) },
    {
      role: "user",
      content:
        `Write the markdown body for a new OKF document of type "${type}" titled "${title}". ` +
        `(Its frontmatter — ${fields} — and the top-level "# ${title}" heading already exist; ` +
        `do NOT output YAML frontmatter or repeat the H1. Start directly with the content.)\n\n` +
        `What the document should contain:\n${userPrompt}`,
    },
  ];
}

/** Messages for the chat panel: history plus fresh doc/reference grounding. */
export function chatMessages(
  schema: SchemaConfig,
  doc: DocMeta | null,
  references: DocMeta[],
  history: ChatMessage[],
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt(schema, doc, references) },
    ...history,
  ];
}
