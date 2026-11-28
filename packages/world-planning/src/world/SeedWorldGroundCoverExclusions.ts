import type { SeedWorldFields } from "../runtime/SeedWorldFields.ts";
import { seedWorldOriginX, seedWorldOriginZ } from "../runtime/SeedWorldFields.ts";
import type { SeedWorldDetailDensityField, SeedWorldPopulationPreview } from "../runtime/SeedWorldPopulationPlan.ts";
import type { SeedWorldAuthoringRuntimeBoundsV1 } from "./SeedWorldAuthoringRuntimeDelta";

type Bounds = SeedWorldAuthoringRuntimeBoundsV1;

interface DensityProjection {
  readonly source: SeedWorldDetailDensityField;
  readonly resolution: number;
  /** One bit per cleared texel, in immutable 32x32 pages. */
  readonly pages: ReadonlyMap<number, Uint32Array>;
  readonly read: (x: number, z: number) => number;
}
const projections = new WeakMap<SeedWorldDetailDensityField, DensityProjection>();

/** Runtime queries retain sparse occupancy; contiguous snapshots are materialized only by buffer consumers. */
export function groundCoverSampleCount(field: SeedWorldDetailDensityField): number {
  return (projections.get(field)?.source ?? field).samples.length;
}

export function sampleGroundCoverDensity(field: SeedWorldDetailDensityField, index: number): number {
  const projection = projections.get(field);
  return projection
    ? projection.read(index % projection.resolution, Math.floor(index / projection.resolution))
    : field.samples[index];
}

/** Resolve once per batch. The sparse reader takes integer sample X/Z; ordinary fields retain direct array access. */
export function groundCoverDensityReader(
  field: SeedWorldDetailDensityField
): ((x: number, z: number) => number) | undefined {
  return projections.get(field)?.read;
}

function clearedSampleHash(index: number, value: number): number {
  let hash = Math.imul(index ^ 0x9e37_79b9, 0x85eb_ca6b) ^ value;
  hash = Math.imul(hash ^ (hash >>> 16), 0xc2b2_ae35);
  return (hash ^ (hash >>> 13)) >>> 0;
}

/** Bounds of the changed occupied union, independent of owner/order/overlap.
 * Subtract rectangles before adding density interpolation support in the caller.
 */
export function groundCoverChangeBounds(before: readonly Bounds[], after: readonly Bounds[]): Bounds[] {
  const subtract = (source: readonly Bounds[], covers: readonly Bounds[]): Bounds[] => {
    let pieces = [...source];
    for (const cover of covers) {
      pieces = pieces.flatMap((area) => {
        if (
          cover.minimumX <= area.minimumX &&
          cover.maximumX >= area.maximumX &&
          cover.minimumZ <= area.minimumZ &&
          cover.maximumZ >= area.maximumZ
        )
          return [];
        const x0 = Math.max(area.minimumX, cover.minimumX),
          x1 = Math.min(area.maximumX, cover.maximumX);
        const z0 = Math.max(area.minimumZ, cover.minimumZ),
          z1 = Math.min(area.maximumZ, cover.maximumZ);
        if (x0 >= x1 || z0 >= z1) return [area];
        const result: Bounds[] = [];
        if (area.minimumX < x0) result.push({ ...area, maximumX: x0 });
        if (area.maximumX > x1) result.push({ ...area, minimumX: x1 });
        if (area.minimumZ < z0) result.push({ minimumX: x0, maximumX: x1, minimumZ: area.minimumZ, maximumZ: z0 });
        if (area.maximumZ > z1) result.push({ minimumX: x0, maximumX: x1, minimumZ: z1, maximumZ: area.maximumZ });
        return result;
      });
    }
    return pieces;
  };
  return [...subtract(before, after), ...subtract(after, before)];
}

/** Derived occupancy only. The source density and candidate identities remain author-owned. */
export function excludeSeedWorldGroundCover(
  source: SeedWorldPopulationPreview,
  fields: Pick<SeedWorldFields, "sizeMetres" | "worldOrigin">,
  areas: readonly SeedWorldAuthoringRuntimeBoundsV1[]
): SeedWorldPopulationPreview {
  if (!areas.length) return source;
  let changed = false;
  const detailDensityFields = source.detailDensityFields.map((field) => {
    const previous = projections.get(field),
      base = previous?.source ?? field;
    const resolution = Math.sqrt(base.samples.length);
    if (!Number.isInteger(resolution) || resolution < 2) throw new Error("Ground cover must use a square sample grid");
    const spacing = fields.sizeMetres / (resolution - 1),
      ox = seedWorldOriginX(fields),
      oz = seedWorldOriginZ(fields);
    const columns = Math.ceil(resolution / 32);
    const pages = new Map(previous?.pages),
      writable = new Set<number>();
    let hash = field.hash,
      fieldChanged = false;
    for (const area of areas) {
      // Include interpolation support, so neighbouring source texels cannot regrow vegetation inside occupied ground.
      const x0 = Math.max(0, Math.ceil((area.minimumX - spacing - ox) / spacing));
      const x1 = Math.min(resolution - 1, Math.floor((area.maximumX + spacing - ox) / spacing));
      const z0 = Math.max(0, Math.ceil((area.minimumZ - spacing - oz) / spacing));
      const z1 = Math.min(resolution - 1, Math.floor((area.maximumZ + spacing - oz) / spacing));
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const i = z * resolution + x;
          const value = base.samples[i];
          if (!value) continue;
          const key = (z >>> 5) * columns + (x >>> 5),
            bit = 1 << (x & 31),
            row = z & 31;
          let page = pages.get(key);
          if (page && page[row] & bit) continue;
          if (!writable.has(key)) {
            page = page ? page.slice() : new Uint32Array(32);
            pages.set(key, page);
            writable.add(key);
          }
          page![row] |= bit;
          // Order/overlap-independent content identity, without scanning unaffected source texels.
          hash = (hash ^ clearedSampleHash(i, value)) >>> 0;
          fieldChanged = true;
        }
    }
    if (!fieldChanged) return field;
    changed = true;
    let samples: Uint8Array | undefined;
    const projected = Object.freeze({
      ...base,
      get samples(): Uint8Array {
        if (!samples) {
          samples = new Uint8Array(base.samples);
          for (const [key, page] of pages) {
            const x0 = (key % columns) * 32,
              z0 = Math.floor(key / columns) * 32;
            for (let row = 0; row < 32; row++) {
              let bits = page[row];
              while (bits) {
                samples[(z0 + row) * resolution + x0 + 31 - Math.clz32(bits & -bits)] = 0;
                bits &= bits - 1;
              }
            }
          }
        }
        return samples;
      },
      hash,
      candidateSeed: field.candidateSeed ?? field.hash
    });
    // Bilinear corners and nearby candidates share pages; immutable masks make this one-page cache safe.
    let pageKey = -1,
      page: Uint32Array | undefined;
    projections.set(projected, {
      source: base,
      resolution,
      pages,
      read(x, z) {
        const key = (z >>> 5) * columns + (x >>> 5);
        if (key !== pageKey) {
          pageKey = key;
          page = pages.get(key);
        }
        return page && page[z & 31] & (1 << (x & 31)) ? 0 : base.samples[z * resolution + x];
      }
    });
    return projected;
  });
  return changed ? { ...source, detailDensityFields } : source;
}
