// Refresh planning dimensions from the actual runtime compiler; never hand-maintain a second species table.
import { createServer } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const argument = process.argv.indexOf("--catalog");
const catalogPath = argument < 0 ? resolve(directory, "../generated/procedural-trees/plant-species.json") : process.argv[argument + 1];
if (!catalogPath) throw new Error("--catalog requires the source plant-species.json path");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const resolveRef = file => (typeof file === "string" ? file : file?.$ref?.replace(/^World\/Vegetation\//u, ""));
const read = file => JSON.parse(readFileSync(resolve(dirname(catalogPath), resolveRef(file)), "utf8"));
// Engine module initialization installs browser polyfills; measurement never creates an Engine or GPU resource.
globalThis.window ??= globalThis;
const vite = await createServer({ configFile: resolve(directory, "../../../../../world/vite.config.mjs"),
  root: directory, server: { middlewareMode: true, hmr: false }, logLevel: "silent" });
try {
  const load = name => vite.ssrLoadModule(resolve(directory, "..", `${name}.ts`));
  const { decodePlantParameters } = await load("PlantParameterEncoding");
  const { measureProceduralPlantAssetBounds } = await load("ProceduralPlantLibraryRuntime");
  const { buildProceduralPlantGeometry } = await load("ProceduralPlantGeometry");
  const { treeSpeciesGeometryRecipe } = await load("TreeSpeciesGeometry");
  const { buildProceduralTreeGeometry, createProceduralTreeFoliageGeometryTuning } = await load("ProceduralTreeGenerator");
  const dimensions = new Map();
  const boundsMap = new Map();
  const lodCounts = new Map();
  const decodedCache = new Map();
  const decodeCached = file => {
    const key = resolveRef(file);
    let val = decodedCache.get(key);
    if (!val) {
      val = decodePlantParameters(read(file));
      decodedCache.set(key, val);
    }
    return val;
  };
  for (const entry of catalog.assets) {
    if (!entry.vegetation) continue;
    const source = [...catalog.assets, ...(catalog.prototypes ?? [])].find(source => source.id === (entry.prototypeId ?? entry.id));
    if (!source?.parameterFile) continue;
    const asset = decodeCached(source.parameterFile);
    const bounds = measureProceduralPlantAssetBounds(asset, entry);
    boundsMap.set(entry.id, bounds);
    lodCounts.set(entry.id, asset.geometryLods.length);
    if (entry.vegetation.layer === "trees") {
      dimensions.set(entry.id, bounds.max.map((value, axis) => value - bounds.min[axis]));
    }
  }
  for (const entry of catalog.treeRecipes) {
    const structure = decodeCached(entry.parameterFile);
    const { base, distribution, counts, triangleLimits } = treeSpeciesGeometryRecipe(entry, structure);
    const geometry = buildProceduralTreeGeometry({ ...base, structureParameters: structure },
      { lod0Count: counts[0], lod1Count: counts[1], lod2Count: counts[2], lod3Count: counts[3] }, distribution,
      { ...createProceduralTreeFoliageGeometryTuning(), lodScales: [1, 1, 1, 1] }, { maxTrianglesPerLod: triangleLimits });
    const parts = [geometry.lods[0].trunk, geometry.lods[0].crown];
    const min = [0, 1, 2].map(axis => Math.min(...parts.map(part => part.bounds[0][axis])));
    const max = [0, 1, 2].map(axis => Math.max(...parts.map(part => part.bounds[1][axis])));
    boundsMap.set(entry.id, { min, max });
    dimensions.set(entry.id, [0, 1, 2].map(axis => max[axis] - min[axis]));
  }
  for (const entry of catalog.shrubRecipes ?? []) {
    const structure = decodeCached(entry.parameterFile);
    const restGeometry = buildProceduralPlantGeometry(structure, 0);
    const min = [0, 1, 2].map(axis => Math.min(...restGeometry.map(({ mesh }) => mesh.bounds[0][axis])));
    const max = [0, 1, 2].map(axis => Math.max(...restGeometry.map(({ mesh }) => mesh.bounds[1][axis])));
    boundsMap.set(entry.id, { min, max });
  }
  const applyMeasuredToCatalog = targetCatalog => {
    const updated = [];
    for (const entry of [...targetCatalog.assets, ...targetCatalog.treeRecipes, ...(targetCatalog.shrubRecipes ?? [])]) {
      let dirty = false;
      const measuredDim = dimensions.get(entry.id);
      if (measuredDim && JSON.stringify(measuredDim) !== JSON.stringify(entry.vegetation?.sourceDimensionsM)) {
        entry.vegetation.sourceDimensionsM = measuredDim;
        dirty = true;
      }
      const measuredBounds = boundsMap.get(entry.id);
      if (measuredBounds && entry.vegetation && JSON.stringify(measuredBounds) !== JSON.stringify(entry.vegetation.sourceBoundsM)) {
        entry.vegetation.sourceBoundsM = measuredBounds;
        dirty = true;
      }
      const measuredLods = lodCounts.get(entry.id);
      if (measuredLods !== undefined && entry.lodCount !== measuredLods) {
        entry.lodCount = measuredLods;
        dirty = true;
      }
      if (dirty) updated.push(entry.id);
    }
    return updated;
  };
  const changed = applyMeasuredToCatalog(catalog);
  const projectCatalogPath = argument < 0 ? resolve(dirname(catalogPath), "plant-project-plant-species.json") : undefined;
  let projectChanged = [];
  let projectCatalog;
  if (projectCatalogPath && existsSync(projectCatalogPath)) {
    projectCatalog = JSON.parse(readFileSync(projectCatalogPath, "utf8"));
    projectChanged = applyMeasuredToCatalog(projectCatalog);
  }
  const allChanged = [...new Set([...changed, ...projectChanged])];
  if (process.argv.includes("--check")) {
    if (allChanged.length) throw new Error(`Stale plant species dimensions/bounds: ${allChanged.join(", ")}`);
  } else {
    if (changed.length) writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
    if (projectChanged.length && projectCatalogPath) writeFileSync(projectCatalogPath, JSON.stringify(projectCatalog) + "\n");
  }
  console.log(JSON.stringify({ measuredBounds: boundsMap.size, measuredDimensions: dimensions.size, updated: allChanged, check: process.argv.includes("--check") }));
} finally { await vite.close(); }
