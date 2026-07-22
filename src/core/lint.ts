import type { DocMeta } from "./bundle";
import { parseFrontmatter } from "./frontmatter";
import { fieldsForType, type SchemaConfig } from "./schema";

/**
 * Inline lint (docs/DESIGN.md §6.6). Rules are pure functions over the
 * parsed doc + bundle + schema.
 *
 * Rule IDs use our own OKFE (OKF Editor) namespace: as of July 2026 there is
 * no canonical upstream `okflint` distribution to run the planned parity job
 * against (only unaffiliated third-party repos). When upstream stabilizes,
 * map these IDs and add the parity CI job — the fixture corpus is already
 * structured for it.
 */

export type Severity = "error" | "warning";

/** A machine-applicable remediation attached to a diagnostic. */
export type QuickFix =
  | { kind: "create-doc"; targetPath: string }
  | { kind: "add-schema-type"; typeName: string }
  | { kind: "remove-frontmatter" }
  | {
      kind: "add-frontmatter";
      typeName: "index" | "reference";
      title: string;
    };

export interface Diagnostic {
  rule: string;
  severity: Severity;
  message: string;
  /** Where the issue lives — body diagnostics can carry editor offsets. */
  where: "frontmatter" | "body";
  /** Offsets into the doc body (only for where === "body"). */
  from?: number;
  to?: number;
  fix?: QuickFix;
}

export function lintDoc(
  doc: DocMeta,
  docs: Map<string, DocMeta>,
  schema: SchemaConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const reservedName = doc.path.split("/").at(-1)?.toLowerCase();

  if (reservedName === "index.md" || reservedName === "log.md") {
    if (doc.frontmatterRaw !== null) {
      diagnostics.push({
        rule: "OKFE007",
        severity: "error",
        message: `Reserved ${reservedName} files must not contain frontmatter.`,
        where: "frontmatter",
        fix: { kind: "remove-frontmatter" },
      });
    }
    if (reservedName === "index.md" && !/^#{1,6}\s+\S/m.test(doc.body)) {
      diagnostics.push({
        rule: "OKFE008",
        severity: "warning",
        message: "An OKF index.md should group entries beneath headings.",
        where: "body",
      });
    }
    if (reservedName === "log.md" && !hasValidUpdateLogDates(doc.body)) {
      diagnostics.push({
        rule: "OKFE009",
        severity: "warning",
        message: "Log entries must use newest-first `## YYYY-MM-DD` headings.",
        where: "body",
      });
    }
    diagnostics.push(...brokenLinkDiagnostics(doc, docs));
    return enabledDiagnostics(diagnostics, schema);
  }

  // OKFE001 — missing frontmatter entirely.
  if (doc.frontmatterRaw === null) {
    diagnostics.push({
      rule: "OKFE001",
      severity: "error",
      message: "Document has no frontmatter; OKF requires at least `type`.",
      where: "frontmatter",
      fix: {
        kind: "add-frontmatter",
        typeName: "reference",
        title: doc.title,
      },
    });
    // No frontmatter: the remaining frontmatter rules don't apply.
  } else {
    const values = (parseFrontmatter(doc.frontmatterRaw).toJS() ?? {}) as Record<
      string,
      unknown
    >;

    // OKFE002 — missing/invalid `type` (the one required OKF field).
    if (typeof values.type !== "string" || values.type.trim() === "") {
      diagnostics.push({
        rule: "OKFE002",
        severity: "error",
        message: "Frontmatter is missing the required `type` field.",
        where: "frontmatter",
      });
    } else if (!(values.type in schema.types)) {
      // OKFE003 — type unknown to the schema (fine for OKF, worth flagging).
      diagnostics.push({
        rule: "OKFE003",
        severity: "warning",
        message: `Type "${values.type}" is not defined in the project schema.`,
        where: "frontmatter",
        fix: { kind: "add-schema-type", typeName: values.type },
      });
    }

    // OKFE004 — required fields for the type are missing/empty.
    for (const field of fieldsForType(schema, doc.type)) {
      if (field.required !== true) continue;
      const value = values[field.key];
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        diagnostics.push({
          rule: "OKFE004",
          severity: "warning",
          message: `Required field \`${field.key}\` is missing or empty.`,
          where: "frontmatter",
        });
      }
    }

    // OKFE006 — tags outside the controlled vocabulary.
    if (!schema.allowUnknownTags && schema.tagVocabulary.length > 0) {
      for (const tag of doc.tags) {
        if (!schema.tagVocabulary.includes(tag)) {
          diagnostics.push({
            rule: "OKFE006",
            severity: "warning",
            message: `Tag "${tag}" is not in the project's tag vocabulary.`,
            where: "frontmatter",
          });
        }
      }
    }
  }

  diagnostics.push(...brokenLinkDiagnostics(doc, docs));
  return enabledDiagnostics(diagnostics, schema);
}

function hasValidUpdateLogDates(body: string): boolean {
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map(
    (match) => match[1],
  );
  if (headings.length === 0) return false;
  if (headings.some((heading) => !/^\d{4}-\d{2}-\d{2}$/.test(heading))) {
    return false;
  }
  return headings.every(
    (heading, index) => index === 0 || headings[index - 1] >= heading,
  );
}

function brokenLinkDiagnostics(
  doc: DocMeta,
  docs: Map<string, DocMeta>,
): Diagnostic[] {
  return doc.links.flatMap((link) => {
    if (docs.has(link.target)) return [];
    return [{
      rule: "OKFE005",
      severity: "error" as const,
      message: `Broken link: "${link.raw}" — no document at ${link.target}.`,
      where: "body" as const,
      from: link.from,
      to: link.to,
      ...(link.target.endsWith(".md")
        ? { fix: { kind: "create-doc" as const, targetPath: link.target } }
        : {}),
    }];
  });
}

function enabledDiagnostics(
  diagnostics: Diagnostic[],
  schema: SchemaConfig,
): Diagnostic[] {
  return diagnostics.filter(
    (diagnostic) => !schema.lint.disable.includes(diagnostic.rule),
  );
}

/** Bundle-wide pass; only paths with findings appear in the result. */
export function lintBundle(
  docs: Map<string, DocMeta>,
  schema: SchemaConfig,
): Map<string, Diagnostic[]> {
  const result = new Map<string, Diagnostic[]>();
  for (const doc of docs.values()) {
    const diagnostics = lintDoc(doc, docs, schema);
    if (diagnostics.length > 0) result.set(doc.path, diagnostics);
  }
  return result;
}
