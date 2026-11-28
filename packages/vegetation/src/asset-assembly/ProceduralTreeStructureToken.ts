import type { TreePopulationTokenV1 } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import type { TreeRecipeSource } from "./AssetAssemblySourceLibrary";
import { decodeTreeStructure, encodeTreeStructure, type EncodedTreeStructure } from "./ProceduralTreeStructureCodec";
import { freezeImmutableData } from "@galacean/engine-terrain/terrain/ImmutableData";
import {
  treeStructureLeafTriangleCounts,
  type ProceduralTreeLodTuple,
  createProceduralTreeFoliageGeometryTuning,
  generateProceduralTreeStructureParameters,
  validateProceduralTreeStructureParameters,
  type ProceduralTreeStructureParameters
} from "./ProceduralTreeGenerator";

export const TREE_STRUCTURE_EXTENSION_ID = "terrain/procedural-tree-structure";

/** A draft stores its complete final structure; unedited assets resolve the catalog structure. */
export function resolveTreeStructureRecipe(recipe: TreeRecipeSource, token: TreePopulationTokenV1): TreeRecipeSource {
  const extension = token.extensions.find((entry) => entry.id === TREE_STRUCTURE_EXTENSION_ID);
  if (!extension) {
    if (recipe.structureParameters) return recipe;
    const runtime = recipe.proceduralRuntime;
    return {
      ...recipe,
      structureParameters: generateProceduralTreeStructureParameters(
        recipe,
        runtime?.leafCountTuning,
        runtime?.distributionTuning,
        runtime
          ? {
              ...createProceduralTreeFoliageGeometryTuning(runtime.leafCardTuning, runtime.billboardTuning),
              lodScales: runtime.foliageLodScales
            }
          : undefined
      )
    };
  }
  if (extension.version !== 1 && extension.version !== 2) throw new Error("Unsupported tree structure token version");
  // Previously saved final structures migrate at this input boundary; all new writes use the compact encoding.
  const structure =
    extension.version === 1
      ? freezeImmutableData(extension.data as ProceduralTreeStructureParameters)
      : decodeTreeStructure(extension.data as EncodedTreeStructure);
  validateProceduralTreeStructureParameters(structure);
  const runtime = recipe.proceduralRuntime;
  // A structural edit that adds a crease adds triangles. Preserve the recipe's
  // woody allocation and account for that exact foliage cost at the recipe boundary.
  if (runtime && recipe.structureParameters && structure.leafSurfaces !== recipe.structureParameters.leafSurfaces) {
    const before = treeStructureLeafTriangleCounts(recipe.structureParameters);
    const after = treeStructureLeafTriangleCounts(structure);
    const addSurfaceCost = (limits: ProceduralTreeLodTuple<number>) =>
      limits.map((limit, lod) =>
        Math.max(0, limit + after[lod] - before[lod])
      ) as unknown as ProceduralTreeLodTuple<number>;
    return {
      ...recipe,
      structureParameters: structure,
      proceduralRuntime: {
        ...runtime,
        triangleBudget: {
          maxTrianglesPerLod: addSurfaceCost(runtime.triangleBudget.maxTrianglesPerLod),
          ...(runtime.triangleBudget.preferredTrianglesPerLod
            ? {
                preferredTrianglesPerLod: addSurfaceCost(runtime.triangleBudget.preferredTrianglesPerLod)
              }
            : {})
        }
      }
    };
  }
  return { ...recipe, structureParameters: structure };
}

export function withTreeStructureParameters(
  token: TreePopulationTokenV1,
  structure: ProceduralTreeStructureParameters
): TreePopulationTokenV1 {
  validateProceduralTreeStructureParameters(structure);
  return {
    ...token,
    extensions: [
      ...token.extensions.filter((entry) => entry.id !== TREE_STRUCTURE_EXTENSION_ID),
      { id: TREE_STRUCTURE_EXTENSION_ID, version: 2, required: false, data: encodeTreeStructure(structure) }
    ]
  };
}
