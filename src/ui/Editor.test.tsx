/** @vitest-environment jsdom */

import { diagnosticCount } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Diagnostic } from "../core/lint";
import { Editor } from "./Editor";

const brokenLink: Diagnostic = {
  rule: "OKFE005",
  severity: "error",
  message: "Broken link",
  where: "body",
  from: 5,
  to: 15,
  fix: { kind: "create-doc", targetPath: "missing.md" },
};

const missingField: Diagnostic = {
  rule: "OKFE004",
  severity: "warning",
  message: "Missing field",
  where: "body",
  from: 0,
  to: 4,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  if (root !== null) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

async function renderEditor(diagnostics: Diagnostic[]) {
  if (container === null) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => {
    root?.render(
      <Editor
        docPath="index.md"
        value="See [missing](missing.md)."
        onChange={() => undefined}
        diagnostics={diagnostics}
        linkTargets={[]}
      />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  const editorElement = container.querySelector<HTMLElement>(".cm-editor");
  const view = editorElement ? EditorView.findFromDOM(editorElement) : null;
  if (view === null) throw new Error("CodeMirror editor did not mount");
  return view;
}

describe("Editor diagnostics", () => {
  it("removes resolved diagnostics when props change without a document edit", async () => {
    const view = await renderEditor([brokenLink]);
    expect(diagnosticCount(view.state)).toBe(1);

    await renderEditor([]);

    expect(diagnosticCount(view.state)).toBe(0);
  });

  it("keeps unrelated diagnostics when a broken link is resolved", async () => {
    const view = await renderEditor([brokenLink, missingField]);
    expect(diagnosticCount(view.state)).toBe(2);

    await renderEditor([missingField]);

    expect(diagnosticCount(view.state)).toBe(1);
  });
});
