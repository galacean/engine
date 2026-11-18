import type { ProceduralTreeStructureParameters } from "./ProceduralTreeGenerator";
import { isImmutableData, freezeImmutableData } from "@galacean/engine-terrain/terrain/ImmutableData";
import { validatePlantNormalField, validatePlantShape, buildPlantShapeGeometry } from "./ProceduralPlantGeometry";

export const PROCEDURAL_TREE_LOD_COUNT = 4 as const;

const validatedStructures = new WeakSet<ProceduralTreeStructureParameters>();

/** Transfer a validated mutable input into the immutable geometry cache without rechecking its full graph. */
export function freezeValidatedTreeStructure(parameters: ProceduralTreeStructureParameters): void {
  validateProceduralTreeStructureParameters(parameters);
  freezeImmutableData(parameters);
  validatedStructures.add(parameters);
}

/** Validates once for immutable structures; mutable external inputs are always checked. */
export function validateProceduralTreeStructureParameters(parameters: ProceduralTreeStructureParameters): void {
  if (isImmutableData(parameters) && validatedStructures.has(parameters)) return;
  if (!parameters || parameters.version !== 1 || !(parameters.referenceSize > 0) || !(parameters.height > 0))
    throw new Error("Invalid tree structure version or dimensions");
  const finite = (value: unknown): boolean =>
    typeof value === "number"
      ? Number.isFinite(value)
      : Array.isArray(value)
        ? value.every(finite)
        : value && typeof value === "object"
          ? Object.values(value).every(finite)
          : true;
  if (!finite(parameters)) throw new Error("Tree structure contains non-finite parameters");
  if (parameters.leafNormalField) validatePlantNormalField(parameters.leafNormalField);
  for (const surface of Object.values(parameters.leafSurfaces ?? {})) {
    validatePlantShape(surface.shape);
    buildPlantShapeGeometry(surface.shape, surface.resolution);
  }
  for (const leaf of parameters.leaves) {
    if (
      leaf.surfaceIdsByLod &&
      (leaf.surfaceIdsByLod.length !== 4 || leaf.surfaceIdsByLod.some((id) => !parameters.leafSurfaces?.[id]))
    )
      throw new Error("Leaf surface LOD binding must resolve to shared shape parameters");
  }
  const stems = new Map(parameters.stems.map((stem) => [stem.id, stem]));
  if (
    stems.size !== parameters.stems.length ||
    new Set(parameters.stems.map((stem) => stem.stableId)).size !== stems.size
  )
    throw new Error("Tree structure stem identities must be unique");
  for (const stem of parameters.stems) {
    if (stem.points.length < 2 || stem.radii.length !== stem.points.length || stem.radii.some((radius) => radius < 0))
      throw new Error("Tree structure requires a radius for every curve control");
    const visited = new Set<number>([stem.id]);
    let parent = stem.supportStemId;
    while (parent !== null) {
      if (!stems.has(parent) || visited.has(parent))
        throw new Error("Tree structure parent graph is missing a stem or cyclic");
      visited.add(parent);
      parent = stems.get(parent)!.supportStemId;
    }
  }
  if (
    [...parameters.selectionStemIds, ...(parameters.canonicalStemIds ?? []), ...parameters.leafBearingStemIds].some(
      (id) => !stems.has(id)
    )
  )
    throw new Error("Tree structure selection references a missing stem");
  const leaves = new Set(parameters.leaves.map((leaf) => leaf.id));
  if (leaves.size !== parameters.leaves.length || parameters.leaves.some((leaf) => !stems.has(leaf.stemId)))
    throw new Error("Tree structure leaf identities or attachments are invalid");
  if (parameters.leafIdsByLod.length !== PROCEDURAL_TREE_LOD_COUNT)
    throw new Error("Tree structure LOD count is invalid");
  let previous = leaves;
  for (const ids of parameters.leafIdsByLod) {
    if (new Set(ids).size !== ids.length || ids.some((id) => !previous.has(id)))
      throw new Error("Tree structure LOD membership must be unique and nested");
    previous = new Set(ids);
  }
  if (isImmutableData(parameters)) validatedStructures.add(parameters);
}
