import { useState } from "react";
import { deleteKey, parseFrontmatter, setKey } from "../core/frontmatter";
import {
  fieldLabel,
  fieldsForType,
  type FieldDef,
  type SchemaConfig,
} from "../core/schema";

interface FormProps {
  frontmatterRaw: string | null;
  docPath: string;
  schema: SchemaConfig;
  /** All doc paths, for doc-ref fields. */
  docPaths: string[];
  onChange: (frontmatterRaw: string) => void;
  onAddFrontmatter: () => void;
}

export function FrontmatterForm({
  frontmatterRaw,
  docPath,
  schema,
  docPaths,
  onChange,
  onAddFrontmatter,
}: FormProps) {
  const [rawMode, setRawMode] = useState(false);
  const filename = docPath.split("/").at(-1)?.toLowerCase();
  const reserved = filename === "index.md" || filename === "log.md";

  if (frontmatterRaw === null && reserved) {
    return (
      <div className="fm-form fm-empty">
        <span>
          OKF reserves {filename}; frontmatter is not required for this file.
        </span>
      </div>
    );
  }

  if (frontmatterRaw === null) {
    return (
      <div className="fm-form fm-empty">
        <span>No frontmatter.</span>
        <button onClick={onAddFrontmatter}>Add required frontmatter</button>
      </div>
    );
  }

  const doc = parseFrontmatter(frontmatterRaw);
  const values: Record<string, unknown> = (doc.toJS() ?? {}) as Record<
    string,
    unknown
  >;
  const type = typeof values.type === "string" ? values.type : null;
  const fields = fieldsForType(schema, type);
  const yamlBroken = doc.errors.length > 0;

  const knownKeys = new Set(["type", ...fields.map((f) => f.key)]);
  const unknownKeys = Object.keys(values).filter((k) => !knownKeys.has(k));

  const set = (key: string, value: Parameters<typeof setKey>[2]) =>
    onChange(setKey(frontmatterRaw, key, value));
  const unset = (key: string) => onChange(deleteKey(frontmatterRaw, key));

  return (
    <div className="fm-form">
      <div className="fm-toolbar">
        <span className="fm-title">Frontmatter</span>
        {yamlBroken && (
          <span className="fm-warning">YAML has syntax errors</span>
        )}
        <button
          className={rawMode ? "selected" : ""}
          onClick={() => setRawMode(!rawMode)}
        >
          {rawMode ? "Form" : "Edit as YAML"}
        </button>
      </div>

      {rawMode || yamlBroken ? (
        <textarea
          className="fm-raw"
          value={frontmatterRaw}
          rows={Math.min(12, frontmatterRaw.split("\n").length + 1)}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <div className="fm-grid">
          <label className="fm-field">
            <span className="fm-label">Type</span>
            <input
              list="fm-types"
              value={type ?? ""}
              placeholder="e.g. guide"
              onChange={(e) =>
                e.target.value === ""
                  ? set("type", null)
                  : set("type", e.target.value)
              }
            />
            <datalist id="fm-types">
              {Object.entries(schema.types).map(([name, def]) => (
                <option key={name} value={name}>
                  {def.label ?? name}
                </option>
              ))}
            </datalist>
          </label>

          {fields.map((field) => (
            <Field
              key={field.key}
              field={field}
              value={values[field.key]}
              schema={schema}
              docPaths={docPaths}
              onSet={set}
              onUnset={unset}
            />
          ))}

          {unknownKeys.length > 0 && (
            <div className="fm-unknown">
              <span className="fm-label">Other fields (preserved as-is)</span>
              <ul>
                {unknownKeys.map((key) => (
                  <li key={key}>
                    <code>
                      {key}: {JSON.stringify(values[key])}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  field: FieldDef;
  value: unknown;
  schema: SchemaConfig;
  docPaths: string[];
  onSet: (key: string, value: string | number | boolean | string[] | null) => void;
  onUnset: (key: string) => void;
}

function Field({ field, value, schema, docPaths, onSet, onUnset }: FieldProps) {
  const label = (
    <span className="fm-label">
      {fieldLabel(field)}
      {field.required && <span className="fm-required">*</span>}
    </span>
  );
  const setOrUnset = (text: string) =>
    text === "" ? onUnset(field.key) : onSet(field.key, text);

  switch (field.kind) {
    case "text":
      return (
        <label className="fm-field fm-field-wide">
          {label}
          <textarea
            value={typeof value === "string" ? value : ""}
            rows={3}
            onChange={(e) => setOrUnset(e.target.value)}
          />
        </label>
      );
    case "enum":
      return (
        <label className="fm-field">
          {label}
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(e) => setOrUnset(e.target.value)}
          >
            <option value="">—</option>
            {(field.values ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      );
    case "boolean":
      return (
        <label className="fm-field fm-field-check">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onSet(field.key, e.target.checked)}
          />
          {label}
        </label>
      );
    case "number":
      return (
        <label className="fm-field">
          {label}
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) =>
              e.target.value === ""
                ? onUnset(field.key)
                : onSet(field.key, Number(e.target.value))
            }
          />
        </label>
      );
    case "date":
      return (
        <label className="fm-field">
          {label}
          <input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => setOrUnset(e.target.value)}
          />
        </label>
      );
    case "tags":
      return (
        <TagsField
          label={label}
          fieldKey={field.key}
          value={value}
          vocabulary={schema.tagVocabulary}
          onSet={onSet}
          onUnset={onUnset}
        />
      );
    case "doc-ref":
      return (
        <label className="fm-field">
          {label}
          <input
            list={`fm-docs-${field.key}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => setOrUnset(e.target.value)}
          />
          <datalist id={`fm-docs-${field.key}`}>
            {docPaths.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
      );
    case "string":
    default:
      return (
        <label className="fm-field">
          {label}
          <input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => setOrUnset(e.target.value)}
          />
        </label>
      );
  }
}

interface TagsFieldProps {
  label: React.ReactNode;
  fieldKey: string;
  value: unknown;
  vocabulary: string[];
  onSet: (key: string, value: string[]) => void;
  onUnset: (key: string) => void;
}

function TagsField({
  label,
  fieldKey,
  value,
  vocabulary,
  onSet,
  onUnset,
}: TagsFieldProps) {
  const [pending, setPending] = useState("");
  const tags = Array.isArray(value)
    ? value.filter((t): t is string => typeof t === "string")
    : [];

  const commit = (next: string[]) =>
    next.length === 0 ? onUnset(fieldKey) : onSet(fieldKey, next);

  const add = () => {
    const tag = pending.trim();
    if (tag !== "" && !tags.includes(tag)) commit([...tags, tag]);
    setPending("");
  };

  return (
    <div className="fm-field fm-field-wide">
      {label}
      <div className="fm-tags">
        {tags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
            <button
              className="tag-remove"
              title={`Remove ${tag}`}
              onClick={() => commit(tags.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          list={`fm-vocab-${fieldKey}`}
          value={pending}
          placeholder="Add tag…"
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
        <datalist id={`fm-vocab-${fieldKey}`}>
          {vocabulary
            .filter((v) => !tags.includes(v))
            .map((v) => (
              <option key={v} value={v} />
            ))}
        </datalist>
      </div>
    </div>
  );
}
