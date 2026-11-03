import { add, sub, f32, type RoofCurve } from "./RecoveredRoofMath";
import { wallArclengthFromWorld } from "./RecoveredWallSpace";
import type { PlankBounds } from "./RecoveredWoodPlank";

export interface WoodArchOpening {
  points: readonly (readonly [number, number, number])[];
  heights: readonly number[];
}

/** Original arch_openings_to_aabb2 (0x1010f0bb0). Structural arch ranges
 * become board cutouts BEFORE plank subdivision. Their ceiling is the maximum
 * absolute profile height, bottom is wallBottom-.2, and closed seams split into
 * separate intervals. Window SDF search bounds are not structural cutouts.
 * REA ev_c6ea17f6792cc023d7769012aa5b9a6eb00d3d6f15b63e809fc6521fe08049e0.
 */
export function woodArchOpeningBounds(
  curve: RoofCurve,
  sourceLength: number,
  wallBottom: number,
  closed: boolean,
  openings: readonly WoodArchOpening[]
): PlankBounds[] {
  const length = f32(sourceLength),
    bottom = add(wallBottom, -0.2);
  if (!(length > 0) || !Number.isFinite(length) || !Number.isFinite(bottom))
    throw RangeError("Finite wood arch wall length and bottom required");
  const result: PlankBounds[] = [];
  for (const opening of openings) {
    if (
      opening.points.some((p) => p.length !== 3 || !p.every((v) => Number.isFinite(f32(v)))) ||
      !opening.heights.every((v) => Number.isFinite(f32(v)))
    )
      throw RangeError("Finite wooden arch opening samples required");
    const count = Math.min(opening.points.length, opening.heights.length);
    let lo = Infinity,
      hi = -Infinity,
      top = -Infinity,
      previous = 0;
    for (let i = 0; i < count; i++) {
      const p = opening.points[i];
      let u = wallArclengthFromWorld(curve, length, [p[0], p[2]]);
      if (closed && i > 0)
        while (u < previous) {
          const next = add(u, length);
          if (!(next > u)) throw RangeError("Wood arch traversal exceeds float32 resolution");
          u = next;
        }
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
      top = Math.max(top, add(p[1], opening.heights[i]));
      previous = u;
    }
    if (![lo, hi, top].every(Number.isFinite)) continue;
    if (!closed) {
      result.push([lo, bottom, hi, top]);
      continue;
    }
    if (!(length > f32(0.01))) continue;
    if (sub(hi, lo) >= add(length, -0.0001)) {
      result.push([0, bottom, length, top]);
      continue;
    }
    while (lo < add(hi, -0.0001)) {
      const remainder = f32(lo % length),
        from = remainder < 0 ? add(Math.abs(length), remainder) : remainder;
      const span = Math.min(sub(hi, lo), sub(length, from));
      if (span <= f32(0.0001)) break;
      result.push([from, bottom, add(from, span), top]);
      const next = add(lo, span);
      if (!(next > lo)) throw RangeError("Wood arch cutout exceeds float32 resolution");
      lo = next;
    }
  }
  return result;
}
