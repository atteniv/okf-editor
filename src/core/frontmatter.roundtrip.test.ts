import { describe, expect, it } from "vitest";
import { deleteKey, setKey } from "./frontmatter";

/**
 * The minimal-diff suite (docs/DESIGN.md §6.4): editing one key must leave
 * every other line byte-identical. This is the regression net under the
 * app's hardest requirement — never mangle YAML we don't own. Grow this
 * corpus from every round-trip bug report.
 */

interface Sample {
  name: string;
  yaml: string;
  /** Lines that may legitimately change when `title` is set. */
  editableMatcher: RegExp;
}

const CORPUS: Sample[] = [
  {
    name: "comments above and inline",
    yaml: `# document header comment
type: guide
title: Old Title # trailing comment stays on this line's replacement
tags: # a comment on the tags key
  - a
  - b
`,
    editableMatcher: /^title:/,
  },
  {
    name: "quoting styles preserved on untouched keys",
    yaml: `type: "guide"
title: plain
owner: 'single-quoted'
description: "double \\"escaped\\" quotes"
`,
    editableMatcher: /^title:/,
  },
  {
    name: "block scalars untouched",
    yaml: `type: guide
title: x
summary: |
  Line one keeps
      its odd indentation
  and trailing spec
notes: >-
  folded
  scalar
`,
    editableMatcher: /^title:/,
  },
  {
    name: "nested maps and flow collections",
    yaml: `type: guide
title: x
meta:
  owner: { name: Jo, team: docs }
  reviewers: [a, b, c]
weird_key_order: last
`,
    editableMatcher: /^title:/,
  },
  {
    name: "unknown fields with unusual formatting",
    yaml: `type: guide
title: x
x-custom:    spaced-value
UPPER_CASE: kept
empty_value:
`,
    editableMatcher: /^title:/,
  },
];

/** Lines of `before` that don't appear (in order) in `after`. */
function removedLines(before: string, after: string): string[] {
  const afterLines = after.split("\n");
  let cursor = 0;
  const removed: string[] = [];
  for (const line of before.split("\n")) {
    const found = afterLines.indexOf(line, cursor);
    if (found === -1) removed.push(line);
    else cursor = found + 1;
  }
  return removed;
}

describe("minimal-diff round trips (DESIGN §6.4)", () => {
  for (const sample of CORPUS) {
    it(`setKey(title) touches only the title line: ${sample.name}`, () => {
      const after = setKey(sample.yaml, "title", "New Title");
      expect(after).toContain("New Title");
      const removed = removedLines(sample.yaml, after).filter(
        (line) => !sample.editableMatcher.test(line),
      );
      expect(removed).toEqual([]);
    });

    it(`adding a fresh key removes nothing: ${sample.name}`, () => {
      const after = setKey(sample.yaml, "brand_new_key", "value");
      expect(after).toContain("brand_new_key: value");
      expect(removedLines(sample.yaml, after)).toEqual([]);
    });
  }

  it("deleteKey removes only the target key's lines", () => {
    const yaml = `type: guide
title: Keep
obsolete: gone
tags:
  - keep-me
`;
    const after = deleteKey(yaml, "obsolete");
    const removed = removedLines(yaml, after);
    expect(removed).toEqual(["obsolete: gone"]);
  });

  it("setKey on a multi-line list touches only that list", () => {
    const yaml = `# header
type: guide
title: Keep # comment
tags:
  - old-a
  - old-b
owner: jo
`;
    const after = setKey(yaml, "tags", ["new-a"]);
    const removed = removedLines(yaml, after).filter(
      (line) => !/^\s*(tags:|- old-)/.test(line),
    );
    expect(removed).toEqual([]);
    expect(after).toContain("# header");
    expect(after).toContain("owner: jo");
    expect(after).toContain("new-a");
  });
});
