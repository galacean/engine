import { createWallUvProjector, type BuildingWallBakeBinding, type WallUvProjection } from "./BuildingWallBakeBinding";
import { uvU, uvV, type ConstructionPreviewPart } from "./ConstructionPreview";

type Vec3 = [number, number, number];
type Corner = { index?: number; weights: Vec3; u: number; v: number };
type Geometry = Pick<ConstructionPreviewPart, "positions" | "indices"> & { vertexAlpha?: number[] } & Partial<
    Pick<
      ConstructionPreviewPart,
      "normals" | "uvs" | "colors" | "neutralColors" | "tintRoles" | "emission" | "appearance" | "plaster"
    >
  >;

/** Clip in UV space during mesh assembly. Barycentric coordinates carry all original
 * vertex attributes across new edges, including the brick/paint UVs and plaster cutouts. */
function split(corners: Corner[], axis: "u" | "v", sign: number, limit: number): [Corner[], Corner[]] {
  const inside: Corner[] = [],
    outside: Corner[] = [];
  let a = corners[corners.length - 1],
    da = (a[axis] - limit) * sign;
  for (const b of corners) {
    const db = (b[axis] - limit) * sign;
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      const mix = (x: number, y: number) => x + t * (y - x);
      const cut: Corner = {
        weights: [mix(a.weights[0], b.weights[0]), mix(a.weights[1], b.weights[1]), mix(a.weights[2], b.weights[2])],
        u: mix(a.u, b.u),
        v: mix(a.v, b.v)
      };
      cut[axis] = limit;
      inside.push(cut);
      outside.push(cut);
    }
    if (db >= 0) inside.push(b);
    if (db <= 0) outside.push(b);
    a = b;
    da = db;
  }
  return [inside, outside];
}

/** Assign one chart per triangle. Split shared vertices at chart seams and cut triangles
 * crossing a packed tile edge; their unlit pieces sample a reserved black texel. */
export function withBuildingWallUVs<T extends Geometry>(
  part: T,
  binding: BuildingWallBakeBinding
): T & { lightmapUVs: Float32Array } {
  const projector = createWallUvProjector(binding);
  const positions: number[] = [],
    indices: number[] = [],
    lightmapUVs: number[] = [];
  const result = { ...part, positions, indices };
  const channels: Array<{ src: ArrayLike<number>; out: number[]; stride: number; discrete: boolean }> = [];
  function channel(src: ArrayLike<number>, stride: number, discrete = false) {
    const out: number[] = [];
    channels.push({ src, out, stride, discrete });
    return out;
  }
  for (const key of ["normals", "colors", "neutralColors"] as const) {
    if (part[key]?.length) result[key] = channel(part[key]!, 3);
  }
  for (const key of ["emission", "tintRoles", "vertexAlpha"] as const) {
    if (part[key]?.length) result[key] = channel(part[key]!, 1, key === "tintRoles");
  }
  if (part.plaster) result.plaster = { ...part.plaster, edgeDistances: channel(part.plaster.edgeDistances, 1) };
  const uvStreams: Array<{ src: NonNullable<Geometry["uvs"]>; out: number[][] }> = [];
  function uvStream(src: NonNullable<Geometry["uvs"]>) {
    const out: number[][] = [];
    uvStreams.push({ src, out });
    return out;
  }
  if (part.uvs?.length) result.uvs = uvStream(part.uvs);
  if (part.appearance) {
    const a = part.appearance;
    result.appearance = {
      kinds: channel(a.kinds, 1, true),
      colorIds: channel(a.colorIds, 1, true),
      centers: channel(a.centers, 3),
      materialUVs: uvStream(a.materialUVs)
    };
  }

  const ids: Vec3 = [0, 0, 0];
  const byChart = new Map<WallUvProjection, Map<number, number>>();
  function emit(poly: Corner[], chart: WallUvProjection) {
    if (poly.length < 3) return;
    let byVertex = byChart.get(chart);
    if (!byVertex) byChart.set(chart, (byVertex = new Map()));
    const vertices = poly.map((c) => {
      if (c.index !== undefined) {
        const existing = byVertex.get(c.index);
        if (existing !== undefined) return existing;
      }
      const id = positions.length / 3;
      if (c.index !== undefined) byVertex.set(c.index, id);
      const [a, b, d] = ids,
        [wa, wb, wd] = c.weights;
      const nearest = wa >= wb && wa >= wd ? a : wb >= wd ? b : d;
      const value = (src: ArrayLike<number>, stride: number, k: number) =>
        c.index !== undefined
          ? src[c.index * stride + k]
          : wa * src[a * stride + k] + wb * src[b * stride + k] + wd * src[d * stride + k];
      for (let k = 0; k < 3; k++) positions.push(value(part.positions, 3, k));
      for (const { src, out, stride, discrete } of channels)
        for (let k = 0; k < stride; k++) out.push(discrete ? src[nearest * stride + k] : value(src, stride, k));
      for (const { src, out } of uvStreams) {
        if (c.index !== undefined) out.push([uvU(src, c.index), uvV(src, c.index)]);
        else
          out.push([
            wa * uvU(src, a) + wb * uvU(src, b) + wd * uvU(src, d),
            wa * uvV(src, a) + wb * uvV(src, b) + wd * uvV(src, d)
          ]);
      }
      if (chart === projector.black) lightmapUVs.push(...projector.blackUV);
      else lightmapUVs.push(c.u, c.v);
      return id;
    });
    for (let i = 1; i + 1 < vertices.length; i++) indices.push(vertices[0], vertices[i], vertices[i + 1]);
  }

  const p = part.positions;
  for (let i = 0; i < part.indices.length; i += 3) {
    ids[0] = part.indices[i];
    ids[1] = part.indices[i + 1];
    ids[2] = part.indices[i + 2];
    const [a, b, c] = ids.map((x) => x * 3);
    const dx = p[b] - p[a],
      dy = p[b + 1] - p[a + 1],
      dz = p[b + 2] - p[a + 2];
    const ex = p[c] - p[a],
      ey = p[c + 1] - p[a + 1],
      ez = p[c + 2] - p[a + 2];
    const chart = projector.select(
      (p[a] + p[b] + p[c]) / 3,
      (p[a + 1] + p[b + 1] + p[c + 1]) / 3,
      (p[a + 2] + p[b + 2] + p[c + 2]) / 3,
      dy * ez - dz * ey,
      dz * ex - dx * ez,
      dx * ey - dy * ex
    );
    let poly: Corner[] = ids.map((index, corner) => {
      const j = index * 3,
        weights: Vec3 = [0, 0, 0];
      weights[corner] = 1;
      const uv = (row: WallUvProjection["u"]) => row[0] * p[j] + row[1] * p[j + 1] + row[2] * p[j + 2] + row[3];
      return { index, weights, u: uv(chart.u), v: uv(chart.v) };
    });
    if (chart !== projector.black && !chart.unbounded) {
      for (const [axis, sign, limit] of [
        ["u", 1, chart.bounds[0]],
        ["v", 1, chart.bounds[1]],
        ["u", -1, chart.bounds[2]],
        ["v", -1, chart.bounds[3]]
      ] as const) {
        if (poly.every((c) => (c[axis] - limit) * sign >= 0)) continue;
        if (poly.every((c) => (c[axis] - limit) * sign <= 0)) {
          emit(poly, projector.black);
          poly = [];
          break;
        }
        const [inside, outside] = split(poly, axis, sign, limit);
        emit(outside, projector.black);
        poly = inside;
      }
    }
    emit(poly, chart);
  }
  return { ...result, lightmapUVs: Float32Array.from(lightmapUVs) };
}
