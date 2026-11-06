import { RecoveredCottageRoofSection } from "./RecoveredCottageRoofSampler";
import { add, sub, mul, div, sqrt, f32 } from "./RecoveredRoofMath";
import type { PlankBounds } from "./RecoveredWoodPlank";

/** Original BoardWallSpace::new 0x1010efb90. Source length is published by
 * the wall owner; board length is the expanded shape's sampled curve length.
 * Freeform walls retain their source chart. */
export function createBoardWallSpace(
  shape: RecoveredCottageRoofSection | null,
  sourceLength: number,
  outwardOffset = 0.125
): RecoveredBoardWallSpace {
  const boardShape = shape?.expand(outwardOffset) ?? null;
  return new RecoveredBoardWallSpace(
    shape && !("radius" in shape.shape) ? shape : null,
    boardShape,
    sourceLength,
    boardShape ? boardShape.asCurve2().length : sourceLength,
    outwardOffset
  );
}

/** Published wall chart and the board chart are distinct. Rectangles remap
 * along each displaced edge; other shape pairs use the native length ratio.
 * This does not move a decoration's world pose or SDF sampling domain. */
export class RecoveredBoardWallSpace {
  readonly sourceLength: number;
  readonly boardLength: number;
  readonly outwardOffset: number;

  constructor(
    readonly sourceRectangle: RecoveredCottageRoofSection | null,
    readonly boardShape: RecoveredCottageRoofSection | null,
    sourceLength: number,
    boardLength: number,
    outwardOffset: number
  ) {
    this.sourceLength = f32(sourceLength);
    this.boardLength = f32(boardLength);
    this.outwardOffset = f32(outwardOffset);
    if (
      !(this.sourceLength > 0) ||
      !(this.boardLength > 0) ||
      ![this.sourceLength, this.boardLength, this.outwardOffset].every(Number.isFinite)
    )
      throw Error("Positive finite wall chart lengths and finite offset required");
    if (sourceRectangle && "radius" in sourceRectangle.shape)
      throw Error("Source rectangle or absent rectangle required");
  }

  /** Freeform boards keep published XZ positions; regular boards sample this
   * shape after arclength remapping. Only rectangle pairs use edge projection. */
  get boardRectangle(): RecoveredCottageRoofSection | null {
    return this.boardShape && !("radius" in this.boardShape.shape) ? this.boardShape : null;
  }

  /** Original BoardWallSpace::remap_x, 0x1010efc68. The .0001 tolerance
   * selects the preceding edge at corners before clamping its local distance. */
  remap(distance: number): number {
    if (!Number.isFinite(f32(distance))) throw Error("Finite wall arclength required");
    const u = Math.min(this.sourceLength, Math.max(0, f32(distance)));
    const source = this.sourceRectangle,
      target = this.boardRectangle;
    if (!source || !target) return mul(div(u, this.sourceLength), this.boardLength);
    const knots = source.cornerParameters();
    let side = 0;
    for (; side < 4; side++) if (u <= add(mul(knots[side + 1], this.sourceLength), 0.0001)) break;
    if (side === 4) return this.boardLength;
    const base = mul(knots[side], this.sourceLength),
      span = sub(mul(knots[side + 1], this.sourceLength), base);
    const along = Math.min(span, Math.max(0, sub(u, base)));
    const a = source.corner(side),
      b = source.corner(side + 1),
      dx = sub(b[0], a[0]),
      dz = sub(b[1], a[1]);
    const inverse = div(1, sqrt(add(mul(dx, dx), mul(dz, dz))));
    const tangent = Number.isFinite(inverse) && inverse > 0 ? [mul(dx, inverse), mul(dz, inverse)] : [0, 0];
    const normal = source.edgeNormal(side);
    const position = [
      add(mul(normal[0], this.outwardOffset), add(a[0], mul(along, tangent[0]))),
      add(mul(normal[1], this.outwardOffset), add(a[1], mul(along, tangent[1])))
    ];
    const p = target.corner(side),
      q = target.corner(side + 1),
      ex = sub(q[0], p[0]),
      ez = sub(q[1], p[1]);
    const square = add(mul(ex, ex), mul(ez, ez));
    const t = Math.min(
      1,
      Math.max(
        0,
        div(add(mul(ex, sub(position[0], p[0])), mul(ez, sub(position[1], p[1]))), Math.max(square, f32(1e-20)))
      )
    );
    return add(mul(target.cornerParameters()[side], this.boardLength), mul(sqrt(square), t));
  }

  /** Original search-box iterator 0x1010af2f0. Full-chart ends stay anchored
   * at 0 / boardLength, rather than moving into a newly enlarged corner. */
  remapBounds(bounds: PlankBounds): PlankBounds {
    const [lo, y0, hi, y1] = bounds.map(f32);
    if (![lo, y0, hi, y1].every(Number.isFinite) || lo > hi || y0 > y1)
      throw Error("Finite ordered plank bounds required");
    const a = this.remap(lo),
      b = this.remap(hi);
    return [
      lo <= f32(0.0001) ? 0 : Math.min(a, b),
      y0,
      hi >= sub(this.sourceLength, 0.0001) ? this.boardLength : Math.max(a, b),
      y1
    ];
  }
}
