import type { RiverEditDocument } from "../../authoring/river/RiverEditDocument";
import { createRiver } from "../../authoring/river/createRiver";
import { RiverPathMode, RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { sampleRiverPath } from "./RiverPathSampler";
import { compileRiverSurfaceGeometry } from "./RiverGeometryCompiler";
import { RIVER_GEOMETRY_EPSILON, RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY } from "./constants";
import type { ReadonlyVector3Tuple } from "./types";
import type { RiverTerrainBounds } from "./RiverTerrainModifierCompiler";

export interface RiverEditDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  pointIndices: number[];
  path?: string;
  /** Actual sampled bank spans, not a second approximate editor ribbon. */
  spans?: readonly (readonly [ReadonlyVector3Tuple, ReadonlyVector3Tuple])[];
}

/** Cheap authoring checks plus the same High ribbon sampling/join resolution as production.
 * Cached by the edit session; never called from the render loop. No terrain derivation/maps/GPU. */
export function diagnoseRiverEdit(document: RiverEditDocument, bounds?: RiverTerrainBounds): RiverEditDiagnostic[] {
  if (!document.riverEnabled) return [];
  const points = document.points;
  const issues: RiverEditDiagnostic[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (b.position[1] > a.position[1] + RIVER_GEOMETRY_EPSILON)
      issues.push({
        severity: "error",
        code: "uphill",
        pointIndices: [i - 1, i],
        message: `第 ${i + 1} 点高程 ${b.position[1].toFixed(3)} m 高于上游第 ${i} 点 ${a.position[1].toFixed(3)} m；请调整这些点的高程。`
      });
    if (Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]) < 0.1)
      issues.push({
        severity: "error",
        code: "short-segment",
        pointIndices: [i - 1, i],
        message: `第 ${i}、${i + 1} 点距离不足 0.1 m。`
      });
  }
  if (issues.length) return issues;
  const descriptor = createRiver({ id: document.riverId, points });
  const config = {
    id: document.riverId,
    path: { ...descriptor.segments[0].curve, mode: RiverPathMode.Polyline },
    ...descriptor.defaults
  };
  const sampled = sampleRiverPath(config);
  const { surfaceGeometry: geometry, inspection } = compileRiverSurfaceGeometry(sampled.points, RiverQualityLevel.High);
  const stride = RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY[RiverQualityLevel.High] + 1;
  const nearestPoint = (sampleIndex: number) => {
    const p = sampled.points[sampleIndex].position;
    let nearest = 0,
      distance = Infinity;
    points.forEach((a, i) => {
      const d = Math.hypot(a.position[0] - p.x, a.position[2] - p.z);
      if (d < distance) {
        distance = d;
        nearest = i;
      }
    });
    return nearest;
  };
  if (bounds) {
    const outside = new Set<number>();
    geometry.positions.forEach((p, vertex) => {
      if (p[0] < bounds.min[0] || p[0] > bounds.max[0] || p[2] < bounds.min[1] || p[2] > bounds.max[1])
        outside.add(nearestPoint(Math.floor(vertex / stride)));
    });
    if (outside.size)
      issues.push({
        code: "surface-bounds",
        severity: "error",
        path: "bounds",
        pointIndices: [...outside],
        message: "实际水面超出允许范围或地形采样范围，请减小幅度、河宽或调整端点"
      });
  }
  for (const { side, points: bank, intersections } of inspection.banks) {
    for (const [a, b] of intersections) {
      const indices = Array.from(new Set([nearestPoint(a), nearestPoint(a + 1), nearestPoint(b), nearestPoint(b + 1)]));
      issues.push({
        severity: "warning",
        code: "bank-intersection",
        pointIndices: indices,
        spans: [
          [bank[a], bank[a + 1]],
          [bank[b], bank[b + 1]]
        ],
        message: `${side}在第 ${indices.map((i) => i + 1).join("、")} 点附近相交；请减小局部河宽或放缓弯道。`
      });
    }
  }
  const foldedRows = inspection.foldedRows;
  if (foldedRows.length) {
    const indices = Array.from(new Set([...foldedRows].map(nearestPoint))).sort((a, b) => a - b);
    issues.push({
      severity: "error",
      code: "folded-surface",
      pointIndices: indices,
      message: `第 ${indices.map((i) => i + 1).join("、")} 点附近水面折叠或退化；请减小河宽、拉开控制点或放缓弯道后再应用。`
    });
  }
  for (const index of inspection.fallbackRows) {
    const pointIndex = nearestPoint(index);
    const from = Math.max(0, index - 1) * stride,
      to = Math.min(sampled.points.length - 1, index + 1) * stride;
    issues.push({
      severity: "warning",
      code: "bounded-join",
      pointIndices: [pointIndex],
      spans: [
        [geometry.positions[from], geometry.positions[to]],
        [geometry.positions[from + stride - 1], geometry.positions[to + stride - 1]]
      ],
      message: `第 ${pointIndex + 1} 点附近急弯已采用有限长度拼接；请检查橙色标记，若仍有红色折叠错误，需要放缓弯道。`
    });
  }
  return issues;
}
