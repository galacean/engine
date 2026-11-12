import limits from "../../planning-data/road-network.json";
import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { rasterizeTerrainRoadCoverage } from "../../world/RoadSurfaceCoverage";
import { compileRoadPath } from "./RoadGeometry";
import { searchTerrainRoadGrid, terrainRoadSegmentGrade } from "./TerrainRoadSearch";

/** Terrain inputs for generating an open road from ordered keypoints. All distances are in metres. */
export interface TerrainRoadOptions {
  /** Terrain width and depth, with local X and Z both in [0, sizeMetres]. */
  sizeMetres: number;
  /** Ordered points on the terrain that the centerline must pass through. */
  keypoints: readonly PlanPoint[];
  /** Full width of the road core. */
  widthMetres: number;
  /** Soft shoulder width on each side of the core. */
  shoulderMetres: number;
  /** Coverage samples per axis, including both terrain edges. */
  resolution: number;
  /** Ground height in terrain-local coordinates. */
  heightAt(x: number, z: number): number;
  /** Signed distance to the boundary of traversable terrain, positive inside. */
  clearanceAt(x: number, z: number): number;
}

/** An open road and its row-major coverage, with weights in [0, 1]. */
export interface TerrainRoad {
  /** Centerline samples in terrain-local X/Z metres. */
  points: PlanPoint[];
  /** Road core and shoulder weights on the requested terrain lattice. */
  coverage: Float32Array;
}

/** Search and smooth a terrain road through the given keypoints.
 * @returns The road, or undefined when the keypoints cannot be joined at the requested clearance.
 */
export function generateTerrainRoad(options: TerrainRoadOptions): TerrainRoad | undefined {
  const { sizeMetres, keypoints, widthMetres, shoulderMetres, heightAt, clearanceAt } = options;
  if (
    keypoints.length < 2 ||
    !Number.isFinite(sizeMetres) ||
    sizeMetres <= 0 ||
    !Number.isFinite(widthMetres) ||
    widthMetres <= 0 ||
    !Number.isFinite(shoulderMetres) ||
    shoulderMetres < 0
  )
    return undefined;
  const first = keypoints[0],
    last = keypoints[keypoints.length - 1];
  if (first.x === last.x && first.z === last.z) return undefined;
  const requiredClearance = widthMetres / 2 + shoulderMetres + limits.clearanceM;
  const withinRoadBounds = ({ x, z }: PlanPoint) =>
    Math.min(x, z, sizeMetres - x, sizeMetres - z) >= requiredClearance && clearanceAt(x, z) >= requiredClearance;
  if (!keypoints.every(withinRoadBounds)) return undefined;
  const grade = (a: PlanPoint, b: PlanPoint) => terrainRoadSegmentGrade(a, b, (p) => heightAt(p.x, p.z));
  const clearSegment = (a: PlanPoint, b: PlanPoint) => {
    const samples = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 2));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      if (!withinRoadBounds({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  };

  const step = Math.min(limits.gridStepM, sizeMetres / 4);
  const columns = Math.ceil(sizeMetres / step);
  const point = (id: number): PlanPoint => ({
    x: ((id % columns) + 0.5) * step,
    z: (Math.floor(id / columns) + 0.5) * step
  });
  const gridId = ({ x, z }: PlanPoint) => Math.floor(z / step) * columns + Math.floor(x / step);
  const grades = new Map<number, number | undefined>();
  const edgeGrade = (a: number, b: number) => {
    const key = Math.min(a, b) * columns ** 2 + Math.max(a, b);
    if (!grades.has(key)) {
      const start = point(a),
        end = point(b);
      grades.set(key, clearSegment(start, end) ? grade(start, end) : undefined);
    }
    return grades.get(key);
  };

  const points: PlanPoint[] = [];
  for (let i = 1; i < keypoints.length; i++) {
    const start = keypoints[i - 1],
      end = keypoints[i];
    if (start.x === end.x && start.z === end.z) continue;
    const from = gridId(start),
      to = gridId(end);
    const route = searchTerrainRoadGrid(from, to, { columns, rows: columns, step, point, edgeGrade });
    if (!route) return undefined;
    const raw = [start, ...route.map(point), end];
    if (!raw.slice(1).every((p, j) => clearSegment(raw[j], p))) return undefined;
    const maxGrade = Math.max(limits.maxSlope, ...raw.slice(1).map((p, j) => grade(raw[j], p)));
    const compiled = compileRoadPath(
      { id: "terrain-road", from: "", to: "", width: widthMetres },
      raw,
      (path) => path.slice(1).every((p, j) => clearSegment(path[j], p) && grade(path[j], p) <= maxGrade + 1e-6),
      limits.curveSimplifyM
    );
    // A smooth spline can exceed the accepted corridor or grade on steep ground.
    const section = compiled?.points ?? raw;
    points.push(...section.slice(points.length ? 1 : 0));
  }
  if (points.length < 2) return undefined;
  return {
    points,
    coverage: rasterizeTerrainRoadCoverage(points, sizeMetres, options.resolution, widthMetres, shoulderMetres)
  };
}
