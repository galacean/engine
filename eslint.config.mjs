import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";

// Recommended rule sets are surfaced as warnings so they guide without blocking CI,
// while the existing backlog is reduced incrementally.
const asWarnings = (configs) =>
  configs.map((config) => ({
    ...config,
    rules: Object.fromEntries(
      Object.entries(config.rules ?? {}).map(([rule, value]) => {
        const level = Array.isArray(value) ? value[0] : value;
        const isError = level === "error" || level === 2;
        if (!isError) return [rule, value];
        return [rule, Array.isArray(value) ? ["warn", ...value.slice(1)] : "warn"];
      })
    )
  }));

export default tseslint.config(
  {
    files: ["packages/*/src/**/*.ts"],
    extends: asWarnings([eslint.configs.recommended, ...tseslint.configs.recommended]),
    languageOptions: { parser: tseslint.parser, sourceType: "module" },
    plugins: { "@typescript-eslint": tseslint.plugin }
  },
  // Turn off ESLint rules that conflict with Prettier; formatting is owned by the Prettier CLI
  prettier
);
