import { add, sub, f32 } from "./RecoveredRoofMath";

export interface WoodArchProfileInput {
  points: readonly (readonly [number, number, number])[];
  /** Offsets above the corresponding path points, used to resolve an omitted top. */
  originalHeights: readonly number[];
  /** Absolute top elevation. Explicit zero is distinct from omission. */
  referenceTop?: number;
  /** Optional ceiling samples already mapped through the owner's LoopRange.
   * Omission is the native unclamped/open-wall path. */
  wallTop?: readonly number[];
}

/** Native create_wood_arch_profile (0x10105d164), ARM64 SHA256
 * 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * REA ev_86119052414047141e5f774884632f6df759e81bd94348e68dee68b75b5b67ec.
 * Wooden openings have a level top, clipped below the wall ceiling when supplied.
 * They do not use the stone arch's cubic shoulder or endpoint inset.
 * This boundary producer does not generate the wooden frame or carve the host.
 */
export function createWoodArchProfile(input: WoodArchProfileInput): {
  points: [number, number, number][];
  heights: number[];
} {
  const { points, originalHeights, referenceTop, wallTop } = input;
  const finite32 = (v: number) => Number.isFinite(f32(v));
  if (
    points.length === 0 ||
    points.length !== originalHeights.length ||
    points.some((p) => p.length !== 3 || !p.every(finite32)) ||
    !originalHeights.every(finite32) ||
    (referenceTop !== undefined && !finite32(referenceTop)) ||
    (wallTop !== undefined && (wallTop.length !== points.length || !wallTop.every(finite32)))
  ) {
    throw Error("Invalid wood arch profile input");
  }
  const ownedPoints = points.map((p) => p.map(f32) as [number, number, number]);
  let top = referenceTop === undefined ? add(originalHeights[0], ownedPoints[0][1]) : f32(referenceTop);
  if (referenceTop === undefined) {
    for (let i = 1; i < ownedPoints.length; i++) top = Math.max(top, add(originalHeights[i], ownedPoints[i][1]));
  }
  const heights = ownedPoints.map((point, i) => {
    const height = sub(top, point[1]);
    return wallTop === undefined ? height : Math.min(height, Math.max(0, sub(sub(wallTop[i], point[1]), 0.25)));
  });
  if (!heights.every(Number.isFinite)) throw Error("Invalid wood arch profile extent");
  return { points: ownedPoints, heights };
}
