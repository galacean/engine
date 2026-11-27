import { vegetationRank as rank } from "./VegetationRandom";

export interface VegetationCompanionAnchor {
  readonly id: string;
  readonly layerId: string;
  readonly position: readonly [number, number, number];
  readonly radius: number;
}
export interface VegetationCompanionRecipe {
  readonly anchorLayers: readonly string[];
  /** Lengths relative to the actual anchor radius. */
  readonly centerRadiusRatio: number;
  readonly patchRadiusRatio: number;
  /** Nominal Boolean ellipse coverage before boundary clipping. */
  readonly coverage: number;
  readonly aspectRatio: readonly [number, number];
}
export function companionAnchorReach(radius: number, recipe: VegetationCompanionRecipe): number {
  return radius * (recipe.centerRadiusRatio + recipe.patchRadiusRatio * Math.sqrt(recipe.aspectRatio[1]));
}
export function validateCompanionRecipe(recipe: VegetationCompanionRecipe): void {
  if (
    !recipe.anchorLayers.length ||
    new Set(recipe.anchorLayers).size !== recipe.anchorLayers.length ||
    recipe.anchorLayers.some((id) => !id) ||
    !Number.isFinite(recipe.centerRadiusRatio) ||
    recipe.centerRadiusRatio <= 0 ||
    !Number.isFinite(recipe.patchRadiusRatio) ||
    recipe.patchRadiusRatio <= 0 ||
    !(recipe.coverage > 0 && recipe.coverage < 1) ||
    recipe.aspectRatio.length !== 2 ||
    !recipe.aspectRatio.every((v) => Number.isFinite(v) && v >= 1) ||
    recipe.aspectRatio[0] > recipe.aspectRatio[1]
  )
    throw new Error("Invalid vegetation companion recipe");
}

/** Shared finite pockets around real anchors. No layer, camera or stream-cell RNG domain. */
export function createVegetationCompanionPatches(
  seed: number,
  anchors: readonly VegetationCompanionAnchor[],
  recipe: VegetationCompanionRecipe
) {
  validateCompanionRecipe(recipe);
  type Patch = { id: string; anchorId: string; x: number; z: number; a: number; b: number; cos: number; sin: number };
  const patches: Patch[] = [];
  const parents = anchors.filter((anchor) => recipe.anchorLayers.includes(anchor.layerId));
  if (new Set(parents.map((anchor) => anchor.id)).size !== parents.length)
    throw new Error("Duplicate vegetation companion anchor");
  const mean = -Math.log(1 - recipe.coverage) * (recipe.centerRadiusRatio / recipe.patchRadiusRatio) ** 2;
  for (const anchor of [...parents].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!Number.isFinite(anchor.radius) || anchor.radius <= 0 || !anchor.position.every(Number.isFinite))
      throw new Error("Invalid vegetation companion anchor");
    let arrival = 0;
    for (let i = 0; ; i++) {
      const id = `companion/${anchor.id}/${i}`;
      arrival -= Math.log(1 - rank(seed, `${id}/arrival`));
      if (arrival >= mean) break;
      const angle = rank(seed, `${id}/position-angle`) * Math.PI * 2;
      const distance = Math.sqrt(rank(seed, `${id}/position-radius`)) * recipe.centerRadiusRatio * anchor.radius;
      const aspect = Math.sqrt(
        recipe.aspectRatio[0] + rank(seed, `${id}/aspect`) * (recipe.aspectRatio[1] - recipe.aspectRatio[0])
      );
      const rotation = rank(seed, `${id}/rotation`) * Math.PI * 2;
      patches.push({
        id,
        anchorId: anchor.id,
        x: anchor.position[0] + Math.cos(angle) * distance,
        z: anchor.position[2] + Math.sin(angle) * distance,
        a: anchor.radius * recipe.patchRadiusRatio * aspect,
        b: (anchor.radius * recipe.patchRadiusRatio) / aspect,
        cos: Math.cos(rotation),
        sin: Math.sin(rotation)
      });
    }
  }
  // Size-derived bins accelerate lookup; only the exact ellipse determines membership.
  const cell = patches.length
    ? Math.sqrt(patches.reduce((sum, patch) => sum + patch.a * patch.b, 0) / patches.length)
    : 1;
  const bins = new Map<string, Patch[]>();
  for (const patch of patches) {
    const dx = Math.hypot(patch.a * patch.cos, patch.b * patch.sin);
    const dz = Math.hypot(patch.a * patch.sin, patch.b * patch.cos);
    for (let z = Math.floor((patch.z - dz) / cell); z <= Math.floor((patch.z + dz) / cell); z++)
      for (let x = Math.floor((patch.x - dx) / cell); x <= Math.floor((patch.x + dx) / cell); x++) {
        const key = `${x}/${z}`,
          bucket = bins.get(key) ?? [];
        bucket.push(patch);
        bins.set(key, bucket);
      }
  }
  const query = (point: readonly [number, number]) => {
    let overlapCount = 0;
    let weight = 0,
      anchorId: string | undefined,
      patchId: string | undefined;
    for (const patch of bins.get(`${Math.floor(point[0] / cell)}/${Math.floor(point[1] / cell)}`) ?? []) {
      const dx = point[0] - patch.x,
        dz = point[1] - patch.z;
      const distance = Math.hypot(
        (dx * patch.cos + dz * patch.sin) / patch.a,
        (-dx * patch.sin + dz * patch.cos) / patch.b
      );
      if (distance >= 1) continue;
      overlapCount++;
      const value = 1 - distance * distance * (3 - 2 * distance);
      if (value > weight) {
        weight = value;
        anchorId = patch.anchorId;
        patchId = patch.id;
      }
    }
    return { weight, anchorId, patchId, overlapCount };
  };
  return Object.assign(query, { patches });
}
