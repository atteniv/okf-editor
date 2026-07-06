import { describe, expect, it } from "vitest";
import { buildIndex, type ScanEntry } from "./bundle";
import { buildFileTree, dirsContaining } from "./filetree";

const ENTRIES: ScanEntry[] = [
  { path: "index.md", content: "# root\n" },
  { path: "policies/remote-work.md", content: "# rw\n" },
  { path: "policies/index.md", content: "# p\n" },
  { path: "policies/hr/index.md", content: "# hr\n" },
  { path: "policies/facilities/index.md", content: "# fac\n" },
  { path: "guides/onboarding.md", content: "# on\n" },
];

describe("buildFileTree", () => {
  const tree = buildFileTree(buildIndex(ENTRIES).docs);

  it("nests directories to arbitrary depth", () => {
    const policies = tree.dirs.find((d) => d.name === "policies")!;
    expect(policies.dirs.map((d) => d.name)).toEqual(["facilities", "hr"]);
    expect(policies.dirs[1].files.map((f) => f.path)).toEqual([
      "policies/hr/index.md",
    ]);
  });

  it("keeps root files at the root and sorts dirs alphabetically", () => {
    expect(tree.files.map((f) => f.path)).toEqual(["index.md"]);
    expect(tree.dirs.map((d) => d.name)).toEqual(["guides", "policies"]);
  });

  it("floats index.md above siblings", () => {
    const policies = tree.dirs.find((d) => d.name === "policies")!;
    expect(policies.files.map((f) => f.path)).toEqual([
      "policies/index.md",
      "policies/remote-work.md",
    ]);
  });
});

describe("dirsContaining", () => {
  it("returns every ancestor directory of the given paths", () => {
    expect(dirsContaining(["policies/hr/index.md"])).toEqual(
      new Set(["policies", "policies/hr"]),
    );
    expect(dirsContaining(["index.md"])).toEqual(new Set());
  });
});
