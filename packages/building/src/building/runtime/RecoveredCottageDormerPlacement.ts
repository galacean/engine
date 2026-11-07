import { f32 as f, add, sub, mul, div, sqrt } from "./RecoveredRoofMath";
import { RecoveredCottageRoofSampler, cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler";

export interface CottageDormerFrameTransform {
  position: number[];
  quaternion: number[];
  scale: number[];
}

export function cottageDormerWidth(rank: 1 | 2 | 3): number {
  return f([0.8, 1.5, 2.2][rank - 1]);
}

const wrap = (x: number) => {
  const value = f(x % 1);
  return value < 0 ? add(value, 1) : value;
};

/** Original full-Cottage producer 0x1011126ec..0x101112f80.
 * Rank chooses repeated rank-1 frames; it is not a mesh merged by the editor.
 * Center U comes from the analytic shape. Frame positions and facing come from
 * its polygonal curve. Rank 3 retains only the cached middle orientation.
 */
export function cottageFullDormerFrames(
  cached: CottageDormerFrameTransform,
  rank: 1 | 2 | 3,
  roof: RecoveredCottageRoofSampler,
  /** Native width by default; host size edits scale the arc spacing, not the roof. */
  width = cottageDormerWidth(rank)
): CottageDormerFrameTransform[] {
  if (!(f(width) > 0) || !Number.isFinite(f(width))) throw Error("Positive finite dormer spacing required");
  if (rank === 1)
    return [{ position: cached.position.slice(), quaternion: cached.quaternion.slice(), scale: cached.scale.slice() }];
  const p = cached.position,
    shape = roof.sectionAt(p),
    center = shape.closestU(p[0], p[2]);
  const fraction = div(width, shape.perimeter());
  const offset = rank === 2 ? mul(fraction, 0.25) : div(fraction, 3),
    curve = shape.asCurve3(p[1]);
  const flank = (u: number): CottageDormerFrameTransform => {
    const t = curve.tangent(u),
      n = [-t[2], 0, t[0]];
    const inv = div(1, sqrt(add(add(mul(n[0], n[0]), mul(n[1], n[1])), mul(n[2], n[2]))));
    return {
      position: curve.sample(u),
      quaternion: cottageXzProjectiveRotation(n.map((q) => mul(q, inv))),
      scale: [1, 1, 1]
    };
  };
  const left = flank(wrap(sub(center, offset))),
    right = flank(wrap(add(center, offset)));
  return rank === 2
    ? [left, right]
    : [
        left,
        {
          position: curve.sample(center),
          quaternion: cached.quaternion.slice(),
          scale: [1, 1, 1]
        },
        right
      ];
}
