import { describe, expect, it } from "vitest";
import { extractLinks, relativize, resolveRelative } from "./links";

describe("relativize", () => {
  it("targets in the same directory", () => {
    expect(relativize("guides/a.md", "guides/b.md")).toBe("b.md");
  });

  it("targets in a sibling directory", () => {
    expect(relativize("guides/a.md", "policies/p.md")).toBe("../policies/p.md");
  });

  it("targets at the root from a nested doc", () => {
    expect(relativize("guides/deep/a.md", "index.md")).toBe("../../index.md");
  });

  it("nested targets from the root", () => {
    expect(relativize("index.md", "guides/a.md")).toBe("guides/a.md");
  });

  it("round-trips through resolveRelative", () => {
    const from = "guides/deep/a.md";
    const target = "policies/p.md";
    expect(resolveRelative(from, relativize(from, target))).toBe(target);
  });
});

describe("extractLinks offsets", () => {
  it("records the destination's exact offsets in the body", () => {
    const body = "intro [x](target.md) outro";
    const [link] = extractLinks("a.md", body);
    expect(body.slice(link.from, link.to)).toBe("target.md");
  });
});
