import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown sanitization (DESIGN §9)", () => {
  it("renders normal markdown", () => {
    const html = renderMarkdown("# Title\n\nSome **bold** text.");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders GFM tables", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
  });

  it("strips script tags (inner text may remain, but only as escaped text)", () => {
    const html = renderMarkdown('hello <script>alert("xss")</script>');
    expect(html).not.toContain("<script");
  });

  it("strips event-handler attributes", () => {
    const html = renderMarkdown('<img src="x.png" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("strips javascript: URLs", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("strips iframes and style tags", () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe><style>*{}</style>');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<style");
  });
});
