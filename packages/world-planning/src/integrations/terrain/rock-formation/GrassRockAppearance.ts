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

function pointTriangleDistanceSquared(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): number {
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

interface PlacementMeshRef {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals: Float32Array;
  readonly coverage: Float32Array;
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
}

/** Optional appearance source for blades near a real rock face. Never changes grass geometry or density. */
export class GrassRockAppearance {
  private readonly cells = new Map<number, Uint32Array>();
  private readonly placements: PlacementMeshRef[];
  private readonly facePlacement: Uint16Array | Uint32Array;
  private readonly faceTri: Uint32Array;

  constructor(placements: readonly RockGrassPlacement[]) {
    const totalTris = placements.reduce((n, p) => n + p.formation.mesh.indices.length / 3, 0);
    // Snapshot each unique indexed rock mesh once instead of expanding 88 B/tri, preserving
    // constructor snapshot immutability while cutting memory ~4-5x.
    const meshSnapshots = new Map<
      RockGrassPlacement["formation"]["mesh"],
      { positions: Float32Array; indices: Uint32Array; normals: Float32Array; coverage: Float32Array }
    >();
    this.placements = placements.map(({ formation, origin }) => {
      let snap = meshSnapshots.get(formation.mesh);
      if (!snap) {
        snap = {
          positions: formation.mesh.positions.slice(),
          indices: formation.mesh.indices.slice(),
          normals: formation.mesh.normals!.slice(),
          coverage: sharedRockTransitionCoverage(formation).slice()
        };
        meshSnapshots.set(formation.mesh, snap);
      }
      return {
        positions: snap.positions,
        indices: snap.indices,
        normals: snap.normals,
        coverage: snap.coverage,
        ox: origin[0],
        oy: origin[1],
        oz: origin[2]
      };
    });
    this.facePlacement = new (placements.length <= 0xffff ? Uint16Array : Uint32Array)(totalTris);
    this.faceTri = new Uint32Array(totalTris);
    const sizes = new Map<number, number>();
    let face = 0;
    for (let pIndex = 0; pIndex < this.placements.length; pIndex++) {
      const { positions, indices, ox, oz } = this.placements[pIndex];
      const triCount = indices.length / 3;
      for (let t = 0; t < triCount; t++) {
        const id = face++;
        this.facePlacement[id] = pIndex;
        this.faceTri[id] = t;
        const ti = t * 3;
        const a = indices[ti] * 3,
          b = indices[ti + 1] * 3,
          c = indices[ti + 2] * 3;
        this.visitCells(
          Math.min(positions[a], positions[b], positions[c]) + ox,
          Math.min(positions[a + 2], positions[b + 2], positions[c + 2]) + oz,
          Math.max(positions[a], positions[b], positions[c]) + ox,
          Math.max(positions[a + 2], positions[b + 2], positions[c + 2]) + oz,
          (key) => sizes.set(key, (sizes.get(key) ?? 0) + 1)
        );
      }
    }
    for (const [key, size] of sizes) {
      this.cells.set(key, new Uint32Array(size));
      sizes.set(key, 0);
    }
    for (let id = 0; id < face; id++) {
      const { positions, indices, ox, oz } = this.placements[this.facePlacement[id]];
      const ti = this.faceTri[id] * 3;
      const a = indices[ti] * 3,
        b = indices[ti + 1] * 3,
        c = indices[ti + 2] * 3;
      this.visitCells(
        Math.min(positions[a], positions[b], positions[c]) + ox,
        Math.min(positions[a + 2], positions[b + 2], positions[c + 2]) + oz,
        Math.max(positions[a], positions[b], positions[c]) + ox,
        Math.max(positions[a + 2], positions[b + 2], positions[c + 2]) + oz,
        (key) => {
          const cursor = sizes.get(key)!;
          this.cells.get(key)![cursor] = id;
          sizes.set(key, cursor + 1);
        }
      );
    }
  }

  private visitCells(minX: number, minZ: number, maxX: number, maxZ: number, visit: (key: number) => void): void {
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
    const placements = this.placements,
      facePlacement = this.facePlacement,
      faceTri = this.faceTri;
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
            const { positions, indices, ox, oy, oz } = placements[facePlacement[face]];
            const ti = faceTri[face] * 3;
            const i0 = indices[ti] * 3,
              i1 = indices[ti + 1] * 3,
              i2 = indices[ti + 2] * 3;
            const ax = positions[i0] + ox,
              ay = positions[i0 + 1] + oy,
              az = positions[i0 + 2] + oz;
            const bx = positions[i1] + ox,
              by = positions[i1 + 1] + oy,
              bz = positions[i1 + 2] + oz;
            const cxv = positions[i2] + ox,
              cyv = positions[i2 + 1] + oy,
              czv = positions[i2 + 2] + oz;
            const dx = Math.max(Math.min(ax, bx, cxv) - x, 0, x - Math.max(ax, bx, cxv));
            const dy = Math.max(Math.min(ay, by, cyv) - py, 0, py - Math.max(ay, by, cyv));
            const dz = Math.max(Math.min(az, bz, czv) - z, 0, z - Math.max(az, bz, czv));
            if (dx * dx + dy * dy + dz * dz >= best) continue;
            const d = pointTriangleDistanceSquared(x, py, z, ax, ay, az, bx, by, bz, cxv, cyv, czv);
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
        const { positions, indices, normals, coverage, ox, oy, oz } = placements[facePlacement[chosen]];
        const ti = faceTri[chosen] * 3;
        const v0 = indices[ti],
          v1 = indices[ti + 1],
          v2 = indices[ti + 2];
        const verts = [v0, v1, v2];
        values = [];
        for (let c = 0; c < 3; c++) {
          const v = verts[c],
            p = v * 3;
          values.push(positions[p] + ox, positions[p + 1] + oy, positions[p + 2] + oz, coverage[v]);
        }
        for (let c = 0; c < 3; c++) {
          const v = verts[c],
            p = v * 3;
          const px = positions[p] + ox,
            pz = positions[p + 2] + oz,
            pY = positions[p + 1] + oy;
          const h = sampleSeedWorldHeight(heightFields, px, pz);
          values.push(normals[p], normals[p + 1], normals[p + 2], h === undefined ? 10000 : pY - h);
        }
        values.push(0, 1, 1, 0);
        packed.set(chosen, values);
      }
      result.set(values, i * GRASS_ROCK_APPEARANCE_STRIDE);
    }
    return result;
  }
}
