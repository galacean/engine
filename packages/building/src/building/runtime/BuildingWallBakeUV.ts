import type { BuildingWallBakeBinding, BuildingWallBakeTexture } from "./BuildingWallBakeBinding";

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

/** Native unit topology stays intact. A conservative sphere identifies units whose
 * triangles may cross a packed tile edge. Those units use a shared, independently
 * clamped chart, so the UV stays affine even along a plank longer than its light patch. */
export function partitionWallReceiverUnits(
  binding: BuildingWallBakeBinding,
  bounds: Float32Array,
  radii: Float32Array
): { dark: Uint32Array; lit: { ids: Uint32Array; binding: BuildingWallBakeBinding }[] } {
  const projector = createWallUvProjector(binding);
  const groups = new Map<BuildingWallBakeBinding, Map<BuildingWallBakeTexture, number[]>>();
  const dark: number[] = [];
  for (let i = 0; i < radii.length; i++) {
    const x = bounds[4 * i],
      y = bounds[4 * i + 1],
      z = bounds[4 * i + 2],
      r = radii[i];
    const chart = projector.select(x, y, z, 0, 0, 0);
    const u = chart.u[0] * x + chart.u[2] * z + chart.u[3],
      ru = r * Math.hypot(chart.u[0], chart.u[2]);
    const v = chart.v[1] * y + chart.v[3],
      rv = r * Math.abs(chart.v[1]);
    const [u0, v0, u1, v1] = chart.bounds;
    if (r <= 0 || chart === projector.black || u + ru < u0 || u - ru > u1 || v + rv < v0 || v - rv > v1) {
      dark.push(i);
      continue;
    }
    const crosses = !chart.unbounded && (u - ru < u0 || u + ru > u1 || v - rv < v0 || v + rv > v1);
    // A facade with one contributing emitter retains the native single-tap draw,
    // including its own black-bordered crop for long units crossing the patch.
    const source = binding.singleReceiver?.(chart.chartIndex);
    const receiver = source?.binding ?? binding;
    const texture = crosses
      ? receiver.texture.isolatedChart(source?.sourceChart ?? chart.chartIndex)
      : receiver.texture;
    let textures = groups.get(receiver);
    if (!textures) groups.set(receiver, (textures = new Map()));
    let ids = textures.get(texture);
    if (!ids) textures.set(texture, (ids = []));
    ids.push(i);
  }
  return {
    dark: Uint32Array.from(dark),
    lit: Array.from(groups, ([source, textures]) =>
      Array.from(textures, ([texture, ids]) => ({
        ids: Uint32Array.from(ids),
        binding: texture === source.texture ? source : { ...source, texture }
      }))
    ).flat()
  };
}
