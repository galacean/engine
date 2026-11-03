import type { MeshBuffers } from "./types";

/** Retain face interiors and a shared normal field at their boundaries.
 * All incident faces use the same vertex normals, including at triple joints.
 */
export function cellularCornerShading(
  mesh: MeshBuffers,
  isTop: Uint32Array,
  neighbors: Int32Array,
  cellIds?: Uint32Array,
  random?: Float32Array,
  active?: Float32Array,
  coverage?: Float32Array
): void {
  const { positions: p, indices } = mesh,
    count = indices.length / 3;
  const faceNormals = new Float32Array(count * 3),
    neighborNormals = new Float32Array(count * 9);
  const edgeLengths = new Float32Array(count * 3),
    cells = new Float32Array(count * 3);
  for (let t = 0; t < count; t++) {
    const a = indices[t * 3] * 3,
      b = indices[t * 3 + 1] * 3,
      c = indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx,
      length = Math.hypot(nx, ny, nz);
    faceNormals.set(length > 1e-10 ? [nx / length, ny / length, nz / length] : [0, 1, 0], t * 3);
    const owner = indices[t * 3];
    cells.set([cellIds?.[owner] ?? 0, random?.[owner] ?? 0, active?.[t] ?? 1], t * 3);
  }
  for (let t = 0; t < count; t++)
    for (let edge = 0; edge < 3; edge++) {
      const neighbor = neighbors[t * 3 + edge],
        other = neighbor >= 0 ? neighbor : t;
      neighborNormals.set(faceNormals.subarray(other * 3, other * 3 + 3), t * 9 + edge * 3);
      const a = indices[t * 3 + edge] * 3,
        b = indices[t * 3 + ((edge + 1) % 3)] * 3;
      const length2 = (p[b] - p[a]) ** 2 + (p[b + 1] - p[a + 1]) ** 2 + (p[b + 2] - p[a + 2]) ** 2;
      // Sign encodes the two recovered widths (.20 for cap/cap; .08 otherwise).
      edgeLengths[t * 3 + edge] = (neighbor >= 0 && isTop[t] && isTop[neighbor] ? 1 : -1) * length2;
    }
  mesh.cellularShading = { faceNormals, neighborNormals, edgeLengths, cells };
  Object.assign(mesh.cellularShading, cellularSmoothShading(mesh, coverage));
}

/** Linear-time shading metadata; canonical positions and topology stay intact. */
function cellularSmoothShading(
  mesh: MeshBuffers,
  coverage?: Float32Array
): {
  smoothNormals: Float32Array;
  edgeAltitudes: Float32Array;
} {
  const { positions: p, indices, cellularShading: shading } = mesh;
  const vertexNormals = new Float32Array(p.length),
    edgeAltitudes = new Float32Array(indices.length);
  for (let t = 0; t < indices.length / 3; t++) {
    const a = indices[t * 3] * 3,
      b = indices[t * 3 + 1] * 3,
      c = indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const area2 = Math.hypot(nx, ny, nz);
    for (let corner = 0; corner < 3; corner++) {
      const i = indices[t * 3 + corner] * 3,
        j = indices[t * 3 + ((corner + 1) % 3)] * 3;
      vertexNormals[i] += nx;
      vertexNormals[i + 1] += ny;
      vertexNormals[i + 2] += nz;
      const edgeLength = Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1], p[j + 2] - p[i + 2]);
      edgeAltitudes[t * 3 + corner] =
        (shading!.edgeLengths[t * 3 + corner] > 0 ? 1 : -1) * (edgeLength > 1e-12 ? area2 / edgeLength : 0);
    }
  }
  for (let i = 0; i < p.length; i += 3) {
    const length = Math.hypot(vertexNormals[i], vertexNormals[i + 1], vertexNormals[i + 2]);
    const rock = coverage ? Math.max(0, Math.min(1, coverage[i / 3])) : 1;
    for (let axis = 0; axis < 3; axis++) {
      const guide = mesh.guideNormals?.[i + axis] ?? (axis === 1 ? 1 : 0);
      const geometric = length > 1e-12 ? vertexNormals[i + axis] / length : guide;
      vertexNormals[i + axis] = mesh.guideNormals ? guide * (1 - rock) + geometric * rock : geometric;
    }
    const blendedLength = Math.hypot(vertexNormals[i], vertexNormals[i + 1], vertexNormals[i + 2]) || 1;
    for (let axis = 0; axis < 3; axis++) vertexNormals[i + axis] /= blendedLength;
  }
  const smoothNormals = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++)
    smoothNormals.set(vertexNormals.subarray(indices[i] * 3, indices[i] * 3 + 3), i * 3);
  return { smoothNormals, edgeAltitudes };
}

/** Exact distance to the selected edge segment, including obtuse triangles. */
export function cellularEdgeDistance(bary: readonly number[], lengths2: readonly number[], edge: number): number {
  const u = bary[(edge + 1) % 3],
    v = bary[(edge + 2) % 3],
    ab = Math.abs(lengths2[edge]),
    ac = Math.abs(lengths2[(edge + 2) % 3]),
    bc = Math.abs(lengths2[(edge + 1) % 3]);
  const dot = (ab + ac - bc) * 0.5,
    t = Math.max(0, Math.min(1, (u * ab + v * dot) / Math.max(ab, 1e-20))),
    q = u - t;
  return Math.sqrt(Math.max(0, q * q * ab + v * v * ac + 2 * q * v * dot));
}
