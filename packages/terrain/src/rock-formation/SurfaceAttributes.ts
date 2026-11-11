import type { RockFormationMesh } from "./types";

/** Render-only corner expansion carries owner picking IDs and native grass coverage.
 * The indexed canonical mesh remains the collision and placement source. */
export function rockSurfaceAttributes(formation: RockFormationMesh) {
  const source = formation.mesh,
    ids = [...new Set(formation.owners)],
    idIndex = new Map(ids.map((id, i) => [id, i])),
    stride = 10;
  const data = new Float32Array(source.indices.length * stride);
  for (let i = 0; i < source.indices.length; i++) {
    const vertex = source.indices[i],
      v = vertex * 3,
      p = i * stride;
    data.set(source.positions.subarray(v, v + 3), p);
    data.set(source.normals!.subarray(v, v + 3), p + 3);
    data[p + 6] = source.positions[v] / 8;
    data[p + 7] = source.positions[v + 2] / 8;
    data[p + 8] = idIndex.get(formation.owners[Math.floor(i / 3)])!;
    data[p + 9] = formation.grass?.coverage[i] ?? 0;
  }
  return { data, ids, stride };
}
