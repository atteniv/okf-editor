import { describe, expect, it } from "vitest";
import { parseDoc } from "./bundle";
import { chatMessages, generateDocMessages, systemPrompt } from "./ai";
import { DEFAULT_SCHEMA } from "./schema";

const DOC = parseDoc({
  path: "guides/a.md",
  content: "---\ntype: guide\ntitle: A\n---\n\n# A\n\nBody text.\n",
});

describe("systemPrompt", () => {
  it("describes OKF and lists schema types", () => {
    const prompt = systemPrompt(DEFAULT_SCHEMA, null);
    expect(prompt).toContain("Open Knowledge Format");
    expect(prompt).toContain("guide");
    expect(prompt).not.toContain("document open");
  });

  it("embeds the open document verbatim when grounded", () => {
    const prompt = systemPrompt(DEFAULT_SCHEMA, DOC);
    expect(prompt).toContain("path: guides/a.md");
    expect(prompt).toContain("Body text.");
  });
});

describe("generateDocMessages", () => {
  const messages = generateDocMessages(
    DEFAULT_SCHEMA,
    "guide",
    "Expense Policy",
    "Cover approvals and limits.",
  );

  it("instructs body-only output (frontmatter stays editor-owned)", () => {
    const user = messages.at(-1)!.content;
    expect(user).toContain('type "guide"');
    expect(user).toContain("do NOT output YAML frontmatter");
    expect(user).toContain("Cover approvals and limits.");
  });

  it("names the type's schema fields", () => {
    expect(messages.at(-1)!.content).toContain("title");
    expect(messages.at(-1)!.content).toContain("status");
  });
});

describe("chatMessages", () => {
  it("prepends grounded system prompt to history", () => {
    const history = [{ role: "user" as const, content: "Summarize this doc" }];
    const messages = chatMessages(DEFAULT_SCHEMA, DOC, history);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("guides/a.md");
    expect(messages.at(-1)).toEqual(history[0]);
  });
});
