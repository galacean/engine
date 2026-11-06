import {
  createCanonicalWaterSemanticFieldSample,
  sampleCanonicalWaterSemanticField,
  type WaterSemanticFieldSnapshotV1
} from "@galacean/engine-water/water/runtime/index";
import type { PromptNoiseOperatorBoundsV1 } from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";

export type PromptNoiseWaterExcludedLayoutKind = "tree" | "shrub" | "flower" | "grass" | "prefab";

export interface PromptNoiseWaterLayoutCandidateV1 {
  readonly id: string;
  readonly kind: PromptNoiseWaterExcludedLayoutKind;
  readonly x: number;
  readonly z: number;
  /** Additional dry-side clearance. Zero preserves the historical wet-only audit. */
  readonly minimumShoreDistance?: number;
}

export interface PromptNoiseWaterLayoutAuditV1 {
  readonly semanticGeneration: number;
  readonly accepted: readonly PromptNoiseWaterLayoutCandidateV1[];
  readonly excludedCount: number;
  readonly wetVegetationCount: number;
  readonly ordinaryPrefabCount: number;
}

export function auditPromptNoiseWaterLayout(
  snapshot: WaterSemanticFieldSnapshotV1,
  candidates: readonly PromptNoiseWaterLayoutCandidateV1[]
): PromptNoiseWaterLayoutAuditV1 {
  const accepted: PromptNoiseWaterLayoutCandidateV1[] = [];
  const sample = createCanonicalWaterSemanticFieldSample();
  let excludedCount = 0;
  for (const candidate of candidates) {
    const resolved = sampleCanonicalWaterSemanticField(snapshot, candidate.x, candidate.z, sample);
    const minimumShoreDistance = candidate.minimumShoreDistance ?? 0;
    if (!Number.isFinite(minimumShoreDistance) || minimumShoreDistance < 0) {
      throw new RangeError(`Water Layout candidate '${candidate.id}' has invalid shore clearance.`);
    }
    if (resolved && sample.shoreSignedDistance >= -minimumShoreDistance) {
      excludedCount++;
      continue;
    }
    accepted.push(Object.freeze({ ...candidate }));
  }
  let wetVegetationCount = 0;
  let ordinaryPrefabCount = 0;
  for (const candidate of accepted) {
    if (!sampleCanonicalWaterSemanticField(snapshot, candidate.x, candidate.z, sample) || !sample.wet) continue;
    if (candidate.kind === "prefab") ordinaryPrefabCount++;
    else wetVegetationCount++;
  }
  return Object.freeze({
    semanticGeneration: snapshot.generation,
    accepted: Object.freeze(accepted),
    excludedCount,
    wetVegetationCount,
    ordinaryPrefabCount
  });
}

export function resolveWaterLayoutInvalidationBounds(
  previous: readonly PromptNoiseOperatorBoundsV1[],
  next: readonly PromptNoiseOperatorBoundsV1[]
): PromptNoiseOperatorBoundsV1 | null {
  const bounds = [...previous, ...next];
  if (bounds.length === 0) return null;
  return Object.freeze({
    minX: Math.min(...bounds.map(({ minX }) => minX)),
    minZ: Math.min(...bounds.map(({ minZ }) => minZ)),
    maxX: Math.max(...bounds.map(({ maxX }) => maxX)),
    maxZ: Math.max(...bounds.map(({ maxZ }) => maxZ))
  });
}
