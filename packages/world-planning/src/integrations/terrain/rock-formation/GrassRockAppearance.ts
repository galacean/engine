import { segmentTriangleDistanceSquared } from "@galacean/engine-building/building/runtime/SurfaceQueryMath";
import { sampleSeedWorldHeight, type SeedWorldFields } from "../../../runtime/SeedWorldFields.ts";
import { sharedRockTransitionCoverage } from "@galacean/engine-terrain/rock-formation/TransitionCoverage";
import type { RockGrassPlacement } from "@galacean/engine-terrain/rock-formation/GrassPatches";
import type { V3 } from "@galacean/engine-terrain/rock-formation/types";

const CELL = 8;
export const GRASS_ROCK_APPEARANCE_STRIDE = 28;
// Immutable CPU snapshot: corners/coverage (12), normals (9), tile size (1), AABB (6).
// Float64 preserves the original JS-number world-coordinate calculations exactly.
const FACE_STRIDE = 28;

/** Optional appearance source for blades near a real rock face. Never changes grass geometry or density. */
export class GrassRockAppearance {
  private readonly cells = new Map<string, Uint32Array>();
  private readonly faces: Float64Array;

  constructor(placements: readonly RockGrassPlacement[]) {
    this.faces = new Float64Array(
      placements.reduce((n, p) => n + p.formation.mesh.indices.length / 3, 0) * FACE_STRIDE
    );
    const sizes = new Map<string, number>();
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
        this.faces[k + 21] = formation.textureScale ?? 0;
        for (let axis = 0; axis < 3; axis++) {
          this.faces[k + 22 + axis] = Math.min(
            this.faces[k + axis],
            this.faces[k + 4 + axis],
            this.faces[k + 8 + axis]
          );
          this.faces[k + 25 + axis] = Math.max(
            this.faces[k + axis],
            this.faces[k + 4 + axis],
            this.faces[k + 8 + axis]
          );
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

  private visitCells(k: number, visit: (key: string) => void): void {
    for (let z = Math.floor(this.faces[k + 24] / CELL); z <= Math.floor(this.faces[k + 27] / CELL); z++)
      for (let x = Math.floor(this.faces[k + 22] / CELL); x <= Math.floor(this.faces[k + 25] / CELL); x++)
        visit(`${x}/${z}`);
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
    let result: Float32Array | undefined;
    const visited = new Set<number>(),
      packed = new Map<number, number[]>();
    const points: [V3, V3, V3] = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ],
      faces = this.faces;
    const heightFields = { ...fields, surfaceHeights: undefined };
    let candidates = 0;
    for (let i = 0; i < count; i++) {
      if (i > 0 && i % 32 === 0) yield;
      const k = i * 13,
        x = transforms[k],
        y = transforms[k + 1],
        z = transforms[k + 2];
      const reach =
        radius * Math.max(Math.abs(transforms[k + 4]), Math.abs(transforms[k + 5]), Math.abs(transforms[k + 6])) + 0.35;
      const point: V3 = [x, y + 0.083428765 * Math.abs(transforms[k + 5]), z];
      let best = reach * reach,
        chosen: number | undefined;
      visited.clear();
      for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++)
        for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++)
          for (const face of this.cells.get(`${cx}/${cz}`) ?? []) {
            if (++candidates % 64 === 0) yield;
            if (visited.has(face)) continue;
            visited.add(face);
            // Distance to the enclosing box is a lower bound; preserve exact face selection and ties.
            const f = face * FACE_STRIDE;
            const dx = Math.max(faces[f + 22] - point[0], 0, point[0] - faces[f + 25]);
            const dy = Math.max(faces[f + 23] - point[1], 0, point[1] - faces[f + 26]);
            const dz = Math.max(faces[f + 24] - point[2], 0, point[2] - faces[f + 27]);
            if (dx * dx + dy * dy + dz * dz > best) continue;
            for (let c = 0; c < 3; c++) for (let axis = 0; axis < 3; axis++) points[c][axis] = faces[f + c * 4 + axis];
            const d = segmentTriangleDistanceSquared(point, point, ...points);
            if (d < best) {
              best = d;
              chosen = face;
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
