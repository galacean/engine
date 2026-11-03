import type { PlanPoint } from "./IslandPlanModel";

export interface ScalarGrid {
  x: number;
  z: number;
  step: number;
  columns: number;
  rows: number;
  values: number[];
}
/** Sample once; share identical values between filled elevation and contour lines. */
export function sampleScalarGrid(
  x: number,
  z: number,
  width: number,
  depth: number,
  step: number,
  sample: (p: PlanPoint) => number
): ScalarGrid {
  const columns = Math.ceil(width / step) + 1,
    rows = Math.ceil(depth / step) + 1,
    values: number[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < columns; i++) values.push(sample({ x: x + i * step, z: z + j * step }));
  return { x, z, step, columns, rows, values };
}
/** March triangles with a fixed diagonal. Shared edges interpolate identically, including saddle cells. */
export function scalarContours(grid: ScalarGrid, level: number): PlanPoint[][] {
  const { x, z, step, columns, rows, values } = grid,
    segments: [PlanPoint, PlanPoint][] = [];
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < columns - 1; i++) {
      const ids = [j * columns + i, j * columns + i + 1, (j + 1) * columns + i + 1, (j + 1) * columns + i];
      const points = [
        { x: x + i * step, z: z + j * step },
        { x: x + (i + 1) * step, z: z + j * step },
        { x: x + (i + 1) * step, z: z + (j + 1) * step },
        { x: x + i * step, z: z + (j + 1) * step }
      ];
      for (const triangle of [
        [0, 1, 2],
        [0, 2, 3]
      ]) {
        const crossings: PlanPoint[] = [];
        for (let k = 0; k < 3; k++) {
          const a = triangle[k],
            b = triangle[(k + 1) % 3],
            va = values[ids[a]],
            vb = values[ids[b]];
          if (va >= level === vb >= level) continue;
          const t = (level - va) / (vb - va);
          crossings.push({
            x: points[a].x + (points[b].x - points[a].x) * t,
            z: points[a].z + (points[b].z - points[a].z) * t
          });
        }
        if (
          crossings.length === 2 &&
          Math.hypot(crossings[0].x - crossings[1].x, crossings[0].z - crossings[1].z) > 1e-6
        )
          segments.push([crossings[0], crossings[1]]);
      }
    }
  const key = (p: PlanPoint) => `${p.x.toFixed(5)}:${p.z.toFixed(5)}`,
    adjacent = new Map<string, number[]>();
  segments.forEach((s, i) =>
    s.forEach((p) => {
      const k = key(p),
        ids = adjacent.get(k);
      if (ids) ids.push(i);
      else adjacent.set(k, [i]);
    })
  );
  const used = new Set<number>(),
    lines: PlanPoint[][] = [];
  const walk = (start: PlanPoint, index: number) => {
    const points = [start];
    let at = start,
      next: number | undefined = index;
    while (next !== undefined && !used.has(next)) {
      used.add(next);
      const edge = segments[next];
      at = key(edge[0]) === key(at) ? edge[1] : edge[0];
      points.push(at);
      next = adjacent.get(key(at))?.find((id) => !used.has(id));
    }
    if (points.length > 2) lines.push(points);
  };
  for (const [k, ids] of adjacent)
    if (ids.length === 1 && !used.has(ids[0])) walk(segments[ids[0]].find((p) => key(p) === k)!, ids[0]);
  segments.forEach((edge, i) => {
    if (!used.has(i)) walk(edge[0], i);
  });
  return lines;
}
