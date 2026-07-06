import type { FieldDef, SchemaConfig } from "./schema";
import { fieldsForType } from "./schema";

/**
 * New-document content (docs/DESIGN.md §8 step 3). If the type declares a
 * template file, its content is used with {{placeholder}} substitution;
 * otherwise a sensible skeleton is generated from the type's fields.
 */

/** Filesystem-safe filename slug from a title. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "untitled" : slug;
}

/** Substitute {{title}} / {{type}} / {{date}} placeholders in a template. */
export function instantiateTemplate(
  template: string,
  values: { title: string; type: string; date: string },
): string {
  return template
    .replaceAll("{{title}}", values.title)
    .replaceAll("{{type}}", values.type)
    .replaceAll("{{date}}", values.date);
}

/** Generate a skeleton doc from the schema when no template file exists. */
export function generateSkeleton(
  schema: SchemaConfig,
  type: string,
  title: string,
  date: string,
): string {
  const lines: string[] = ["---", `type: ${type}`];
  for (const field of fieldsForType(schema, type)) {
    if (field.key === "title") {
      lines.push(`title: ${yamlScalar(title)}`);
    } else if (field.required === true) {
      lines.push(`${field.key}:${defaultFor(field, date)}`);
    }
  }
  lines.push("---", "", `# ${title}`, "");
  return lines.join("\n");
}

function defaultFor(field: FieldDef, date: string): string {
  switch (field.kind) {
    case "tags":
      return " []";
    case "boolean":
      return " false";
    case "date":
      return ` ${date}`;
    case "enum":
      return field.values !== undefined && field.values.length > 0
        ? ` ${field.values[0]}`
        : "";
    default:
      return "";
  }
}

function yamlScalar(value: string): string {
  return /^[A-Za-z0-9](?:[A-Za-z0-9 _./@-]*[A-Za-z0-9_./@-])?$/.test(value)
    ? value
    : JSON.stringify(value);
}
