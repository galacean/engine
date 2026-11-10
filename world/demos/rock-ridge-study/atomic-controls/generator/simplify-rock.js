import { enforceMetricAngles } from "./loft-rock.js";
import { MeshoptSimplifier } from "./vendor/meshopt_simplifier.js";

export const simplifierReady = MeshoptSimplifier.ready;

/**
 * Reduces a closed rock after its shape solve, preserving sampled shading normals,
 * roof identity and all six geometric extrema. Local angle repairs may move a
 * vertex by at most 0.8% of each OBB axis. Input buffers are never mutated.
 * @param {ReturnType<import("./rock-body.js").buildRock>} mesh Shared-index rock geometry and generation metadata.
 * @param {{ enabled?: boolean, error?: number, targetTriangles?: number }} options Optional triangle ceiling; zero uses only the requested error limit.
 * Budget mode measures geometry in OBB-normalized space so thin axes remain protected.
 * @returns Compact mesh, or the original surface if no safe reduction is found.
 * The error is meshoptimizer's estimate, not a guaranteed Hausdorff distance.
 */
export function simplifyRock(mesh, { enabled = true, error = 0.008, targetTriangles = 0 } = {}) {
  const start = performance.now();
  const rawTriangles = mesh.indices.length / 3;
  const rawBytes = bufferBytes(mesh);
  const budget = Number.isFinite(targetTriangles) ? Math.max(0, Math.floor(targetTriangles / 2) * 2) : 0;
  const requestedError = Number.isFinite(error) ? Math.max(0.0001, Math.min(0.01, error)) : 0.008;
  if (!enabled)
    return {
      ...mesh,
      stats: {
        ...mesh.stats,
        rawTriangles,
        targetTriangles: budget,
        budgetMet: rawTriangles <= budget,
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
  const weights = new Array(stride).fill(budget ? 0.03 : 0.5);
  if (budget && mesh.surfaceRoles) weights[3] = 0.05;
  // A longest-axis-only metric can erase the width of a tall, thin rock.
  const metricPositions = budget ? normalizedPositions(mesh.positions) : mesh.positions;
  let indices = mesh.indices,
    measured = null,
    reportedError = 0,
    acceptedError = 0,
    attempts = 0;
  let repairedEdges = 0,
    repairedPositions = mesh.positions,
    angleAdjustments = 0;
  const extremaLocks = locks.slice();
  // First ask what the error tolerance needs, not how to spend every triangle.
  // At most five solves; no ten-retry budget chase or tolerance doubling loop.
  for (let attempt = 0; attempt < 5; attempt++) {
    const limit = attempt === 0 ? requestedError : budget ? Math.min(0.024, requestedError * 3) : requestedError / 2;
    attempts++;
    let [candidate, estimate] = MeshoptSimplifier.simplifyWithAttributes(
      mesh.indices,
      metricPositions,
      3,
      attributes,
      stride,
      weights,
      locks,
      attempt === 0 || !budget ? 36 : Math.min(mesh.indices.length, Math.max(12, budget) * 3),
      limit,
      attempt < 3 ? ["RegularizeLight"] : []
    );
    let audit = inspectSurface(mesh.positions, candidate);
    let flips = 0;
    if (audit.valid && audit.sharpEdges) {
      const repaired = repairTurns(mesh.positions, metricPositions, candidate, audit);
      candidate = repaired.indices;
      audit = repaired.audit;
      flips = repaired.flips;
    }
    let candidatePositions = mesh.positions,
      corrections = 0;
    if (budget && audit.valid && audit.sharpEdges) {
      candidatePositions = mesh.positions.slice();
      const limits = mesh.envelopeBounds[1];
      const repair = enforceMetricAngles(candidatePositions, candidate, limits, {
        locks: extremaLocks,
        maxOffsets: limits.map((half) => half * 0.016),
        bounds: mesh.bounds,
        maxAdjustments: 512
      });
      corrections = repair.adjustments;
      audit = inspectSurface(candidatePositions, candidate);
    }
    if (audit.valid && !audit.sharpEdges) {
      if (!measured || candidate.length < indices.length) {
        indices = candidate;
        measured = audit;
        reportedError = estimate;
        acceptedError = limit;
        repairedEdges = flips;
        repairedPositions = candidatePositions;
        angleAdjustments = corrections;
      }
      if (!budget || candidate.length / 3 <= budget) break;
    }
    if (audit.valid && audit.sharpEdges) {
      // Only protect the affected patch. A safe result may exceed the requested
      // ceiling rather than erase a silhouette or enter an unbounded retry loop.
      for (let i = 0; i < mesh.indices.length; i += 3) {
        if ([0, 1, 2].some((j) => audit.badVertices.has(mesh.indices[i + j])))
          for (let j = 0; j < 3; j++) locks[mesh.indices[i + j]] = 1;
      }
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
      positions.set(repairedPositions.subarray(source * 3, source * 3 + 3), destination * 3);
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
      targetTriangles: budget,
      budgetMet: budget > 0 && triangles <= budget,
      repairedEdges,
      angleAdjustments,
      vertices: result.positions.length / 3,
      rawBytes,
      meshBytes: bufferBytes(result),
      reduction: 1 - triangles / rawTriangles,
      requestedError,
      acceptedError,
      error: reportedError,
      // Meshoptimizer estimates collapse error only; edge and bounded position
      // repairs are validated separately by the silhouette regression suite.
      errorEstimateMeters: reportedError * MeshoptSimplifier.getScale(mesh.positions, 3),
      errorMetric: budget ? "obb-normalized" : "longest-extent",
      maxFaceTurn: measured?.maxFaceTurn ?? mesh.stats.maxFaceTurn,
      sharpEdges: measured?.sharpEdges ?? mesh.stats.sharpEdges,
      simplificationMethod: retainedRaw
        ? "original-safety-fallback"
        : budget
          ? "error-first-bounded"
          : "attribute-aware",
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
  const badVertices = new Set();
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
      const edge = edges.get(key) || { faces: [], winding: 0, from, to, opposite: vertices[(j + 2) % 3] };
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
    if (angle > 90.1) {
      sharpEdges++;
      for (const face of edge.faces) for (let j = 0; j < 3; j++) badVertices.add(indices[face * 3 + j]);
    }
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
  return { valid: true, maxFaceTurn, sharpEdges, badVertices, edges, normals };
}

function normalizedPositions(positions) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  return Float32Array.from(positions, (value, i) => (value - min[i % 3]) / Math.max(1e-12, max[i % 3] - min[i % 3]));
}

// Reconnect a few non-planar quads instead of retaining an entire dense mesh.
// Vertices, normals, roof identity and extrema stay fixed. Every flip must lower
// the local hinge penalty; an unresolved patch is protected in the next collapse.
function repairTurns(positions, metricPositions, source, initial) {
  const indices = source.slice(),
    count = positions.length / 3;
  let audit = initial,
    flips = 0;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const penalty = (a, b) => Math.max(0, (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI - 89.5) ** 2;
  const normal = (a, b, c) => {
    const ux = positions[b * 3] - positions[a * 3],
      uy = positions[b * 3 + 1] - positions[a * 3 + 1],
      uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const vx = positions[c * 3] - positions[a * 3],
      vy = positions[c * 3 + 1] - positions[a * 3 + 1],
      vz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx],
      length = Math.hypot(...n);
    return length > 1e-15 ? n.map((value) => value / length) : null;
  };
  for (; flips < 32 && audit.valid && audit.sharpEdges; flips++) {
    let best = null,
      bestDelta = -1e-6;
    const key = (a, b) => Math.min(a, b) * count + Math.max(a, b);
    for (const edge of audit.edges.values()) {
      const [f, g] = edge.faces,
        { from: a, to: b, opposite: c } = edge;
      const d = [indices[g * 3], indices[g * 3 + 1], indices[g * 3 + 2]].find((v) => v !== a && v !== b);
      if (![a, b, c, d].some((v) => audit.badVertices.has(v)) || audit.edges.has(key(c, d))) continue;
      const nf = normal(c, d, b),
        ng = normal(d, c, a);
      const average = audit.normals[f].map((n, i) => n + audit.normals[g][i]);
      if (
        !nf ||
        !ng ||
        dot(nf, average) <= 1e-6 * Math.hypot(...average) ||
        dot(ng, average) <= 1e-6 * Math.hypot(...average)
      )
        continue;
      if (flipDeviation(positions, metricPositions, a, b, c, d, average) > 0.008) continue;
      let delta = penalty(nf, ng) - penalty(audit.normals[f], audit.normals[g]);
      for (const [u, v, face, nextNormal] of [
        [b, c, f, nf],
        [c, a, f, ng],
        [a, d, g, ng],
        [d, b, g, nf]
      ]) {
        const boundary = audit.edges.get(key(u, v));
        const other = boundary.faces.find((index) => index !== face);
        delta += penalty(nextNormal, audit.normals[other]) - penalty(audit.normals[face], audit.normals[other]);
      }
      if (delta < bestDelta) {
        bestDelta = delta;
        best = { f, g, a, b, c, d };
      }
    }
    if (!best) break;
    const { f, g, a, b, c, d } = best;
    // Update the two faces locally. Rebuilding every vertex fan after each
    // diagonal flip made a tiny repair more expensive than the simplification.
    for (const face of [f, g]) {
      for (let j = 0; j < 3; j++) {
        const edgeKey = key(indices[face * 3 + j], indices[face * 3 + ((j + 1) % 3)]);
        const edge = audit.edges.get(edgeKey);
        edge.faces.splice(edge.faces.indexOf(face), 1);
        if (!edge.faces.length) audit.edges.delete(edgeKey);
        else {
          const other = edge.faces[0],
            vertices = indices.subarray(other * 3, other * 3 + 3);
          for (let k = 0; k < 3; k++)
            if (key(vertices[k], vertices[(k + 1) % 3]) === edgeKey) {
              edge.from = vertices[k];
              edge.to = vertices[(k + 1) % 3];
              edge.opposite = vertices[(k + 2) % 3];
            }
        }
      }
    }
    indices.set([c, d, b], f * 3);
    indices.set([d, c, a], g * 3);
    for (const face of [f, g]) {
      const vertices = indices.subarray(face * 3, face * 3 + 3);
      audit.normals[face] = normal(...vertices);
      for (let j = 0; j < 3; j++) {
        const from = vertices[j],
          to = vertices[(j + 1) % 3],
          edgeKey = key(from, to);
        let edge = audit.edges.get(edgeKey);
        if (!edge) {
          edge = { from, to, opposite: vertices[(j + 2) % 3], faces: [] };
          audit.edges.set(edgeKey, edge);
        }
        edge.faces.push(face);
      }
    }
    audit.sharpEdges = 0;
    audit.badVertices.clear();
    for (const edge of audit.edges.values()) {
      if (dot(audit.normals[edge.faces[0]], audit.normals[edge.faces[1]]) < Math.cos((90.1 * Math.PI) / 180)) {
        audit.sharpEdges++;
        for (const face of edge.faces) for (let j = 0; j < 3; j++) audit.badVertices.add(indices[face * 3 + j]);
      }
    }
  }
  return { indices, audit: flips ? inspectSurface(positions, indices) : audit, flips };
}

// In the common convex projection, the difference between the two piecewise
// linear surfaces peaks where their diagonals cross. This bounds the distance
// introduced by a flip, including in the narrow axes of a tall or thin rock.
function flipDeviation(positions, metric, a, b, c, d, normal) {
  const vector = (from, to) => [0, 1, 2].map((axis) => positions[to * 3 + axis] - positions[from * 3 + axis]);
  const crossDot = (u, v) =>
    (u[1] * v[2] - u[2] * v[1]) * normal[0] +
    (u[2] * v[0] - u[0] * v[2]) * normal[1] +
    (u[0] * v[1] - u[1] * v[0]) * normal[2];
  const ab = vector(a, b),
    cd = vector(c, d),
    ac = vector(a, c),
    denominator = crossDot(ab, cd);
  if (Math.abs(denominator) < 1e-6 * Math.hypot(...ab) * Math.hypot(...cd) * Math.hypot(...normal)) return Infinity;
  const t = crossDot(ac, cd) / denominator,
    u = crossDot(ac, ab) / denominator;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return Infinity;
  return Math.hypot(
    ...[0, 1, 2].map(
      (axis) =>
        metric[a * 3 + axis] * (1 - t) +
        metric[b * 3 + axis] * t -
        metric[c * 3 + axis] * (1 - u) -
        metric[d * 3 + axis] * u
    )
  );
}
