import { type Engine, AssetType, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine";
import type { TreeRecipeSource } from "./AssetAssemblySourceLibrary";
import { loadTreeSpeciesMaterials } from "./TreeSpeciesMaterialResources";
import { freezeImmutableData } from "@galacean/engine-terrain/terrain/ImmutableData";
import {
  validateProceduralTreeStructureParameters,
  type ProceduralTreeStructureParameters
} from "./ProceduralTreeGenerator";
import { PopulationLodMetric } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";

import { PLANT_SPECIES_CATALOG } from "./PlantSpeciesCatalog";
import { plantSpeciesResourceUrl } from "./PlantSpeciesResources";
import { treeSpeciesGeometryRecipe } from "./TreeSpeciesGeometry";
import { loadPlantJSON } from "./ProceduralPlantResources";

/** Resolves final structure data into the SAME recipe contract used by all existing base trees. */
export async function loadTreeSpeciesCandidates(
  engine: Engine,
  assetIds?: ReadonlySet<string>
): Promise<readonly TreeRecipeSource[]> {
  const catalog = await loadPlantJSON<typeof PLANT_SPECIES_CATALOG>(
    engine,
    plantSpeciesResourceUrl("plant-species.json", engine)
  );
  return Promise.all(
    catalog.treeRecipes
      .filter((entry) => !assetIds || assetIds.has(entry.id))
      .map(async (entry): Promise<TreeRecipeSource> => {
        const style = await loadTreeSpeciesMaterials(engine, entry.materialKey, entry.displayName, {
          defaultColorRgb: entry.defaultColorRgb as [number, number, number],
          trunkUvTilesPerMeter: entry.trunkUvTilesPerMeter as [number, number],
          barkAlbedoUrl: plantSpeciesResourceUrl(entry.barkAlbedoFile, engine),
          barkNormalUrl: plantSpeciesResourceUrl(entry.barkNormalFile, engine),
          leavesUrl: plantSpeciesResourceUrl(entry.leafMaskFile, engine),
          trunkMaterialUrl: plantSpeciesResourceUrl(entry.trunkMaterialFile, engine),
          leafMaterialUrl: plantSpeciesResourceUrl(entry.leafMaterialFile, engine)
        });
        const structure = freezeImmutableData(
          await loadPlantJSON<ProceduralTreeStructureParameters>(
            engine,
            plantSpeciesResourceUrl(entry.parameterFile, engine)
          )
        );
        validateProceduralTreeStructureParameters(structure);
        const { base, distribution, counts, triangleLimits } = treeSpeciesGeometryRecipe(entry, structure);
        const leafMask = await engine.resourceManager.load<Texture2D>({
          type: AssetType.Texture,
          url: plantSpeciesResourceUrl(entry.leafMaskFile, engine),
          params: {
            isSRGBColorSpace: false,
            mipmap: true,
            filterMode: TextureFilterMode.Trilinear,
            wrapModeU: TextureWrapMode.Clamp,
            wrapModeV: TextureWrapMode.Clamp,
            // Match catalog foliage sampling for narrow, obliquely viewed leaf surfaces.
            anisoLevel: 8
          }
        });
        leafMask.name = entry.leafMaskLabel;
        return Object.freeze<TreeRecipeSource>({
          ...base,
          sourceKind: "measured-reconstruction",
          proceduralGeometryIdentity: entry.id,
          structureParameters: structure,
          defaultColorRgb: style.defaultColorRgb,
          defaultLodProfile: { metric: PopulationLodMetric.InstanceCount, values: [1, 1, 1] },
          trunkMaterial: style.trunkMaterial,
          leafMaterial: style.leafMaterial,
          leafMask,
          leafMaskId: "leaf",
          leafMaskLabel: entry.leafMaskLabel,
          lodGroup: {
            localReferencePoint: [0, structure.height / 2, 0],
            size: structure.height,
            screenRelativeTransitionHeights: entry.transitionHeights
          },
          proceduralRuntime: {
            distributionTuning: distribution,
            leafCountTuning: { lod0Count: counts[0], lod1Count: counts[1], lod2Count: counts[2], lod3Count: counts[3] },
            leafCardTuning: { widthPercent: 100, lengthPercent: 100 },
            billboardTuning: { billboardSize: 0, billboardsScale: 1, inflate: 0 },
            leafCardFacingMode: "fixed",
            foliageLodScales: [1, 1, 1, 1],
            triangleBudget: { maxTrianglesPerLod: triangleLimits },
            preserveLeafMaterialFeatures: false
          }
        });
      })
  );
}
