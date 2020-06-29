module.exports = {
  mode: 'modules',
  theme: "vuepress",
  out: "docs",
  exclude: ["**/node_modules/**", "**/*.test.ts", "scripts/template/**", "**/*.d.ts"],
  name: "o3",
  excludePrivate: true,
  ignoreCompilerErrors: true,
  includeDeclarations: true,
  excludeExternals: true,
  lernaExclude: ["@alipay/o3-$name$"]
};
