/** Explicit V1 negative-wet compatibility boundary. Serialized V1 snapshots retain their schema. */
import {
  createWaterSemanticFieldSample,
  sampleWaterSemanticField,
  type WaterSemanticFieldSample,
  type WaterSemanticFieldSnapshotV1
} from "./WaterSemanticField";

export interface CanonicalWaterSemanticFieldSample extends Omit<WaterSemanticFieldSample, "shoreSignedDistance"> {
  /** Metres: positive wet, zero shoreline, negative dry, matching WaterSpatialFieldSample. */
  shoreSignedDistance: number;
}

/** The zero boundary stays +0 in both conventions. */
export function legacyWaterShoreDistanceToCanonical(distance: number): number {
  return distance === 0 ? 0 : -distance;
}

export function createCanonicalWaterSemanticFieldSample(): CanonicalWaterSemanticFieldSample {
  const sample = createWaterSemanticFieldSample();
  sample.shoreSignedDistance = Number.NEGATIVE_INFINITY;
  return sample;
}

/** Adapts a V1 snapshot without changing old consumers or serialized data. Output is caller-owned. */
export function sampleCanonicalWaterSemanticField(
  snapshot: WaterSemanticFieldSnapshotV1,
  worldX: number,
  worldZ: number,
  out: CanonicalWaterSemanticFieldSample
): boolean {
  const resolved = sampleWaterSemanticField(snapshot, worldX, worldZ, out);
  out.shoreSignedDistance = legacyWaterShoreDistanceToCanonical(out.shoreSignedDistance);
  return resolved;
}
