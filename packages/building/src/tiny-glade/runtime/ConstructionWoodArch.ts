import { resolveConstructionArchRange } from "./ConstructionArchRange";
import { refineConstructionArchWall } from "./ConstructionArchWallProfile";
import { createWoodArchProfile } from "./RecoveredWoodArchProfile";
import { createWoodArchFrameParams, validateWoodArchFrame } from "./RecoveredWoodArchFrame";
import { createWoodArchCornerParams } from "./RecoveredWoodArchCorners";
import { woodArchPillar } from "./RecoveredWoodArchPillar";
import { woodArchOpeningBounds } from "./RecoveredWoodArchCutouts";
import { applyWallArchCuts } from "./RecoveredWallArchCut";
import { add, sub, mul, div, sqrt, f32, RoofCurve } from "./RecoveredRoofMath";
import type { PublishedWallProfile } from "./PublishedWallProfile";

export interface ConstructionWoodArchInput {
  depthScale?: number;
  id: string;
  centerU: number;
  width: number;
  /** World-space lintel height; ground remains owned by the wall publication. */
  topY: number;
  seed: number;
  slot: number;
}

/** Explicit author interval adapter for the native wooden opening producers.
 * The same original profile feeds the lintel, braces, endpoint pillars, wall
 * lower boundary and board cutouts. This is not native path-paint authoring.
 * Regular house walls use the original non-narrow frame/pillar parameters.
 */
export function planConstructionWoodArch(source: PublishedWallProfile, input: ConstructionWoodArchInput) {
  const uint = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (!input.id || !uint(input.seed) || !uint(input.slot) || !Number.isFinite(f32(input.topY)))
    throw RangeError("Invalid construction wooden arch input");
  const refined = refineConstructionArchWall(
    source,
    resolveConstructionArchRange(source, input.centerU, input.width),
    0.43 / 2
  );
  const { range, profile } = refined;
  const originalHeights = range.points.map((p) => sub(input.topY, p[1]));
  if (originalHeights.some((h) => !(h > 0))) throw RangeError("Wooden lintel must be above the entire ground interval");
  const opening = createWoodArchProfile({
    points: range.points,
    originalHeights,
    referenceTop: input.topY,
    wallTop: range.wallTop
  });
  const cut = { ...opening, indices: range.indices, startInsetFraction: 0, endInsetFraction: 1 };
  const third = applyWallArchCuts(profile.third, [cut], true);
  const cutouts = woodArchOpeningBounds(profile.control, profile.control.length, profile.minGround, true, [opening]);
  let sampledTopY = -Infinity;
  for (let i = 0; i < opening.points.length; i++)
    sampledTopY = Math.max(sampledTopY, add(opening.points[i][1], opening.heights[i]));
  return {
    range,
    cut,
    cutouts,
    profile: { ...profile, third },
    requestedTopY: f32(input.topY),
    sampledTopY,
    placement: {
      id: input.id,
      seed: input.seed,
      slot: input.slot,
      depthScale: input.depthScale,
      heights: opening.heights
    }
  };
}

export type WoodArchPlacementParameters = ReturnType<typeof planConstructionWoodArch>["placement"];
export function placeConstructionWoodArch(
  points: readonly (readonly [number, number, number])[],
  input: WoodArchPlacementParameters
) {
  const opening = { points: points.map((p) => [...p] as [number, number, number]), heights: input.heights };
  const frames = [
    ...createWoodArchFrameParams(opening, false).map((frame, i) => ({ id: `${input.id}/lintel/${i}`, frame })),
    ...createWoodArchCornerParams(opening, false).map((frame, i) => ({ id: `${input.id}/brace/${i}`, frame }))
  ];
  const depthScale = input.depthScale ?? 1;
  if (!(depthScale > 0) || !Number.isFinite(Math.fround(depthScale))) throw RangeError("Invalid arch depth scale");
  for (const part of frames) {
    part.frame.section[1] = mul(part.frame.section[1], depthScale);
    validateWoodArchFrame(part.frame);
  }
  const pillars: { id: string; bytes: ArrayBuffer }[] = [];
  const last = opening.points.length - 1,
    length = new RoofCurve(opening.points).length;
  for (const i of [0, last]) {
    if (!(opening.heights[i] > f32(0.3)) || (i === last && !(length > f32(0.3)))) continue;
    const a = opening.points[i === 0 ? 0 : last - 1],
      b = opening.points[i === 0 ? 1 : last];
    const dx = sub(b[0], a[0]),
      dz = sub(b[2], a[2]),
      inverse = div(1, sqrt(add(mul(dx, dx), mul(dz, dz))));
    if (!Number.isFinite(inverse)) throw RangeError("Wooden arch endpoint direction is degenerate");
    pillars.push({
      id: `${input.id}/pillar/${i === 0 ? 0 : 1}`,
      bytes: woodArchPillar({
        direction: [mul(dx, inverse), mul(dz, inverse)],
        position: opening.points[i],
        height: opening.heights[i],
        depth: mul(0.675, depthScale),
        width: 0.43,
        embed: 0.7,
        extension: 0.15,
        gateSeed: input.seed,
        pieceSeed: i === 0 ? 0 : 1,
        colorId: input.slot
      })
    });
  }
  return { frames, pillars };
}

export function compileConstructionWoodArch(source: PublishedWallProfile, input: ConstructionWoodArchInput) {
  const { placement, ...plan } = planConstructionWoodArch(source, input);
  return { ...plan, ...placeConstructionWoodArch(plan.cut.points, placement) };
}
