import { rockGenerationShape, type RockGenerationKind, type RockGenerationProfile } from "./GenerationProfile.ts";
import { hashSeed } from "@galacean/engine-terrain/rock-formation/math";
import { rockGeometrySettings, type RockFormationSettings } from "./Settings.ts";
import type { RockFormationJob, RockObb } from "@galacean/engine-terrain/rock-formation/types";

/** Supported shape families; stable instance IDs seed each independent specimen. */
export const COMPANION_ROCK_KINDS: readonly RockGenerationKind[] = ["platform", "peak"];

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
  const { heightScale } = rockGenerationShape(kind, profile),
    { min, max } = bounds;
  const height = (max[1] - min[1]) * heightScale;
  const guides: RockObb[] = [
    {
      id,
      ownerId: id,
      center: [0, height / 2, 0],
      size: [max[0] - min[0], height, max[2] - min[2]],
      axes: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]
    }
  ];
  return {
    id: `companion:${id}:${kind}`,
    seed: hashSeed(seed, `${id}:${kind}`),
    surfaceGrass: false,
    origin: [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2],
    guides
  };
}
