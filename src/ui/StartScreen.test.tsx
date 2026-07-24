/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StartScreen } from "./StartScreen";
import { useStore } from "./store";

vi.mock("../platform", () => ({
  tauriPlatform: {
    gitRemoteUrl: vi.fn(async () => null),
  },
}));

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
  useStore.setState({
    recents: [],
    error: null,
    settingsOpen: false,
    githubReady: false,
    aiReady: false,
    perplexityReady: false,
  });
});

function renderStartScreen() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<StartScreen />));
  return container;
}

describe("first-time setup guidance", () => {
  it("explains prerequisites and directs a non-technical user to Settings", () => {
    const view = renderStartScreen();

    expect(view.textContent).toContain("First time here?");
    expect(view.textContent).toContain("GitHub account");
    expect(view.textContent).toContain("personal access token");
    expect(view.textContent).toContain("OpenRouter");
    expect(view.textContent).toContain("Perplexity");

    const setup = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent === "Set up accounts & keys",
    );
    expect(setup).toBeDefined();

    act(() => setup?.click());
    expect(useStore.getState().settingsOpen).toBe(true);
  });

  it("opens a sample picker from the splash page", () => {
    const view = renderStartScreen();
    const trySample = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent === "Try a sample bundle…",
    );

    expect(trySample).toBeDefined();
    act(() => trySample?.click());
    expect(view.textContent).toContain("Choose a sample bundle");
    expect(view.textContent).toContain("Google Bitcoin");
    expect(view.textContent).toContain("Google Analytics 4");
  });

  it("shows which credentials are connected and which are optional", () => {
    useStore.setState({
      githubReady: true,
      aiReady: true,
      perplexityReady: false,
    });
    const view = renderStartScreen();
    const statuses = Array.from(view.querySelectorAll(".setup-status")).map(
      (status) => status.textContent,
    );

    expect(statuses).toEqual(["Connected", "Connected", "Optional · Not set up"]);
  });
});
