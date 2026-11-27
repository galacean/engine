import { AssetType, type Engine, TextureFilterMode, TextureWrapMode } from "@galacean/engine";
import { loadProceduralPlantSource } from "./ProceduralPlantSource";
import type { ShrubAssemblySource } from "./AssetAssemblySourceLibrary";
import { PLANT_SPECIES_CATALOG } from "./PlantSpeciesCatalog";
import { plantSpeciesResourceUrl, usesProjectPlantResources } from "./PlantSpeciesResources";
import { loadPlantJSON } from "./ProceduralPlantResources";

type ShrubRecipe = (typeof PLANT_SPECIES_CATALOG.shrubRecipes)[number];

export async function loadCatalogShrubSource(engine: Engine, entry: ShrubRecipe): Promise<ShrubAssemblySource> {
  if (!usesProjectPlantResources(engine))
    engine.resourceManager.registerVirtualResources(
      entry.textures.map((texture) => ({
        virtualPath: texture.virtualPath,
        path: plantSpeciesResourceUrl(texture.file, engine),
        type: AssetType.Texture,
        params: {
          isSRGBColorSpace: true,
          mipmap: true,
          filterMode: TextureFilterMode.Trilinear,
          wrapModeU: TextureWrapMode.Clamp,
          wrapModeV: TextureWrapMode.Clamp,
          anisoLevel: 8
        }
      }))
    );
  return loadProceduralPlantSource(engine, {
    id: entry.id,
    label: entry.displayName,
    structureUrl: plantSpeciesResourceUrl(entry.parameterFile, engine),
    materialUrls: Object.fromEntries(
      Object.entries(entry.materialFiles).map(([id, file]) => [id, plantSpeciesResourceUrl(file, engine)])
    ),
    defaultColorRgb: entry.defaultColorRgb as [number, number, number],
    lodGroup: { ...entry.lodGroup, localReferencePoint: entry.lodGroup.localReferencePoint as [number, number, number] }
  });
}

/** Legacy material consumers borrow the catalog's first shrub; species loading enumerates the whole catalog. */
export async function loadProceduralShrubSource(engine: Engine): Promise<ShrubAssemblySource> {
  const catalog = await loadPlantJSON<typeof PLANT_SPECIES_CATALOG>(
    engine,
    plantSpeciesResourceUrl("plant-species.json", engine)
  );
  return loadCatalogShrubSource(engine, catalog.shrubRecipes[0]);
}
