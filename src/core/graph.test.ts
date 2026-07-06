import { describe, expect, it } from "vitest";
import { buildIndex } from "./bundle";
import { deriveGraph } from "./graph";

describe("deriveGraph", () => {
  const { docs } = buildIndex([
    { path: "a.md", content: "# A\n[b](b.md) [b again](b.md) [gone](nope.md)\n" },
    { path: "b.md", content: "# B\n[a](a.md)\n" },
    { path: "lonely.md", content: "# L\n" },
  ]);
  const graph = deriveGraph(docs);

  it("includes every doc as a node, linked or not", () => {
    expect(graph.nodes.map((n) => n.path).sort()).toEqual([
      "a.md",
      "b.md",
      "lonely.md",
    ]);
  });

  it("dedupes repeated links and drops broken ones", () => {
    expect(graph.edges).toEqual([
      { source: "a.md", target: "b.md" },
      { source: "b.md", target: "a.md" },
    ]);
  });
});
