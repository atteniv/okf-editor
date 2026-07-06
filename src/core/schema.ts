/**
 * The schema engine (docs/DESIGN.md §5). OKF is v0.1 and will move, so the
 * frontmatter schema is data, not code: the app ships a default, and a bundle
 * overrides it with `.okf-editor.json` at its root (deep-merged over the
 * default). The published JSON Schema for the config file lives in
 * schemas/okf-editor.schema.json.
 */

export type FieldKind =
  | "string"
  | "text"
  | "enum"
  | "tags"
  | "date"
  | "boolean"
  | "number"
  | "doc-ref";

export interface FieldDef {
  key: string;
  kind: FieldKind;
  label?: string;
  required?: boolean;
  /** Allowed values; only meaningful for kind "enum". */
  values?: string[];
}

export interface TypeDef {
  label?: string;
  /** Bundle-relative path to the new-doc template (used from M1 wk5). */
  template?: string;
  fields?: FieldDef[];
}

export interface SchemaConfig {
  types: Record<string, TypeDef>;
  tagVocabulary: string[];
  allowUnknownTags: boolean;
  wikiLinks: boolean;
  lint: { disable: string[] };
}

export const CONFIG_FILENAME = ".okf-editor.json";

const TITLE: FieldDef = { key: "title", kind: "string", required: true };
const TAGS: FieldDef = { key: "tags", kind: "tags" };

/** Fields offered for a `type` the schema doesn't know (graceful degrade). */
export const GENERIC_FIELDS: FieldDef[] = [TITLE, TAGS];

/**
 * The shipped default schema: a modest starter set of prose-doc types.
 * Projects are expected to override; an empty vocabulary or missing type is
 * never an error.
 */
export const DEFAULT_SCHEMA: SchemaConfig = {
  types: {
    index: { label: "Index", fields: [TITLE, TAGS] },
    guide: {
      label: "Guide",
      fields: [
        TITLE,
        { key: "owner", kind: "string" },
        TAGS,
        {
          key: "status",
          kind: "enum",
          values: ["draft", "published", "deprecated"],
        },
      ],
    },
    policy: {
      label: "Policy",
      fields: [
        TITLE,
        { key: "owner", kind: "string" },
        TAGS,
        {
          key: "status",
          kind: "enum",
          values: ["draft", "published", "deprecated"],
        },
        { key: "reviewed", kind: "date" },
      ],
    },
    reference: { label: "Reference", fields: [TITLE, TAGS] },
  },
  tagVocabulary: [],
  allowUnknownTags: true,
  wikiLinks: false,
  lint: { disable: [] },
};

/**
 * Parse a `.okf-editor.json` source. Malformed config never breaks the app:
 * the error is surfaced and the default schema is used.
 */
export function parseSchemaConfig(
  source: string,
): { config: Partial<SchemaConfig>; error: null } | { config: null; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    return { config: null, error: `invalid JSON: ${(err as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { config: null, error: "config must be a JSON object" };
  }
  return { config: parsed as Partial<SchemaConfig>, error: null };
}

/**
 * Merge a project config over the default. Top-level fields override;
 * `types` merges per type name (a project redefining "guide" replaces that
 * type entirely — field-level merge would make removal impossible).
 */
export function mergeSchema(
  base: SchemaConfig,
  override: Partial<SchemaConfig> | null,
): SchemaConfig {
  if (override === null) return base;
  return {
    types: { ...base.types, ...(override.types ?? {}) },
    tagVocabulary: override.tagVocabulary ?? base.tagVocabulary,
    allowUnknownTags: override.allowUnknownTags ?? base.allowUnknownTags,
    wikiLinks: override.wikiLinks ?? base.wikiLinks,
    lint: { disable: override.lint?.disable ?? base.lint.disable },
  };
}

/**
 * The form fields for a doc of the given type. Unknown or missing types
 * degrade to the generic title/tags fields (DESIGN §5) — never an error.
 */
export function fieldsForType(
  schema: SchemaConfig,
  type: string | null,
): FieldDef[] {
  if (type !== null) {
    const def = schema.types[type];
    if (def?.fields !== undefined) return def.fields;
  }
  return GENERIC_FIELDS;
}

/** Display label for a field (explicit label ?? capitalized key). */
export function fieldLabel(field: FieldDef): string {
  return field.label ?? field.key.charAt(0).toUpperCase() + field.key.slice(1);
}
