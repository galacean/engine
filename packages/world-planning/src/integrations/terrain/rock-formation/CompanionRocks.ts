import { rockGenerationShape, type RockGenerationKind, type RockGenerationProfile } from "./GenerationProfile.ts";
import { rockFormationDomain } from "./Jobs.ts";
import { hashSeed } from "@galacean/engine-terrain/rock-formation/math";
import { rockGeometrySettings, type RockFormationSettings } from "./Settings.ts";
import type { RockFormationJob, RockObb } from "@galacean/engine-terrain/rock-formation/types";

/** Share a platform and a peak mesh per stone family; instance IDs select between them. */
export const COMPANION_ROCK_KINDS: readonly RockGenerationKind[] = ["platform", "peak"];
const FLAT_GROUND = new Float32Array(4);

/** Share/appearance edits only rebind resident instances or update their material. */
export function companionRockGeometryKey(settings: RockFormationSettings, profile: RockGenerationProfile): string {
  return JSON.stringify([
    rockGeometrySettings(settings),
    ...COMPANION_ROCK_KINDS.map((kind) => rockGenerationShape(kind, profile))
  ]);
}

/** Apply profile height once in source space, preserving the original footprint and contact plane. */
export function companionRockJob(
  id: string,
  bounds: { min: readonly number[]; max: readonly number[] },
  seed: number,
  kind: RockGenerationKind,
  profile: RockGenerationProfile
): RockFormationJob {
  const { heightScale, ...shape } = rockGenerationShape(kind, profile),
    { min, max } = bounds;
  const height = (max[1] - min[1]) * heightScale;
  const guides: RockObb[] = [
    {
      id,
      ownerId: id,
      ...shape,
      center: [0, height / 2, 0],
      size: [max[0] - min[0], height, max[2] - min[2]],
      axes: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]
    }
  ];
  const domain = rockFormationDomain(guides);
  return {
    id: `companion:${id}:${kind}`,
    seed: hashSeed(seed, id),
    surfaceGrass: false,
    origin: [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2],
    guides,
    domain,
    ground: {
      minX: domain.minX,
      minZ: domain.minZ,
      spacingX: domain.width,
      spacingZ: domain.depth,
      columns: 2,
      rows: 2,
      heights: FLAT_GROUND
    }
  };
}
