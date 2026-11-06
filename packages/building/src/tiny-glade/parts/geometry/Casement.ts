import { buildingGeometryAlgorithms } from "../BuildingAlgorithms";
import { cross, unit, subtract, positive, type BuildingPoint } from "../BuildingLayout";
import { BuildingMeshWriter } from "./BuildingMesh";
export const casement = buildingGeometryAlgorithms.register("casement", (p: { width: number; height: number }, c) => {
  positive(p.width, "Window width");
  positive(p.height, "Window height");
  const w = p.width,
    h = p.height,
    g = new BuildingMeshWriter(),
    f = 0.1;
  if (Math.min(w, h) <= 2 * f) throw Error("Window is smaller than its frame");
  for (const s of [-1, 1]) {
    g.box((s * (w - f)) / 2, 0, 0, f, h, 0.14);
    g.box(0, (s * (h - f)) / 2, 0, w - 2 * f, f, 0.14);
  }
  // Thin diagonal lattice, clipped to the opening's inner rectangle before building geometry.
  const halfW = (w - 2 * f) / 2,
    halfH = (h - 2 * f) / 2;
  for (const slope of [-0.65, 0.65])
    for (let y = -halfH - halfW; y < halfH + halfW; y += 0.32) {
      const pts: BuildingPoint[] = [];
      for (const x of [-halfW, halfW]) {
        const Y = y + slope * x;
        if (Math.abs(Y) <= halfH) pts.push([x, Y, 0.025]);
      }
      for (const Y of [-halfH, halfH]) {
        const x = (Y - y) / slope;
        if (Math.abs(x) < halfW) pts.push([x, Y, 0.025]);
      }
      if (pts.length !== 2) continue;
      const [a, b] = pts,
        dir = unit(subtract(b, a)),
        side = unit(cross(dir, [0, 0, 1])),
        r = 0.018;
      const v = (p: BuildingPoint, s: number, z: number) =>
        p.map((n, i) => n + s * side[i] * r + (i === 2 ? z * r : 0)) as BuildingPoint;
      g.quad(v(a, -1, 1), v(b, -1, 1), v(b, 1, 1), v(a, 1, 1));
      g.quad(v(a, 1, -1), v(b, 1, -1), v(b, -1, -1), v(a, -1, -1));
      g.quad(v(a, 1, 1), v(b, 1, 1), v(b, 1, -1), v(a, 1, -1));
      g.quad(v(a, -1, -1), v(b, -1, -1), v(b, -1, 1), v(a, -1, 1));
    }
  return g.mesh(c, "Window frame and lattice");
});
