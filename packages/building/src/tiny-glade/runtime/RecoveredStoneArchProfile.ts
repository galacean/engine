import { add, sub, mul, div, f32, RoofCurve } from "./RecoveredRoofMath";

/** Inputs to the profile fold called by create_stone_arch_profile (0x10105d4d8).
 * Heights are offsets above the corresponding path point, not world Y.
 * The caller owns endpoint resampling and the subsequent wall-top clamp. */
export interface StoneArchProfileInput {
  points: readonly (readonly [number, number, number])[];
  originalHeights: readonly number[];
  scale: number;
  referenceTop: number;
  referenceBase: number;
  /** `start`/`end` describes an open wall endpoint, not an arch handedness. */
  openEnd: "symmetric" | "start" | "end";
  /** Length before the native .1875 endpoint inset, including path Y. */
  originalLength: number;
}

/** Original profile fold 0x1010d962c, ARM64 build
 * 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * REA ev_f2a99d02874ef6e28efdcaba9b2af492cbf5c119552e90b86a2acbea1f8928bc.
 * This produces the sampled arch boundary; it does not generate voussoirs,
 * carve a wall, or stand in for ArchWalker. No native runtime is required. */
function validateProfile(input: StoneArchProfileInput): void {
  const { points, originalHeights, openEnd } = input;
  const finite32 = (value: number) => Number.isFinite(f32(value));
  if (
    points.length < 2 ||
    originalHeights.length !== points.length ||
    points.some((p) => p.length !== 3 || !p.every(finite32)) ||
    !originalHeights.every(finite32) ||
    ![input.scale, input.referenceTop, input.referenceBase, input.originalLength].every(finite32) ||
    !(f32(input.scale) > 0) ||
    !(f32(input.originalLength) > 0) ||
    !["symmetric", "start", "end"].includes(openEnd)
  ) {
    throw Error("Invalid stone arch profile input");
  }
}

export function stoneArchProfileHeights(input: StoneArchProfileInput): number[] {
  validateProfile(input);
  const { points, originalHeights, openEnd } = input;
  const denominator = sub(f32(points.length), 1);
  // Native fit01(2, 1, length), saturated after evaluation.
  const endpointBlend = Math.min(1, Math.max(0, div(sub(input.originalLength, 2), sub(1, 2))));
  return points.map((point, index) => {
    const ratio = Math.min(1, Math.max(0, div(originalHeights[index], input.scale)));
    const shoulder = add(mul(ratio, 0.5), mul(sub(1, ratio), 0));
    const u = div(f32(index), denominator);
    const distance = Math.abs(sub(u, 0.5));
    const doubled = add(distance, distance);
    const complement = sub(1, shoulder);
    const symmetric = sub(1, mul(mul(mul(doubled, doubled), doubled), complement));
    let weight = symmetric;
    if (openEnd !== "symmetric") {
      const sideU = openEnd === "start" ? u : sub(1, u);
      const oneSided = sub(1, mul(complement, mul(sideU, sideU)));
      weight = add(mul(oneSided, endpointBlend), mul(symmetric, sub(1, endpointBlend)));
    }
    const lower = Math.max(0, sub(sub(input.referenceBase, 1), point[1]));
    return add(mul(sub(input.referenceTop, point[1]), weight), mul(lower, sub(1, weight)));
  });
}

export interface StoneArchSegmentInput {
  points: StoneArchProfileInput["points"];
  originalHeights: readonly number[];
  scale: number;
  reference?: { top: number; base: number };
  boundary: { kind: "closed"; wallTop: readonly number[] } | { kind: "open"; start: boolean; end: boolean };
}

/** Whole native profile producer 0x10105d4d8. The upstream LoopRange is resolved
 * by the caller to endpoint flags and matching wall-top samples; this function
 * neither invents the range nor treats array indices as native wall identities.
 * Returned points/heights are owned snapshots. The masonry walker and wall cut
 * must consume this SAME boundary, including endpoint insets and top limiting. */
export function createStoneArchProfile(input: StoneArchSegmentInput): {
  points: [number, number, number][];
  heights: number[];
  startInsetFraction: number;
  endInsetFraction: number;
} {
  validateProfile({
    ...input,
    referenceTop: input.reference?.top ?? 0,
    referenceBase: input.reference?.base ?? 0,
    openEnd: "symmetric",
    originalLength: 1
  });
  const boundary = input.boundary;
  if (
    !boundary ||
    (boundary.kind === "closed"
      ? boundary.wallTop.length !== input.points.length || !boundary.wallTop.every((v) => Number.isFinite(f32(v)))
      : boundary.kind !== "open" || typeof boundary.start !== "boolean" || typeof boundary.end !== "boolean")
  )
    throw Error("Invalid stone arch boundary");

  const points = input.points.map((p) => p.map(f32) as [number, number, number]);
  let referenceTop = f32(input.reference?.top ?? add(input.originalHeights[0], points[0][1]));
  let referenceBase = f32(input.reference?.base ?? points[0][1]);
  if (!input.reference) {
    for (let i = 1; i < points.length; i++) {
      const top = add(input.originalHeights[i], points[i][1]);
      if (top > referenceTop) {
        referenceTop = top;
        referenceBase = points[i][1];
      }
    }
  }
  let originalLength = 1;
  let startInsetFraction = 0;
  let endInsetFraction = 1;
  let openEnd: StoneArchProfileInput["openEnd"] = "symmetric";
  if (boundary.kind === "open" && (boundary.start || boundary.end)) {
    originalLength = new RoofCurve(points).length;
    openEnd = boundary.start ? "start" : "end";
    const curve = new RoofCurve(points.map((p) => [p[0], p[2]]));
    if (curve.length > f32(0.1875)) {
      const inset = Math.min(f32(0.95), div(0.1875, curve.length));
      startInsetFraction = boundary.start ? (boundary.end ? Math.min(f32(0.475), inset) : inset) : 0;
      endInsetFraction = boundary.end ? sub(1, boundary.start ? startInsetFraction : inset) : 1;
      const [first] = curve.coord(startInsetFraction),
        [last] = curve.coord(endInsetFraction);
      const sliced = new RoofCurve([
        curve.sample(startInsetFraction),
        ...curve.points.slice(first + 1, last + 1),
        curve.sample(endInsetFraction)
      ]);
      for (let i = 0; i < points.length; i++) {
        const p = sliced.sample(div(f32(i), sub(f32(points.length), 1)));
        points[i][0] = p[0];
        points[i][2] = p[1];
      }
    }
  }
  const heights = stoneArchProfileHeights({ ...input, points, referenceTop, referenceBase, openEnd, originalLength });
  if (boundary.kind === "closed") {
    for (let i = 0; i < heights.length; i++) heights[i] = Math.min(heights[i], sub(boundary.wallTop[i], points[i][1]));
  }
  return { points, heights, startInsetFraction, endInsetFraction };
}
