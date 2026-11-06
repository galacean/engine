import { MeshoptSimplifier } from "./vendor/meshopt_simplifier.js";

export const simplifierReady = MeshoptSimplifier.ready;

/**
 * Reduces a closed rock after its shape solve, preserving sampled shading normals,
 * roof identity and all six geometric extrema. Input buffers are never mutated.
 * @param {ReturnType<import("./rock-body.js").buildRock>} mesh Shared-index rock geometry and generation metadata.
 * @param {{ enabled?: boolean, error?: number }} options Reduction settings; error is relative to mesh longest extent.
 * @returns Compact mesh, or the original surface if no safe reduction is found.
 * The error is meshoptimizer's estimate, not a guaranteed Hausdorff distance.
 */
export function simplifyRock(mesh, { enabled = true, error = 0.004 } = {}) {
  const start = performance.now();
  const rawTriangles = mesh.indices.length / 3;
  const rawBytes = bufferBytes(mesh);
  const requestedError = Number.isFinite(error) ? Math.max(0.0001, Math.min(0.01, error)) : 0.004;
  if (!enabled)
    return {
      ...mesh,
      stats: {
        ...mesh.stats,
        rawTriangles,
        rawBytes,
        meshBytes: rawBytes,
        reduction: 0,
        requestedError,
        acceptedError: 0,
        error: 0,
        errorEstimateMeters: 0,
        simplifyMs: 0,
        attempts: 0,
        simplificationMethod: "disabled",
        retainedRaw: true
      }
    };

  const count = mesh.positions.length / 3;
  const stride = mesh.surfaceRoles ? 4 : 3;
  const attributes = new Float32Array(count * stride),
    locks = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    attributes.set(mesh.normals.subarray(i * 3, i * 3 + 3), i * stride);
    if (mesh.surfaceRoles) attributes[i * stride + 3] = mesh.surfaceRoles[i];
  }
  // Fix only extrema, not every vertex on a flat cap. This also fixes the bottom
  // apex and grounding height without retaining thousands of coplanar triangles.
  for (let axis = 0; axis < 3; axis++) {
    let min = 0,
      max = 0;
    for (let i = 1; i < count; i++) {
      if (mesh.positions[i * 3 + axis] < mesh.positions[min * 3 + axis]) min = i;
      if (mesh.positions[i * 3 + axis] > mesh.positions[max * 3 + axis]) max = i;
    }
    locks[min] = locks[max] = 1;
  }
  const weights = new Array(stride).fill(0.5);
  let indices = mesh.indices,
    measured = null,
    reportedError = 0,
    acceptedError = 0,
    attempts = 0;
  // A smaller error is not itself proof of good topology. Validate every result;
  // never repair it by moving the accepted shape or silently allowing sharp hinges.
  for (let level = 0; level < 7 && !measured; level++) {
    const limit = requestedError / 2 ** level;
    for (const flags of [["RegularizeLight"], []]) {
      attempts++;
      const [candidate, estimate] = MeshoptSimplifier.simplifyWithAttributes(
        mesh.indices,
        mesh.positions,
        3,
        attributes,
        stride,
        weights,
        locks,
        Math.min(mesh.indices.length, 36),
        limit,
        flags
      );
      const audit = inspectSurface(mesh.positions, candidate);
      if (!audit.valid || audit.sharpEdges) continue;
      indices = candidate;
      measured = audit;
      reportedError = estimate;
      acceptedError = limit;
      break;
    }
  }
  const retainedRaw = !measured;
  let result = mesh;
  if (measured) {
    const [remap, vertexCount] = MeshoptSimplifier.compactMesh(indices);
    const positions = new Float32Array(vertexCount * 3),
      normals = new Float32Array(vertexCount * 3);
    const surfaceRoles = mesh.surfaceRoles ? new Float32Array(vertexCount) : undefined;
    for (let source = 0; source < remap.length; source++) {
      const destination = remap[source];
      if (destination === 0xffffffff) continue;
      positions.set(mesh.positions.subarray(source * 3, source * 3 + 3), destination * 3);
      normals.set(mesh.normals.subarray(source * 3, source * 3 + 3), destination * 3);
      if (surfaceRoles) surfaceRoles[destination] = mesh.surfaceRoles[source];
    }
    result = { ...mesh, positions, normals, indices, surfaceRoles };
  }
  const triangles = result.indices.length / 3;
  return {
    ...result,
    stats: {
      ...mesh.stats,
      rawTriangles,
      triangles,
      vertices: result.positions.length / 3,
      rawBytes,
      meshBytes: bufferBytes(result),
      reduction: 1 - triangles / rawTriangles,
      requestedError,
      acceptedError,
      error: reportedError,
      errorEstimateMeters: reportedError * MeshoptSimplifier.getScale(mesh.positions, 3),
      maxFaceTurn: measured?.maxFaceTurn ?? mesh.stats.maxFaceTurn,
      sharpEdges: measured?.sharpEdges ?? mesh.stats.sharpEdges,
      simplificationMethod: retainedRaw ? "original-safety-fallback" : "attribute-aware",
      retainedRaw,
      attempts,
      simplifyMs: performance.now() - start
    }
  };
}

function bufferBytes(mesh) {
  return (
    mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength + (mesh.surfaceRoles?.byteLength || 0)
  );
}

// A connected, consistently oriented, closed sphere with nonzero faces and one
// cyclic fan at every vertex. These checks are independent of shading normals.
function inspectSurface(positions, indices) {
  const vertexCount = positions.length / 3,
    faceCount = indices.length / 3;
  const faces = Array.from({ length: vertexCount }, () => []);
  const neighbors = Array.from({ length: faceCount }, () => []);
  const normals = [],
    edges = new Map();
  let signedVolume = 0,
    maxFaceTurn = 0,
    sharpEdges = 0,
    usedVertices = 0;
  const invalid = { valid: false };
  if (!faceCount) return invalid;
  for (let face = 0; face < faceCount; face++) {
    const vertices = [indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]];
    const [a, b, c] = vertices.map((v) => v * 3);
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const area = Math.hypot(nx, ny, nz);
    if (!(area > 0) || !Number.isFinite(area)) return invalid;
    normals.push([nx / area, ny / area, nz / area]);
    signedVolume += (positions[a] * nx + positions[a + 1] * ny + positions[a + 2] * nz) / 6;
    for (let j = 0; j < 3; j++) {
      const from = vertices[j],
        to = vertices[(j + 1) % 3];
      if (!faces[from].length) usedVertices++;
      faces[from].push(face);
      const key = Math.min(from, to) * vertexCount + Math.max(from, to);
      const edge = edges.get(key) || { faces: [], winding: 0 };
      edge.faces.push(face);
      edge.winding += from < to ? 1 : -1;
      if (edge.faces.length > 2) return invalid;
      edges.set(key, edge);
    }
  }
  for (const edge of edges.values()) {
    if (edge.faces.length !== 2 || edge.winding !== 0) return invalid;
    const [a, b] = edge.faces;
    neighbors[a].push(b);
    neighbors[b].push(a);
    const cosine = normals[a].reduce((sum, n, axis) => sum + n * normals[b][axis], 0);
    const angle = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
    maxFaceTurn = Math.max(maxFaceTurn, angle);
    if (angle > 90.1) sharpEdges++;
  }
  if (!(signedVolume > 0) || usedVertices - edges.size + faceCount !== 2) return invalid;
  const visited = new Set(),
    pending = [0];
  while (pending.length) {
    const face = pending.pop();
    if (visited.has(face)) continue;
    visited.add(face);
    pending.push(...neighbors[face]);
  }
  if (visited.size !== faceCount) return invalid;
  for (const incident of faces) {
    if (!incident.length) continue;
    const remaining = new Set(incident),
      fan = [incident[0]];
    while (fan.length) {
      const face = fan.pop();
      if (!remaining.delete(face)) continue;
      for (const next of neighbors[face]) if (remaining.has(next)) fan.push(next);
    }
    if (remaining.size) return invalid;
  }
  return { valid: true, maxFaceTurn, sharpEdges };
}
