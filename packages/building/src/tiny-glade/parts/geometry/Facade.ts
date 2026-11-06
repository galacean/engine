import { buildingGeometryAlgorithms } from "../BuildingAlgorithms";
import { positive } from "../BuildingLayout";
import { BuildingMeshWriter } from "./BuildingMesh";
export interface FacadeOpening {
  x: number;
  bottom: number;
  width: number;
  height: number;
}
export interface FacadeParameters {
  width: number;
  height: number;
  openings?: FacadeOpening[];
  reservations?: FacadeOpening[];
}
/** Actual finite mesh with aperture triangles absent; UVs are metres. Local normal is +Z. */
export const facade = buildingGeometryAlgorithms.register("facade", (p: FacadeParameters, c) => {
  positive(p.width, "Facade width");
  positive(p.height, "Facade height");
  const holes = [...(p.openings ?? []), ...(p.reservations ?? [])];
  for (const o of holes) {
    positive(o.width, "Opening width");
    positive(o.height, "Opening height");
    if (
      !Number.isFinite(o.x) ||
      !Number.isFinite(o.bottom) ||
      o.bottom < 0 ||
      Math.abs(o.x) + o.width / 2 > p.width / 2 + 1e-8 ||
      o.bottom + o.height > p.height + 1e-8
    )
      throw Error("Opening outside facade");
  }
  const xs = [
      ...new Set([-p.width / 2, p.width / 2, ...holes.flatMap((o) => [o.x - o.width / 2, o.x + o.width / 2])])
    ].sort((a, b) => a - b),
    ys = [...new Set([0, p.height, ...holes.flatMap((o) => [o.bottom, o.bottom + o.height])])].sort((a, b) => a - b),
    g = new BuildingMeshWriter();
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const l = xs[i],
        r = xs[i + 1],
        b = ys[j],
        t = ys[j + 1],
        x = (l + r) / 2,
        y = (b + t) / 2;
      if (r - l < 1e-8 || t - b < 1e-8) continue;
      if (holes.some((o) => x > o.x - o.width / 2 && x < o.x + o.width / 2 && y > o.bottom && y < o.bottom + o.height))
        continue;
      g.quad(
        [l, b, 0],
        [r, b, 0],
        [r, t, 0],
        [l, t, 0],
        [
          [l, b],
          [r, b],
          [r, t],
          [l, t]
        ]
      );
    }
  return g.mesh(c, "Facade with apertures");
});
