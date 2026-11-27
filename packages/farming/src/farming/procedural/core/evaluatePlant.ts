import { pointMix, mixPlantAngle, sampleGrowthCurve, sampleScalarCurve, type PlantPoint } from "./curves";
import { DEFAULT_PLANT_SHAPE, validatePlantShape, type PlantGrowthRecipe, type PlantShape } from "./PlantGrowthRecipe";

export function transformPlantPoint(local: PlantPoint, origin: PlantPoint, angle: number, spread = 1): PlantPoint {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return [
    origin[0] + (local[0] * c - local[2] * s) * spread,
    origin[1] + local[1],
    origin[2] + (local[0] * s + local[2] * c) * spread
  ];
}
export interface EvaluatedAnchor {
  readonly position: PlantPoint;
  readonly azimuth: number;
}

/** Pure, stateless evaluation. Parent anchors can appear in any order in the recipe. */
export function evaluatePlant(recipe: PlantGrowthRecipe, value: number, shape: PlantShape = DEFAULT_PLANT_SHAPE) {
  if (!Number.isFinite(value)) throw new Error("生长进度必须是有限数值");
  validatePlantShape(shape);
  const age = Math.max(0, Math.min(1, value));
  const anchors = new Map<string, EvaluatedAnchor>();
  const definitions = new Map(recipe.anchors.map((a) => [a.id, a]));
  const pending = new Set<string>();
  const resolve = (id: string): EvaluatedAnchor => {
    const cached = anchors.get(id);
    if (cached) return cached;
    const definition = definitions.get(id);
    if (!definition || pending.has(id)) throw new Error(`挂点关系无效：${id}`);
    pending.add(id);
    const pose = sampleGrowthCurve(definition.poses, age, (a, b, t) => ({
      offset: pointMix(a.offset, b.offset, t),
      azimuth: mixPlantAngle(a.azimuth, b.azimuth, t)
    }));
    const parent = definition.parent ? resolve(definition.parent) : undefined;
    const anchor = {
      position: parent
        ? transformPlantPoint(pose.offset, parent.position, parent.azimuth, shape.stemBend)
        : pose.offset,
      azimuth: (parent?.azimuth ?? 0) + pose.azimuth
    };
    pending.delete(id);
    anchors.set(id, anchor);
    return anchor;
  };
  for (const anchor of recipe.anchors) resolve(anchor.id);
  const leaves = recipe.leaves.map((leaf) => ({
    definition: leaf,
    surface: recipe.surfaces.find((surface) => surface.id === leaf.surface)!,
    anchor: anchors.get(leaf.anchor)!,
    points: sampleGrowthCurve(leaf.poses, age, (a, b, t) => a.map((p, i) => pointMix(p, b[i], t))),
    scale: leaf.scale ? sampleScalarCurve(leaf.scale, age) : 1
  }));
  const stems = recipe.stems.map((stem) => ({
    definition: stem,
    path: stem.path.map((id) => anchors.get(id)!.position),
    radii: sampleGrowthCurve(stem.radii, age, (a, b, t) => a.map((r, i) => r + (b[i] - r) * t))
  }));
  const volumes = recipe.volumes.map((volume) => {
    const pose = sampleGrowthCurve(volume.poses, age, (a, b, t) => ({
      offset: pointMix(a.offset, b.offset, t),
      radii: pointMix(a.radii, b.radii, t)
    }));
    let offsetScale = 1;
    if (volume.followLeaf && age < volume.followLeaf.untilAge) {
      const leaf = leaves.find((leaf) => leaf.definition.id === volume.followLeaf!.id)!;
      const reference = sampleGrowthCurve(leaf.definition.poses, volume.followLeaf.untilAge, (a, b, t) =>
        a.map((p, i) => pointMix(p, b[i], t))
      );
      const sample = leaf.surface.lengthSample;
      const referenceScale = leaf.definition.scale
        ? sampleScalarCurve(leaf.definition.scale, volume.followLeaf.untilAge)
        : 1;
      const referenceLength = Math.hypot(...reference[sample]) * referenceScale;
      offsetScale = referenceLength > 1e-6 ? (Math.hypot(...leaf.points[sample]) * leaf.scale) / referenceLength : 1;
    }
    const anchor = anchors.get(volume.anchor)!;
    return {
      definition: volume,
      center: transformPlantPoint(
        pose.offset.map((v) => v * offsetScale) as unknown as PlantPoint,
        anchor.position,
        anchor.azimuth,
        volume.followLeaf ? shape.leafSpread : 1
      ),
      radii: pose.radii,
      scale:
        (volume.scale ? sampleScalarCurve(volume.scale, age) : 1) * (volume.kind === "fruit" ? shape.fruitScale : 1)
    };
  });
  return { age, maturity: sampleScalarCurve(recipe.maturity, age), anchors, leaves, stems, volumes, shape };
}
