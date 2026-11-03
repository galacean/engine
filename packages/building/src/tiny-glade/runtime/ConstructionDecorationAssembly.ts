import { decorationMesh, type DecorationMesh, type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import { constructionDecorationRecipe } from "./ConstructionDecorationRecipe";

export interface DecorationAssemblyPart {
  name: string;
  suffix: string;
  mesh: DecorationMesh;
  material: number;
  emissionOrigin?: number[];
  binding: import("../resources/BuildingAssembly").AssemblyBinding;
}
export interface DecorationAssembly {
  parts: DecorationAssemblyPart[];
  /** One bounds/pivot for the entire original assembly. Parts never recenter. */
  bounds: { min: number[]; max: number[] };
}

/** Generator/loader-selected source models, not a filename-based material guess.
 * Cottage windows: retained086; doors:105; lanterns:0x1010f42c8.
 * Caller-selected dimensions scale the complete native assembly together.
 */
export function constructionDecorationAssembly(
  assets: ConstructionDecorationMeshes | undefined,
  type: string,
  rank: number
): DecorationAssembly | undefined {
  const recipe = constructionDecorationRecipe(assets, type, rank);
  if (!recipe) return undefined;
  const { selected, bounds } = recipe;
  const parts = selected.map(([name, suffix, material, emissionOrigin, binding]) => {
    const mesh = decorationMesh(assets, name);
    return { name, suffix, material, mesh, emissionOrigin, binding: binding ?? { role: "body" as const } };
  });
  return { parts, bounds };
}
