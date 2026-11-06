/** Semantic published profile -> original ordinary-wall caller (0x1010cd0f8).
 * The native ID and sampled count own the seed. No saved producer input needed.
 */
import { f32, add, sub, mul, div } from "./RecoveredRoofMath";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallConnectionShape, WallConnectionFinalHole } from "./WallConnectionTypes";
import type { WallProfile } from "./WallTypes";
import type { UnitFootprintScale } from "./MaterialFootprint";
export function ordinaryWallProfile(
  id: string,
  nativeId: bigint,
  slot: number,
  shape: WallConnectionShape,
  published: PublishedWallProfile,
  height: number,
  holes: WallConnectionFinalHole[],
  followTerrain = true,
  unitScale?: UnitFootprintScale,
  variationKey?: string
): WallProfile {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const fit = (a: number, b: number, x: number) => div(sub(x, a), sub(b, a));
  const circle = shape.type === "circle";
  const t = clamp(div(sub(published.control.length, 0.69), 0.69));
  const endpointJitter = published.gable ? 0 : followTerrain ? mul(mul(t, t), sub(3, add(t, t))) : f32(0.046);
  const extension = circle ? mul(sub(1, clamp(fit(0.9000000357627869, 3.5999999046325684, shape.radius))), 0.06) : 0;
  const thicknessT = circle ? clamp(fit(0.9000000357627869, 3, shape.radius)) : 0;
  const thickness = circle ? add(thicknessT, mul(sub(1, thicknessT), 0.9)) : 0;
  return {
    ...(unitScale ? { unitScale } : {}),
    ...(variationKey !== undefined ? { variationKey } : {}),
    id,
    slot,
    curve: {
      pointsXZ: published.projected.points as [number, number][],
      knots: published.projected.knots,
      length: published.projected.length
    },
    top: published.top,
    bottom: published.bottom,
    third: published.third,
    seed: BigInt.asUintN(64, nativeId * 0x4b28021n + BigInt(published.points.length)),
    parameters: [endpointJitter, published.minGround, extension, thickness, f32(height)],
    mode: 0,
    roof: published.gable ?? { height: 0, ranges: [0, 0, 0, 0], kind: 2 },
    widthExtension: circle,
    scaleThickness: circle,
    extendTop: false,
    holes: holes.map((h) => ({ bounds: [h.minU, h.minY, h.maxU, h.maxY], flags: h.kind | (h.seamCopy ? 256 : 0) })),
    holeLength: published.control.length,
    holesClosed: true
  };
}

import { generateWallCorners } from "./RecoveredWallCorners";
import { generateOrdinaryWall } from "./RecoveredWallLayout";
import { finalizeWallConnectionHoles } from "./RecoveredWallConnectionHoles";
import type { WallConnectionWipHole } from "./WallConnectionTypes";
/** Corner occupancy belongs to the masonry constructor's private hole clone.
 * Return shared holes separately so plaster never receives these placeholders. */
export function generateMasonry(
  id: string,
  nativeId: bigint,
  slot: number,
  shape: WallConnectionShape,
  published: PublishedWallProfile,
  height: number,
  sharedHoles: WallConnectionWipHole[] = [],
  followTerrain = true,
  unitScale?: UnitFootprintScale,
  variationKey?: string
) {
  const corners = generateWallCorners({
    unitScale,
    variationKey,
    id,
    slot,
    control: published.control,
    points: published.points,
    bottom: published.bottom,
    top: published.top,
    third: published.third,
    closed: true,
    lowerTop: false,
    gableEave: published.gable?.height,
    holes: sharedHoles
  });
  const finalized = finalizeWallConnectionHoles([...sharedHoles, ...corners.occupancy], published.control.length, true);
  const profile = ordinaryWallProfile(
    id,
    nativeId,
    slot,
    shape,
    published,
    height,
    finalized,
    followTerrain,
    unitScale,
    variationKey
  );
  const ordinary = generateOrdinaryWall(profile);
  return {
    instances: [...corners.instances, ...ordinary.instances],
    corners,
    ordinary,
    profile,
    sharedHoles,
    privateMasonryHoles: finalized
  };
}
