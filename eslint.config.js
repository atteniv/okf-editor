import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "src-tauri/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // The platform seam is the only module allowed to touch Tauri
    // (docs/DESIGN.md §3). Everything else goes through the Platform interface.
    files: ["src/{core,ui}/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@tauri-apps/*"], message: "Only src/platform/ may import Tauri APIs (DESIGN §3)." }] },
      ],
    },
  },
);
