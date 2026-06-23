module.exports = {
  root: true,
  ignorePatterns: ["pnpm-lock.yaml"],
  overrides: [
    {
      files: ["*.ts"],
      parser: "@typescript-eslint/parser",
      extends: ["plugin:prettier/recommended"],
      plugins: ["@typescript-eslint"],
      parserOptions: {
        ecmaVersion: 2019,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      },
      env: {
        browser: true,
        node: true
      }
    },
    {
      files: ["*.md", "*.mdx"],
      extends: ["plugin:prettier/recommended"],
      parser: "eslint-parser-plain",
      rules: {
        "prettier/prettier": [
          "error",
          {
            parser: "markdown"
          }
        ]
      }
    },
    {
      files: ["*.html"],
      extends: ["plugin:prettier/recommended"],
      parser: "eslint-parser-plain",
      rules: {
        "prettier/prettier": [
          "error",
          {
            parser: "html"
          }
        ]
      }
    },
    {
      files: ["*.json"],
      extends: ["plugin:prettier/recommended"],
      parser: "eslint-parser-plain",
      rules: {
        "prettier/prettier": [
          "error",
          {
            parser: "json"
          }
        ]
      }
    },
    {
      files: ["*.yaml", "*.yml"],
      extends: ["plugin:prettier/recommended"],
      parser: "eslint-parser-plain",
      rules: {
        "prettier/prettier": [
          "error",
          {
            parser: "yaml"
          }
        ]
      }
    }
  ]
};
