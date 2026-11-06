import { f32 as f, add, sub, mul, div } from "./RecoveredRoofMath";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler";

/** Recovered is_out_of_roof_bounds 0x101111b1c. width/height are the original
 * full_dormer collision model's BBX spans, NOT frame span or strip width.
 * The host may scale these with its explicitly resized body dimensions.
 */
export function cottageRoofClearance(
  position: readonly number[],
  rank: 1 | 2 | 3,
  roof: RecoveredCottageRoofSampler,
  width: number,
  height: number
) {
  if (
    position.length !== 3 ||
    !position.every((v) => Number.isFinite(f(v))) ||
    ![1, 2, 3].includes(rank) ||
    ![width, height].every((v) => f(v) > 0 && Number.isFinite(f(v)))
  )
    throw Error("Finite positive Cottage clearance dimensions required");
  const circle = "radius" in roof.footprint;
  const topY = add(mul(roof.height, [0.1, 0.15, 0.2][rank - 1]), add(add(mul(height, 0.5), 0.1), position[1]));
  const limitY = sub(add(roof.surface.base_height, roof.height), circle ? 0.5 : 0.1);
  if (topY > limitY) return { valid: false, reason: "roof-height" as const, topY, limitY };
  if (!circle) {
    const halfWidth = add(mul(width, 0.5), 0.1);
    const wrap = (v: number) => {
      const q = f(v % 1);
      return q < 0 ? add(q, 1) : q;
    };
    for (const y of [position[1], topY]) {
      const section = roof.sectionAt([position[0], y, position[2]]);
      const center = section.closestU(position[0], position[2]);
      const offset = div(halfWidth, section.perimeter());
      const a = wrap(sub(center, offset)),
        b = wrap(add(center, offset));
      const end = a > b ? add(b, 1) : b;
      // Native interval is inclusive at both ends; touching a corner is invalid.
      for (const corner of section.cornerParameters().slice(0, 4)) {
        if ((a <= corner && corner <= end) || (a > b && a <= add(corner, 1) && add(corner, 1) <= end))
          return { valid: false, reason: "roof-corner" as const, topY, limitY, sectionY: y };
      }
    }
  }
  return { valid: true, topY, limitY };
}
