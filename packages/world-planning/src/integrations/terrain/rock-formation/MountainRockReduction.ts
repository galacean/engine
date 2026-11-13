import { MeshoptSimplifier } from "@galacean/engine-terrain/rock-formation/generator/vendor/meshopt_simplifier.js";
import { creasedRockAttributes } from "@galacean/engine-terrain/rock-ridge/features/shaping/rock-surface.mjs";

/** Preserve source/cut seams during reduction, then weld the physics surface.
 * The simplifier may remove vertices, but cannot move them or smooth a cut into
 * the rounded body. Positive tags identify individual planar cutter walls. */
export function reduceMountainRock(geometry: any, budget: number) {
  const render = creasedRockAttributes(geometry);
  const split = new Map<string, number>();
  const positions: number[] = [],
    normals: number[] = [],
    sourceIds: number[] = [],
    groups: number[] = [];
  const splitIndices = Uint32Array.from(geometry.indices, (old: number, corner: number) => {
    const group = Math.max(0, geometry.faceTags?.[Math.floor(corner / 3)] ?? 0);
    const key = `${old}:${group}`;
    if (!split.has(key)) {
      split.set(key, sourceIds.length);
      sourceIds.push(old);
      groups.push(group);
      positions.push(...geometry.positions.slice(old * 3, old * 3 + 3));
      normals.push(...render.normals.slice(corner * 3, corner * 3 + 3));
    }
    return split.get(key)!;
  });
  const [reduced] = MeshoptSimplifier.simplifyWithAttributes(
    splitIndices,
    new Float32Array(positions),
    3,
    new Float32Array(normals),
    3,
    [0.01, 0.01, 0.01],
    null,
    Math.min(splitIndices.length, budget * 3),
    0.0005
  );
  // Edge collapses can leave an opposite triangle pair attached along a seam.
  // It encloses no volume; cancel both sides before welding/compacting so the
  // canonical physics surface remains manifold and has no dangling vertices.
  const triangles = new Map<string, { ids: number[]; winding: number }>();
  for (let i = 0; i < reduced.length; i += 3) {
    const ids = Array.from(reduced.slice(i, i + 3));
    const source = ids.map((id) => sourceIds[id]);
    const key = [...source].sort((a, b) => a - b).join(":");
    const winding = (Number(source[0] > source[1]) + Number(source[0] > source[2]) + Number(source[1] > source[2])) % 2;
    const previous = triangles.get(key);
    if (previous && previous.winding !== winding) triangles.delete(key);
    else triangles.set(key, { ids, winding });
  }
  const welded = new Map<string, number>();
  const compactPositions: number[] = [],
    compactNormals: number[] = [],
    bodyNormals: number[] = [],
    rockDetail: number[] = [],
    faceTags: number[] = [];
  const indices = [...triangles.values()]
    .flatMap((triangle) => triangle.ids)
    .map((id, corner) => {
      const old = sourceIds[id];
      const position = geometry.positions.slice(old * 3, old * 3 + 3).map(Math.fround);
      const key = position.join(":");
      if (corner % 3 === 0) faceTags.push(groups[id]);
      if (!welded.has(key)) {
        welded.set(key, welded.size);
        compactPositions.push(...position);
        compactNormals.push(...geometry.normals.slice(old * 3, old * 3 + 3));
        bodyNormals.push(...(geometry.bodyNormals ?? geometry.normals).slice(old * 3, old * 3 + 3));
        rockDetail.push(...(geometry.rockDetail?.slice(old * 3, old * 3 + 3) ?? [0, 0.51, 0]));
      }
      return welded.get(key)!;
    });
  return {
    ...geometry,
    positions: compactPositions,
    normals: compactNormals,
    bodyNormals,
    indices,
    faceTags,
    rockDetail,
    stats: { ...geometry.stats, rawTriangles: geometry.indices.length / 3, triangles: indices.length / 3 }
  };
}
