import { describe, expect, it } from "vitest";
import { parseThemePreference, resolveTheme } from "./theme";

describe("theme preference", () => {
  it("accepts supported persisted values and defaults invalid values to system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("unknown")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("resolves system preference against the operating-system appearance", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
