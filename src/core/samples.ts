import type { StarterFile } from "./starter";

export interface SampleBundle {
  id: "getting-started" | "google-bitcoin" | "google-ga4";
  title: string;
  description: string;
  folderName: string;
  sourceUrl: string | null;
  sourceLabel: string;
}

export const SAMPLE_BUNDLES: readonly SampleBundle[] = [
  {
    id: "getting-started",
    title: "Getting Started Handbook",
    description:
      "A small people-operations handbook for learning documents, links, policies, and the knowledge graph.",
    folderName: "okf-getting-started",
    sourceUrl: null,
    sourceLabel: "Created by Atteniv",
  },
  {
    id: "google-bitcoin",
    title: "Google Bitcoin",
    description:
      "A compact real-world bundle covering a BigQuery dataset and its blocks, transactions, inputs, and outputs tables.",
    folderName: "okf-google-bitcoin",
    sourceUrl:
      "https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/bundles/crypto_bitcoin",
    sourceLabel: "Google OKF reference bundle · Apache 2.0",
  },
  {
    id: "google-ga4",
    title: "Google Analytics 4",
    description:
      "A richer e-commerce example with a dataset, event table, metrics, references, and joins.",
    folderName: "okf-google-ga4",
    sourceUrl:
      "https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/bundles/ga4",
    sourceLabel: "Google OKF reference bundle · Apache 2.0",
  },
];

export type SampleAssetReader = (url: string) => Promise<string>;

async function fetchAsset(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load packaged sample asset (${response.status}): ${url}`);
  }
  return response.text();
}

function sampleById(id: string): SampleBundle {
  const sample = SAMPLE_BUNDLES.find((candidate) => candidate.id === id);
  if (sample === undefined) throw new Error(`Unknown sample bundle: ${id}`);
  return sample;
}

function safeManifest(source: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Invalid sample manifest: expected JSON");
  }
  if (!Array.isArray(parsed) || !parsed.every((path) => typeof path === "string")) {
    throw new Error("Invalid sample manifest: expected a list of file paths");
  }
  const paths = parsed as string[];
  const unique = new Set(paths);
  const unsafe = paths.some((path) => {
    const segments = path.split("/");
    return (
      path === "" ||
      path.startsWith("/") ||
      path.includes("\\") ||
      segments.some((segment) => segment === "" || segment === "." || segment === "..")
    );
  });
  if (unsafe || unique.size !== paths.length || !unique.has("index.md")) {
    throw new Error("Invalid sample manifest: paths must be unique, relative, and include index.md");
  }
  return paths;
}

/** Load a packaged, read-only sample into files ready for an editable copy. */
export async function loadSampleBundle(
  id: string,
  readAsset: SampleAssetReader = fetchAsset,
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<StarterFile[]> {
  const sample = sampleById(id);
  const root = `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}samples/${sample.id}/`;
  const manifest = safeManifest(await readAsset(`${root}manifest.json`));
  return Promise.all(
    manifest.map(async (path) => ({
      path,
      content: await readAsset(`${root}${path.split("/").map(encodeURIComponent).join("/")}`),
    })),
  );
}
