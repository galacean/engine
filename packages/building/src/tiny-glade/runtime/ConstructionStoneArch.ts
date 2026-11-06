import { encodeBrick96 } from "./UnitPacking.js";
import { refineConstructionArchWall } from "./ConstructionArchWallProfile";
import { resolveConstructionArchRange } from "./ConstructionArchRange";
import { createStoneArchProfile } from "./RecoveredStoneArchProfile";
import { walkStoneArch } from "./RecoveredStoneArchWalker";
import { stoneArchBrick } from "./RecoveredStoneArchBricks";
import {
  assembleStoneArchPillar,
  resolveStoneArchPillarProposals,
  stoneArchPillarBrick,
  type StoneArchPillarProposal
} from "./RecoveredStoneArchPillar";
import { applyWallArchCuts } from "./RecoveredWallArchCut";
import { add, sub, mul, div, sqrt, f32, RoofCurve, RoofRandom } from "./RecoveredRoofMath";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallInstance } from "./WallTypes";

/** Explicit host inputs, not Tiny Glade's path-raster authoring format.
 * apexY is a requested world height; scale controls the original profile fold.
 * There is no raised sill: this constructor opens the wall down to its ground.
 * The caller owns attachment collision checks and feedback for top clamping. */
export interface ConstructionStoneArchInput {
  /** Host depth extension; native identity remains 1. */
  depthScale?: number;
  id: string;
  variationKey?: string;
  centerU: number;
  width: number;
  apexY: number;
  scale: number;
  seed: number;
  slot: number;
}

/** Compose the recovered stone profile, walker, voussoirs, endpoint pillars and
 * third-field writeback. Both brick construction and wall removal consume one
 * profile. Centre/width and a requested apex are our explicit-author adapter;
 * they do not emulate native path painting or its exponential height sampler. */
export function planConstructionStoneArch(profile: PublishedWallProfile, input: ConstructionStoneArchInput) {
  const uint = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (
    !input.id ||
    !uint(input.seed) ||
    !uint(input.slot) ||
    !Number.isFinite(f32(input.apexY)) ||
    !Number.isFinite(f32(input.scale)) ||
    !(f32(input.scale) > 0)
  )
    throw RangeError("Invalid construction stone arch input");
  const refined = refineConstructionArchWall(
    profile,
    resolveConstructionArchRange(profile, input.centerU, input.width)
  );
  profile = refined.profile;
  const range = refined.range;
  const originalHeights = range.points.map((p) => sub(input.apexY, p[1]));
  if (originalHeights.some((h) => !(h > 0))) throw RangeError("Arch apex must be above its entire ground interval");
  const arch = createStoneArchProfile({
    points: range.points,
    originalHeights,
    scale: input.scale,
    reference: { top: f32(input.apexY), base: sub(input.apexY, input.scale) },
    boundary: { kind: "closed", wallTop: range.wallTop }
  });
  const cut = { ...arch, indices: range.indices };
  const third = applyWallArchCuts(profile.third, [cut], true);
  let sampledApexY = -Infinity;
  for (let i = 0; i < arch.points.length; i++)
    sampledApexY = Math.max(sampledApexY, add(arch.points[i][1], arch.heights[i]));
  return {
    range,
    cut,
    profile: { ...profile, third },
    requestedApexY: f32(input.apexY),
    sampledApexY,
    placement: {
      id: input.id,
      ...(input.variationKey !== undefined ? { variationKey: input.variationKey } : {}),
      seed: input.seed,
      slot: input.slot,
      depthScale: input.depthScale,
      heights: arch.heights,
      wallParameters: range.wallParameters,
      indices: range.indices,
      wallLength: profile.control.length
    }
  };
}

/** Per-sample rises and wall coordinates are solved layout constraints; the Path owns the base geometry. */
export type StoneArchPlacementParameters = ReturnType<typeof planConstructionStoneArch>["placement"];
export function placeConstructionStoneArch(
  points: readonly (readonly [number, number, number])[],
  input: StoneArchPlacementParameters
) {
  const arch = { points: points.map((p) => [...p] as [number, number, number]), heights: input.heights };
  const steps = walkStoneArch({ ...arch, wallParameters: input.wallParameters, cyclic: true });
  const instances: WallInstance[] = steps.map((segment, index) => ({
    id: `${input.id}/arch/${index}`,
    ...(input.variationKey !== undefined ? { seed_id: `${input.variationKey}/arch/${index}` } : {}),
    row: 0,
    column: index,
    ...stoneArchBrick({ segment, index, baseSeed: input.seed, slot: input.slot, wallLength: input.wallLength })
  }));
  // construct_arches 0x101073d..0x10107414c: endpoints over .3 request
  // pillars; the end additionally requires a path longer than .3. Direction
  // comes from the segment's resampled endpoints, not a control-curve tangent.
  const proposals: StoneArchPillarProposal[] = [];
  const end = arch.points.length - 1;
  const pathLength = new RoofCurve(arch.points).length;
  for (const i of [0, end]) {
    if (!(arch.heights[i] > f32(0.3)) || (i === end && !(pathLength > f32(0.3)))) continue;
    const a = arch.points[i === 0 ? 0 : end - 1],
      b = arch.points[i === 0 ? 1 : end];
    const dx = sub(b[0], a[0]),
      dz = sub(b[2], a[2]);
    const inv = div(1, sqrt(add(mul(dx, dx), mul(dz, dz))));
    proposals.push({
      key: input.indices[i],
      direction: [mul(dx, inv), mul(dz, inv)],
      position: arch.points[i],
      height: arch.heights[i],
      wallU: input.wallParameters[i]
    });
  }
  const pillars = resolveStoneArchPillarProposals(proposals);
  const rng = new RoofRandom(BigInt(input.seed));
  for (let i = 0; i < pillars.length; i++) {
    const pillar = pillars[i];
    const pieces = assembleStoneArchPillar(pillar, rng);
    for (let j = 0; j < pieces.length; j++) {
      const sourceId = (input.seed + instances.length) >>> 0;
      instances.push({
        id: `${input.id}/pillar/${i}/${j}`,
        ...(input.variationKey !== undefined ? { seed_id: `${input.variationKey}/pillar/${i}/${j}` } : {}),
        sourceId,
        row: i + 1,
        column: j,
        ...stoneArchPillarBrick({
          piece: pieces[j],
          direction: pillar.direction,
          wallU: pillar.wallU,
          wallLength: input.wallLength,
          sourceId,
          slot: input.slot
        })
      });
    }
  }
  const depthScale = input.depthScale ?? 1;
  if (!(depthScale > 0) || !Number.isFinite(Math.fround(depthScale))) throw RangeError("Invalid arch depth scale");
  if (depthScale !== 1)
    for (const instance of instances) {
      // The native third basis column spans the wall normal for voussoirs and
      // endpoint pillars. Resize the owned domain before either LOD consumes it.
      const view = new DataView(instance.domain96.buffer, instance.domain96.byteOffset, 96);
      for (let axis = 0; axis < 3; axis++)
        view.setFloat32(24 + axis * 4, view.getFloat32(24 + axis * 4, true) * depthScale, true);
      instance.packed64 = encodeBrick96(instance.domain96);
    }
  return { instances, pillars };
}

/** Convenience for standalone numerical callers, with the same split stages as parts. */
export function compileConstructionStoneArch(profile: PublishedWallProfile, input: ConstructionStoneArchInput) {
  const { placement, ...plan } = planConstructionStoneArch(profile, input);
  return { ...plan, ...placeConstructionStoneArch(plan.cut.points, placement) };
}
