import { describe, expect, it } from "vitest";
import {
  addTypeToSchemaSource,
  DEFAULT_SCHEMA,
  fieldsForType,
  GENERIC_FIELDS,
  mergeSchema,
  parseSchemaConfig,
} from "./schema";

describe("parseSchemaConfig", () => {
  it("parses a valid config", () => {
    const result = parseSchemaConfig('{"tagVocabulary": ["a"]}');
    expect(result.error).toBeNull();
    expect(result.config?.tagVocabulary).toEqual(["a"]);
  });

  it("reports malformed JSON without throwing", () => {
    const result = parseSchemaConfig("{nope");
    expect(result.config).toBeNull();
    expect(result.error).toContain("invalid JSON");
  });

  it("rejects non-object configs", () => {
    expect(parseSchemaConfig("[1,2]").error).toContain("must be a JSON object");
  });
});

describe("addTypeToSchemaSource", () => {
  it("creates a project config with a minimal definition for the discovered type", () => {
    const result = addTypeToSchemaSource(null, "Persona");

    expect(result.error).toBeNull();
    expect(JSON.parse(result.source!)).toMatchObject({
      types: {
        Persona: {
          label: "Persona",
          fields: [
            { key: "title", kind: "string", required: true },
            { key: "tags", kind: "tags" },
          ],
        },
      },
    });
  });

  it("preserves existing project configuration when adding a type", () => {
    const result = addTypeToSchemaSource(
      '{"tagVocabulary":["legal"],"types":{"Policy":{"label":"Policy"}}}',
      "Persona",
    );

    expect(result.error).toBeNull();
    expect(JSON.parse(result.source!)).toMatchObject({
      tagVocabulary: ["legal"],
      types: {
        Policy: { label: "Policy" },
        Persona: { label: "Persona" },
      },
    });
  });

  it("refuses to overwrite a malformed project config", () => {
    const result = addTypeToSchemaSource("{broken", "Persona");

    expect(result.source).toBeNull();
    expect(result.error).toContain("invalid JSON");
  });
});

describe("mergeSchema", () => {
  it("returns the base when there is no override", () => {
    expect(mergeSchema(DEFAULT_SCHEMA, null)).toBe(DEFAULT_SCHEMA);
  });

  it("merges types per name, keeping unmentioned defaults", () => {
    const merged = mergeSchema(DEFAULT_SCHEMA, {
      types: { rfc: { label: "RFC", fields: [] } },
    });
    expect(merged.types.rfc.label).toBe("RFC");
    expect(merged.types.guide).toBe(DEFAULT_SCHEMA.types.guide);
  });

  it("replaces a redefined type entirely (no field-level merge)", () => {
    const merged = mergeSchema(DEFAULT_SCHEMA, {
      types: { guide: { fields: [{ key: "title", kind: "string" }] } },
    });
    expect(merged.types.guide.fields).toHaveLength(1);
  });

  it("overrides scalars and vocabulary wholesale", () => {
    const merged = mergeSchema(DEFAULT_SCHEMA, {
      tagVocabulary: ["x"],
      allowUnknownTags: false,
    });
    expect(merged.tagVocabulary).toEqual(["x"]);
    expect(merged.allowUnknownTags).toBe(false);
    expect(merged.wikiLinks).toBe(DEFAULT_SCHEMA.wikiLinks);
  });
});

describe("fieldsForType", () => {
  it("returns the declared fields for a known type", () => {
    const fields = fieldsForType(DEFAULT_SCHEMA, "guide");
    expect(fields.map((f) => f.key)).toContain("status");
  });

  it("degrades to generic fields for unknown types", () => {
    expect(fieldsForType(DEFAULT_SCHEMA, "mystery")).toBe(GENERIC_FIELDS);
  });

  it("degrades to generic fields for null type", () => {
    expect(fieldsForType(DEFAULT_SCHEMA, null)).toBe(GENERIC_FIELDS);
  });
});
