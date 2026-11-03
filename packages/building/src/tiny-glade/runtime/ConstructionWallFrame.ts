import { RoofCurve, f32 } from "./RecoveredRoofMath";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallConnectionShape, WallConnectionWipHole } from "./WallConnectionTypes";
import { generateMasonry } from "./WallProfileAdapter";
import { generateWallPlaster } from "./RecoveredWallPlaster";
import { finalizeWallConnectionHoles } from "./RecoveredWallConnectionHoles";
import { encodeBrick96 } from "./UnitPacking.js";
import type { UnitFootprintScale } from "./MaterialFootprint";

/** Recovered kernels normalize by positive top Y and start plaster at zero.
 * Give each host wall its own explicit layout frame, then publish positions and
 * clip planes in shared world Y. UV/noise remain in the local layout frame.
 * This is a host adaptation, not a claim that the native kernels are invariant
 * under translation. Never derive this frame from another owner's footprint. */
export function compileWallInFrame(
  id: string,
  nativeId: bigint,
  slot: number,
  shape: WallConnectionShape,
  world: PublishedWallProfile,
  height: number,
  holes: WallConnectionWipHole[],
  host: boolean,
  unitScale?: UnitFootprintScale
) {
  const { originY, local, localHoles } = prepareWallFrame(world, holes, host);
  const masonry = generateMasonry(id, nativeId, slot, shape, local, height, localHoles, true, unitScale);
  const plaster = generateWallPlaster(shape, local, {
    holes: finalizeWallConnectionHoles(localHoles, local.control.length, true)
  });
  if (originY !== 0) {
    translateMasonry(masonry, originY);
    for (const side of plaster.sides) {
      const v = new DataView(side.vertices48.buffer, side.vertices48.byteOffset, side.vertices48.byteLength);
      for (let i = 0; i < side.vertices48.byteLength; i += 48)
        v.setFloat32(i + 4, v.getFloat32(i + 4, true) + originY, true);
    }
    for (const patch of plaster.patches) patch.bounds[1] = f32(patch.bounds[1] + originY);
  }
  // Preserve the caller's world-space reservation facts alongside the world
  // profile. Kernel-private holes remain in the explicit layout frame.
  return { masonry, plaster, worldHoles: holes, layoutOriginY: originY };
}

/** Material-specific layout needs the same recovered masonry lattice, without
 * recomputing plaster that remains owned by the full wall publication. */
export function compileWallMasonryInFrame(
  id: string,
  nativeId: bigint,
  slot: number,
  shape: WallConnectionShape,
  world: PublishedWallProfile,
  height: number,
  holes: WallConnectionWipHole[],
  host: boolean,
  unitScale?: UnitFootprintScale
) {
  const { originY, local, localHoles } = prepareWallFrame(world, holes, host);
  const masonry = generateMasonry(id, nativeId, slot, shape, local, height, localHoles, true, unitScale);
  if (originY !== 0) translateMasonry(masonry, originY);
  return masonry;
}
function prepareWallFrame(world: PublishedWallProfile, holes: WallConnectionWipHole[], host: boolean) {
  const originY = host ? f32(world.minGround - 1) : 0;
  const y = (v: number) => f32(v - originY);
  const points = world.points.map((p): [number, number, number] => [p[0], y(p[1]), p[2]]);
  const local: PublishedWallProfile =
    originY === 0
      ? world
      : {
          ...world,
          points,
          ground: new RoofCurve(points),
          bottom: world.bottom.map(y),
          top: world.top.map(y),
          topY: y(world.topY),
          maxY: y(world.maxY),
          maxYGable: y(world.maxYGable),
          minGround: y(world.minGround),
          maxGround: y(world.maxGround),
          gable: world.gable && { ...world.gable, height: y(world.gable.height) }
        };
  const localHoles = holes.map((h) => ({ ...h, centerY: y(h.centerY) }));
  return { originY, local, localHoles };
}
function translateMasonry(masonry: ReturnType<typeof generateMasonry>, originY: number) {
  for (const instance of masonry.instances) {
    const v = new DataView(instance.domain96.buffer, instance.domain96.byteOffset, 96);
    // Affine translation Y and three absolute lower clip heights. Deformation
    // deltas, dimensions, stable IDs and UVs are deliberately not translated.
    for (const offset of [40, 64, 68, 72]) v.setFloat32(offset, v.getFloat32(offset, true) + originY, true);
    instance.packed64 = encodeBrick96(instance.domain96);
  }
}
