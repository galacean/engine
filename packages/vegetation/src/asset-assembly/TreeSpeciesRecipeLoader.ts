import type { Engine } from "@galacean/engine";
import type { TreeRecipeSource } from "./AssetAssemblySourceLibrary";
import { TREE_SPECIES_CATALOG, type TreeSpeciesCatalogEntry } from "./TreeSpeciesCatalog";
import { TREE_SPECIES_LOD_POLICIES, createTreeSpeciesFoliageLodScales } from "./TreeSpeciesLodPolicy";
import { TREE_SPECIES_MATERIAL_RESOURCES, loadTreeSpeciesMaterials } from "./TreeSpeciesMaterialResources";
import { TREE_SPECIES_PARAMETERS } from "./TreeSpeciesParameters";
import type { ProceduralTreeStructureParameters } from "./ProceduralTreeGenerator";
import { plantProjectResources, usesProjectPlantResources } from "./PlantSpeciesResources";
import { loadPlantJSON } from "./ProceduralPlantResources";
import { freezeImmutableData } from "@galacean/engine-terrain/terrain/ImmutableData";
import { validateProceduralTreeStructureParameters } from "./ProceduralTreeStructureValidation";

/**
 * Assembly boundary for independently owned catalog, parameter, material, and
 * LOD data. Runtime consumers receive a resolved TreeRecipeSource, but none of
 * those source layers stores fields owned by another layer.
 */
export async function loadTreeSpeciesRecipes(
  engine: Engine,
  requestedIds?: ReadonlySet<string>
): Promise<readonly TreeRecipeSource[]> {
  validateLayerClosure();
  const project = usesProjectPlantResources(engine)
    ? await loadPlantJSON<{
        proceduralTreeResources: Record<
          string,
          (typeof TREE_SPECIES_MATERIAL_RESOURCES)[string] & { structure: string }
        >;
      }>(engine, plantProjectResources(engine).production)
    : undefined;
  const selected = requestedIds
    ? TREE_SPECIES_CATALOG.filter((entry) => requestedIds.has(entry.assetId))
    : TREE_SPECIES_CATALOG;
  return Object.freeze(
    await Promise.all(selected.map((entry) => loadEntry(engine, entry, project?.proceduralTreeResources[entry.key])))
  );
}

async function loadEntry(
  engine: Engine,
  entry: TreeSpeciesCatalogEntry,
  project?: (typeof TREE_SPECIES_MATERIAL_RESOURCES)[string] & { structure: string }
): Promise<TreeRecipeSource> {
  if (usesProjectPlantResources(engine) && !project) throw new Error(`Missing project tree resources: ${entry.key}`);
  const parameters = TREE_SPECIES_PARAMETERS[entry.key];
  const lodPolicy = TREE_SPECIES_LOD_POLICIES[entry.key];
  if (!parameters) throw new Error(`${entry.label} is missing its editable tree parameters`);
  if (!lodPolicy) throw new Error(`${entry.label} is missing its LOD policy`);
  const [materials, structureParameters] = await Promise.all([
    loadTreeSpeciesMaterials(engine, entry.key, entry.label, project),
    project
      ? loadPlantJSON<ProceduralTreeStructureParameters>(engine, project.structure).then((value) => {
          validateProceduralTreeStructureParameters(value);
          return freezeImmutableData(value);
        })
      : loadTreeStructureParameters(entry.key)
  ]);

  return Object.freeze({
    id: entry.assetId,
    label: entry.label,
    sourceKind: "measured-reconstruction",
    proceduralProfile: entry.profile,
    proceduralGeometryIdentity: entry.geometryIdentity,
    size: parameters.size,
    structureParameters,
    defaultColorRgb: materials.defaultColorRgb,
    defaultLodProfile: lodPolicy.defaultLodProfile,
    trunkMaterial: materials.trunkMaterial,
    leafMaterial: materials.leafMaterial,
    leafMask: materials.leafMask,
    leafMaskId: materials.leafMaskId,
    defaultLeafLightingTuning: materials.defaultLeafLightingTuning,
    lodGroup: lodPolicy.lodGroup,
    proceduralRuntime: {
      distributionTuning: parameters.distributionTuning,
      leafCountTuning: parameters.leafCountTuning,
      leafCardTuning: parameters.leafCardTuning,
      billboardTuning: parameters.billboardTuning,
      leafCardFacingMode: "fixed" as const,
      foliageLodScales: createTreeSpeciesFoliageLodScales(parameters.leafCountTuning),
      triangleBudget: lodPolicy.triangleBudget,
      preserveLeafMaterialFeatures: true
    }
  });
}

export function loadTreeStructureParameters(key: string): Promise<ProceduralTreeStructureParameters> {
  switch (key) {
    case "dead-tree":
      return import("./TreeStructureDeadTree").then(({ TREE_STRUCTURE }) => TREE_STRUCTURE);
    default:
      return Promise.reject(new Error(`Unsupported tree structure key "${key}"`));
  }
}

function validateLayerClosure(): void {
  const catalogKeys = new Set(TREE_SPECIES_CATALOG.map((entry) => entry.key));
  assertExactKeys("tree parameters", catalogKeys, Object.keys(TREE_SPECIES_PARAMETERS));
  assertExactKeys("material resources", catalogKeys, Object.keys(TREE_SPECIES_MATERIAL_RESOURCES));
  assertExactKeys("LOD policies", catalogKeys, Object.keys(TREE_SPECIES_LOD_POLICIES));
}

function assertExactKeys(layer: string, catalogKeys: ReadonlySet<string>, layerKeys: readonly string[]): void {
  const missing = [...catalogKeys].filter((key) => !layerKeys.includes(key));
  const orphaned = layerKeys.filter((key) => !catalogKeys.has(key));
  if (missing.length > 0 || orphaned.length > 0) {
    throw new Error(
      `Tree species ${layer} must match the catalog exactly; missing=[${missing.join(",")}], orphaned=[${orphaned.join(",")}]`
    );
  }
}
