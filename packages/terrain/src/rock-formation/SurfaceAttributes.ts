import type { RockFormationMesh } from "./types";
import { sharedRockTransitionCoverage } from "./TransitionCoverage";

/** Render-only corner expansion. The indexed canonical mesh also owns collision. */
export function rockSurfaceAttributes(formation: RockFormationMesh) {
  const source = formation.mesh,
    painted = formation.painted,
    surfaces = formation.triangleSurfaces,
    vertices = source.positions.length / 3,
    triangles = source.indices.length / 3;
  if (surfaces && (surfaces.length !== triangles || !surfaces.every((surface) => surface === 0 || surface === 1)))
    throw Error("Invalid rock triangle surfaces");
  if (surfaces?.some((surface) => surface === 1) && !painted) throw Error("Missing painted rock attributes");
  if (painted) {
    for (const [key, length] of [
      ["coverage", vertices],
      ["cavity", vertices],
      ["guideNormals", vertices * 3],
      ["faceNormals", triangles * 3],
      ["neighborNormals", triangles * 9],
      ["smoothNormals", triangles * 9],
      ["edgeAltitudes", triangles * 3],
      ["cells", triangles * 2]
    ] as const)
      if (painted[key].length !== length || !painted[key].every(Number.isFinite))
        throw Error(`Invalid painted rock ${key}`);
    if (!Number.isFinite(painted.cellScale) || painted.cellScale <= 0) throw Error("Invalid painted rock cell scale");
  }
  const ids = [...new Set(formation.owners)],
    idIndex = new Map(ids.map((id, i) => [id, i]));
  const stride = painted ? 31 : 10,
    data = new Float32Array(source.indices.length * stride);
  const bisectors = new Float32Array(9);
  const continuousCoverage = sharedRockTransitionCoverage(formation);
  const order: number[] = [];
  if (surfaces) {
    for (const surface of [0, 1])
      for (let triangle = 0; triangle < triangles; triangle++) if (surfaces[triangle] === surface) order.push(triangle);
  } else for (let triangle = 0; triangle < triangles; triangle++) order.push(triangle);
  const ranges: { start: number; count: number; painted: boolean }[] = [];
  for (let i = 0; i < source.indices.length; i++) {
    const t = order[Math.floor(i / 3)],
      curved = surfaces ? surfaces[t] === 1 : !!painted,
      vertex = source.indices[t * 3 + (i % 3)],
      v = vertex * 3,
      p = i * stride;
    if (i % 3 === 0) {
      const range = ranges[ranges.length - 1];
      if (range?.painted === curved) range.count += 3;
      else ranges.push({ start: i, count: 3, painted: curved });
      if (curved && painted)
        for (let edge = 0; edge < 3; edge++) {
          // Both incident faces must agree on the normal at their shared edge.
          let x = painted.faceNormals[t * 3] + painted.neighborNormals[t * 9 + edge * 3];
          let y = painted.faceNormals[t * 3 + 1] + painted.neighborNormals[t * 9 + edge * 3 + 1];
          let z = painted.faceNormals[t * 3 + 2] + painted.neighborNormals[t * 9 + edge * 3 + 2];
          let length = Math.hypot(x, y, z);
          if (length < 1e-8) {
            x = 0;
            y = 1;
            z = 0;
            length = 1;
          }
          bisectors.set([x / length, y / length, z / length], edge * 3);
        }
    }
    data.set(source.positions.subarray(v, v + 3), p);
    data[p + 8] = idIndex.get(formation.owners[t])!;
    data[p + 9] = curved ? continuousCoverage[vertex] : (formation.grass?.coverage[t * 3 + (i % 3)] ?? 0);
    if (curved && painted) {
      const coverage = painted.coverage[vertex];
      for (let axis = 0; axis < 3; axis++)
        data[p + 3 + axis] =
          painted.guideNormals[v + axis] * (1 - coverage) + painted.faceNormals[t * 3 + axis] * coverage;
      data[p + 6] = coverage;
      data[p + 7] = painted.cavity[vertex];
      data[p + 10 + (i % 3)] = 1;
      data[p + 13] = painted.cells[t * 2 + 1];
      for (let edge = 0; edge < 3; edge++) {
        data.set(bisectors.subarray(edge * 3, edge * 3 + 3), p + 14 + edge * 4);
        data[p + 17 + edge * 4] = painted.edgeAltitudes[t * 3 + edge];
      }
      data[p + 26] = painted.cellScale;
      data[p + 27] = painted.cells[t * 2];
      const corner = (t * 3 + (i % 3)) * 3;
      data.set(painted.smoothNormals.subarray(corner, corner + 3), p + 28);
    } else {
      data.set(source.normals!.subarray(v, v + 3), p + 3);
      data[p + 6] = source.positions[v] / 8;
      data[p + 7] = source.positions[v + 2] / 8;
    }
  }
  return { data, ids, stride, painted: !!painted, ranges };
}
