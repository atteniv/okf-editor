import { describe, expect, it, vi } from "vitest";
import { SAMPLE_BUNDLES, loadSampleBundle } from "./samples";

describe("sample bundle catalog", () => {
  it("offers a teaching sample and two official Google-derived examples", () => {
    expect(SAMPLE_BUNDLES.map((sample) => sample.id)).toEqual([
      "getting-started",
      "google-bitcoin",
      "google-ga4",
    ]);
    expect(SAMPLE_BUNDLES.filter((sample) => sample.sourceUrl !== null)).toHaveLength(2);
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
