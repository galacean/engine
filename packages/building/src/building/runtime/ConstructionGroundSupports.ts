/** Immutable published world-space rock triangles. The host owns transforms and
 * snapshots; this sampler does not read navigation state or renderer buffers. */
export interface ConstructionGroundMesh {
  positions: Float32Array;
  indices: Uint32Array;
}
export interface ConstructionGroundBounds {
  min: readonly [number, number];
  max: readonly [number, number];
}
const F32_STRIDE = 7; // ax, ay, az, minX, maxX, minZ, maxZ
const F64_STRIDE = 7; // ux, uy, uz, vx, vy, vz, determinant
const BUCKET_BIAS = 32768;
const BUCKET_SPAN = 65536;

function bucketCellKey(cx: number, cz: number): number | string {
  if (cx >= -BUCKET_BIAS && cx < BUCKET_BIAS && cz >= -BUCKET_BIAS && cz < BUCKET_BIAS) {
    return (cx + BUCKET_BIAS) * BUCKET_SPAN + (cz + BUCKET_BIAS);
  }
  return `${cx}/${cz}`;
}

/** Build once per published support snapshot. Query a vertical line through XZ
 * and retain the highest surface, matching a downward ray from above the scene.
 * This is the host counterpart of native find_stone_column_start_y's collision
 * query, not a replacement heightfield: holes and overhang openings stay empty.
 */
export class ConstructionGroundSupports {
  private readonly f32Data: Float32Array;
  private readonly f64Data: Float64Array;
  private readonly triCountNum: number = 0;
  private readonly csrBuckets: Map<number | string, number>;
  private readonly csrOffsets: Uint32Array;
  private readonly csrIndices: Uint32Array;
  private readonly cellSize: number;
  constructor(meshes: readonly ConstructionGroundMesh[], bounds?: ConstructionGroundBounds) {
    if (
      bounds &&
      (![...bounds.min, ...bounds.max].every(Number.isFinite) || bounds.min.some((v, i) => v > bounds.max[i]))
    )
      throw Error("Ordered finite ground support bounds required");

    let maxTris = 0;
    for (const mesh of meshes) {
      if (
        !(mesh.positions instanceof Float32Array) ||
        !(mesh.indices instanceof Uint32Array) ||
        mesh.positions.length % 3 ||
        mesh.indices.length % 3
      )
        throw Error("Ground supports require packed triangle arrays");
      for (const coordinate of mesh.positions)
        if (!Number.isFinite(coordinate)) throw Error("Nonfinite ground support position");
      maxTris += mesh.indices.length / 3;
    }

    const rawF32 = new Float32Array(maxTris * F32_STRIDE);
    const rawF64 = new Float64Array(maxTris * F64_STRIDE);
    let triCount = 0;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    for (const mesh of meshes) {
      const p = mesh.positions;
      const idx = mesh.indices;
      const vCount = p.length / 3;
      for (let offset = 0; offset < idx.length; offset += 3) {
        const i0 = idx[offset]!,
          i1 = idx[offset + 1]!,
          i2 = idx[offset + 2]!;
        if (i0 >= vCount || i1 >= vCount || i2 >= vCount) throw Error("Ground support index outside vertex buffer");
        const a = i0 * 3,
          b = i1 * 3,
          c = i2 * 3;
        const ax = p[a]!,
          ay = p[a + 1]!,
          az = p[a + 2]!;
        const bx = p[b]!,
          by = p[b + 1]!,
          bz = p[b + 2]!;
        const cx = p[c]!,
          cy = p[c + 1]!,
          cz = p[c + 2]!;
        const tMinX = ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx;
        const tMaxX = ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx;
        const tMinZ = az < bz ? (az < cz ? az : cz) : bz < cz ? bz : cz;
        const tMaxZ = az > bz ? (az > cz ? az : cz) : bz > cz ? bz : cz;
        if (
          bounds &&
          (tMaxX < bounds.min[0] || tMinX > bounds.max[0] || tMaxZ < bounds.min[1] || tMinZ > bounds.max[1])
        )
          continue;
        const ux = bx - ax,
          uy = by - ay,
          uz = bz - az;
        const vx = cx - ax,
          vy = cy - ay,
          vz = cz - az;
        const det = ux * vz - uz * vx;
        const scale = Math.max(Math.abs(ux * vz), Math.abs(uz * vx));
        if (scale === 0 || Math.abs(det) <= Number.EPSILON * 16 * scale) continue;

        const f32Base = triCount * F32_STRIDE;
        rawF32[f32Base] = ax;
        rawF32[f32Base + 1] = ay;
        rawF32[f32Base + 2] = az;
        rawF32[f32Base + 3] = tMinX;
        rawF32[f32Base + 4] = tMaxX;
        rawF32[f32Base + 5] = tMinZ;
        rawF32[f32Base + 6] = tMaxZ;

        const f64Base = triCount * F64_STRIDE;
        rawF64[f64Base] = ux;
        rawF64[f64Base + 1] = uy;
        rawF64[f64Base + 2] = uz;
        rawF64[f64Base + 3] = vx;
        rawF64[f64Base + 4] = vy;
        rawF64[f64Base + 5] = vz;
        rawF64[f64Base + 6] = det;

        triCount++;
        if (tMinX < minX) minX = tMinX;
        if (tMaxX > maxX) maxX = tMaxX;
        if (tMinZ < minZ) minZ = tMinZ;
        if (tMaxZ > maxZ) maxZ = tMaxZ;
      }
    }

    this.triCountNum = triCount;
    this.f32Data = triCount === maxTris ? rawF32 : rawF32.slice(0, triCount * F32_STRIDE);
    this.f64Data = triCount === maxTris ? rawF64 : rawF64.slice(0, triCount * F64_STRIDE);
    this.cellSize = Math.max(2, (maxX - minX) / 128, (maxZ - minZ) / 128);
    if (!triCount) this.cellSize = 2;

    const invCell = 1 / this.cellSize;
    const cellToId = new Map<number | string, number>();
    const counts: number[] = [];
    let totalRefs = 0;

    for (let i = 0; i < triCount; i++) {
      const f32Base = i * F32_STRIDE;
      const x0 = Math.floor(this.f32Data[f32Base + 3]! * invCell);
      const x1 = Math.floor(this.f32Data[f32Base + 4]! * invCell);
      const z0 = Math.floor(this.f32Data[f32Base + 5]! * invCell);
      const z1 = Math.floor(this.f32Data[f32Base + 6]! * invCell);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const key = bucketCellKey(x, z);
          let id = cellToId.get(key);
          if (id === undefined) {
            id = counts.length;
            cellToId.set(key, id);
            counts.push(1);
          } else {
            counts[id]!++;
          }
          totalRefs++;
        }
      }
    }

    const offsets = new Uint32Array(counts.length + 1);
    const cursors = new Uint32Array(counts.length);
    for (let i = 0; i < counts.length; i++) {
      offsets[i + 1] = offsets[i]! + counts[i]!;
      cursors[i] = offsets[i]!;
    }
    const indices = new Uint32Array(totalRefs);
    for (let i = 0; i < triCount; i++) {
      const f32Base = i * F32_STRIDE;
      const x0 = Math.floor(this.f32Data[f32Base + 3]! * invCell);
      const x1 = Math.floor(this.f32Data[f32Base + 4]! * invCell);
      const z0 = Math.floor(this.f32Data[f32Base + 5]! * invCell);
      const z1 = Math.floor(this.f32Data[f32Base + 6]! * invCell);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const id = cellToId.get(bucketCellKey(x, z))!;
          indices[cursors[id]++] = i;
        }
      }
    }
    this.csrBuckets = cellToId;
    this.csrOffsets = offsets;
    this.csrIndices = indices;
  }
  sample(x: number, z: number, fallback: number): number {
    if (![x, z, fallback].every(Number.isFinite)) throw Error("Finite ground support query required");
    let height = fallback;
    const id = this.csrBuckets.get(bucketCellKey(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)));
    if (id === undefined) return height;
    const start = this.csrOffsets[id]!;
    const end = this.csrOffsets[id + 1]!;
    const f32 = this.f32Data;
    const f64 = this.f64Data;
    const indices = this.csrIndices;
    const tolerance = Number.EPSILON * 32;
    for (let cursor = start; cursor < end; cursor++) {
      const index = indices[cursor]!;
      const f32Base = index * F32_STRIDE;
      if (x < f32[f32Base + 3]! || x > f32[f32Base + 4]! || z < f32[f32Base + 5]! || z > f32[f32Base + 6]!) continue;
      const dx = x - f32[f32Base]!;
      const dz = z - f32[f32Base + 2]!;
      const f64Base = index * F64_STRIDE;
      const det = f64[f64Base + 6]!;
      const u = (dx * f64[f64Base + 5]! - dz * f64[f64Base + 3]!) / det;
      const v = (f64[f64Base]! * dz - f64[f64Base + 2]! * dx) / det;
      if (u < -tolerance || v < -tolerance || u + v > 1 + tolerance) continue;
      const candidate = f32[f32Base + 1]! + u * f64[f64Base + 1]! + v * f64[f64Base + 4]!;
      if (candidate > height) height = candidate;
    }
    return height;
  }
  get triangleCount() {
    return this.triCountNum;
  }
}
