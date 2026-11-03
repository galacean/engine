import type { RoofFootprint } from "./RecoveredRoofMath";

/** Inverse of the public roof plan chart. Position and footprint share a frame.
 * No clamping: a point outside the editable roof must not silently move. */
export function roofAttachmentUV(footprint: RoofFootprint, position: readonly number[]): [number, number] {
  const circular = "radius" in footprint;
  const angle = circular ? footprint.phase : Math.atan2(footprint.orientation[1], footprint.orientation[0]);
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const dx = position[0] - footprint.center[0],
    dz = position[2] - footprint.center[1];
  const width = circular ? footprint.radius * 2 : footprint.width;
  const depth = circular ? footprint.radius * 2 : footprint.depth;
  return [0.5 + (c * dx + s * dz) / width, 0.5 - (-s * dx + c * dz) / depth];
}
