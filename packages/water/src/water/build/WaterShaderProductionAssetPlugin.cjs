const { readFileSync } = require("node:fs");
const { relative, resolve, sep } = require("node:path");

const WATER_SHADER_ASSET_EXTENSION = /\.(?:frag|glsl|shader|vert)$/u;

/**
 * Removes formatting-only line whitespace and full-line comments while preserving the Shader/GLSL token stream.
 * Source assets stay readable in development; only production `?raw` modules use this form.
 */
function compactWaterShaderSource(source) {
  const compacted = source
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .join("\n");
  // Raw modules are concatenated at runtime; terminate directives and line comments
  // before the next module's first token, even when the input has no final newline.
  return `${compacted}\n`;
}

function isShaderAssetInsideRoot(filePath, shaderRoot) {
  const relativePath = relative(shaderRoot, filePath);
  return (
    relativePath.length > 0 &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    WATER_SHADER_ASSET_EXTENSION.test(filePath)
  );
}

/** Vite plugin that compacts only Water shader raw imports in non-development builds. */
function createWaterShaderProductionAssetPlugin(shaderRoot) {
  const resolvedShaderRoot = resolve(shaderRoot);
  let enabled = false;
  return {
    name: "compact-water-shader-production-assets",
    enforce: "pre",
    configResolved(config) {
      enabled = config.command === "build" && config.mode !== "development";
    },
    load(id) {
      if (!enabled) return null;
      const queryIndex = id.indexOf("?");
      if (queryIndex < 0) return null;
      const filePath = id.slice(0, queryIndex);
      const query = new URLSearchParams(id.slice(queryIndex + 1));
      if (!query.has("raw") || !isShaderAssetInsideRoot(filePath, resolvedShaderRoot)) return null;

      const compactedSource = compactWaterShaderSource(readFileSync(filePath, "utf8"));
      return {
        code: `export default ${JSON.stringify(compactedSource)};`,
        map: null,
        moduleSideEffects: false
      };
    }
  };
}

module.exports = {
  compactWaterShaderSource,
  createWaterShaderProductionAssetPlugin
};
