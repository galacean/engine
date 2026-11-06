import {
  AssetPromise,
  JSONAsset,
  Loader,
  resourceLoader,
  type LoadItem,
  type ResourceManager
} from "@galacean/engine-core";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import type { RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { decodePlantParameters } from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import { resolvePlantJSONReferences } from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import { validateProceduralPlantAsset } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantAsset";
import { validateProceduralPlantStructure } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantGeometry";
import { validateProceduralTreeStructureParameters } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeStructureValidation";
import { validatePlantMaterialManifest } from "@galacean/engine-vegetation/asset-assembly/PlantMaterialManifest";
import {
  plantSpeciesPalettes,
  type PlantSpeciesEntry
} from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import {
  validateManifest,
  productionCatalogReferences
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyCatalog";
import { SEED_WORLD_PRODUCTION_ASSET_CATALOG } from "@galacean/engine-vegetation/asset-assembly/SeedWorldProductionAssetCatalog";

const json = nativeAssetFormats(() => ({})).get("JSON")!;
const validators: ReadonlyMap<string, (value: any) => void> = new Map<string, (value: any) => void>([
  ["PlantStructure", validateProceduralPlantAsset],
  ["PlantShape", validateProceduralPlantStructure],
  ["TreeStructure", validateProceduralTreeStructureParameters],
  ["PlantAppearance", validatePlantMaterialManifest],
  [
    "PlantProduction",
    (value) => {
      validateManifest(value, SEED_WORLD_PRODUCTION_ASSET_CATALOG);
    }
  ],
  [
    "PlantSpecies",
    (value) => {
      if (
        !Array.isArray(value?.assets) ||
        !Array.isArray(value.treeRecipes) ||
        !Array.isArray(value.shrubRecipes) ||
        typeof value.materialFile !== "string" ||
        !value.materialFile
      )
        throw new Error("Invalid plant species catalog");
      plantSpeciesPalettes([...value.assets, ...value.treeRecipes, ...value.shrubRecipes] as PlantSpeciesEntry[]);
    }
  ]
]);
function parse(content: string | Uint8Array): unknown {
  return resolvePlantJSONReferences(
    decodePlantParameters(
      JSON.parse(typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: true }).decode(content))
    )
  );
}

/** Custom formats describe procedural domains. Geometry, textures, materials and templates retain native formats. */
export const plantProjectFormats: ReadonlyMap<string, RuntimeAssetFormat> = new Map(
  [...validators].map(([type, validate]) => [
    type,
    {
      contentEncoding: "utf8",
      validate: (content) => {
        validate(parse(content));
      },
      references: (content, file) => [
        ...new Set([
          ...json.references(typeof content === "string" ? content : new TextDecoder().decode(content), file),
          ...(type === "PlantProduction"
            ? productionCatalogReferences(validateManifest(parse(content), SEED_WORLD_PRODUCTION_ASSET_CATALOG))
            : [])
        ])
      ]
    }
  ])
);

let registered = false;
export function registerPlantProjectAssets(): void {
  if (registered) return;
  for (const [type, validate] of validators) {
    class PlantAssetLoader extends Loader<JSONAsset> {
      load(item: LoadItem, manager: ResourceManager): AssetPromise<JSONAsset> {
        return (manager as unknown as { _request(url: string, config: unknown): AssetPromise<unknown> })
          ._request(item.url!, { ...item, type: "json" })
          .then((data) => {
            validate(resolvePlantJSONReferences(decodePlantParameters(data)));
            const asset = new JSONAsset(manager.engine);
            asset.data = data as object;
            return asset;
          });
      }
    }
    resourceLoader(type, [])(PlantAssetLoader);
  }
  registered = true;
}
