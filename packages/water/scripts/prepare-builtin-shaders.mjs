import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import { engineModify } from "../../modify/build/vite.mjs";

const require = createRequire(new URL("../../../world/package.json", import.meta.url));
const { createServer } = await import(pathToFileURL(path.join(path.dirname(require.resolve("vite/package.json")), "dist/node/index.js")).href);

// Offline only. Does not touch Terrain's AOT artifacts or regenerate native assets.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = process.env.WATER_BUILTIN_SHADER_OUTPUT ?? path.join(root, "packages/water/src/water/native/assets/Water/Shaders/builtin");
const input = process.env.WATER_BUILTIN_SHADER_INPUT ?? path.join(root, "packages/water/src/water/native/assets/Water/Shaders");
const server = await createServer({ root, configFile: false, cacheDir: "/tmp/opencode/water-builtins/vite-cache",
  plugins: [{ name: "water-builtin-source-paths", enforce: "pre", resolveId(source) {
    if (source.startsWith("/packages/")) return path.join(root, source);
  } }, engineModify()], server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] } });
try {
  const { ShaderPrecompiler } = await server.ssrLoadModule("/packages/shader-compiler/src/ShaderPrecompiler.ts");
  const { shaderLibrary } = await server.ssrLoadModule("/packages/shader/src/ShaderLibrary/index.ts");
  const { WATER_BUILTIN_SHADER_NAMES, waterBuiltinShaderSource } = await server.ssrLoadModule("/packages/water/src/water/native/WaterBuiltinShaderNames.ts");
  const compiler = new ShaderPrecompiler();
  compiler.setIncludeMap(Object.fromEntries(shaderLibrary.map(({ path, source }) => [path, source])));
  await mkdir(output, { recursive: true });
  const sources = {};
  for (const profile of Object.keys(WATER_BUILTIN_SHADER_NAMES)) {
    const source = waterBuiltinShaderSource(await readFile(path.join(input, `${profile}.shader`), "utf8"), profile);
    const data = compiler.precompile(source, 0);
    sources[profile] = createHash("sha256").update(source).digest("hex");
    await writeFile(path.join(output, `${profile}.json`), JSON.stringify(data) + "\n");
    console.log(`Precompiled ${data.name}: ${data.subShaders.length} SubShaders`);
  }
  await writeFile(path.join(output, "sources.json"), JSON.stringify(sources, null, 2) + "\n");
} finally { await server.close(); }
