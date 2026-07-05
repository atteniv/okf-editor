import { describe, expect, it } from "vitest";
import {
  deleteKey,
  getType,
  joinFrontmatter,
  setKey,
  splitFrontmatter,
} from "./frontmatter";

const DOC = `---
# owner is on the hook for reviews
type: guide
title: "Onboarding"   # keep quoted
tags:
  - onboarding
  - policy
custom_unknown_field: preserved
---

# Onboarding

Body text.
`;

describe("splitFrontmatter / joinFrontmatter", () => {
  it("round-trips a document byte-for-byte with no edits", () => {
    const { frontmatterRaw, body } = splitFrontmatter(DOC);
    expect(joinFrontmatter(frontmatterRaw, body)).toBe(DOC);
  });

  it("handles documents without frontmatter", () => {
    const { frontmatterRaw, body } = splitFrontmatter("# Just markdown\n");
    expect(frontmatterRaw).toBeNull();
    expect(body).toBe("# Just markdown\n");
  });

  it("treats an unterminated fence as body, not frontmatter", () => {
    const source = "---\ntype: guide\nno closing fence\n";
    const { frontmatterRaw, body } = splitFrontmatter(source);
    expect(frontmatterRaw).toBeNull();
    expect(body).toBe(source);
  });

  it("does not mistake a horizontal rule mid-document for frontmatter", () => {
    const source = "intro\n\n---\n\nmore\n";
    expect(splitFrontmatter(source).frontmatterRaw).toBeNull();
  });
});

describe("setKey — round-trip safety (DESIGN §6.4)", () => {
  it("changes only the target key, preserving comments and formatting", () => {
    const { frontmatterRaw } = splitFrontmatter(DOC);
    const updated = setKey(frontmatterRaw!, "title", "Onboarding v2");
    // Comments, unknown fields, and list formatting survive.
    expect(updated).toContain("# owner is on the hook for reviews");
    expect(updated).toContain("custom_unknown_field: preserved");
    expect(updated).toContain("  - onboarding");
    expect(updated).toContain("Onboarding v2");
    expect(updated).not.toContain('"Onboarding"   # keep quoted');
  });

  it("adds a new key without disturbing existing content", () => {
    const { frontmatterRaw } = splitFrontmatter(DOC);
    const updated = setKey(frontmatterRaw!, "status", "draft");
    expect(updated).toContain("status: draft");
    expect(updated).toContain("# owner is on the hook for reviews");
  });
});

describe("deleteKey", () => {
  it("removes only the target key", () => {
    const { frontmatterRaw } = splitFrontmatter(DOC);
    const updated = deleteKey(frontmatterRaw!, "custom_unknown_field");
    expect(updated).not.toContain("custom_unknown_field");
    expect(updated).toContain("type: guide");
  });
});

describe("getType", () => {
  it("reads the OKF type field", () => {
    const { frontmatterRaw } = splitFrontmatter(DOC);
    expect(getType(frontmatterRaw)).toBe("guide");
  });

  it("returns null when absent or non-string", () => {
    expect(getType(null)).toBeNull();
    expect(getType("type: [not, a, string]")).toBeNull();
  });
});
