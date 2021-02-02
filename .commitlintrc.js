module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "build", "ci", "docs", "feat", "fix", "perf", "refactor", "test", "types", "style"]
    ]
  }
};
