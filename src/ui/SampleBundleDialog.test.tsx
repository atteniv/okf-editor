/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { tauriPlatform as platform } from "../platform";
import { SampleBundleDialog } from "./SampleBundleDialog";
import { useStore } from "./store";

vi.mock("../platform", () => ({
  tauriPlatform: {
    pickFolder: vi.fn(),
    scanBundle: vi.fn(),
    gitInit: vi.fn(),
    writeDoc: vi.fn(),
    gitCommit: vi.fn(),
  },
}));

const originalOpenBundle = useStore.getState().openBundle;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  useStore.setState({ openBundle: originalOpenBundle });
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function clickButton(label: string) {
  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (candidate) => candidate.textContent === label,
  );
  if (button === undefined) throw new Error(`Missing button: ${label}`);
  await act(async () => button.click());
}

describe("SampleBundleDialog", () => {
  it("creates and opens an editable copy in the chosen destination", async () => {
    const openBundle = vi.fn(async () => undefined);
    const onClose = vi.fn();
    useStore.setState({ openBundle });
    vi.mocked(platform.pickFolder).mockResolvedValue("/Users/example/Documents");
    vi.mocked(platform.scanBundle).mockRejectedValue(new Error("not found"));
    vi.mocked(platform.gitInit).mockResolvedValue();
    vi.mocked(platform.writeDoc).mockResolvedValue();
    vi.mocked(platform.gitCommit).mockResolvedValue();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        text: async () =>
          url.endsWith("manifest.json")
            ? JSON.stringify(["index.md", "guides/onboarding.md"])
            : `sample content from ${url}`,
      })),
    );

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<SampleBundleDialog onClose={onClose} />));

    await clickButton("Choose destination…");
    expect(container.textContent).toContain(
      "/Users/example/Documents/okf-getting-started",
    );
    await clickButton("Create editable copy");

    expect(platform.gitInit).toHaveBeenCalledWith(
      "/Users/example/Documents/okf-getting-started",
    );
    expect(platform.writeDoc).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledOnce();
    expect(openBundle).toHaveBeenCalledWith(
      "/Users/example/Documents/okf-getting-started",
    );
  });

  it("refuses to overwrite an existing sample folder", async () => {
    vi.mocked(platform.pickFolder).mockResolvedValue("/Users/example/Documents");
    vi.mocked(platform.scanBundle).mockResolvedValue([]);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<SampleBundleDialog onClose={() => undefined} />));

    await clickButton("Choose destination…");
    await clickButton("Create editable copy");

    expect(container.textContent).toContain("already exists");
    expect(platform.gitInit).not.toHaveBeenCalled();
  });
});
