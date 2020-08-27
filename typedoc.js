module.exports = {
  name: "My Library",
  mode: "file",
  out: "doc",
  theme: "default",
  ignoreCompilerErrors: "false",
  preserveConstEnums: "true",
  stripInternal: "false",
  "external-modulemap": ".*/packages/([\\w\\-_]+)/",
  exclude: [
    "**/+(dev-packages|examples|typings)/**/*",
    "**/*test.ts",
    "packages/adapter-miniprogram/**/*",
    "packages/component-miniprogram/**/*",
    "packages/**/src/global.d.ts",
    "packages/**/shaderLib/global.d.ts",
    "scripts/**/*"
  ],
  plugin: ["@strictsoftware/typedoc-plugin-monorepo"]
};
