import { describe, expect, it } from "vitest";
import { removeRecentPath } from "./recents";

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
