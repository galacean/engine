/** Original UV hit and roof-facing orientation, independent of runtime render meshes. */
import {
  f32,
  add,
  sub,
  mul,
  div,
  sqrt,
  dot,
  lerp,
  expandedDimensions,
  roofHeight,
  quaternionAxes
} from "./RecoveredRoofMath";
import type { RoofSurface, RoofFootprint } from "./RecoveredRoofMath";
import { gothicHostSurface, gothicRoofNoise } from "./GothicHostSurface";
import type { GothicSupportMesh } from "./GothicHostSurface";
import type { GothicTransform } from "./GothicBlueprint";
/** 0x101ff79e8: first triangle with all three nonnegative barycentric weights. */
export function gothicUVPosition(mesh: GothicSupportMesh, uv: number[], baseY: number): number[] | null {
  for (let i = 0; i < mesh.uvs.length; i++) {
    const [a, b, c] = mesh.uvs[i],
      dx = sub(b[0], a[0]),
      dy = sub(b[1], a[1]),
      ex = sub(c[0], a[0]),
      ey = sub(c[1], a[1]),
      ux = sub(uv[0], a[0]),
      uy = sub(uv[1], a[1]);
    const inv = div(1, sub(mul(dx, ey), mul(dy, ex))),
      v = mul(sub(mul(ux, ey), mul(uy, ex)), inv),
      w = mul(sub(mul(uy, dx), mul(ux, dy)), inv),
      u = sub(sub(1, v), w);
    if (!(v >= 0 && w >= 0 && u >= 0)) continue;
    const [pa, pb, pc] = mesh.triangles[i];
    return pa.map((x, j) => add(add(add(mul(x, u), mul(pb[j], v)), mul(pc[j], w)), j === 1 ? baseY : 0));
  }
  return null;
}
export function gothicPlacement(
  surface: RoofSurface,
  footprint: RoofFootprint,
  uv: number[],
  support?: GothicSupportMesh
): GothicTransform | null {
  if (uv.length !== 2 || uv.some((v) => !Number.isFinite(v))) throw Error("Finite mesh UV required");
  const position = gothicUVPosition(support ?? gothicHostSurface(surface, footprint), uv, surface.base_height);
  if (!position) return null;
  return { translation: position, rotation: gothicRoofFacing(surface, footprint, position), scale: [1, 1, 1] };
}

/** Shared native facing after the host has resolved a surface position. Keep
 * this separate from native mesh UV lookup: editor roof UV is a plan-view chart.
 */
export function gothicRoofFacing(surface: RoofSurface, footprint: RoofFootprint, position: number[]): number[] {
  let forward: number[];
  if ("radius" in footprint) {
    forward = [sub(position[0], footprint.center[0]), sub(position[2], footprint.center[1])];
  } else {
    // Roof::get_roof_shape_from_pos_ws_clamped(translation + Y).
    const y = add(position[1], 1),
      height = roofHeight(surface, footprint),
      noisy = add(y, mul(gothicRoofNoise(mul(position[0], 0.5), mul(position[2], 0.5)), -0.3));
    const v = Math.min(1, Math.max(0, div(sub(noisy, surface.base_height), height))),
      exponent = div(1, add(mul(surface.profile, 1.5), mul(sub(1, surface.profile), 0.5))),
      t = f32(Math.pow(v, exponent));
    const [bottom, top] = expandedDimensions(surface, footprint),
      size = bottom.map((x, i) => lerp(x, top[i], t)),
      [c, s] = footprint.orientation,
      dx = sub(position[0], footprint.center[0]),
      dz = sub(position[2], footprint.center[1]),
      det = add(mul(c, c), mul(s, s));
    const x = add(mul(dx, div(c, det)), mul(dz, div(s, det))),
      z = add(mul(dx, div(-s, det)), mul(dz, div(c, det)));
    forward =
      Math.abs(div(x, size[0])) > Math.abs(div(z, size[1])) ? (x > 0 ? [c, s] : [-c, -s]) : z > 0 ? [-s, c] : [s, -c];
  }
  const length = sqrt(dot(forward, forward));
  forward = length > 0 && Number.isFinite(length) ? forward.map((v) => mul(v, div(1, length))) : [1, 0];
  const [x, z] = forward;
  return quaternionAxes([z, 0, -x], [0, 1, 0], [x, 0, z]);
}
