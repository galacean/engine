const path = require("node:path");
const fs = require("node:fs");

/** Assert the actual Rollup graph, including resolved dynamic imports and emitted assets. */
function plantingProductionBoundary({ requirePlantCatalog = true } = {}) {
  let galleryRoot;
  return {
    name: "planting-production-boundary",
    apply: "build",
    configResolved() {
      galleryRoot = path.resolve(__dirname, "../../..");
    },
    generateBundle(_options, bundle) {
      const modules = [...this.getModuleIds()];
      const plantingModules = modules.filter((id) => id.startsWith(`${galleryRoot}/shared/farming/`));
      const propModelsAllowed = [
        "shared/farming/assets/sowing/seed-sack.glb",
        "shared/farming/assets/watering/watering-can.glb",
        "shared/farming/assets/tilling/hoe.glb",
        "shared/farming/assets/tilling/rake.glb",
        "shared/farming/assets/harvest/basket.glb",
        "shared/farming/assets/storage/cart.glb",
        "shared/farming/assets/storage/basket.glb"
      ].map((file) => path.join(galleryRoot, file));
      const sourceAtlases = plantingModules.filter((id) =>
        /\/catalog\/plants\/[^/]+\/procedural\/atlas\.png(?:\?|$)/.test(id)
      );
      if (sourceAtlases.length) this.error(`Offline plant atlases entered production: ${sourceAtlases.join(", ")}`);
      const forbidden = plantingModules.filter(
        (id) =>
          !propModelsAllowed.includes(id.split("?")[0]) &&
          /\/tests\/|\/migrations\/|(?:AssetCatalog|FarmingAssetLibrary|ResolvedFarmingAssetLibrary|CropStagePresenter|createProceduralStage)\.[^/]+$|\.(?:glb|gltf|fbx)(?:\?|$)/i.test(
            id
          )
      );
      const modelAssets = Object.keys(bundle).filter((name) => /\.(?:glb|gltf|fbx)$/i.test(name));
      // Allow only exact authored prop bytes; renaming a crop GLB cannot bypass this boundary.
      const propModels = modelAssets.filter((name) => {
        const asset = bundle[name];
        return (
          asset.type === "asset" &&
          propModelsAllowed.some((file) => Buffer.from(asset.source).equals(fs.readFileSync(file)))
        );
      });
      const plantModels = modelAssets.filter((name) => !propModels.includes(name));
      if (forbidden.length || plantModels.length) {
        this.error(`Planting production imports forbidden content: ${[...forbidden, ...plantModels].join(", ")}`);
      }
      const recipeIds = plantingModules
        .filter((id) => /\/catalog\/plants\/[^/]+\/procedural\/recipe\.json(?:\?|$)/.test(id))
        .map((id) => id.match(/\/plants\/([^/]+)\//)[1]);
      const uniqueRecipes = [...new Set(recipeIds)].sort();
      if (requirePlantCatalog && uniqueRecipes.length !== 14)
        this.error(`Expected 14 production recipes; found ${uniqueRecipes.length}`);
      this.emitFile({
        type: "asset",
        fileName: "planting-resources.json",
        source: JSON.stringify(
          {
            schemaVersion: 1,
            recipes: uniqueRecipes,
            plantModels,
            propModels,
            modules: plantingModules.map((id) => path.relative(galleryRoot, id)).sort(),
            resources: Object.keys(bundle).sort()
          },
          null,
          2
        )
      });
    }
  };
}

module.exports = { plantingProductionBoundary };
