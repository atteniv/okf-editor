import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildIndex } from "./bundle";
import { lintBundle } from "./lint";
import {
  DEFAULT_SCHEMA,
  mergeSchema,
  parseSchemaConfig,
} from "./schema";
import { SAMPLE_BUNDLES, loadSampleBundle } from "./samples";

const samplesRoot = fileURLToPath(new URL("../../public/samples", import.meta.url));

function filesBelow(root: string): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full.slice(root.length + 1).replaceAll("\\", "/"));
    }
  };
  walk(root);
  return files.sort();
}

describe("sample bundle catalog", () => {
  it("offers a teaching sample and two official Google-derived examples", () => {
    expect(SAMPLE_BUNDLES.map((sample) => sample.id)).toEqual([
      "getting-started",
      "google-bitcoin",
      "google-ga4",
    ]);
    expect(SAMPLE_BUNDLES.filter((sample) => sample.sourceUrl !== null)).toHaveLength(2);
  });

  it.each(SAMPLE_BUNDLES)("ships every asset declared by $title", (sample) => {
    const root = join(samplesRoot, sample.id);
    const manifest = JSON.parse(
      readFileSync(join(root, "manifest.json"), "utf8"),
    ) as string[];
    const packagedFiles = filesBelow(root).filter((path) => path !== "manifest.json");

    expect(manifest).toEqual(packagedFiles);
    expect(manifest).toContain("index.md");
  });

  it.each(SAMPLE_BUNDLES)("opens $title without diagnostics", (sample) => {
    const root = join(samplesRoot, sample.id);
    const entries = filesBelow(root)
      .filter((path) => path.endsWith(".md"))
      .map((path) => ({ path, content: readFileSync(join(root, path), "utf8") }));
    const docs = buildIndex(entries).docs;
    const configSource = readFileSync(join(root, ".okf-editor.json"), "utf8");
    const parsed = parseSchemaConfig(configSource);
    if (parsed.error !== null) throw new Error(parsed.error);
    const schema = mergeSchema(DEFAULT_SCHEMA, parsed.config);

    expect([...lintBundle(docs, schema)]).toEqual([]);
  });

  it("loads every safe file listed by a sample manifest", async () => {
    const readAsset = vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) {
        return JSON.stringify(["index.md", "tables/events.md", ".okf-editor.json"]);
      }
      return `contents of ${url}`;
    });

    const files = await loadSampleBundle("google-ga4", readAsset, "/assets/");

    expect(files.map((file) => file.path)).toEqual([
      "index.md",
      "tables/events.md",
      ".okf-editor.json",
    ]);
    expect(readAsset).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["parent traversal", ["index.md", "../secret"]],
    ["absolute path", ["index.md", "/tmp/secret"]],
    ["duplicate path", ["index.md", "index.md"]],
    ["missing root index", ["docs/example.md"]],
  ])("rejects an unsafe manifest with %s", async (_label, manifest) => {
    const readAsset = async (url: string) =>
      url.endsWith("manifest.json") ? JSON.stringify(manifest) : "unused";

    await expect(
      loadSampleBundle("google-bitcoin", readAsset, "/assets/"),
    ).rejects.toThrow("sample manifest");
  });
});
