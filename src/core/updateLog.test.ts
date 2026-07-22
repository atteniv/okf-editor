import { describe, expect, it } from "vitest";
import { appendUpdateLog, createUpdateLog } from "./updateLog";

describe("createUpdateLog", () => {
  it("creates a conformant root log with an initialization entry", () => {
    expect(createUpdateLog("2026-07-20")).toBe(
      "# Bundle Update Log\n\n" +
        "## 2026-07-20\n" +
        "* **Initialization**: Enabled editor-maintained update logging.\n",
    );
  });
});

describe("appendUpdateLog", () => {
  it("prepends a new date group", () => {
    const source =
      "# Bundle Update Log\n\n" +
      "## 2026-07-19\n" +
      "* **Update**: Older change.\n";

    expect(appendUpdateLog(source, "2026-07-20", "Add payroll policy")).toBe(
      "# Bundle Update Log\n\n" +
        "## 2026-07-20\n" +
        "* **Update**: Add payroll policy.\n\n" +
        "## 2026-07-19\n" +
        "* **Update**: Older change.\n",
    );
  });

  it("adds an entry beneath an existing date heading", () => {
    const source =
      "# Bundle Update Log\n\n" +
      "## 2026-07-20\n" +
      "* **Initialization**: Enabled editor-maintained update logging.\n";

    expect(appendUpdateLog(source, "2026-07-20", "Update personas")).toBe(
      "# Bundle Update Log\n\n" +
        "## 2026-07-20\n" +
        "* **Update**: Update personas.\n" +
        "* **Initialization**: Enabled editor-maintained update logging.\n",
    );
  });

  it("flattens multiline commit messages into one prose entry", () => {
    const source = "# Bundle Update Log\n";

    expect(appendUpdateLog(source, "2026-07-20", "Add policy\n\nWith details"))
      .toContain("* **Update**: Add policy With details.");
  });
});
