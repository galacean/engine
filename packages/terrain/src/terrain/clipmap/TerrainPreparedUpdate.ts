import type { TerrainClipmapRegionSource } from "./TerrainClipmapSource";

/** Detached final values on the existing sample lattice. The backend derives lossless dirty rectangles. */
export interface TerrainRegionUpdate {
  readonly sources: readonly TerrainClipmapRegionSource[];
  readonly alphamaps?: readonly {
    regionId: string;
    mapIndex: number;
    sampleSize: readonly [number, number];
    pixels: Uint8Array;
  }[];
}
/** Reversible until finalize. Retirement never precedes the caller's final publication boundary. */
export interface PreparedTerrainUpdate {
  commit(): void;
  rollback(): void;
  finalize(): void;
  discard(): void;
}
export interface TerrainPixelRectangle {
  x: number;
  z: number;
  width: number;
  height: number;
}
/** Exact value comparison, including every channel. No precision or affected-area heuristic. */
export function terrainChangedRectangle(
  before: ArrayLike<number>,
  after: ArrayLike<number>,
  width: number,
  height: number,
  channels = 1
): TerrainPixelRectangle | undefined {
  if (
    ![width, height, channels].every((n) => Number.isInteger(n) && n > 0) ||
    before.length !== width * height * channels ||
    after.length !== before.length
  )
    throw Error("Terrain patch lattice mismatch");
  let x0 = width,
    z0 = height,
    x1 = -1,
    z1 = -1;
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < channels; c++) {
        const i = (z * width + x) * channels + c;
        if (!Number.isFinite(after[i])) throw Error("Non-finite Terrain patch");
        if (before[i] !== after[i]) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          z0 = Math.min(z0, z);
          z1 = Math.max(z1, z);
        }
      }
  return x1 < 0 ? undefined : { x: x0, z: z0, width: x1 - x0 + 1, height: z1 - z0 + 1 };
}
export function terrainRectangleSamples<T extends Uint8Array | Uint16Array>(
  source: T,
  width: number,
  rectangle: TerrainPixelRectangle,
  channels = 1
): T {
  const result = source.slice(0, rectangle.width * rectangle.height * channels) as T;
  for (let row = 0; row < rectangle.height; row++) {
    const start = ((rectangle.z + row) * width + rectangle.x) * channels;
    result.set(source.subarray(start, start + rectangle.width * channels), row * rectangle.width * channels);
  }
  return result;
}
/** Register rollback before each potentially mutating setter, including mutate-then-throw backends. */
export function reversibleTerrainSteps(steps: readonly { commit(): void; rollback(): void }[]): {
  commit(): void;
  rollback(): void;
} {
  let applied = 0;
  const rollback = () => {
    const errors: unknown[] = [];
    while (applied) {
      try {
        steps[--applied].rollback();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Terrain rollback failed");
  };
  return {
    rollback,
    commit: () => {
      try {
        while (applied < steps.length) {
          const step = steps[applied++];
          step.commit();
        }
      } catch (error) {
        try {
          rollback();
        } catch (failure) {
          throw new AggregateError([error, failure], "Terrain publication failed");
        }
        throw error;
      }
    }
  };
}
