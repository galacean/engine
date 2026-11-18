import { sampleSeedWorldHeight, type SeedWorldFields } from "../../../runtime/SeedWorldFields.ts";
import { sharedRockTransitionCoverage } from "@galacean/engine-terrain/rock-formation/TransitionCoverage";
import type { RockGrassPlacement } from "@galacean/engine-terrain/rock-formation/GrassPatches";

const CELL = 8;
const CELL_KEY_OFFSET = 0x2000000;
const CELL_KEY_STRIDE = 0x4000000;
const BLADE_YIELD_STRIDE = 256;
const CANDIDATE_YIELD_STRIDE = 512;
export const GRASS_ROCK_APPEARANCE_STRIDE = 28;
// Compact CPU snapshot: corners/coverage (12), normals (9), tile size (1).
// Float32 cuts snapshot memory in half while preserving vertex normals and world AABBs.
const FACE_STRIDE = 22;

const packCellKey = (cx: number, cz: number): number =>
  (cx + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + (cz + CELL_KEY_OFFSET);

function pointTriangleDistanceSquared(px: number, py: number, pz: number, faces: Float32Array, f: number): number {
  const ax = faces[f],
    ay = faces[f + 1],
    az = faces[f + 2];
  const bx = faces[f + 4],
    by = faces[f + 5],
    bz = faces[f + 6];
  const cx = faces[f + 8],
    cy = faces[f + 9],
    cz = faces[f + 10];

  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;

  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const dx = apx - abx * v,
      dy = apy - aby * v,
      dz = apz - abz * v;
    return dx * dx + dy * dy + dz * dz;
  }

  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const dx = apx - acx * w,
      dy = apy - acy * w,
      dz = apz - acz * w;
    return dx * dx + dy * dy + dz * dz;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const dx = bpx - (cx - bx) * w,
      dy = bpy - (cy - by) * w,
      dz = bpz - (cz - bz) * w;
    return dx * dx + dy * dy + dz * dz;
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const dx = apx - abx * v - acx * w;
  const dy = apy - aby * v - acy * w;
  const dz = apz - abz * v - acz * w;
  return dx * dx + dy * dy + dz * dz;
}

/** Optional appearance source for blades near a real rock face. Never changes grass geometry or density. */
export class GrassRockAppearance {
  private readonly cells = new Map<number, Uint32Array>();
  private readonly faces: Float32Array;

  constructor(placements: readonly RockGrassPlacement[]) {
    this.faces = new Float32Array(
      placements.reduce((n, p) => n + p.formation.mesh.indices.length / 3, 0) * FACE_STRIDE
    );
    const sizes = new Map<number, number>();
    let face = 0;
    for (const { formation, origin } of placements) {
      const { positions, indices, normals } = formation.mesh;
      const coverage = sharedRockTransitionCoverage(formation);
      for (let t = 0; t < indices.length / 3; t++) {
        const k = face++ * FACE_STRIDE;
        const data = normals!;
        for (let c = 0; c < 3; c++) {
          const v = indices[t * 3 + c],
            n = v * 3;
          for (let axis = 0; axis < 3; axis++) {
            this.faces[k + c * 4 + axis] = positions[v * 3 + axis] + origin[axis];
            this.faces[k + 12 + c * 3 + axis] = data[n + axis];
          }
          this.faces[k + c * 4 + 3] = coverage[v];
        }

        this.visitCells(k, (key) => sizes.set(key, (sizes.get(key) ?? 0) + 1));
      }
    }
    for (const [key, size] of sizes) {
      this.cells.set(key, new Uint32Array(size));
      sizes.set(key, 0);
    }
    for (let id = 0; id < face; id++)
      this.visitCells(id * FACE_STRIDE, (key) => {
        const cursor = sizes.get(key)!;
        this.cells.get(key)![cursor] = id;
        sizes.set(key, cursor + 1);
      });
  }

  private visitCells(k: number, visit: (key: number) => void): void {
    const f = this.faces;
    const minX = Math.min(f[k], f[k + 4], f[k + 8]);
    const minZ = Math.min(f[k + 2], f[k + 6], f[k + 10]);
    const maxX = Math.max(f[k], f[k + 4], f[k + 8]);
    const maxZ = Math.max(f[k + 2], f[k + 6], f[k + 10]);
    for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++)
      for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) visit(packCellKey(x, z));
  }

  /** Seven vec4 attributes per affected instance: three corners/coverage,
   * three smooth normals/terrain clearances, and material metadata.
   * The shader projects each wind-deformed vertex onto this bounded face.
   * Clearance interpolates the same R16 vertex samples as the rock shader.
   */
  compile(transforms: Float32Array, count: number, radius: number, fields: SeedWorldFields): Float32Array | undefined {
    const task = this.compileIncrementally(transforms, count, radius, fields);
    let step = task.next();
    while (!step.done) step = task.next();
    return step.value;
  }

  /** Compile the same records in bounded candidate slices. Inputs must remain stable until completion. */
  *compileIncrementally(
    transforms: Float32Array,
    count: number,
    radius: number,
    fields: SeedWorldFields
  ): Generator<void, Float32Array | undefined> {
    if (this.cells.size === 0) return undefined;
    let result: Float32Array | undefined;
    const visited = new Set<number>(),
      packed = new Map<number, number[]>();
    const faces = this.faces;
    const heightFields = { ...fields, surfaceHeights: undefined };
    let candidates = 0;
    for (let i = 0; i < count; i++) {
      if (i > 0 && i % BLADE_YIELD_STRIDE === 0) yield;
      const k = i * 13,
        x = transforms[k],
        y = transforms[k + 1],
        z = transforms[k + 2];
      const py = y + 0.083428765 * Math.abs(transforms[k + 5]);
      const reach =
        radius * Math.max(Math.abs(transforms[k + 4]), Math.abs(transforms[k + 5]), Math.abs(transforms[k + 6])) + 0.35;
      let best = reach * reach,
        chosen: number | undefined;
      const minCz = Math.floor((z - reach) / CELL),
        maxCz = Math.floor((z + reach) / CELL),
        minCx = Math.floor((x - reach) / CELL),
        maxCx = Math.floor((x + reach) / CELL);
      const singleCell = minCx === maxCx && minCz === maxCz;
      if (!singleCell) visited.clear();
      for (let cz = minCz; cz <= maxCz; cz++)
        for (let cx = minCx; cx <= maxCx; cx++) {
          const cell = this.cells.get(packCellKey(cx, cz));
          if (!cell) continue;
          for (let j = 0; j < cell.length; j++) {
            const face = cell[j];
            if (++candidates % CANDIDATE_YIELD_STRIDE === 0) yield;
            if (!singleCell) {
              if (visited.has(face)) continue;
              visited.add(face);
            }
            // Distance to the enclosing box is a lower bound; preserve exact face selection and ties.
            const f = face * FACE_STRIDE;
            const minX = Math.min(faces[f], faces[f + 4], faces[f + 8]);
            const maxX = Math.max(faces[f], faces[f + 4], faces[f + 8]);
            const dx = Math.max(minX - x, 0, x - maxX);
            const minY = Math.min(faces[f + 1], faces[f + 5], faces[f + 9]);
            const maxY = Math.max(faces[f + 1], faces[f + 5], faces[f + 9]);
            const dy = Math.max(minY - py, 0, py - maxY);
            const minZ = Math.min(faces[f + 2], faces[f + 6], faces[f + 10]);
            const maxZ = Math.max(faces[f + 2], faces[f + 6], faces[f + 10]);
            const dz = Math.max(minZ - z, 0, z - maxZ);
            if (dx * dx + dy * dy + dz * dz >= best) continue;
            const d = pointTriangleDistanceSquared(x, py, z, faces, f);
            if (d < best) {
              best = d;
              chosen = face;
            }
          }
        }
      if (chosen === undefined) continue;
      result ??= new Float32Array(count * GRASS_ROCK_APPEARANCE_STRIDE);
      let values = packed.get(chosen);
      if (!values) {
        const f = chosen * FACE_STRIDE;
        values = Array.from(faces.subarray(f, f + 12));
        for (let c = 0; c < 3; c++) {
          const p = f + c * 4,
            n = f + 12 + c * 3;
          const h = sampleSeedWorldHeight(heightFields, faces[p], faces[p + 2]);
          values.push(faces[n], faces[n + 1], faces[n + 2], h === undefined ? 10000 : faces[p + 1] - h);
        }
        values.push(faces[f + 21], 1, 1, 0);
        packed.set(chosen, values);
      }
      result.set(values, i * GRASS_ROCK_APPEARANCE_STRIDE);
    }
    return result;
  }
}
