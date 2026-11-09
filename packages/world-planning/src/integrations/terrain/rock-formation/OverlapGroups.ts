import type { RockFormationJob, RockObb, V3 } from "@galacean/engine-terrain/rock-formation/types";

/** Sweep broad phase, then full OBB separating axes; authoring IDs/parameters stay unchanged. */
export function overlappingRockGroups(jobs: readonly RockFormationJob[]): number[][] {
  const parent = jobs.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const boxes = jobs
    .flatMap((job, index) =>
      job.guides.map((guide) => {
        const center = guide.center.map((v, k) => v + job.origin[k]) as V3;
        const half = [0, 1, 2].map((k) =>
          guide.axes.reduce((sum, axis, j) => sum + (Math.abs(axis[k]) * guide.size[j]) / 2, 0)
        );
        return {
          index,
          box: { ...guide, center },
          min: center.map((v, k) => v - half[k]),
          max: center.map((v, k) => v + half[k])
        };
      })
    )
    .sort((a, b) => a.min[0] - b.min[0]);
  for (let a = 0; a < boxes.length; a++) {
    const A = boxes[a];
    for (let b = a + 1; b < boxes.length && boxes[b].min[0] < A.max[0]; b++) {
      const B = boxes[b];
      if (root(A.index) === root(B.index) || [1, 2].some((k) => A.max[k] <= B.min[k] || B.max[k] <= A.min[k])) continue;
      if (intersects(A.box, B.box)) parent[root(B.index)] = root(A.index);
    }
  }
  const groups = new Map<number, number[]>();
  jobs.forEach((_, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  });
  return [...groups.values()];
}
function intersects(a: RockObb, b: RockObb): boolean {
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  const delta = a.center.map((v, k) => v - b.center[k]);
  const axes = [
    ...a.axes,
    ...b.axes,
    ...a.axes.flatMap((u) =>
      b.axes.map((v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]])
    )
  ];
  return axes.every((axis) => {
    const length = Math.hypot(...axis);
    if (length < 1e-8) return true;
    const radius = (obb: RockObb) => obb.axes.reduce((s, v, i) => s + (Math.abs(dot(v, axis)) * obb.size[i]) / 2, 0);
    return Math.abs(dot(delta, axis)) < radius(a) + radius(b) - 1e-5 * length;
  });
}
