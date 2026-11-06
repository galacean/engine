const fs = require("node:fs");
const path = require("node:path");

// Preserve the catalog's URL graph, including ../../../data references. These
// files are fetched dynamically, so Vite cannot discover them from TS imports.
const catalogPath = "asset-assembly/generated/procedural-trees/plant-species.json";
const outputRoot = "assets/plant-species";
const plantSpeciesIndexAsset = `${outputRoot}/${catalogPath}`;

function plantSpeciesDependencies(terrainRoot) {
  const index = path.resolve(terrainRoot, catalogPath);
  const directory = path.dirname(index);
  const catalog = JSON.parse(fs.readFileSync(index, "utf8"));
  const files = new Set([index]);
  const add = (relative, base = directory) => {
    if (typeof relative !== "string" || !relative || /^(?:[a-z]+:|\/)/i.test(relative))
      throw new Error(`Invalid plant resource path: ${relative}`);
    const absolute = path.resolve(base, decodeURIComponent(relative.split(/[?#]/, 1)[0]));
    if (!absolute.startsWith(`${path.resolve(terrainRoot)}${path.sep}`))
      throw new Error(`Plant resource escapes Terrain: ${relative}`);
    if (!fs.statSync(absolute).isFile()) throw new Error(`Plant resource is not a file: ${relative}`);
    files.add(absolute);
    return absolute;
  };
  const materialManifest = add(catalog.materialFile);
  const materials = JSON.parse(fs.readFileSync(materialManifest, "utf8"));
  for (const texture of Object.values(materials.textures)) add(texture.url, path.dirname(materialManifest));
  for (const entry of [...catalog.assets, ...(catalog.prototypes ?? [])]) {
    if (entry.parameterFile) add(entry.parameterFile);
  }
  for (const tree of catalog.treeRecipes) {
    for (const key of ["parameterFile", "leafMaskFile", "barkAlbedoFile", "barkNormalFile", "trunkMaterialFile", "leafMaterialFile"])
      add(tree[key]);
  }
  for (const shrub of catalog.shrubRecipes) {
    add(shrub.parameterFile);
    for (const texture of shrub.textures) add(texture.file);
    for (const material of Object.values(shrub.materialFiles)) add(material);
  }
  // Material virtual resource references belong to the existing engine resource
  // registry, not the material's HTTP directory. Their concrete textures above
  // are registered by the tree/shrub loaders; do not crawl virtual URLs as files.
  return [...files].sort().map(source => ({ source,
    fileName: `${outputRoot}/${path.relative(terrainRoot, source).split(path.sep).join("/")}` }));
}

function plantSpeciesProductionAssets(terrainRoot) {
  return {
    name: "plant-species-production-assets",
    apply: "build",
    generateBundle(_options, bundle) {
      // Only publish when the runtime resolver is actually part of this build.
      if (!bundle[plantSpeciesIndexAsset]) return;
      for (const resource of plantSpeciesDependencies(terrainRoot)) {
        if (resource.fileName === plantSpeciesIndexAsset) continue;
        this.emitFile({ type: "asset", fileName: resource.fileName, source: fs.readFileSync(resource.source) });
      }
    }
  };
}

module.exports = { plantSpeciesIndexAsset, plantSpeciesDependencies, plantSpeciesProductionAssets };
