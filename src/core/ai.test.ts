import { describe, expect, it } from "vitest";
import { parseDoc } from "./bundle";
import {
  chatMessages,
  extractReferences,
  generateDocMessages,
  mergeConflictMessages,
  parseWebsitePlan,
  renderWebsiteDocument,
  systemPrompt,
  websiteDocPrompt,
  websitePlanPrompt,
} from "./ai";
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
    const messages = chatMessages(DEFAULT_SCHEMA, DOC, [], history);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("guides/a.md");
    expect(messages.at(-1)).toEqual(history[0]);
  });

  it("embeds @-referenced docs, deduping the open one", () => {
    const other = parseDoc({
      path: "policies/p.md",
      content: "---\ntype: policy\ntitle: P\n---\n\nPolicy text.\n",
    });
    const messages = chatMessages(DEFAULT_SCHEMA, DOC, [other, DOC], []);
    expect(messages[0].content).toContain("policies/p.md");
    expect(messages[0].content).toContain("Policy text.");
    // The open doc appears once (as the open doc), not again as a reference.
    expect(messages[0].content.match(/guides\/a\.md/g)).toHaveLength(1);
  });
});

describe("mergeConflictMessages", () => {
  it("presents both versions and demands document-only output", () => {
    const messages = mergeConflictMessages(
      DEFAULT_SCHEMA,
      "guides/a.md",
      "# ours\n",
      "# theirs\n",
    );
    const user = messages.at(-1)!.content;
    expect(user).toContain("guides/a.md");
    expect(user).toContain("# ours");
    expect(user).toContain("# theirs");
    expect(user).toContain("ONLY the merged document");
  });
});

describe("extractReferences", () => {
  it("resolves @[path] tokens against the bundle, ignoring unknowns", () => {
    const docs = new Map([[DOC.path, DOC]]);
    const refs = extractReferences(
      "Compare @[guides/a.md] with @[nope.md] and @[guides/a.md] again",
      docs,
    );
    expect(refs).toEqual([DOC]);
  });
});

describe("websitePlanPrompt", () => {
  it("grounds research in the OKF specification and supplied website", () => {
    const prompt = websitePlanPrompt(
      DEFAULT_SCHEMA,
      "Example Knowledge",
      "https://example.com",
      "Focus on products and policies",
    );

    expect(prompt).toContain("SPEC.md");
    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("Focus on products and policies");
    expect(prompt).toContain("untrusted source material");
    expect(prompt).toContain("4 to 8 documents");
  });
});

describe("parseWebsitePlan", () => {
  const validPlan = {
    siteTitle: "Example",
    siteSummary: "An example organization.",
    sources: [
      { title: "Home", url: "https://example.com/" },
      { title: "About", url: "https://example.com/about" },
    ],
    docs: [
      {
        path: "index.md",
        type: "index",
        title: "Example",
        brief: "Introduce the organization.",
        sourceUrls: ["https://example.com/"],
      },
      {
        path: "guides/about.md",
        type: "guide",
        title: "About Example",
        brief: "Describe the organization.",
        sourceUrls: ["https://example.com/about"],
      },
    ],
  };

  it("accepts a grounded, schema-valid plan", () => {
    expect(
      parseWebsitePlan(JSON.stringify(validPlan), DEFAULT_SCHEMA, "https://example.com"),
    ).toEqual(validPlan);
  });

  it("rejects unsafe paths, unknown types, and off-domain sources", () => {
    for (const docs of [
      [{ ...validPlan.docs[0], path: "../escape.md" }],
      [{ ...validPlan.docs[0], type: "unknown" }],
      [
        {
          ...validPlan.docs[0],
          sourceUrls: ["https://attacker.example/claim"],
        },
      ],
    ]) {
      expect(
        parseWebsitePlan(
          JSON.stringify({ ...validPlan, docs }),
          DEFAULT_SCHEMA,
          "https://example.com",
        ),
      ).toBeNull();
    }
  });

  it("rejects a plan without a root index", () => {
    expect(
      parseWebsitePlan(
        JSON.stringify({ ...validPlan, docs: validPlan.docs.slice(1) }),
        DEFAULT_SCHEMA,
        "https://example.com",
      ),
    ).toBeNull();
  });
});

describe("website document generation", () => {
  const doc = {
    path: "guides/about.md",
    type: "guide",
    title: "About Example",
    brief: "Describe the organization without inventing claims.",
    sourceUrls: ["https://example.com/about"],
  };

  it("asks Perplexity for body-only, source-grounded content", () => {
    const prompt = websiteDocPrompt(DEFAULT_SCHEMA, doc);
    expect(prompt).toContain("do not output YAML frontmatter");
    expect(prompt).toContain("https://example.com/about");
    expect(prompt).toContain("untrusted source material");
  });

  it("renders editor-owned frontmatter and deterministic source links", () => {
    const rendered = renderWebsiteDocument(doc, "## Overview\n\nBody.");
    expect(rendered).toContain("type: guide");
    expect(rendered).toContain("# About Example");
    expect(rendered).toContain("## Sources");
    expect(rendered).toContain("<https://example.com/about>");
  });

  it("does not add forbidden frontmatter to index.md", () => {
    const rendered = renderWebsiteDocument(
      { ...doc, path: "index.md", type: "index" },
      "Welcome.",
    );
    expect(rendered.startsWith("---")).toBe(false);
    expect(rendered).toContain("# About Example");
  });
});
