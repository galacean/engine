import { decorationMeshBounds, type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import type { DecorationWindowCut } from "./DecorationWindowCutBuffer";
import {
  projectWallArclength,
  sampleWallArclength,
  approximateWallCurveParameter,
  assertClosedWallSpan
} from "./RecoveredWallSpace";
import { requireDecorationCollision, type ConstructionDecorationCollisions } from "./ConstructionDecorationCollisions";
import { add, sub, mul, div, sqrt, f32, type RoofCurve } from "./RecoveredRoofMath";
import type { DecorationStoneBone, DecorationStoneInstance } from "./DecorationStoneInstance";

/** Original generate_gothic_wall_windows 0x10118a828 and
 * get_gothic_hat_bones_layout 0x10118a42c. Shipped Mach-O SHA256:
 * 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * These are the original fixed-rank dimensions; author resizing belongs to the
 * host adapter, and must scale the mesh and the attachment samples together.
 */
const widths = [0.9512799978256226, 1.4940799474716187, 1.9242719411849976] as const;
const hatMinY = [0.33295831084251404, 0.4852406978607178, 0.4729582965373993] as const;
const fullMinY = [-0.9532017111778259, -0.9502415060997009, -0.9530417919158936] as const;
const maxY = [1.2624931335449219, 1.7034056186676025, 2.2463550567626953] as const;

export interface GothicWallPlacementInput {
  /** Door producer 0x1011bb1d4 shares bones, but not window flags or offsets. */
  kind?: "window" | "door";
  rank: 1 | 2 | 3;
  /** Host extension: the same scale is applied to the original mesh before upload. */
  sourceScale?: readonly [number, number, number];
  curve: RoofCurve;
  /** Native WallSpace length; host adapter derives both from one published curve. */
  wallSpaceLength?: number;
  /** Absolute arclength in the supplied curve, and source-model pivot Y. */
  wallX: number;
  pivotY: number;
  closed: boolean;
  /** Only a closed circular host applies the radius-dependent correction. */
  circleRadius?: number;
  wooden: boolean;
  halfTimber: boolean;
  halfDormer?: boolean;
  foundationHeight: number;
  baseY: number;
  /** PublicWallState::max_y, not the decoration mesh maximum. */
  wallMaxY: number;
  bottomSamples: readonly number[];
  wallSlot: number;
  seed: number;
}
export interface GothicWallPlacement {
  /** Material-independent cut intent. Native emission is wood-only; the host
   * retains it so material replacement can select the appropriate consumer. */
  windowCut: DecorationWindowCut;
  /** Native producer width; differs from the frame mesh's raw bounds. */
  meshSizeX: number;
  template: string;
  instance: DecorationStoneInstance;
  /** Frame and glass share this origin and the hat's yaw, not the hat's bones. */
  frameOrigin: [number, number, number];
  normalXZ: [number, number];
  minY: number;
  maxY: number;
  visibleHat: boolean;
}

export interface GothicHatBoneInput {
  rank: 1 | 2 | 3;
  width: number;
  scaleX?: number;
  curve: RoofCurve;
  wallSpaceLength?: number;
  wallX: number;
  pivotY: number;
  closed: boolean;
  circleRadius?: number;
}
/** Original shared get_gothic_hat_bones_layout; width is chosen by the family.
 * Arrow uses .8 for all ranks, independently of its collision width. */
export function recoveredGothicHatBones(input: GothicHatBoneInput) {
  const { curve } = input;
  if (
    !(input.width > 0) ||
    !((input.scaleX ?? 1) > 0) ||
    ![input.width, input.scaleX ?? 1, input.wallX, input.pivotY].every((v) => Number.isFinite(f32(v)))
  )
    throw Error("Finite positive hat width/scale and wall coordinates required");
  assertClosedWallSpan(mul(input.width, input.scaleX ?? 1), input.wallSpaceLength ?? curve.length, input.closed);
  let correction = input.rank === 1 ? 0 : input.rank === 2 ? f32(0.05) : f32(0.1);
  if (input.closed && input.circleRadius !== undefined) {
    const t = Math.max(0, Math.min(1, div(sub(input.circleRadius, 0.95), sub(1.6, 0.95))));
    correction =
      input.rank === 1
        ? f32(0.05)
        : input.rank === 2
          ? add(mul(sub(1, t), 0.21), 0.1)
          : add(mul(sub(1, t), 0.158), 0.15);
  }
  const halfWidth = mul(mul(sub(input.width, correction), input.scaleX ?? 1), 0.5);
  const sample = (wallX: number, project = true): DecorationStoneBone => {
    const distance = project ? projectWallArclength(wallX, input.wallSpaceLength ?? curve.length, input.closed) : wallX;
    const [x, z] = sampleWallArclength(curve, distance),
      [tx, tz] = curve.tangent(approximateWallCurveParameter(curve, [x, z]));
    return { position: [x, f32(input.pivotY), z], normalXZ: [f32(-tz), tx] };
  };
  const bones: DecorationStoneInstance["bones"] = [
    sample(sub(input.wallX, halfWidth)),
    // Original center skips WallSpace projection; only endpoints wrap/clamp.
    sample(input.wallX, false),
    sample(add(input.wallX, halfWidth))
  ];
  const left = bones[0].position,
    right = bones[2].position;
  const dx = sub(right[0], left[0]),
    dz = sub(right[2], left[2]);
  const length = sqrt(add(mul(dx, dx), mul(dz, dz)));
  if (!(length > 0)) throw Error("Gothic hat attachment collapses to one wall point");
  const tx = div(dx, length),
    tz = div(dz, length);
  const normalXZ: [number, number] = [f32(-tz), tx];
  const origin: [number, number, number] = [
    add(mul(left[0], 0.5), mul(right[0], 0.5)),
    f32(input.pivotY),
    add(mul(left[2], 0.5), mul(right[2], 0.5))
  ];
  return { bones, origin, normalXZ, tx, tz };
}

export function recoveredGothicWallPlacement(
  collisions: ConstructionDecorationCollisions | undefined,
  assets: ConstructionDecorationMeshes | undefined,
  input: GothicWallPlacementInput
): GothicWallPlacement {
  const { rank, curve } = input;
  if (
    ![1, 2, 3].includes(rank) ||
    curve.points.some((p) => p.length !== 2) ||
    ![input.wallX, input.pivotY, input.foundationHeight, input.baseY, input.wallMaxY].every(Number.isFinite) ||
    !input.bottomSamples.every(Number.isFinite) ||
    input.foundationHeight < 0 ||
    (input.circleRadius !== undefined && (!Number.isFinite(input.circleRadius) || input.circleRadius <= 0))
  )
    throw Error("Invalid native Gothic wall placement");
  const scale = input.sourceScale ?? [1, 1, 1];
  if (scale.length !== 3 || !scale.every((v) => v > 0 && Number.isFinite(Math.fround(v))))
    throw Error("Positive finite Gothic source scale required");
  const door = input.kind === "door";
  const doorBounds = door
    ? requireDecorationCollision(collisions, `balcony_door_gothic_rank${rank}_collision`)
    : undefined;
  const width = doorBounds ? sub(doorBounds.max[0], doorBounds.min[0]) : widths[rank - 1];
  const { bones, origin, normalXZ, tx, tz } = recoveredGothicHatBones({ ...input, width, scaleX: scale[0] });
  const full = input.wooden || input.halfTimber || !!input.halfDormer;
  const flags =
    Number(input.halfTimber || input.wooden) |
    (Number(input.wooden && !input.halfTimber) << 1) |
    (Number((!door && rank === 1) || input.wooden) << 2);
  let clipY = -100000;
  if (input.wooden && input.closed && input.foundationHeight > 0) {
    let minimum = input.baseY;
    if (input.bottomSamples.length) {
      minimum = Infinity;
      for (const y of input.bottomSamples) minimum = Math.min(minimum, y);
    }
    clipY = Math.max(add(minimum, input.foundationHeight), f32(input.baseY));
    if (door) clipY = add(clipY, 0.09);
  }
  const template = door ? `balcony_door_gothic_rank${rank}_hat` : `window_gothic_${rank}x1_hat${full ? "_full" : ""}`;
  const hatBounds = decorationMeshBounds(assets, template);
  const low = add(input.pivotY, mul(door ? hatBounds.min[1] : (full ? fullMinY : hatMinY)[rank - 1], scale[1]));
  const high = add(input.pivotY, mul(door ? hatBounds.max[1] : maxY[rank - 1], scale[1]));
  const foundationReplacesHat =
    !door &&
    !!input.halfDormer &&
    input.wooden &&
    input.closed &&
    input.foundationHeight > 0 &&
    clipY >= input.wallMaxY;
  return {
    windowCut: {
      anchor: [f32(input.wallX), f32(input.pivotY)],
      normalXZ: [...normalXZ],
      // Original WindowCut stores the chord midpoint, before the frame offset.
      origin: [...origin],
      layer: rank + (door ? 11 : 2),
      flags: Number(!input.closed),
      scaleXY: [f32(scale[0]), f32(scale[1])]
    },
    meshSizeX: width,
    template,
    instance: {
      xform: [tx, 0, tz, 0, 1, 0, normalXZ[0], 0, normalXZ[1], ...origin],
      seed: input.seed,
      wallSlot: input.wallSlot,
      wallRange: [sub(input.wallX, mul(mul(width, scale[0]), 0.5)), add(input.wallX, mul(mul(width, scale[0]), 0.5))],
      flags,
      bones,
      clipY
    },
    frameOrigin:
      input.closed && !door
        ? [
            add(origin[0], mul(normalXZ[0], mul(0.14, scale[2]))),
            origin[1],
            add(origin[2], mul(normalXZ[1], mul(0.14, scale[2])))
          ]
        : [...origin],
    normalXZ,
    minY: low,
    maxY: high,
    visibleHat: !foundationReplacesHat && sub(high, Math.max(low, clipY)) >= f32(0.01)
  };
}
