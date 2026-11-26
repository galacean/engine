import type { BuildingWallBakeBinding } from "./BuildingWallBakeBinding";

type Vec4 = [number, number, number, number];
export interface WallUvProjection {
  readonly chartIndex: number;
  /** UV = dot(row.xyz, positionInBuildingFrame) + row.w. */
  readonly u: Vec4;
  readonly v: Vec4;
  readonly bounds: Vec4;
  /** Solid-black texel in this tile, including at an interpolated brick face boundary. */
  readonly darkUV: [number, number];
  readonly normal: [number, number, number];
  /** An independent planar image has black outside edges, so UV can extend without clipping. */
  readonly unbounded: boolean;
}
interface WallUvProjector {
  readonly blackUV: [number, number];
  readonly black: WallUvProjection;
  /** A zero normal selects the nearest exterior supporting plane, e.g. for a brick centre. */
  select(x: number, y: number, z: number, nx: number, ny: number, nz: number): WallUvProjection;
}
const projectors = new WeakMap<BuildingWallBakeBinding, WallUvProjector>();

export function createWallUvProjector(binding: BuildingWallBakeBinding): WallUvProjector {
  const cached = projectors.get(binding);
  if (cached) return cached;
  const [ox, oy, oz] = binding.origin,
    c = Math.cos(binding.yaw),
    s = Math.sin(binding.yaw);
  const { texture } = binding,
    { blackUV } = texture;
  const [bu, bv] = blackUV;
  const black: WallUvProjection = {
    chartIndex: -1,
    u: [0, 0, 0, bu],
    v: [0, 0, 0, bv],
    bounds: [bu, bv, bu, bv],
    darkUV: blackUV,
    normal: [0, 0, 0],
    unbounded: false
  };
  const planes = texture.charts.map((chart, chartIndex) => {
    const nx = c * chart.nx + s * chart.nz,
      nz = -s * chart.nx + c * chart.nz;
    const plane = chart.plane + nx * ox + nz * oz;
    const shift = nz * ox - nx * oz;
    const t = chart.tile;
    const projection: WallUvProjection = t
      ? {
          chartIndex,
          u: [nz * t.du, 0, -nx * t.du, t.offsetU - shift * t.du],
          v: [0, t.dv, 0, t.offsetV - oy * t.dv],
          bounds: t.bounds,
          darkUV: t.darkUV,
          normal: [nx, 0, nz],
          unbounded: texture.unbounded
        }
      : black;
    return {
      nx,
      nz,
      plane,
      extended: "extended" in chart && chart.extended === true,
      start: chart.start + shift,
      end: chart.end + shift,
      projection
    };
  });
  const projector: WallUvProjector = {
    blackUV,
    black,
    select(x, _y, z, nx, ny, nz) {
      const n = Math.hypot(nx, ny, nz);
      if (Math.abs(ny) > 0.75 * n) return black;
      let nearest = Infinity,
        best = black;
      for (const wall of planes) {
        const facing = n ? (nx * wall.nx + nz * wall.nz) / n : 1;
        if (facing < 0.12) continue;
        const d = x * wall.nx + z * wall.nz - wall.plane;
        // Physical wall layers have slightly different depths, including mortar, brick and plaster.
        if (Math.abs(d) > 0.35) continue;
        const along = wall.nz * x - wall.nx * z;
        const endDistance = texture.planar || wall.extended ? 0 : Math.max(wall.start - along, along - wall.end, 0);
        if (endDistance > 0.35) continue;
        const score = d * d + endDistance * endDistance + (1 - facing) * 0.0025;
        if (score < nearest) {
          nearest = score;
          best = wall.projection;
        }
      }
      return best;
    }
  };
  projectors.set(binding, projector);
  return projector;
}
