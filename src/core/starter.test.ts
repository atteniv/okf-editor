import { describe, expect, it } from "vitest";
import { getType, splitFrontmatter } from "./frontmatter";
import { parseBundlePlan } from "./ai";
import { starterBundleFiles } from "./starter";

describe("starterBundleFiles", () => {
  const files = starterBundleFiles("My Handbook");

  it("includes index, guide, policy, and editor config", () => {
    expect(files.map((f) => f.path)).toEqual([
      "index.md",
      "guides/getting-started.md",
      "policies/example-policy.md",
      ".okf-editor.json",
    ]);
  });

  it("produces valid frontmatter on every markdown file", () => {
    for (const file of files.filter((f) => f.path.endsWith(".md"))) {
      const { frontmatterRaw } = splitFrontmatter(file.content);
      expect(frontmatterRaw, file.path).not.toBeNull();
      expect(getType(frontmatterRaw), file.path).not.toBeNull();
    }
  });

  it("uses the bundle name in the index", () => {
    expect(files[0].content).toContain("My Handbook");
  });

  it("emits parseable editor config", () => {
    const config = files.find((f) => f.path === ".okf-editor.json")!;
    expect(() => JSON.parse(config.content)).not.toThrow();
  });
});

describe("parseBundlePlan", () => {
  it("parses a clean JSON plan", () => {
    const plan = parseBundlePlan(
      '{"docs":[{"path":"index.md","type":"index","title":"Home","brief":"Cover page"}]}',
    );
    expect(plan).toHaveLength(1);
    expect(plan![0].path).toBe("index.md");
  });

  it("tolerates code fences and prose around the JSON", () => {
    const text =
      'Here is the plan:\n```json\n{"docs":[{"path":"a.md","type":"guide","title":"A","brief":"b"}]}\n```\nHope this helps!';
    expect(parseBundlePlan(text)).toHaveLength(1);
  });

  it("filters unsafe or malformed entries", () => {
    const plan = parseBundlePlan(
      JSON.stringify({
        docs: [
          { path: "ok.md", type: "guide", title: "OK", brief: "fine" },
          { path: "../escape.md", type: "guide", title: "bad", brief: "no" },
          { path: "/abs.md", type: "guide", title: "bad", brief: "no" },
          { path: "not-markdown.txt", type: "guide", title: "bad", brief: "no" },
          { path: "missing-fields.md" },
        ],
      }),
    );
    expect(plan).toHaveLength(1);
    expect(plan![0].path).toBe("ok.md");
  });

  it("returns null for garbage", () => {
    expect(parseBundlePlan("no json here")).toBeNull();
    expect(parseBundlePlan('{"docs": "nope"}')).toBeNull();
  });
});
