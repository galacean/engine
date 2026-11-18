// Refresh planning dimensions from the actual runtime compiler; never hand-maintain a second species table.
import { createServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const argument = process.argv.indexOf("--catalog");
const catalogPath = argument < 0 ? resolve(directory, "../generated/procedural-trees/plant-species.json") : process.argv[argument + 1];
if (!catalogPath) throw new Error("--catalog requires the source plant-species.json path");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const read = file => JSON.parse(readFileSync(resolve(dirname(catalogPath), file), "utf8"));
// Engine module initialization installs browser polyfills; measurement never creates an Engine or GPU resource.
globalThis.window ??= globalThis;
const vite = await createServer({ root: resolve(directory, "../../../../.."), configFile: resolve(directory, "../../../../../world/vite.config.mjs"),
  server: { middlewareMode: true, hmr: false }, logLevel: "silent" });
try {
  const load = name => vite.ssrLoadModule(`/packages/vegetation/src/asset-assembly/${name}.ts`);
  const { decodePlantParameters } = await load("PlantParameterEncoding");
  const { measureProceduralPlantAssetBounds } = await load("ProceduralPlantLibraryRuntime");
  const { treeSpeciesGeometryRecipe } = await load("TreeSpeciesGeometry");
  const { buildProceduralTreeGeometry, createProceduralTreeFoliageGeometryTuning } = await load("ProceduralTreeGenerator");
  const dimensions = new Map();
  for (const entry of catalog.assets.filter(entry => entry.vegetation?.layer === "trees")) {
    const source = [...catalog.assets, ...(catalog.prototypes ?? [])].find(source => source.id === (entry.prototypeId ?? entry.id));
    if (!source?.parameterFile) throw new Error(`Missing plant prototype: ${entry.id}`);
    const bounds = measureProceduralPlantAssetBounds(decodePlantParameters(read(source.parameterFile)), entry);
    dimensions.set(entry.id, bounds.max.map((value, axis) => value - bounds.min[axis]));
  }
  for (const entry of catalog.treeRecipes) {
    const structure = decodePlantParameters(read(entry.parameterFile));
    const { base, distribution, counts, triangleLimits } = treeSpeciesGeometryRecipe(entry, structure);
    const geometry = buildProceduralTreeGeometry({ ...base, structureParameters: structure },
      { lod0Count: counts[0], lod1Count: counts[1], lod2Count: counts[2], lod3Count: counts[3] }, distribution,
      { ...createProceduralTreeFoliageGeometryTuning(), lodScales: [1, 1, 1, 1] }, { maxTrianglesPerLod: triangleLimits });
    const parts = [geometry.lods[0].trunk, geometry.lods[0].crown];
    dimensions.set(entry.id, [0, 1, 2].map(axis => Math.max(...parts.map(part => part.bounds[1][axis])) -
      Math.min(...parts.map(part => part.bounds[0][axis]))));
  }
  const changed = [];
  for (const entry of [...catalog.assets, ...catalog.treeRecipes]) {
    const measured = dimensions.get(entry.id);
    if (measured && JSON.stringify(measured) !== JSON.stringify(entry.vegetation.sourceDimensionsM)) {
      entry.vegetation.sourceDimensionsM = measured;
      changed.push(entry.id);
    }
  }
  if (process.argv.includes("--check")) {
    if (changed.length) throw new Error(`Stale plant species dimensions: ${changed.join(", ")}`);
  } else if (changed.length) writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
  console.log(JSON.stringify({ measured: dimensions.size, updated: changed, check: process.argv.includes("--check") }));
} finally { await vite.close(); }
