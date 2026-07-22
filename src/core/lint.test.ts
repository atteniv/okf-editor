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

  it("does not require frontmatter on a reserved index document", () => {
    const docs = index([
      { path: "company/index.md", content: "# Company\n\n* [Atteniv](atteniv.md)\n" },
    ]);

    expect(
      lintDoc(docs.get("company/index.md")!, docs, DEFAULT_SCHEMA).map(
        (diagnostic) => diagnostic.rule,
      ),
    ).not.toContain("OKFE001");
  });

  it("OKFE001: uses the generic reference type for concept documents", () => {
    const docs = index([{ path: "SPEC.md", content: "# OKF specification\n" }]);

    expect(lintDoc(docs.get("SPEC.md")!, docs, DEFAULT_SCHEMA)[0].fix).toEqual({
      kind: "add-frontmatter",
      typeName: "reference",
      title: "OKF specification",
    });
  });

  it("validates reserved document structure without concept rules", () => {
    const docs = index([
      {
        path: "log.md",
        content: "---\ntype: reference\n---\n# Log\n\n## yesterday\n* Changed it.\n",
      },
    ]);
    const rules = lintDoc(docs.get("log.md")!, docs, DEFAULT_SCHEMA).map(
      (diagnostic) => diagnostic.rule,
    );

    expect(rules).toContain("OKFE007");
    expect(
      lintDoc(docs.get("log.md")!, docs, DEFAULT_SCHEMA).find(
        (diagnostic) => diagnostic.rule === "OKFE007",
      )?.fix,
    ).toEqual({ kind: "remove-frontmatter" });
    expect(rules).toContain("OKFE009");
    expect(rules).not.toContain("OKFE003");
  });

  it("accepts a conformant update log", () => {
    const docs = index([
      {
        path: "log.md",
        content: "# Bundle Update Log\n\n## 2026-07-20\n* **Update**: Added a policy.\n",
      },
    ]);

    expect(lintDoc(docs.get("log.md")!, docs, DEFAULT_SCHEMA)).toEqual([]);
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
    const unknownType = diags.find((d) => d.rule === "OKFE003");
    expect(unknownType?.severity).toBe("warning");
    expect(unknownType?.fix).toEqual({
      kind: "add-schema-type",
      typeName: "mystery",
    });
  });

  it("honors disabled lint rules", () => {
    const docs = index([
      { path: "a.md", content: "---\ntype: mystery\ntitle: X\n---\n" },
    ]);
    const schema = mergeSchema(DEFAULT_SCHEMA, {
      lint: { disable: ["OKFE003"] },
    });

    expect(lintDoc(docs.get("a.md")!, docs, schema)).toEqual([]);
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
