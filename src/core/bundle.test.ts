import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildIndex, groupByType, parseDoc, type ScanEntry } from "./bundle";

/** Load fixtures/sample-bundle the same way bundle_scan does (md files, relative POSIX paths). */
function loadFixture(): ScanEntry[] {
  const root = fileURLToPath(new URL("../../fixtures/sample-bundle", import.meta.url));
  const entries: ScanEntry[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else if (name.name.endsWith(".md")) {
        entries.push({
          path: full.slice(root.length + 1).replaceAll("\\", "/"),
          content: readFileSync(full, "utf8"),
        });
      }
    }
  };
  walk(root);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

describe("buildIndex on the fixture bundle", () => {
  const index = buildIndex(loadFixture());

  it("indexes all markdown docs, at any depth", () => {
    expect([...index.docs.keys()]).toEqual([
      "guides/onboarding.md",
      "index.md",
      "policies/facilities/index.md",
      "policies/hr/index.md",
      "policies/index.md",
      "policies/remote-work.md",
    ]);
  });

  it("derives type, title, and tags from frontmatter", () => {
    const doc = index.docs.get("guides/onboarding.md")!;
    expect(doc.type).toBe("guide");
    expect(doc.title).toBe("Onboarding");
    expect(doc.tags).toEqual(["onboarding"]);
  });

  it("resolves relative links across directories", () => {
    const doc = index.docs.get("guides/onboarding.md")!;
    expect(doc.links.map((l) => l.target)).toContain("policies/remote-work.md");
  });

  it("builds backlinks (the graph dataset)", () => {
    expect(index.backlinks.get("policies/remote-work.md")).toEqual(
      expect.arrayContaining(["guides/onboarding.md", "index.md"]),
    );
    // The intentionally-broken link still gets a backlink entry — that's how
    // lint will find it (target has no doc in the index).
    expect(index.backlinks.get("nope.md")).toEqual(["guides/onboarding.md"]);
  });
});

describe("parseDoc title derivation", () => {
  it("falls back to first H1 when frontmatter has no title", () => {
    const doc = parseDoc({
      path: "a.md",
      content: "---\ntype: note\n---\n\n# Heading Title\n",
    });
    expect(doc.title).toBe("Heading Title");
  });

  it("falls back to filename stem when there is no H1 either", () => {
    const doc = parseDoc({ path: "dir/some-note.md", content: "plain text" });
    expect(doc.title).toBe("some-note");
    expect(doc.type).toBeNull();
  });
});

describe("groupByType", () => {
  it("groups docs by type, sorted, with untyped docs under empty key", () => {
    const index = buildIndex([
      ...loadFixture(),
      { path: "untyped.md", content: "# Loose note\n" },
    ]);
    const groups = groupByType(index.docs);
    expect([...groups.keys()]).toEqual(["", "guide", "index", "policy"]);
    expect(groups.get("guide")!.map((d) => d.path)).toEqual([
      "guides/onboarding.md",
    ]);
  });
});
