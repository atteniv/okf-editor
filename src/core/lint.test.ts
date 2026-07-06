import { describe, expect, it } from "vitest";
import { buildIndex, parseDoc, type ScanEntry } from "./bundle";
import { lintBundle, lintDoc } from "./lint";
import { DEFAULT_SCHEMA, mergeSchema } from "./schema";

function index(entries: ScanEntry[]) {
  return buildIndex(entries).docs;
}

const OK_DOC: ScanEntry = {
  path: "guides/ok.md",
  content: "---\ntype: guide\ntitle: Fine\n---\n\n# Fine\n",
};

describe("lintDoc", () => {
  it("passes a well-formed doc", () => {
    const docs = index([OK_DOC]);
    expect(lintDoc(docs.get(OK_DOC.path)!, docs, DEFAULT_SCHEMA)).toEqual([]);
  });

  it("OKFE001: flags missing frontmatter", () => {
    const docs = index([{ path: "a.md", content: "# no frontmatter\n" }]);
    const rules = lintDoc(docs.get("a.md")!, docs, DEFAULT_SCHEMA).map((d) => d.rule);
    expect(rules).toEqual(["OKFE001"]);
  });

  it("OKFE002: flags missing type", () => {
    const docs = index([{ path: "a.md", content: "---\ntitle: X\n---\n" }]);
    const rules = lintDoc(docs.get("a.md")!, docs, DEFAULT_SCHEMA).map((d) => d.rule);
    expect(rules).toContain("OKFE002");
  });

  it("OKFE003: warns on a type the schema doesn't know", () => {
    const docs = index([
      { path: "a.md", content: "---\ntype: mystery\ntitle: X\n---\n" },
    ]);
    const diags = lintDoc(docs.get("a.md")!, docs, DEFAULT_SCHEMA);
    expect(diags.map((d) => d.rule)).toContain("OKFE003");
    expect(diags.find((d) => d.rule === "OKFE003")?.severity).toBe("warning");
  });

  it("OKFE004: flags a missing required field (title)", () => {
    const docs = index([{ path: "a.md", content: "---\ntype: guide\n---\n" }]);
    const rules = lintDoc(docs.get("a.md")!, docs, DEFAULT_SCHEMA).map((d) => d.rule);
    expect(rules).toContain("OKFE004");
  });

  it("OKFE005: flags broken links with body offsets", () => {
    const docs = index([
      OK_DOC,
      {
        path: "guides/linker.md",
        content: "---\ntype: guide\ntitle: L\n---\n\nSee [ok](ok.md) and [gone](missing.md).\n",
      },
    ]);
    const doc = docs.get("guides/linker.md")!;
    const broken = lintDoc(doc, docs, DEFAULT_SCHEMA).filter(
      (d) => d.rule === "OKFE005",
    );
    expect(broken).toHaveLength(1);
    expect(broken[0].message).toContain("missing.md");
    expect(doc.body.slice(broken[0].from!, broken[0].to!)).toBe("missing.md");
  });

  it("OKFE006: enforces the tag vocabulary only when unknown tags are disallowed", () => {
    const schema = mergeSchema(DEFAULT_SCHEMA, {
      tagVocabulary: ["approved"],
      allowUnknownTags: false,
    });
    const entry = {
      path: "a.md",
      content: "---\ntype: guide\ntitle: X\ntags:\n  - rogue\n---\n",
    };
    const docs = index([entry]);
    const rules = lintDoc(docs.get("a.md")!, docs, schema).map((d) => d.rule);
    expect(rules).toContain("OKFE006");

    const permissive = lintDoc(docs.get("a.md")!, docs, DEFAULT_SCHEMA).map(
      (d) => d.rule,
    );
    expect(permissive).not.toContain("OKFE006");
  });
});

describe("lintBundle", () => {
  it("maps only paths with findings", () => {
    const docs = index([
      OK_DOC,
      { path: "bad.md", content: "no frontmatter" },
    ]);
    const result = lintBundle(docs, DEFAULT_SCHEMA);
    expect([...result.keys()]).toEqual(["bad.md"]);
  });

  it("finds the intentionally-broken fixture link", () => {
    // parseDoc-level sanity against the shape used by the fixture bundle.
    const doc = parseDoc({
      path: "guides/onboarding.md",
      content: "---\ntype: guide\ntitle: O\n---\n\n[missing](../nope.md)\n",
    });
    const docs = new Map([[doc.path, doc]]);
    const rules = lintDoc(doc, docs, DEFAULT_SCHEMA).map((d) => d.rule);
    expect(rules).toContain("OKFE005");
  });
});
