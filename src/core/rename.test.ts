import { describe, expect, it } from "vitest";
import { buildIndex, type ScanEntry } from "./bundle";
import { rewriteLinksForRename } from "./rename";

function bundle(entries: ScanEntry[]) {
  const { docs, backlinks } = buildIndex(entries);
  return { docs, backlinks };
}

describe("rewriteLinksForRename", () => {
  it("retargets inbound links, preserving anchors", () => {
    const { docs, backlinks } = bundle([
      {
        path: "guides/a.md",
        content:
          "---\ntype: guide\ntitle: A\n---\n\nSee [b](../policies/b.md) and [s](../policies/b.md#section).\n",
      },
      { path: "policies/b.md", content: "---\ntype: policy\ntitle: B\n---\n" },
    ]);
    const updates = rewriteLinksForRename(
      docs,
      backlinks,
      "policies/b.md",
      "policies/renamed.md",
    );
    const a = updates.get("guides/a.md")!;
    expect(a).toContain("[b](../policies/renamed.md)");
    expect(a).toContain("[s](../policies/renamed.md#section)");
    expect(a).toContain("type: guide"); // frontmatter untouched
  });

  it("recomputes the moved doc's own links on a cross-directory move", () => {
    const { docs, backlinks } = bundle([
      {
        path: "guides/mover.md",
        content:
          "---\ntype: guide\ntitle: M\n---\n\n[sibling](other.md) and [root](../index.md)\n",
      },
      { path: "guides/other.md", content: "# o\n" },
      { path: "index.md", content: "# i\n" },
    ]);
    const updates = rewriteLinksForRename(
      docs,
      backlinks,
      "guides/mover.md",
      "mover.md", // moved to bundle root
    );
    const moved = updates.get("guides/mover.md")!;
    expect(moved).toContain("[sibling](guides/other.md)");
    expect(moved).toContain("[root](index.md)");
  });

  it("leaves own links alone on a same-directory rename", () => {
    const { docs, backlinks } = bundle([
      {
        path: "guides/a.md",
        content: "---\ntype: guide\ntitle: A\n---\n\n[o](other.md)\n",
      },
      { path: "guides/other.md", content: "# o\n" },
    ]);
    const updates = rewriteLinksForRename(
      docs,
      backlinks,
      "guides/a.md",
      "guides/a2.md",
    );
    expect(updates.has("guides/a.md")).toBe(false);
  });

  it("handles multiple links in one doc without corrupting offsets", () => {
    const { docs, backlinks } = bundle([
      {
        path: "hub.md",
        content: "---\ntype: index\ntitle: H\n---\n\n[1](t.md) [2](t.md) [3](t.md)\n",
      },
      { path: "t.md", content: "# t\n" },
    ]);
    const updates = rewriteLinksForRename(docs, backlinks, "t.md", "moved/t.md");
    expect(updates.get("hub.md")).toContain(
      "[1](moved/t.md) [2](moved/t.md) [3](moved/t.md)",
    );
  });

  it("returns no updates when nothing links to the doc and dir is unchanged", () => {
    const { docs, backlinks } = bundle([
      { path: "lonely.md", content: "# alone\n" },
    ]);
    expect(
      rewriteLinksForRename(docs, backlinks, "lonely.md", "renamed.md").size,
    ).toBe(0);
  });
});
