import { add, sub, mul, div, f32, RoofCurve } from "./RecoveredRoofMath";

export interface WallArchCut {
  /** Resolved LoopRange sample identities, in traversal order. The caller owns
   * endpoint selection and closed-wall wrapping; these are not UV fractions. */
  indices: readonly number[];
  points: readonly (readonly [number, number, number])[];
  heights: readonly number[];
  startInsetFraction: number;
  endInsetFraction: number;
}

/** construct_arches 0x1010734e4..0x10107384c writes the SAME profile used by
 * the stone or wood member producers into the wall's third field. Inset profiles remap the original
 * sample fraction through the inset interval, clamp, then sample the XZ curve.
 * Heights remain offsets above the wall's original ground samples.
 * This ports the writeback, not native ECS/range discovery. Original ARM64
 * build 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * Closed endpoint copy follows 0x10107572c..0x101075750. */
export function applyWallArchCuts(base: readonly number[], cuts: readonly WallArchCut[], closed: boolean): number[] {
  const finite = (x: number) => Number.isFinite(f32(x));
  if (base.length < 2 || !base.every(finite)) throw Error("Invalid arch wall field");
  const third = base.map(f32);
  for (const cut of cuts) {
    const n = cut.heights.length;
    const start = f32(cut.startInsetFraction),
      end = f32(cut.endInsetFraction);
    if (
      n < 2 ||
      cut.indices.length !== n ||
      cut.points.length !== n ||
      !cut.heights.every(finite) ||
      cut.points.some((p) => p.length !== 3 || !p.every(finite)) ||
      cut.indices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= base.length) ||
      !finite(start) ||
      !finite(end) ||
      start < 0 ||
      end > 1 ||
      !(start < end)
    )
      throw Error("Invalid arch wall cut");
    const curve = start === 0 && end === 1 ? null : new RoofCurve(cut.points.map((p) => [p[0], p[2]]));
    for (let i = 0; i < n; i++) {
      let height = f32(cut.heights[i]);
      if (curve) {
        const u = Math.min(1, Math.max(0, div(sub(div(i, sub(n, 1)), start), sub(end, start))));
        const [j, t] = curve.coord(u);
        height = add(cut.heights[j], mul(t, sub(cut.heights[j + 1], cut.heights[j])));
      }
      const index = cut.indices[i];
      third[index] = Math.max(third[index], height);
    }
  }
  if (closed) third[third.length - 1] = third[0];
  return third;
}
