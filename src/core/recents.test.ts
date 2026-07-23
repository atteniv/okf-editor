import { describe, expect, it } from "vitest";
import {
  formatRecentLocation,
  loadRecentRemotes,
  removeRecentPath,
} from "./recents";

describe("removeRecentPath", () => {
  it("removes only the selected project", () => {
    const recents = ["/projects/one", "/projects/two", "/projects/three"];

    expect(removeRecentPath(recents, "/projects/two")).toEqual([
      "/projects/one",
      "/projects/three",
    ]);
    expect(recents).toHaveLength(3);
  });

  it("leaves the list unchanged when the project is absent", () => {
    const recents = ["/projects/one"];

    expect(removeRecentPath(recents, "/projects/two")).toEqual(recents);
  });
});

describe("formatRecentLocation", () => {
  it("uses the local path when no remote is associated", () => {
    expect(formatRecentLocation("/projects/one", null)).toBe("/projects/one");
  });

  it("shows a concise GitHub location without credentials or .git", () => {
    expect(
      formatRecentLocation(
        "/projects/one",
        "https://secret@github.com/atteniv/okf-editor.git",
      ),
    ).toBe("github.com/atteniv/okf-editor");
    expect(
      formatRecentLocation(
        "/projects/one",
        "git@github.com:atteniv/okf-editor.git",
      ),
    ).toBe("github.com/atteniv/okf-editor");
  });
});

describe("loadRecentRemotes", () => {
  it("loads each remote and treats non-repositories as local", async () => {
    const remotes = await loadRecentRemotes(
      ["/projects/one", "/projects/two"],
      async (root) => {
        if (root.endsWith("two")) throw new Error("not a repository");
        return "https://github.com/example/one.git";
      },
    );

    expect(remotes).toEqual({
      "/projects/one": "https://github.com/example/one.git",
      "/projects/two": null,
    });
  });
});
