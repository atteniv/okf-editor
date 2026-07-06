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
