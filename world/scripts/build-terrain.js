import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { readStylizedTerrainPreset } from "../../packages/terrain/src/terrain/tools/ReadStylizedTerrainPreset.mjs";

const packages = fileURLToPath(new URL("../../packages/", import.meta.url));
const terrain = join(packages, "terrain");
const presetRoot = join(terrain, "src/data/seed-world/public");
const resources = {
  terrainShader: "Terrain",
  grassShader: "Grass",
  flowerShader: "Vegetation"
};

const options = {
  absWorkingDir: packages,
  entryPoints: {
    "terrain-authoring": "world-planning/src/generation/terrain/TerrainAuthoring.ts",
    "terrain-runtime": "world-planning/src/generation/terrain/TerrainRuntime.ts"
  },
  outdir: join(packages, "world-planning/dist"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  external: ["@galacean/engine", "@galacean/engine-core", "@galacean/engine-math"],
  loader: { ".shaderc": "json", ".r8": "dataurl", ".rgb8": "dataurl" },
  plugins: [
    {
      name: "world-package-sources",
      setup(api) {
        api.onResolve({ filter: /^@galacean\/engine-(terrain|vegetation|environment|modify|water)\// }, (args) => {
          if (args.pluginData) return;
          const [, name, subpath] = /^@galacean\/engine-([^/]+)\/(.+)$/.exec(args.path);
          return api.resolve(join(packages, name, "src", subpath), {
            kind: args.kind,
            resolveDir: args.resolveDir,
            pluginData: true
          });
        });
        api.onResolve({ filter: /\?url$/ }, ({ path, resolveDir }) => ({
          path: resolve(resolveDir, path.slice(0, -4))
        }));
        api.onResolve({ filter: /^\.\/StylizedTerrainPreset$/ }, () => ({
          path: "stylized-terrain-preset",
          namespace: "terrain-assets"
        }));
        api.onLoad({ filter: /.*/, namespace: "terrain-assets" }, async () => {
          const { geometry, grassMaterial, flowers } = await readStylizedTerrainPreset(presetRoot);
          const names = ["grass", "flowers-1", "flowers-2"];
          return {
            loader: "js",
            resolveDir: presetRoot,
            watchFiles: [
              ...names.flatMap((name) => [
                join(presetRoot, "atoms", `${name}.glb`),
                join(presetRoot, "Material/Vegetation", `${name}.mat`)
              ])
            ],
            contents: [
              ...Object.entries(resources).map(
                ([name, shader]) => `export { default as ${name} } from "./Shader/${shader}.shaderc";`
              ),
              `export const flowerPresets = ${JSON.stringify(flowers)};`,
              `export const grassGeometry = ${JSON.stringify(geometry)};`,
              `export const grassMaterialData = ${JSON.stringify(grassMaterial.shaderData)};`
            ].join("\n")
          };
        });
      }
    }
  ]
};

if (process.argv.includes("--watch")) {
  const compiler = await context(options);
  await compiler.watch();
} else {
  await build(options);
}
