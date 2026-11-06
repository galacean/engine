import { PrimitiveMesh } from "@galacean/engine";
import { buildingGeometryAlgorithms } from "../BuildingAlgorithms";
import { buildingSupportAlgorithms } from "../BuildingAlgorithms";
import { buildingPose, positive } from "../BuildingLayout";
import { BuildingMeshWriter } from "./BuildingMesh";

/** Opening coordinates are along the front facade, above the wall foot, in metres. */
export interface BuildingOpening {
  x: number;
  bottom: number;
  width: number;
  height: number;
  depth: number;
}
export function validateOpening(o: BuildingOpening, width?: number, height?: number): void {
  if (![o.x, o.bottom].every(Number.isFinite) || o.bottom < 0) throw Error("Invalid opening position");
  positive(o.width, "Opening width");
  positive(o.height, "Opening height");
  positive(o.depth, "Opening depth");
  if (
    width !== undefined &&
    (o.x - o.width / 2 < -width / 2 || o.x + o.width / 2 > width / 2 || o.bottom + o.height > height!)
  )
    throw Error("Opening lies outside wall");
}
export const wallGeometry = buildingGeometryAlgorithms.register(
  "wallWithOpenings",
  (
    p: {
      width: number;
      height: number;
      depth: number;
      thickness: number;
      openings: BuildingOpening[];
    },
    context
  ) => {
    const { width: w, height: h, depth: d, thickness: t, openings } = p;
    [w, h, d, t].forEach((v) => positive(v, "Wall dimension"));
    if (t * 2 >= Math.min(w, d)) throw Error("Wall thickness exceeds room dimensions");
    openings.forEach((o, i) => {
      validateOpening(o, w, h);
      if (o.depth > t) throw Error("Opening inset exceeds wall thickness");
      for (const q of openings.slice(0, i))
        if (
          Math.abs(o.x - q.x) < (o.width + q.width) / 2 &&
          o.bottom < q.bottom + q.height &&
          q.bottom < o.bottom + o.height
        )
          throw Error("Overlapping wall openings");
    });
    if (!openings.length) {
      // Same primitive as the original demo, positioned by its Point support.
      return context.own(PrimitiveMesh.createCuboid(context.entity.engine, w, h, d, false));
    }
    const g = new BuildingMeshWriter();
    // The front wall is partitioned around shared opening rectangles. Each box provides its reveals.
    const xs = [...new Set([-w / 2, w / 2, ...openings.flatMap((o) => [o.x - o.width / 2, o.x + o.width / 2])])].sort(
      (a, b) => a - b
    );
    const ys = [...new Set([0, h, ...openings.flatMap((o) => [o.bottom, o.bottom + o.height])])].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++)
      for (let j = 0; j < ys.length - 1; j++) {
        const x = (xs[i] + xs[i + 1]) / 2,
          y = (ys[j] + ys[j + 1]) / 2;
        if (!openings.some((o) => Math.abs(x - o.x) < o.width / 2 && y > o.bottom && y < o.bottom + o.height))
          g.box(x, y - h / 2, d / 2 - t / 2, xs[i + 1] - xs[i], ys[j + 1] - ys[j], t);
      }
    g.box(0, 0, -d / 2 + t / 2, w, h, t);
    for (const s of [-1, 1]) g.box(s * (w / 2 - t / 2), 0, 0, t, h, d - 2 * t);
    return g.mesh(context, "Wall with openings");
  }
);
export const openingPoint = buildingSupportAlgorithms.register(
  "wallOpening",
  (p: { opening: BuildingOpening; wallDepth: number }) => {
    validateOpening(p.opening);
    positive(p.wallDepth, "Wall depth");
    const o = p.opening;
    return {
      type: "point",
      pose: buildingPose([o.x, o.bottom + o.height / 2, p.wallDepth / 2 - o.depth], [1, 0, 0], [0, 1, 0])
    };
  }
);
export const windowFrame = buildingGeometryAlgorithms.register(
  "windowFrame",
  (p: { opening: BuildingOpening; frame: number }, context) => {
    validateOpening(p.opening);
    positive(p.frame, "Window frame");
    const { width: w, height: h } = p.opening,
      f = p.frame;
    if (f * 2 >= Math.min(w, h)) throw Error("Window frame is too wide");
    const g = new BuildingMeshWriter();
    for (const s of [-1, 1]) {
      g.box((s * (w - f)) / 2, 0, 0, f, h, f);
      g.box(0, (s * (h - f)) / 2, 0, w - 2 * f, f, f);
    }
    g.box(0, 0, 0, f, h - 2 * f, f);
    return g.mesh(context, "Window frame");
  }
);
export const openingPanel = buildingGeometryAlgorithms.register(
  "openingPanel",
  (p: { opening: BuildingOpening }, context) => {
    validateOpening(p.opening);
    const g = new BuildingMeshWriter();
    g.box(0, 0, -0.02, p.opening.width, p.opening.height, 0.02);
    return g.mesh(context, "Opening panel");
  }
);
