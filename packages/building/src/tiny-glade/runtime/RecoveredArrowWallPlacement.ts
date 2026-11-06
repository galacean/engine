import type { DecorationWindowCut } from "./DecorationWindowCutBuffer";
import { requireDecorationCollision, type ConstructionDecorationCollisions } from "./ConstructionDecorationCollisions";
import { recoveredGothicHatBones, type GothicHatBoneInput } from "./RecoveredGothicWallPlacement";
import { add, sub, mul, f32 } from "./RecoveredRoofMath";
import type { DecorationStoneInstance, DecorationStoneBone } from "./DecorationStoneInstance";
import { assertClosedWallSpan } from "./RecoveredWallSpace";

/** Native arrow producer 0x101102860. The roof consumer independently samples
 * raw bones; only the visual bodies/hat use the wooden-circle sagitta shift.
 * The +.14 blueprint-root offset is NOT a body or Hole48 placement offset. */
export function recoveredArrowWallPlacement(
  collisions: ConstructionDecorationCollisions | undefined,
  input: Omit<GothicHatBoneInput, "width" | "scaleX"> & {
    wooden: boolean;
    sourceScale?: readonly [number, number, number];
    wallMaxY: number;
    wallSlot: number;
    seed: number;
  }
) {
  const scale = input.sourceScale ?? [1, 1, 1];
  if (!scale.every((v) => v > 0 && Number.isFinite(f32(v))) || !Number.isFinite(f32(input.wallMaxY)))
    throw Error("Positive finite arrow scale and wall maximum required");
  const bounds = requireDecorationCollision(collisions, `arrow_slit_1x${input.rank}_collision`);
  const meshSizeX = sub(bounds.max[0], bounds.min[0]);
  const width = mul(meshSizeX, scale[0]);
  assertClosedWallSpan(width, input.wallSpaceLength ?? input.curve.length, input.closed);
  const raw = recoveredGothicHatBones({ ...input, width: f32(0.8), scaleX: scale[0] });
  const { normalXZ, tx, tz } = raw;
  let shift = 0;
  if (input.wooden && input.closed && input.circleRadius !== undefined) {
    const center = raw.bones[1].position;
    shift = Math.max(
      0,
      Math.min(
        1,
        sub(add(mul(sub(center[0], raw.origin[0]), normalXZ[0]), mul(sub(center[2], raw.origin[2]), normalXZ[1])), 0.05)
      )
    );
  }
  const translate = (p: readonly number[]): [number, number, number] => [
    add(p[0], mul(normalXZ[0], shift)),
    p[1],
    add(p[2], mul(normalXZ[1], shift))
  ];
  const origin = translate(raw.origin);
  const visualBone = (b: DecorationStoneBone): DecorationStoneBone => ({
    position: translate(b.position),
    normalXZ: [...b.normalXZ]
  });
  const visualBones: [DecorationStoneBone, DecorationStoneBone, DecorationStoneBone] = [
    visualBone(raw.bones[0]),
    visualBone(raw.bones[1]),
    visualBone(raw.bones[2])
  ];
  const depth = mul(scale[2], input.wooden ? (input.closed ? f32(1.07) : 0.5) : 1);
  const instance: DecorationStoneInstance = {
    xform: [tx, 0, tz, 0, 1, 0, normalXZ[0], 0, normalXZ[1], ...origin],
    wallRange: [sub(input.wallX, mul(width, 0.5)), add(input.wallX, mul(width, 0.5))],
    seed: input.seed,
    wallSlot: input.wallSlot,
    flags: input.wooden ? 3 : 0,
    bones: visualBones,
    clipY: input.wooden ? f32(input.wallMaxY) : -100000
  };
  const windowCut: DecorationWindowCut = {
    anchor: [f32(input.wallX), f32(input.pivotY)],
    normalXZ: [...normalXZ],
    // The native cut uses the shifted visual origin, not the raw roof bones.
    origin: [...origin],
    layer: input.rank + 5,
    flags: Number(!input.closed),
    scaleXY: [f32(scale[0]), f32(scale[1])]
  };
  return {
    windowCut,
    meshSizeX,
    origin,
    normalXZ,
    instance,
    profileBones: raw.bones,
    scale: [scale[0], scale[1], depth] as [number, number, number]
  };
}
