import { buildingGeometryAlgorithms, buildingSupportAlgorithms } from "../BuildingAlgorithms";
import { BuildingPath, positive, type BuildingPoint } from "../BuildingLayout";
import { BuildingMeshWriter } from "./BuildingMesh";

/** Shape parameters belong to the generator. The placement algorithms only see its mesh. */
export interface ProfileRoofParameters {
  width: number;
  depth: number;
  rise: number;
  ridgeLength: number;
  overhang: number;
  exponent: number;
  segments?: number;
}
function validate(p: ProfileRoofParameters) {
  [p.width, p.depth, p.rise, p.exponent].forEach((v) => positive(v, "Roof dimension"));
  if (
    !Number.isFinite(p.overhang) ||
    p.overhang < 0 ||
    !Number.isFinite(p.ridgeLength) ||
    p.ridgeLength < 0 ||
    p.ridgeLength > p.width
  )
    throw Error("Invalid ridge or overhang");
  const n = p.segments ?? 32;
  if (!Number.isInteger(n) || n < 2 || n > 256) throw Error("Roof segments must be 2..256");
  return n;
}
function rings(p: ProfileRoofParameters) {
  const x = p.width / 2 + p.overhang,
    z = p.depth / 2 + p.overhang,
    r = Math.max(0.04, p.ridgeLength / 2);
  return {
    bottom: [
      [-x, 0, -z],
      [-x, 0, z],
      [x, 0, z],
      [x, 0, -z]
    ] as BuildingPoint[],
    top: [
      [-r, p.rise, -0.05],
      [-r, p.rise, 0.05],
      [r, p.rise, 0.05],
      [r, p.rise, -0.05]
    ] as BuildingPoint[]
  };
}
function interpolate(a: BuildingPoint, b: BuildingPoint, t: number, p: ProfileRoofParameters): BuildingPoint {
  return [a[0] + (b[0] - a[0]) * t, p.rise * Math.pow(t, p.exponent), a[2] + (b[2] - a[2]) * t];
}
export const profileRoof = buildingGeometryAlgorithms.register("profileRoof", (p: ProfileRoofParameters, context) => {
  const n = validate(p),
    { bottom, top } = rings(p),
    g = new BuildingMeshWriter(),
    ranges: number[][] = [];
  for (let side = 0; side < 4; side++) {
    const j = (side + 1) % 4,
      start = g.indices.length;
    let v = 0;
    for (let k = 0; k < n; k++) {
      const a = interpolate(bottom[side], top[side], k / n, p),
        b = interpolate(bottom[j], top[j], k / n, p),
        c = interpolate(bottom[j], top[j], (k + 1) / n, p),
        d = interpolate(bottom[side], top[side], (k + 1) / n, p);
      const dv = Math.hypot(...a.map((_, i) => (c[i] + d[i] - a[i] - b[i]) / 2)),
        v1 = v + dv;
      // U is normalized across each course; V is distance along the centre profile in metres.
      g.quad(a, b, c, d, [
        [0, v],
        [1, v],
        [1, v1],
        [0, v1]
      ]);
      v = v1;
    }
    ranges.push([start, g.indices.length - start]);
  }
  const mesh = g.mesh(context, "Profile roof");
  mesh.clearSubMesh();
  ranges.forEach(([s, n]) => mesh.addSubMesh(s, n));
  return mesh;
});
/** Optional construction paths. The roof planner explicitly supplies the same shape inputs. */
export const profileRoofEdge = buildingSupportAlgorithms.register(
  "profileRoofEdge",
  (p: ProfileRoofParameters & { side: number; edge: "hip" | "ridge" | "eave" }) => {
    const n = validate(p),
      { bottom, top } = rings(p),
      i = p.side;
    if (!Number.isInteger(i) || i < 0 || i > 3) throw Error("Roof side must be 0..3");
    const points =
      p.edge === "hip"
        ? Array.from({ length: n + 1 }, (_, k) => interpolate(bottom[i], top[i], k / n, p))
        : p.edge === "eave"
          ? [bottom[i], bottom[(i + 1) % 4]]
          : [top[i], top[(i + 1) % 4]];
    return { type: "path", path: new BuildingPath(points, false) };
  }
);
