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
interface GroundTriangle {
  ax: number;
  ay: number;
  az: number;
  ux: number;
  uy: number;
  uz: number;
  vx: number;
  vy: number;
  vz: number;
  determinant: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
/** Build once per published support snapshot. Query a vertical line through XZ
 * and retain the highest surface, matching a downward ray from above the scene.
 * This is the host counterpart of native find_stone_column_start_y's collision
 * query, not a replacement heightfield: holes and overhang openings stay empty.
 */
export class ConstructionGroundSupports {
  private readonly triangles: GroundTriangle[] = [];
  private readonly buckets = new Map<string, number[]>();
  private readonly cellSize: number;
  constructor(meshes: readonly ConstructionGroundMesh[], bounds?: ConstructionGroundBounds) {
    if (
      bounds &&
      (![...bounds.min, ...bounds.max].every(Number.isFinite) || bounds.min.some((v, i) => v > bounds.max[i]))
    )
      throw Error("Ordered finite ground support bounds required");
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
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
      const count = mesh.positions.length / 3;
      for (let offset = 0; offset < mesh.indices.length; offset += 3) {
        const ids = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]];
        if (ids.some((i) => i >= count)) throw Error("Ground support index outside vertex buffer");
        const [a, b, c] = ids.map((i) => i * 3),
          p = mesh.positions;
        const t: GroundTriangle = {
          ax: p[a],
          ay: p[a + 1],
          az: p[a + 2],
          ux: p[b] - p[a],
          uy: p[b + 1] - p[a + 1],
          uz: p[b + 2] - p[a + 2],
          vx: p[c] - p[a],
          vy: p[c + 1] - p[a + 1],
          vz: p[c + 2] - p[a + 2],
          determinant: 0,
          minX: Math.min(p[a], p[b], p[c]),
          maxX: Math.max(p[a], p[b], p[c]),
          minZ: Math.min(p[a + 2], p[b + 2], p[c + 2]),
          maxZ: Math.max(p[a + 2], p[b + 2], p[c + 2])
        };
        if (
          bounds &&
          (t.maxX < bounds.min[0] || t.minX > bounds.max[0] || t.maxZ < bounds.min[1] || t.minZ > bounds.max[1])
        )
          continue;
        t.determinant = t.ux * t.vz - t.uz * t.vx;
        const scale = Math.max(Math.abs(t.ux * t.vz), Math.abs(t.uz * t.vx));
        // A vertical triangle has no XZ area and cannot supply an upper surface.
        // Relative tolerance retains small but well-shaped triangles.
        if (scale === 0 || Math.abs(t.determinant) <= Number.EPSILON * 16 * scale) continue;
        this.triangles.push(t);
        minX = Math.min(minX, t.minX);
        maxX = Math.max(maxX, t.maxX);
        minZ = Math.min(minZ, t.minZ);
        maxZ = Math.max(maxZ, t.maxZ);
      }
    }
    // Bound grid expansion by the published extent. A giant triangle does not
    // allocate millions of cells; ordinary building queries remain local.
    this.cellSize = Math.max(2, (maxX - minX) / 128, (maxZ - minZ) / 128);
    if (!this.triangles.length) this.cellSize = 2;
    this.triangles.forEach((t, index) => {
      for (let x = Math.floor(t.minX / this.cellSize); x <= Math.floor(t.maxX / this.cellSize); x++)
        for (let z = Math.floor(t.minZ / this.cellSize); z <= Math.floor(t.maxZ / this.cellSize); z++) {
          const key = `${x}/${z}`,
            bucket = this.buckets.get(key);
          if (bucket) bucket.push(index);
          else this.buckets.set(key, [index]);
        }
    });
  }
  sample(x: number, z: number, fallback: number): number {
    if (![x, z, fallback].every(Number.isFinite)) throw Error("Finite ground support query required");
    let height = fallback;
    const bucket = this.buckets.get(`${Math.floor(x / this.cellSize)}/${Math.floor(z / this.cellSize)}`);
    if (!bucket) return height;
    for (const index of bucket) {
      const t = this.triangles[index];
      if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
      const dx = x - t.ax,
        dz = z - t.az;
      const u = (dx * t.vz - dz * t.vx) / t.determinant,
        v = (t.ux * dz - t.uz * dx) / t.determinant;
      const tolerance = Number.EPSILON * 32;
      if (u < -tolerance || v < -tolerance || u + v > 1 + tolerance) continue;
      height = Math.max(height, t.ay + u * t.uy + v * t.vy);
    }
    return height;
  }
  get triangleCount() {
    return this.triangles.length;
  }
}
