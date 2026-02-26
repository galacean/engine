module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "build", "ci", "docs", "perf", "refactor", "test", "types", "style", "revert", "chore"]
    ]
  }
};
