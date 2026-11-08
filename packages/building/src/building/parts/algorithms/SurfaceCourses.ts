import { buildingPlacementAlgorithms } from "../BuildingAlgorithms";
import { cross, unit, positive, type BuildingPoint } from "../BuildingLayout";
import { assetInstanceBatch, type AssetCell, type AssetBatchParameters } from "../native/AssetInstanceBatch";
import { surfaceCourseCells, type SurfaceCourseParameters } from "./SurfaceCourseCells";
export { surfaceCourseCells, type SurfaceCourseParameters } from "./SurfaceCourseCells";
export const surfaceCourses = buildingPlacementAlgorithms.register(
  "surfaceCourses",
  (support, p: SurfaceCourseParameters) => {
    if (support.type !== "surface" || !("chart" in support)) throw Error("surfaceCourses requires a Mesh Surface");
    return assetInstanceBatch(surfaceCourseCells(support.chart, p), p);
  }
);
export const pathCourses = buildingPlacementAlgorithms.register(
  "pathCourses",
  (support, p: AssetBatchParameters & { size: BuildingPoint; offset?: number }) => {
    if (support.type !== "path") throw Error("pathCourses requires a Path");
    p.size.forEach((v) => positive(v, "Unit size"));
    const n = Math.max(1, Math.ceil(support.path.length / p.size[1]));
    if (n > 10000) throw Error("Path unit budget exceeded");
    const cells: AssetCell[] = Array.from({ length: n }, (_, i) => {
      const pose = support.path.sample(((i + 0.5) * support.path.length) / n),
        up = pose.normal,
        along = pose.tangent;
      return {
        id: `path/${i}`,
        center: pose.position.map((x, k) => x + up[k] * (p.offset ?? 0)) as BuildingPoint,
        tangent: unit(cross(along, up)),
        bitangent: along,
        normal: up,
        size: [p.size[0], (support.path.length / n) * 1.12, p.size[2]]
      };
    });
    return assetInstanceBatch(cells, p);
  }
);

/** Explicit spans along a path, with a cross-section anchored by two fractions.
 * A corner bond uses [-.5,-.5] to put each stone wholly inside the shared corner. */
export const pathBlocks = buildingPlacementAlgorithms.register(
  "pathBlocks",
  (
    support,
    p: AssetBatchParameters & {
      bands: { start: number; end: number; width: number; depth: number }[];
      up: BuildingPoint;
      anchor?: [number, number];
    }
  ) => {
    if (support.type !== "path") throw Error("pathBlocks requires a Path");
    if (!Array.isArray(p.bands) || p.bands.length > 10000) throw Error("Path block budget exceeded");
    const anchor = p.anchor ?? [0, 0];
    if (!anchor.every(Number.isFinite)) throw Error("Finite anchor required");
    const cells: AssetCell[] = p.bands.map((b, i) => {
      [b.end - b.start, b.width, b.depth].forEach((v) => positive(v, "Path block size"));
      if (!Number.isFinite(b.start) || b.start < 0 || b.end > support.path.length + 1e-8)
        throw Error("Block outside path");
      const pose = support.path.sample((b.start + b.end) / 2, p.up),
        normal = pose.normal,
        tangent = unit(cross(pose.tangent, normal));
      return {
        id: `block/${i}`,
        center: pose.position.map(
          (v, k) => v + tangent[k] * b.width * anchor[0] + normal[k] * b.depth * anchor[1]
        ) as BuildingPoint,
        tangent,
        bitangent: pose.tangent,
        normal,
        size: [b.width, b.end - b.start, b.depth],
        brick_deformation: [0.01, -0.01, 0.015, -0.015]
      };
    });
    return assetInstanceBatch(cells, p);
  }
);
