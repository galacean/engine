import { contains } from "./PlacementDocument.js";
import { surfaceBoundary, surfaceArea } from "./SurfacePolygon";
import type { MasonryOverride } from "./MasonryDocument";

export interface MasonrySurfaceInspection {
  bindingId: string;
  /** Bounds of actual material-unit anchors in this surface's chart, not world metres. */
  uvBounds: { min: number[]; max: number[] } | null;
  totalUnits: number;
  hiddenUnits: number;
  selectedUnits: number;
  selectedHiddenUnits: number;
  /** Small UV square centred on an existing visible unit; null when no visible unit or no two-dimensional anchor extent is available. */
  sampleRegion: MasonryOverride["region"] | null;
}
interface SurfaceCell {
  id: string;
  logical_id?: string;
  binding_id: string;
  placement_binding_id?: string;
  anchor_uv?: number[];
  hidden?: boolean;
}
/** Reuses resolved render assignments: dependencies and split logical pieces agree with rendering. */
export function inspectMasonrySurface(
  cells: SurfaceCell[],
  bindingId: string,
  polygon?: number[][]
): MasonrySurfaceInspection {
  if (
    polygon &&
    (polygon.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v))) ||
      !surfaceArea(surfaceBoundary(polygon)))
  )
    throw new Error("Surface selection requires a finite nonzero-area UV polygon");
  const units = new Map<string, SurfaceCell>();
  for (const cell of cells) {
    if (
      (cell.binding_id !== bindingId && cell.placement_binding_id !== bindingId) ||
      !cell.anchor_uv ||
      cell.anchor_uv.length !== 2 ||
      !cell.anchor_uv.every(Number.isFinite)
    )
      continue;
    const key = JSON.stringify([cell.placement_binding_id ?? cell.binding_id, cell.logical_id ?? cell.id]);
    const prior = units.get(key);
    if (
      prior &&
      (prior.hidden !== cell.hidden || prior.anchor_uv!.some((v, i) => Math.abs(v - cell.anchor_uv![i]) > 1e-8))
    )
      throw new Error("Inconsistent logical surface unit");
    units.set(key, cell);
  }
  const all = [...units.values()];
  const min = [Infinity, Infinity],
    max = [-Infinity, -Infinity];
  for (const cell of all)
    for (let i = 0; i < 2; i++) {
      min[i] = Math.min(min[i], cell.anchor_uv![i]);
      max[i] = Math.max(max[i], cell.anchor_uv![i]);
    }
  const visible = all.filter((c) => !c.hidden);
  const center = min.map((v, i) => (v + max[i]) / 2);
  const sample = visible.reduce<SurfaceCell | undefined>(
    (best, c) =>
      !best ||
      Math.hypot(...c.anchor_uv!.map((v, i) => v - center[i])) <
        Math.hypot(...best.anchor_uv!.map((v, i) => v - center[i]))
        ? c
        : best,
    undefined
  );
  const half = Math.min(max[0] - min[0], max[1] - min[1]) / 20;
  const [u, v] = sample?.anchor_uv ?? [0, 0];
  const selected = polygon ? all.filter((c) => contains(polygon, c.anchor_uv)) : all;
  return {
    bindingId,
    uvBounds: all.length ? { min, max } : null,
    totalUnits: all.length,
    hiddenUnits: all.filter((c) => c.hidden).length,
    selectedUnits: selected.length,
    selectedHiddenUnits: selected.filter((c) => c.hidden).length,
    sampleRegion:
      sample && half > 0 && Number.isFinite(half)
        ? {
            space: "surface_uv",
            polygon: [
              [u - half, v - half],
              [u + half, v - half],
              [u + half, v + half],
              [u - half, v + half]
            ]
          }
        : null
  };
}
