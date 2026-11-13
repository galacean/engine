import { MeshoptSimplifier } from "@galacean/engine-terrain/rock-formation/generator/vendor/meshopt_simplifier.js";

const reduced = new WeakMap<object, Map<number, any>>();
const fractureGroups = new WeakMap<object, { body: Uint8Array; groups: Set<number>[] }>();

/** A runtime LOD of the generated rock, with its six extrema locked. Collapse
 * existing edges only: no vertex displacement, skirts or added fracture caps. */
export function budgetMountainRock(geometry: any, target: number): any {
  target = Math.max(8, Math.floor(target / 2) * 2);
  if (geometry.indices.length <= target * 3) return geometry;
  let cache = reduced.get(geometry);
  if (!cache) reduced.set(geometry, (cache = new Map()));
  if (cache.has(target)) return cache.get(target);
  const positions = new Float32Array(geometry.positions),
    normals = new Float32Array(geometry.normals),
    locks = new Uint8Array(positions.length / 3);
  for (let d = 0; d < 3; d++) {
    let low = 0,
      high = 0;
    for (let i = 0; i < locks.length; i++) {
      if (positions[i * 3 + d] < positions[low * 3 + d]) low = i;
      if (positions[i * 3 + d] > positions[high * 3 + d]) high = i;
    }
    locks[low] = locks[high] = 1;
  }
  lockMajorFractures(geometry, locks, target);
  const [sourceIndices, error] = MeshoptSimplifier.simplifyWithAttributes(
    new Uint32Array(geometry.indices),
    positions,
    3,
    normals,
    3,
    geometry.surface ? [0.12, 0.12, 0.12] : [0.01, 0.01, 0.01],
    locks,
    target * 3,
    1
  );
  if (sourceIndices.length > target * 3)
    throw new Error(`Mountain LOD cannot meet ${target} triangles while retaining its extrema`);
  const remap = new Map<number, number>(),
    sourceIds: number[] = [],
    indices: number[] = [];
  for (const id of sourceIndices) {
    if (!remap.has(id)) {
      remap.set(id, sourceIds.length);
      sourceIds.push(id);
    }
    indices.push(remap.get(id)!);
  }
  const copy = (values: ArrayLike<number>) =>
    sourceIds.flatMap((id) => [values[id * 3], values[id * 3 + 1], values[id * 3 + 2]]);
  const compact = copy(geometry.positions),
    frame = geometry.surface?.normalizedFrame;
  // Retained planes keep their original tags. A collapsed face inside one
  // fracture gets its new geometric plane, not the deleted high-resolution one.
  const planes = [...(geometry.surface?.cutPlanes ?? [])];
  const normalized = frame
    ? sourceIds.map((id) => [
        (geometry.positions[id * 3] - frame.center[0]) / frame.radius[0],
        (geometry.positions[id * 3 + 1] - frame.minimum) / frame.height,
        (geometry.positions[id * 3 + 2] - frame.center[1]) / frame.radius[1]
      ])
    : [];
  const sourceGroups = cutGroups(geometry).groups;
  const membership = frame
    ? sourceIds.map((id) => {
        const p = geometry.positions,
          q = [
            (p[id * 3] - frame.center[0]) / frame.radius[0],
            (p[id * 3 + 1] - frame.minimum) / frame.height,
            (p[id * 3 + 2] - frame.center[1]) / frame.radius[1]
          ];
        return new Set<number>(
          planes
            .filter(
              (plane: any) =>
                Math.abs(plane.n.reduce((sum: number, v: number, d: number) => sum + v * q[d], 0) - plane.w) < 0.00002
            )
            .map((plane: any) => plane.tag)
        );
      })
    : [];
  const faceTags: number[] = [];
  let nextTag = Math.max(0, ...planes.map((p: any) => p.tag)) + 1;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3);
    let tag = membership[a]
      ? ([...membership[a]].find((tag) => membership[b].has(tag) && membership[c].has(tag)) ?? 0)
      : 0;
    const group = frame
      ? [...sourceGroups[sourceIds[a]]].find(
          (g) => sourceGroups[sourceIds[b]].has(g) && sourceGroups[sourceIds[c]].has(g)
        )
      : undefined;
    if (!tag && group !== undefined) {
      const p = normalized[a],
        q = normalized[b],
        r = normalized[c],
        u = q.map((v, d) => v - p[d]),
        v = r.map((v, d) => v - p[d]),
        n = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]],
        length = Math.hypot(...n);
      if (length > 1e-10) {
        for (let d = 0; d < 3; d++) n[d] /= length;
        tag = nextTag++;
        planes.push({ n, w: n.reduce((sum, v, d) => sum + v * p[d], 0), tag, kind: "joint", fractureIndex: group });
      }
    }
    faceTags.push(tag);
  }
  const result = {
    ...geometry,
    positions: compact,
    indices,
    normals: copy(geometry.normals),
    ...(geometry.bodyNormals ? { bodyNormals: copy(geometry.bodyNormals) } : {}),
    ...(geometry.rockDetail ? { rockDetail: copy(geometry.rockDetail) } : {}),
    ...(geometry.faceTags ? { faceTags } : {}),
    ...(geometry.surface ? { surface: { ...geometry.surface, cutPlanes: planes } } : {}),
    stats: {
      ...geometry.stats,
      triangles: indices.length / 3,
      rawTriangles: geometry.indices.length / 3,
      budgetMet: true,
      targetTriangles: target,
      simplificationMethod: "formation-budget",
      lodError: error
    }
  };
  cache.set(target, result);
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  return result;
}

/** Allocate even triangle counts across ALL placed masses, weighted by their
 * placed surface area. Every support remains present; the total is a hard cap. */
export function mountainMassBudgets(rocks: any[], geometries: Record<string, any>, budget: number): number[] {
  const weights = rocks.map((rock) => {
    const g = geometries[rock.mesh],
      x = (g.bounds[1][0] - g.bounds[0][0]) * rock.scale * (rock.longitudinalScale ?? 1),
      y = (g.bounds[1][1] - g.bounds[0][1]) * rock.scale * (rock.verticalScale ?? 1),
      z = (g.bounds[1][2] - g.bounds[0][2]) * rock.scale * (rock.lateralScale ?? 1);
    return x * y + x * z + y * z;
  });
  return allocateMountainTriangles(weights, budget, 16);
}

export function allocateMountainTriangles(weights: number[], budget: number, minimumTriangles = 8): number[] {
  if (!Number.isInteger(budget) || budget < 8 || !weights.length || weights.some((w) => !Number.isFinite(w) || w <= 0))
    throw new RangeError("Mountain triangle budget and positive allocation weights must be finite");
  const total = Math.floor(budget / 2),
    minimum = Math.max(Math.ceil(minimumTriangles / 2), Math.min(12, Math.floor(total / (weights.length * 2))));
  if (minimum * weights.length > total)
    throw new RangeError("Mountain triangle budget is too small for its supporting masses");
  const sum = weights.reduce((a, b) => a + b, 0),
    remaining = total - minimum * weights.length;
  const shares = weights.map((weight) => (remaining * weight) / sum),
    result = shares.map((share) => minimum + Math.floor(share));
  const order = shares
    .map((share, index) => ({ index, fraction: share % 1 }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const spare = total - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < spare; i++) result[order[i].index]++;
  return result.map((count) => count * 2);
}

/** Keep the floor and both lips of the largest joints. Otherwise a low-poly
 * collapse can legally bridge a groove, spending its triangles on the outer
 * hull and erasing the entire effect of carving. Smaller cuts may disappear. */
function lockMajorFractures(geometry: any, locks: Uint8Array, target: number) {
  if (target < 24) return;
  const frame = geometry.surface?.normalizedFrame,
    paths = geometry.surface?.fracturePaths;
  if (!frame || !paths?.length) return;
  const points = Array.from({ length: locks.length }, (_, id) => [
    (geometry.positions[id * 3] - frame.center[0]) / frame.radius[0],
    (geometry.positions[id * 3 + 1] - frame.minimum) / frame.height,
    (geometry.positions[id * 3 + 2] - frame.center[1]) / frame.radius[1]
  ]);
  const { body, groups } = cutGroups(geometry);
  const order = paths
    .map((path: any, index: number) => ({
      path,
      index,
      depth: Math.max(...path.sections.slice(1, -1).map((s: any) => 1 - s.tip))
    }))
    .sort((a: any, b: any) => b.depth - a.depth || a.index - b.index);
  for (const { path, index } of order.slice(0, target >= 128 ? 3 : target >= 64 ? 2 : 1)) {
    const section = path.sections[Math.floor(path.sections.length / 2)],
      n = path.n,
      tangent = [-n[1], n[0]];
    const tip = [
      n[0] * section.tip + tangent[0] * section.center,
      section.y,
      n[1] * section.tip + tangent[1] * section.center
    ];
    let nearest = -1,
      distance = Infinity;
    for (let id = 0; id < points.length; id++) {
      if (!groups[id].has(index)) continue;
      const p = points[id],
        d = Math.hypot(p[0] - tip[0], p[1] - tip[1], p[2] - tip[2]);
      if (d < distance) {
        nearest = id;
        distance = d;
      }
    }
    if (nearest < 0) continue;
    locks[nearest] = 1;
    for (const sign of [-1, 1]) {
      let lip = -1,
        score = Infinity;
      for (let id = 0; id < points.length; id++) {
        if (!body[id] || !groups[id].has(index)) continue;
        const p = points[id],
          side = (p[0] * tangent[0] + p[2] * tangent[1] - section.center) * sign;
        if (side <= 0) continue;
        const d = Math.abs(p[1] - section.y) + Math.abs(side - 0.18) * 0.2;
        if (d < score) {
          lip = id;
          score = d;
        }
      }
      if (lip >= 0) locks[lip] = 1;
    }
  }
}

function cutGroups(geometry: any) {
  let result = fractureGroups.get(geometry);
  if (result) return result;
  const body = new Uint8Array(geometry.positions.length / 3),
    groups = Array.from(body, () => new Set<number>());
  const tags = new Map<number, number>();
  let first = 1;
  geometry.surface?.fracturePaths?.forEach((path: any, index: number) => {
    const count = 3 * (path.sections.length - 1) + 2;
    for (let tag = first; tag < first + count; tag++) tags.set(tag, index);
    first += count;
  });
  for (const p of geometry.surface?.cutPlanes ?? [])
    if (p.fractureIndex !== undefined) tags.set(p.tag, p.fractureIndex);
  for (let t = 0; t < geometry.indices.length; t += 3) {
    const tag = geometry.faceTags?.[t / 3] ?? 0;
    for (let c = 0; c < 3; c++) {
      const id = geometry.indices[t + c];
      if (tag <= 0) body[id] = 1;
      else if (tags.has(tag)) groups[id].add(tags.get(tag)!);
    }
  }
  result = { body, groups };
  fractureGroups.set(geometry, result);
  return result;
}
