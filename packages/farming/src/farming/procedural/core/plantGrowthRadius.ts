import { pointMix, sampleGrowthCurve, sampleScalarCurve, type GrowthCurve, type PlantPoint } from "./curves";
import { PLANT_SHAPE_LIMITS, type PlantGrowthRecipe } from "./PlantGrowthRecipe";
import { isImmutablePlantGrowthRecipe } from "./validation";

const length = (p: PlantPoint) => Math.hypot(...p);
const scaleMaximum = (curve?: GrowthCurve<number>) => (curve ? Math.max(...curve.map((key) => key.value)) : 1);
const cache = new WeakMap<PlantGrowthRecipe, number>();

/** Conservative all-age/all-shape envelope. Never cull growth using the smaller, stale seedling mesh. */
export function plantGrowthRadius(recipe: PlantGrowthRecipe): number {
  const cached = cache.get(recipe);
  if (cached !== undefined) return cached;
  const anchors = new Map(recipe.anchors.map((anchor) => [anchor.id, anchor]));
  const radii = new Map<string, number>();
  const anchorRadius = (id: string): number => {
    if (radii.has(id)) return radii.get(id)!;
    const anchor = anchors.get(id)!;
    const radius =
      Math.max(...anchor.poses.map(({ value }) => length(value.offset))) *
        (anchor.parent ? Math.max(1, PLANT_SHAPE_LIMITS.stemBend[1]) : 1) +
      (anchor.parent ? anchorRadius(anchor.parent) : 0);
    radii.set(id, radius);
    return radius;
  };
  let radius = 0;
  for (const stem of recipe.stems) {
    const thickness = stem.radii.reduce((maximum, key) => Math.max(maximum, ...key.value), 0);
    for (const id of stem.path) radius = Math.max(radius, anchorRadius(id) + thickness);
  }
  const leafRadius = (leaf: PlantGrowthRecipe["leaves"][number]) =>
    leaf.poses.reduce((maximum, key) => Math.max(maximum, ...key.value.map(length)), 0) * scaleMaximum(leaf.scale);
  for (const leaf of recipe.leaves)
    radius = Math.max(radius, anchorRadius(leaf.anchor) + leafRadius(leaf) * PLANT_SHAPE_LIMITS.leafSpread[1]);
  for (const volume of recipe.volumes) {
    let offsetScale = 1;
    if (volume.followLeaf) {
      const leaf = recipe.leaves.find((leaf) => leaf.id === volume.followLeaf!.id)!;
      const sample = recipe.surfaces.find((surface) => surface.id === leaf.surface)!.lengthSample;
      const age = volume.followLeaf.untilAge;
      const point = sampleGrowthCurve(
        leaf.poses.map((key) => ({ age: key.age, value: key.value[sample] })),
        age,
        pointMix
      );
      const reference = length(point) * (leaf.scale ? sampleScalarCurve(leaf.scale, age) : 1);
      if (reference > 1e-6) offsetScale = Math.max(1, leafRadius(leaf) / reference);
      offsetScale *= PLANT_SHAPE_LIMITS.leafSpread[1];
    }
    const offset = Math.max(...volume.poses.map((key) => length(key.value.offset))) * offsetScale;
    const extent =
      Math.max(...volume.poses.map((key) => length(key.value.radii))) *
      scaleMaximum(volume.scale) *
      (volume.kind === "fruit" ? PLANT_SHAPE_LIMITS.fruitScale[1] : 1);
    radius = Math.max(radius, anchorRadius(volume.anchor) + offset + extent);
  }
  for (const mesh of recipe.meshes ?? []) {
    const size = Math.max(...mesh.poses.flatMap((key) => key.value.scale));
    // Unfolding can combine the vertical gathering length with horizontal source coordinates.
    const extent =
      Math.max(...mesh.positions.map(length)) *
      size *
      Math.SQRT2 *
      (mesh.kind === "leaf"
        ? PLANT_SHAPE_LIMITS.leafSpread[1]
        : mesh.kind === "fruit"
          ? PLANT_SHAPE_LIMITS.fruitScale[1]
          : 1);
    radius = Math.max(radius, anchorRadius(mesh.anchor) + extent);
  }
  for (const support of recipe.supports) radius = Math.max(radius, length(support.center) + length(support.size) / 2);
  if (isImmutablePlantGrowthRecipe(recipe)) cache.set(recipe, radius);
  return radius;
}
