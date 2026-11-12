const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

/** Compile the authored tint shader on the dev/build server, never on a display frame. */
function plantShaderPrecompile(options = {}) {
  const shaderPath = resolve(__dirname, "../procedural/runtime/PlantOrganTint.shader");
  return {
    name: "plant-shader-precompile",
    enforce: "pre",
    load(id) {
      if (id !== `${shaderPath}?plant-precompiled`) return null;
      const { ShaderPrecompiler } = require("@galacean/engine-shader-compiler/precompile");
      const shaderLibrary = options.shaderLibrary ?? require("@galacean/engine-shader/sources").shaderLibrary;
      this.addWatchFile(shaderPath);
      const compiler = new ShaderPrecompiler();
      compiler.setIncludeMap(Object.fromEntries(shaderLibrary.map(({ path, source }) => [path, source])));
      // Keep the existing GLES100 target, including the engine's WebGL2 upgrade path.
      const data = compiler.precompile(readFileSync(shaderPath, "utf8"), 0, "PlantOrganTint.shader");
      return { code: `export default ${JSON.stringify(data)};`, map: null };
    }
  };
}

module.exports = { plantShaderPrecompile };
