import { gothicHostSurface, type GothicSupportMesh } from "./GothicHostSurface";
import { gothicRoofFacing } from "./GothicPlacement";
import { f32, add, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath";
import { isFlatRoofHeight } from "./RoofMode";

export interface PitchedRoofAttachment {
  triangle: number;
  barycentric: [number, number, number];
  /** Evidence of the hit in the native chart; never persisted as author input. */
  meshUV: number[];
  surfacePosition: number[];
  transform: { position: number[]; quaternion: number[]; scale: number[] };
}
export type PitchedRoofAttachmentResult =
  | { ok: true; attachment: PitchedRoofAttachment }
  | { ok: false; reason: "flat-roof" | "outside-roof" | "horizontal-cap" };

/** Editor host policy, not a recovered Tiny Glade UI rule. Roof uv addresses
 * the footprint's oriented bounding rectangle (V runs from +Z to -Z), matching
 * the flat-roof API. Cast vertically onto the original trigger triangles and
 * choose the highest hit. Never snap a circle's empty corners to its perimeter,
 * nor round-trip through native UV at chart seams. The native sampler/facing
 * and all downstream bodies/cuts consume the same resolved position.
 * A prepared support must belong to this exact surface/footprint generation.
 */
export function resolvePitchedRoofAttachment(
  surface: RoofSurface,
  footprint: RoofFootprint,
  uv: readonly number[],
  bottom = 0,
  preparedSupport?: GothicSupportMesh
): PitchedRoofAttachmentResult {
  if (uv.length !== 2 || !uv.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
    throw Error("Roof uv must contain two finite values in [0,1]");
  if (!Number.isFinite(bottom) || bottom < 0 || !Number.isFinite(f32(bottom)))
    throw Error("Finite nonnegative roof attachment offset required");
  if (isFlatRoofHeight(surface.height_parameter)) return { ok: false, reason: "flat-roof" };
  const circular = "radius" in footprint;
  const width = circular ? footprint.radius * 2 : footprint.width;
  const depth = circular ? footprint.radius * 2 : footprint.depth;
  const angle = circular ? footprint.phase : Math.atan2(footprint.orientation[1], footprint.orientation[0]);
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const lx = (uv[0] - 0.5) * width,
    lz = (0.5 - uv[1]) * depth;
  const x = footprint.center[0] + c * lx - s * lz;
  const z = footprint.center[1] + s * lx + c * lz;
  const support = preparedSupport ?? gothicHostSurface(surface, footprint);
  let hit: PitchedRoofAttachment | undefined;
  let horizontal = false;
  for (let index = 0; index < support.triangles.length; index++) {
    const [a, b, d] = support.triangles[index];
    const bx = b[0] - a[0],
      bz = b[2] - a[2],
      dx = d[0] - a[0],
      dz = d[2] - a[2];
    const det = bx * dz - bz * dx;
    // Vertical or truly degenerate projection has no area for a vertical hit.
    if (det === 0 || !Number.isFinite(det)) continue;
    const px = x - a[0],
      pz = z - a[2];
    const v = (px * dz - pz * dx) / det,
      w = (bx * pz - bz * px) / det;
    const u = 1 - v - w;
    // Only floating-point arithmetic uncertainty is admitted; there is no
    // world-space snap radius that could bridge a missing host or a narrow face.
    const error =
      16 *
      Number.EPSILON *
      (1 + (Math.abs(px * dz) + Math.abs(pz * dx) + Math.abs(bx * pz) + Math.abs(bz * px)) / Math.abs(det));
    if (u < -error || v < -error || w < -error) continue;
    const weights = [Math.max(0, u), Math.max(0, v), Math.max(0, w)];
    const sum = weights[0] + weights[1] + weights[2];
    const barycentric = weights.map((q) => q / sum) as [number, number, number];
    const position = a.map((_, axis) =>
      f32(a[axis] * barycentric[0] + b[axis] * barycentric[1] + d[axis] * barycentric[2])
    );
    position[1] = add(position[1], surface.base_height);
    if (hit && position[1] <= hit.surfacePosition[1]) continue;
    const sourceUV = support.uvs[index];
    hit = {
      triangle: index,
      barycentric,
      meshUV: [0, 1].map((axis) => sourceUV.reduce((value, p, i) => value + p[axis] * barycentric[i], 0)),
      surfacePosition: position,
      transform: {
        position: [position[0], add(position[1], bottom), position[2]],
        quaternion: [],
        scale: [1, 1, 1]
      }
    };
    // Native top-cap chart is separate from slope charts. Noise can make its
    // triangles slightly non-horizontal, so normals are not a semantic test.
    horizontal = sourceUV.every((p) => p[1] >= 2);
  }
  if (!hit) return { ok: false, reason: "outside-roof" };
  if (horizontal) return { ok: false, reason: "horizontal-cap" };
  hit.transform.quaternion = gothicRoofFacing(surface, footprint, hit.surfacePosition);
  return { ok: true, attachment: hit };
}
