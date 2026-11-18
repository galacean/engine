import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { pointInPolygon } from "../../geometry/V2Geometry";
import { createRegionOwnership } from "./RegionOwnership";

/** A spatial domain may carry height, moisture or another scalar without changing its ownership geometry. */
export interface RegionScalarCell {
  id: string;
  domainId: string;
  center: PlanPoint;
  outline: PlanPoint[];
  value: number;
  /** Optional squared-metre offset from the published management partition. */
  weightM2?: number;
}
/** Serializable intent. Sampling caches and render textures are not part of the project document. */
export interface RegionScalarField {
  id: string;
  unit: string;
  blendM: number;
  cells: RegionScalarCell[];
  domains: { id: string; outline: PlanPoint[] }[];
}

/** Shared Voronoi edges determine neighbours; cells never propagate across separate islands. */
export function regionAdjacency(field: Pick<RegionScalarField, "cells" | "domains">): Map<string, string[]> {
  const result = new Map(field.cells.map((cell) => [cell.id, [] as string[]]));
  const edges = new Map<string, { id: string; a: PlanPoint; b: PlanPoint }[]>();
  const key = (p: PlanPoint) => `${Math.round(p.x * 1e5)},${Math.round(p.z * 1e5)}`;
  for (const cell of field.cells)
    for (let i = 0; i < cell.outline.length; i++) {
      const a = cell.outline[i],
        b = cell.outline[(i + 1) % cell.outline.length];
      if (Math.hypot(a.x - b.x, a.z - b.z) < 1e-5) continue;
      const ak = key(a),
        bk = key(b),
        edge = `${cell.domainId}:${ak < bk ? ak + ":" + bk : bk + ":" + ak}`;
      const owners = edges.get(edge) ?? [];
      owners.push({ id: cell.id, a, b });
      edges.set(edge, owners);
    }
  for (const owners of edges.values()) {
    if (owners.length !== 2) continue;
    const [a, b] = owners,
      cell = field.cells.find((cell) => cell.id === a.id)!;
    const domain = field.domains.find((domain) => domain.id === cell.domainId);
    if (
      !domain ||
      ![0.05, 0.25, 0.5, 0.75, 0.95].some((t) =>
        pointInPolygon({ x: a.a.x + (a.b.x - a.a.x) * t, z: a.a.z + (a.b.z - a.a.z) * t }, domain.outline)
      )
    )
      continue;
    result.get(a.id)!.push(b.id);
    result.get(b.id)!.push(a.id);
  }
  for (const neighbours of result.values()) neighbours.sort();
  return result;
}

/** A finite graph distance propagates authored values; unrelated disconnected domains stay untouched. */
export function propagateRegionValue(
  adjacency: ReadonlyMap<string, readonly string[]>,
  source: string,
  value: number,
  rings: number
): Map<string, number> {
  if (!Number.isFinite(value) || !Number.isInteger(rings) || rings < 0 || rings > 8)
    throw new Error("区域属性值或邻接层数无效");
  const result = new Map<string, number>(),
    queue: [string, number][] = [[source, 0]],
    visited = new Set([source]);
  for (let i = 0; i < queue.length; i++) {
    const [id, distance] = queue[i],
      t = 1 - distance / (rings + 1);
    result.set(id, value * t * t * (3 - 2 * t));
    if (distance === rings) continue;
    for (const next of adjacency.get(id) ?? [])
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, distance + 1]);
      }
  }
  return result;
}

/** Sample smoothly across the same ownership bisectors, with a finite metric blend band.
 * This inexpensive 8m field is compiled once; the canonical 1m Terrain raster consumes bilinear samples.
 */
export function compileRegionScalarField(
  field: RegionScalarField,
  width: number,
  depth: number,
  spacingM = 8
): (p: PlanPoint) => number {
  if (!Number.isFinite(field.blendM) || field.blendM <= 0) throw new Error("区域过渡宽度须大于零");
  const columns = Math.ceil(width / spacingM) + 1,
    rows = Math.ceil(depth / spacingM) + 1;
  const dx = width / (columns - 1),
    dz = depth / (rows - 1),
    values = new Float32Array(columns * rows);
  const groups = field.domains.map((domain) => {
    const cells = field.cells.filter((cell) => cell.domainId === domain.id);
    return { ...domain, cells, ownership: createRegionOwnership(cells) };
  });
  for (let iz = 0; iz < rows; iz++)
    for (let ix = 0; ix < columns; ix++) {
      const p = { x: ix * dx, z: iz * dz };
      const domain = groups.find((domain) => pointInPolygon(p, domain.outline));
      if (!domain?.cells.length) continue;
      values[iz * columns + ix] = domain
        .ownership(p, field.blendM)
        .reduce((sum, sample) => sum + sample.weight * domain.cells[sample.index].value, 0);
    }
  return (p) => {
    const x = Math.max(0, Math.min(columns - 1, p.x / dx)),
      z = Math.max(0, Math.min(rows - 1, p.z / dz));
    const ix = Math.min(columns - 2, Math.floor(x)),
      iz = Math.min(rows - 2, Math.floor(z)),
      u = x - ix,
      v = z - iz,
      i = iz * columns + ix;
    return (
      (values[i] * (1 - u) + values[i + 1] * u) * (1 - v) +
      (values[i + columns] * (1 - u) + values[i + columns + 1] * u) * v
    );
  };
}
