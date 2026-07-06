/**
 * The sample-data starter bundle (New bundle → "Start with sample docs").
 * The placeholder content is deliberately self-teaching: it documents OKF
 * and the editor rather than filling space with lorem ipsum.
 */

export interface StarterFile {
  path: string;
  content: string;
}

export function starterBundleFiles(bundleName: string): StarterFile[] {
  return [
    {
      path: "index.md",
      content: `---
type: index
title: ${quoteIfNeeded(bundleName)}
tags:
  - meta
---

# ${bundleName}

Welcome to your OKF bundle — a directory of markdown documents with YAML
frontmatter that both people and AI agents can consume.

Start exploring:

- [Getting started with this bundle](guides/getting-started.md)
- [Example policy](policies/example-policy.md)
`,
    },
    {
      path: "guides/getting-started.md",
      content: `---
type: guide
title: Getting started
owner: you
tags:
  - meta
status: draft
---

# Getting started

Every document in this bundle is markdown with a YAML frontmatter block.
The only field OKF requires is \`type\` — this editor reads the rest from
the schema in \`.okf-editor.json\`, which you can edit to define your own
types, fields, and tag vocabulary.

Useful things to try:

- Link between documents with relative paths — type \`](\` and the editor
  offers every document in the bundle.
- The frontmatter form above the editor is schema-aware; unknown fields
  are preserved exactly as written.
- The Problems panel flags broken links and missing required fields.
- Open the assistant (✦) and type \`@\` to reference any document as
  context.

Replace this guide with your own content whenever you're ready — see the
[example policy](../policies/example-policy.md) for a second document
shape.
`,
    },
    {
      path: "policies/example-policy.md",
      content: `---
type: policy
title: Example policy
owner: you
tags:
  - meta
status: draft
---

# Example policy

This is a placeholder policy demonstrating the \`policy\` type from the
default schema (owner, status, reviewed date). It links back to the
[getting started guide](../guides/getting-started.md) so the bundle's
knowledge graph has an edge to show in the overview.

Delete or repurpose this document — it exists to be replaced.
`,
    },
    {
      path: ".okf-editor.json",
      content: `${JSON.stringify(
        {
          $schema:
            "https://raw.githubusercontent.com/atteniv/okf-editor/main/schemas/okf-editor.schema.json",
          tagVocabulary: ["meta"],
          allowUnknownTags: true,
        },
        null,
        2,
      )}\n`,
    },
  ];
}

function quoteIfNeeded(value: string): string {
  return /^[A-Za-z0-9](?:[A-Za-z0-9 _./@-]*[A-Za-z0-9_./@-])?$/.test(value)
    ? value
    : JSON.stringify(value);
}
