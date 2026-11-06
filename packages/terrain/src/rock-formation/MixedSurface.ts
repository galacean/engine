/** Repair only failures introduced while pinning a mixed deformation boundary.
 * Curvature can intentionally turn beyond its guide; faces already outside the
 * candidate's orientation/area guard are not newly constrained here.
 */
export function repairMixedSurfaceSeams(
  rest: Float32Array,
  output: Float32Array,
  indices: Uint32Array,
  active: Float32Array,
  faceSurfaces: Uint8Array,
  vertexSurfaces: Uint8Array,
  slabPositions: Float32Array,
  curvaturePositions: Float32Array
): void {
  const count = rest.length / 3,
    faces = indices.length / 3;
  const original = new Float64Array(indices.length),
    lengths = new Float64Array(faces);
  const eligible = new Uint8Array(faces),
    queued = new Uint8Array(faces),
    queue: number[] = [];
  const vector = (positions: Float32Array, t: number): [number, number, number] => {
    const a = indices[t * 3] * 3,
      b = indices[t * 3 + 1] * 3,
      c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  const valid = (positions: Float32Array, t: number): boolean => {
    const next = vector(positions, t),
      length = Math.hypot(...next),
      k = t * 3;
    const dot = next[0] * original[k] + next[1] * original[k + 1] + next[2] * original[k + 2];
    return length > lengths[t] * 0.02 && dot > length * lengths[t] * 0.015;
  };
  for (let t = 0; t < faces; t++) {
    if (!active[t]) continue;
    const normal = vector(rest, t),
      before = Math.hypot(...normal);
    if (before < 1e-9) continue;
    original.set(normal, t * 3);
    lengths[t] = before;
    if (!valid(faceSurfaces[t] ? curvaturePositions : slabPositions, t)) continue;
    eligible[t] = 1;
    const seam = [0, 1, 2].some((j) => vertexSurfaces[indices[t * 3 + j]] === 3);
    if (seam && !valid(output, t)) {
      queue.push(t);
      queued[t] = 1;
    }
  }
  if (!queue.length) return;

  const source = output.slice(),
    attempts = new Uint8Array(count);
  const adjacent: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < faces; t++) if (eligible[t]) for (let j = 0; j < 3; j++) adjacent[indices[t * 3 + j]].push(t);
  while (queue.length) {
    const t = queue.pop()!;
    queued[t] = 0;
    if (valid(output, t)) continue;
    for (let j = 0; j < 3; j++) {
      const v = indices[t * 3 + j],
        k = v * 3;
      if (
        vertexSurfaces[v] === 3 ||
        attempts[v] === 15 ||
        (output[k] === rest[k] && output[k + 1] === rest[k + 1] && output[k + 2] === rest[k + 2])
      )
        continue;
      // Fourteen bounded halvings, then an exact restore. Each vertex changes
      // at most fifteen times, so neighbor propagation always terminates.
      const alpha = ++attempts[v] === 15 ? 0 : 2 ** -attempts[v];
      for (let axis = 0; axis < 3; axis++)
        output[k + axis] = alpha ? rest[k + axis] + (source[k + axis] - rest[k + axis]) * alpha : rest[k + axis];
      for (const neighbor of adjacent[v])
        if (!queued[neighbor]) {
          queued[neighbor] = 1;
          queue.push(neighbor);
        }
    }
  }
}
