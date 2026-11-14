import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";

/**
 * @internal
 */
export class MeshTangentUtils {
  static calculateTangents(
    positions: readonly Vector3[],
    normals: readonly Vector3[],
    uvs: readonly Vector2[],
    indices: ArrayLike<number> | null
  ): Vector4[] {
    return MeshTangentUtils._calculateTangents(positions, normals, uvs, indices, null) as Vector4[];
  }

  static calculateTangentsFromBuffer(vertices: Float32Array, indices: ArrayLike<number> | null): Float32Array {
    return MeshTangentUtils._calculateTangents(null, null, null, indices, vertices) as Float32Array;
  }

  private static _calculateTangents(
    positions: readonly Vector3[] | null,
    normals: readonly Vector3[] | null,
    uvs: readonly Vector2[] | null,
    indices: ArrayLike<number> | null,
    vertices: Float32Array | null
  ): Vector4[] | Float32Array {
    const vertexCount = vertices ? vertices.length / 8 : positions!.length;
    const indexCount = indices ? indices.length : vertexCount;
    // Accumulate in double precision before converting to the GPU buffer format
    const basis = new Float64Array(vertexCount * 6);
    for (let i = 0; i < indexCount; i += 3) {
      const a = indices ? indices[i] : i;
      const b = indices ? indices[i + 1] : i + 1;
      const c = indices ? indices[i + 2] : i + 2;
      let e1x: number, e1y: number, e1z: number, e2x: number, e2y: number, e2z: number;
      let x1: number, x2: number, y1: number, y2: number;
      if (vertices) {
        const offsetA = a * 8;
        const offsetB = b * 8;
        const offsetC = c * 8;
        e1x = vertices[offsetB] - vertices[offsetA];
        e1y = vertices[offsetB + 1] - vertices[offsetA + 1];
        e1z = vertices[offsetB + 2] - vertices[offsetA + 2];
        e2x = vertices[offsetC] - vertices[offsetA];
        e2y = vertices[offsetC + 1] - vertices[offsetA + 1];
        e2z = vertices[offsetC + 2] - vertices[offsetA + 2];
        x1 = vertices[offsetB + 6] - vertices[offsetA + 6];
        x2 = vertices[offsetC + 6] - vertices[offsetA + 6];
        y1 = vertices[offsetB + 7] - vertices[offsetA + 7];
        y2 = vertices[offsetC + 7] - vertices[offsetA + 7];
      } else {
        const p0 = positions![a];
        const p1 = positions![b];
        const p2 = positions![c];
        const uv0 = uvs![a];
        const uv1 = uvs![b];
        const uv2 = uvs![c];
        e1x = p1.x - p0.x;
        e1y = p1.y - p0.y;
        e1z = p1.z - p0.z;
        e2x = p2.x - p0.x;
        e2y = p2.y - p0.y;
        e2z = p2.z - p0.z;
        x1 = uv1.x - uv0.x;
        x2 = uv2.x - uv0.x;
        y1 = uv1.y - uv0.y;
        y2 = uv2.y - uv0.y;
      }
      const determinant = x1 * y2 - x2 * y1;
      if (determinant === 0) {
        continue;
      }
      const inverse = 1 / determinant;
      const ty1 = y1 * inverse;
      const ty2 = y2 * inverse;
      const bx1 = x1 * inverse;
      const bx2 = x2 * inverse;
      const tx = e1x * ty2 - e2x * ty1;
      const ty = e1y * ty2 - e2y * ty1;
      const tz = e1z * ty2 - e2z * ty1;
      const bx = e2x * bx1 - e1x * bx2;
      const by = e2y * bx1 - e1y * bx2;
      const bz = e2z * bx1 - e1z * bx2;
      for (let corner = 0; corner < 3; corner++) {
        const offset = (corner === 0 ? a : corner === 1 ? b : c) * 6;
        basis[offset] += tx;
        basis[offset + 1] += ty;
        basis[offset + 2] += tz;
        basis[offset + 3] += bx;
        basis[offset + 4] += by;
        basis[offset + 5] += bz;
      }
    }

    const tangents = vertices ? new Float32Array(vertexCount * 4) : new Array<Vector4>(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      let nx: number, ny: number, nz: number;
      if (vertices) {
        const offset = i * 8;
        nx = vertices[offset + 3];
        ny = vertices[offset + 4];
        nz = vertices[offset + 5];
      } else {
        const normal = normals![i];
        nx = normal.x;
        ny = normal.y;
        nz = normal.z;
      }
      const offset = i * 6;
      let tx = basis[offset];
      let ty = basis[offset + 1];
      let tz = basis[offset + 2];
      const bx = basis[offset + 3];
      const by = basis[offset + 4];
      const bz = basis[offset + 5];
      const handedness = (ty * bz - tz * by) * nx + (tz * bx - tx * bz) * ny + (tx * by - ty * bx) * nz > 0 ? 1 : -1;
      // Custom normals need not have unit length
      const normalLengthSquared = nx * nx + ny * ny + nz * nz;
      const projection = normalLengthSquared > 0 ? (tx * nx + ty * ny + tz * nz) / normalLengthSquared : 0;
      tx -= nx * projection;
      ty -= ny * projection;
      tz -= nz * projection;
      const length = Math.hypot(tx, ty, tz);
      if (length > 0) {
        const inverse = 1 / length;
        tx *= inverse;
        ty *= inverse;
        tz *= inverse;
      }
      if (vertices) {
        const result = tangents as Float32Array;
        result[i * 4] = tx;
        result[i * 4 + 1] = ty;
        result[i * 4 + 2] = tz;
        result[i * 4 + 3] = handedness;
      } else {
        (tangents as Vector4[])[i] = new Vector4(tx, ty, tz, handedness);
      }
    }
    return tangents;
  }
}
