import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEMA } from "./schema";
import { generateSkeleton, instantiateTemplate, slugify } from "./template";
import { splitFrontmatter } from "./frontmatter";
import { getType } from "./frontmatter";

describe("slugify", () => {
  it("lowercases, hyphenates, strips punctuation and diacritics", () => {
    expect(slugify("Remote Work Policy!")).toBe("remote-work-policy");
    expect(slugify("Café Décor — v2")).toBe("cafe-decor-v2");
  });

  it("falls back for empty input", () => {
    expect(slugify("!!!")).toBe("untitled");
  });
});

describe("instantiateTemplate", () => {
  it("substitutes all placeholders, repeatedly", () => {
    const out = instantiateTemplate(
      "---\ntype: {{type}}\ntitle: {{title}}\n---\n# {{title}}\n{{date}}",
      { title: "T", type: "guide", date: "2026-07-05" },
    );
    expect(out).toContain("type: guide");
    expect(out.match(/T/g)?.length).toBe(2);
    expect(out).toContain("2026-07-05");
  });
});

describe("generateSkeleton", () => {
  it("produces valid frontmatter with the required fields for the type", () => {
    const doc = generateSkeleton(DEFAULT_SCHEMA, "guide", "My Guide", "2026-07-05");
    const { frontmatterRaw, body } = splitFrontmatter(doc);
    expect(getType(frontmatterRaw)).toBe("guide");
    expect(frontmatterRaw).toContain("title: My Guide");
    expect(body).toContain("# My Guide");
  });

  it("quotes titles that need quoting", () => {
    const doc = generateSkeleton(DEFAULT_SCHEMA, "guide", "A: colon", "2026-07-05");
    expect(doc).toContain('title: "A: colon"');
    expect(getType(splitFrontmatter(doc).frontmatterRaw)).toBe("guide");
  });

  it("works for types the schema doesn't know (generic fields)", () => {
    const doc = generateSkeleton(DEFAULT_SCHEMA, "mystery", "X", "2026-07-05");
    expect(getType(splitFrontmatter(doc).frontmatterRaw)).toBe("mystery");
    expect(doc).toContain("title: X");
  });
});
