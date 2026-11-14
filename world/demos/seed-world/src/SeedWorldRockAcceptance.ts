import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import { SEED_WORLD_CLIFF_1_ASSET_PROFILE } from "./SeedWorldCliffAssetCatalog.ts";
import type { SeedWorldRockCoverageTarget } from "@galacean/engine-world-planning/runtime/SeedWorldRockTerrainAnalysis";
import { solveSeedWorldRockObbPlacement, type SeedWorldSolvedRockObb } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";

type Vector3Tuple = readonly [x: number, y: number, z: number];
type QuaternionTuple = readonly [x: number, y: number, z: number, w: number];

/** Rock-compiler-only deltas used to diagnose one solved OBB without changing layout data. */
export interface SeedWorldRockAcceptanceOverride {
  /** Signed displacement along the selected shoulder tangent. */
  readonly alongShoulderMetres: number;
  /** Signed displacement from crest toward the selected lowland shoulder. */
  readonly downhillMetres: number;
  /** Final absolute asset rotation around world Y after local X. */
  readonly yawDegrees: number;
  /** Final absolute asset rotation around world X. */
  readonly pitchDegrees: number;
  /** Final absolute asset rotation around world Z after X and Y. */
  readonly rollDegrees: number;
  /** Uniform multiplier applied equally to X, Y, and Z. */
  readonly uniformScaleMultiplier: number;
  /** Absolute OBB root burial below its zero-depth terrain contact. */
  readonly burialMetres: number;
}

/** Measured preview result produced from one solved rock and final Heightmap. */
export interface SeedWorldRockAcceptancePreview {
  /** Runtime-ready preview transform and strict OBB. */
  readonly rock: SeedWorldSolvedRockObb;
  /** Fraction of the OBB bottom support grid intersecting final terrain. */
  readonly contactRatio: number;
  /** Whether the adjusted strict OBB contains the final-terrain crest. */
  readonly containsCrest: boolean;
  /** Highest adjusted OBB extent above the final-terrain crest. */
  readonly crestRiseMetres: number;
  /** Absolute burial applied below the zero-depth terrain contact. */
  readonly appliedBurialMetres: number;
}

/** User-authored evidence that one final-terrain location still needs a rock assembly. */
export interface SeedWorldRockAcceptanceRequest {
  /** Stable acceptance-only identifier rendered as A01, A02, and so on. */
  readonly id: string;
  /** Clicked point on the final Heightmap in world metres. */
  readonly position: Vector3Tuple;
  /** Nearest analyzed convexity, retained as evidence rather than a forced ownership decision. */
  readonly nearestTargetId?: string;
  /** Canyon relation of the nearest target when one exists. */
  readonly canyonId?: string;
  /** Terrain hills contributing to the nearest target. */
  readonly sourceHillIds: readonly string[];
}

/** Neutral acceptance deltas which exactly preserve the solver result. */
export const SEED_WORLD_ROCK_ACCEPTANCE_DEFAULT_OVERRIDE = Object.freeze<SeedWorldRockAcceptanceOverride>({
  alongShoulderMetres: 0,
  downhillMetres: 0,
  yawDegrees: 0,
  pitchDegrees: 0,
  rollDegrees: 0,
  uniformScaleMultiplier: 1,
  burialMetres: 0
});

/**
 * Converts one compiled rock Transform into the absolute acceptance-control contract.
 * @param target Final-terrain convexity owning the rock.
 * @param fields Final Heightmap defining the zero-burial flat contact.
 * @param rock Compiled rock whose current world Transform is the control baseline.
 * @returns Absolute XYZ Euler angles and flat-contact-referenced burial plus neutral planar and scale controls.
 */
export function seedWorldRockAcceptanceOverrideFromSolvedRock(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  rock: SeedWorldSolvedRockObb
): SeedWorldRockAcceptanceOverride {
  const [pitchDegrees, yawDegrees, rollDegrees] = quaternionToEulerXyzDegrees(rock.rotationQuaternion);
  const supportOffsets = canonicalSupportOffsets(rock.uniformScale);
  const zeroBurialCenterY = measureFlatZeroBurialCenterY(
    target,
    fields,
    rock.obbCenter[0],
    rock.obbCenter[2],
    rock.obbRotationQuaternion,
    rock.obbSizeMetres,
    supportOffsets
  );
  return Object.freeze({
    alongShoulderMetres: 0,
    downhillMetres: 0,
    yawDegrees,
    pitchDegrees,
    rollDegrees,
    uniformScaleMultiplier: 1,
    burialMetres: zeroBurialCenterY - rock.obbCenter[1]
  });
}

/**
 * Places a provisional Clif instance at one user-requested final-terrain point.
 * @param request Missing-rock request on Hfinal.
 * @param template Existing solved Clif supplying asset shape and uniform scale.
 * @returns Runtime-ready provisional rock with its lower OBB volume embedded in terrain.
 */
export function createSeedWorldRockAcceptanceRequestRock(
  request: SeedWorldRockAcceptanceRequest,
  template: SeedWorldSolvedRockObb
): SeedWorldSolvedRockObb {
  const minimumOffsetY = measureMinimumObbOffsetY(template.obbRotationQuaternion, template.obbSizeMetres);
  const burial = template.obbSizeMetres[1] * 0.12;
  const obbCenter = Object.freeze([
    request.position[0],
    request.position[1] - burial - minimumOffsetY,
    request.position[2]
  ] as const);
  const localCenterOffset = rotateVectorByQuaternionConjugate(
    [
      template.obbCenter[0] - template.position[0],
      template.obbCenter[1] - template.position[1],
      template.obbCenter[2] - template.position[2]
    ],
    template.rotationQuaternion
  );
  const worldCenterOffset = rotateVectorByQuaternion(localCenterOffset, template.rotationQuaternion);
  return Object.freeze({
    ...template,
    id: `acceptance-add:${request.id}:rock-0`,
    position: Object.freeze([
      obbCenter[0] - worldCenterOffset[0],
      obbCenter[1] - worldCenterOffset[1],
      obbCenter[2] - worldCenterOffset[2]
    ] as const),
    obbCenter,
    contactRatio: 0,
    containsCrest: false
  });
}

/**
 * Applies diagnostic OBB deltas in the solved rock's canonical local frame.
 * @param target Final-terrain convexity and its selected shoulder frame.
 * @param original Immutable rock solve to use as the baseline.
 * @param fields Final Heightmap used for contact measurement.
 * @param override Rock-compiler-only diagnostic deltas.
 * @returns Adjusted rock transform plus recomputed final-terrain evidence.
 * @throws {RangeError} When the scale multiplier is non-positive or any delta is non-finite.
 */
export function previewSeedWorldRockAcceptance(
  target: SeedWorldRockCoverageTarget,
  original: SeedWorldSolvedRockObb,
  fields: SeedWorldFields,
  override: SeedWorldRockAcceptanceOverride
): SeedWorldRockAcceptancePreview {
  validateOverride(override);
  const tangent = bearingVector(target.frame.shoulderTangentBearingRadians);
  const downhill = bearingVector(target.frame.downhillBearingRadians);
  const rotationQuaternion = normalizeQuaternion(
    multiplyQuaternion(
      multiplyQuaternion(
        quaternionFromAxisAngle([0, 0, 1], degreesToRadians(override.rollDegrees)),
        quaternionFromAxisAngle([0, 1, 0], degreesToRadians(override.yawDegrees))
      ),
      quaternionFromAxisAngle([1, 0, 0], degreesToRadians(override.pitchDegrees))
    )
  );
  const obbRotationQuaternion = canonicalObbRotationFromAssetRotation(rotationQuaternion);
  const uniformScale = original.uniformScale * override.uniformScaleMultiplier;
  const obbSizeMetres = Object.freeze(
    original.obbSizeMetres.map((size) => size * override.uniformScaleMultiplier) as [number, number, number]
  );
  const supportOffsets = canonicalSupportOffsets(uniformScale);
  const obbCenterX =
    original.obbCenter[0] + tangent[0] * override.alongShoulderMetres + downhill[0] * override.downhillMetres;
  const obbCenterZ =
    original.obbCenter[2] + tangent[1] * override.alongShoulderMetres + downhill[1] * override.downhillMetres;
  const zeroBurialCenterY = measureFlatZeroBurialCenterY(
    target,
    fields,
    obbCenterX,
    obbCenterZ,
    obbRotationQuaternion,
    obbSizeMetres,
    supportOffsets
  );
  const appliedBurialMetres = override.burialMetres;
  const obbCenter = Object.freeze([obbCenterX, zeroBurialCenterY - appliedBurialMetres, obbCenterZ] as const);
  const originalCenterOffset = rotateVectorByQuaternionConjugate(
    [
      original.obbCenter[0] - original.position[0],
      original.obbCenter[1] - original.position[1],
      original.obbCenter[2] - original.position[2]
    ],
    original.rotationQuaternion
  );
  const previewCenterOffset = rotateVectorByQuaternion(
    originalCenterOffset.map((component) => component * override.uniformScaleMultiplier) as [number, number, number],
    rotationQuaternion
  );
  const position = Object.freeze([
    obbCenter[0] - previewCenterOffset[0],
    obbCenter[1] - previewCenterOffset[1],
    obbCenter[2] - previewCenterOffset[2]
  ] as const);
  const contactRatio = measureContactRatio(fields, obbCenter, obbRotationQuaternion, obbSizeMetres, supportOffsets);
  const containsCrest = pointInsideObb(target.crest, obbCenter, obbRotationQuaternion, obbSizeMetres);
  const crestRiseMetres = measureCrestRise(target, obbCenter, obbRotationQuaternion, obbSizeMetres);
  const rock = Object.freeze<SeedWorldSolvedRockObb>({
    ...original,
    position,
    obbCenter,
    rotationQuaternion,
    obbRotationQuaternion,
    uniformScale,
    obbSizeMetres,
    contactRatio,
    insertionDepthMetres: appliedBurialMetres,
    skywardTiltDegrees: measureSkywardTiltDegrees(obbRotationQuaternion),
    containsCrest
  });
  return Object.freeze({
    rock,
    contactRatio,
    containsCrest,
    crestRiseMetres,
    appliedBurialMetres
  });
}

function measureFlatZeroBurialCenterY(
  target: SeedWorldRockCoverageTarget,
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  rotationQuaternion: QuaternionTuple,
  size: readonly [number, number, number],
  supportOffsets: readonly Vector3Tuple[]
): number {
  const placement = solveSeedWorldRockObbPlacement(
    fields,
    target.crest,
    worldX,
    worldZ,
    rotationQuaternion,
    size,
    undefined,
    supportOffsets
  );
  return placement.obbCenterY + placement.insertionDepthMetres;
}

function validateOverride(override: SeedWorldRockAcceptanceOverride): void {
  const values = [
    override.alongShoulderMetres,
    override.downhillMetres,
    override.yawDegrees,
    override.pitchDegrees,
    override.rollDegrees,
    override.uniformScaleMultiplier,
    override.burialMetres
  ];
  if (!values.every(Number.isFinite) || override.uniformScaleMultiplier <= 0) {
    throw new RangeError("Rock acceptance override must contain finite values and a positive uniform scale");
  }
}

function measureContactRatio(
  fields: SeedWorldFields,
  center: Vector3Tuple,
  rotation: QuaternionTuple,
  size: readonly [number, number, number],
  supportOffsets: readonly Vector3Tuple[]
): number {
  const toleranceMetres = Math.max(1.5, size[1] * 0.025);
  const contactCount = supportOffsets.filter((local) => {
    const offset = rotateVectorByQuaternion(local, rotation);
    const terrain = sampleSeedWorldHeight(fields, center[0] + offset[0], center[2] + offset[2]);
    return terrain !== undefined && center[1] + offset[1] <= terrain + toleranceMetres;
  }).length;
  return contactCount / supportOffsets.length;
}

function canonicalSupportOffsets(uniformScale: number): readonly Vector3Tuple[] {
  return Object.freeze(
    SEED_WORLD_CLIFF_1_ASSET_PROFILE.canonicalSupportOffsetsMetres.map((offset) =>
      Object.freeze(offset.map((component) => component * uniformScale) as [number, number, number])
    )
  );
}

function measureSkywardTiltDegrees(rotation: QuaternionTuple): number {
  const worldUphill = rotateVectorByQuaternion([0, 0, 1], rotation);
  return radiansToDegrees(Math.asin(clamp(worldUphill[1], -1, 1)));
}

function canonicalObbRotationFromAssetRotation(rotation: QuaternionTuple): QuaternionTuple {
  const authoredToCanonical = SEED_WORLD_CLIFF_1_ASSET_PROFILE.assetToCanonicalQuaternion;
  return normalizeQuaternion(
    multiplyQuaternion(rotation, [
      -authoredToCanonical[0],
      -authoredToCanonical[1],
      -authoredToCanonical[2],
      authoredToCanonical[3]
    ])
  );
}

function pointInsideObb(
  point: Vector3Tuple,
  center: Vector3Tuple,
  rotation: QuaternionTuple,
  size: readonly [number, number, number]
): boolean {
  const local = rotateVectorByQuaternionConjugate(
    [point[0] - center[0], point[1] - center[1], point[2] - center[2]],
    rotation
  );
  return size.every((component, index) => Math.abs(local[index]!) <= component * 0.5 + 1e-6);
}

function measureCrestRise(
  target: SeedWorldRockCoverageTarget,
  center: Vector3Tuple,
  rotation: QuaternionTuple,
  size: readonly [number, number, number]
): number {
  let highest = Number.NEGATIVE_INFINITY;
  for (let bits = 0; bits < 8; bits++) {
    const local = Object.freeze([
      (bits & 1 ? 1 : -1) * size[0] * 0.5,
      (bits & 2 ? 1 : -1) * size[1] * 0.5,
      (bits & 4 ? 1 : -1) * size[2] * 0.5
    ] as const);
    highest = Math.max(highest, center[1] + rotateVectorByQuaternion(local, rotation)[1]);
  }
  return highest - target.crest[1];
}

function measureMinimumObbOffsetY(rotation: QuaternionTuple, size: readonly [number, number, number]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let bits = 0; bits < 8; bits++) {
    const local = Object.freeze([
      (bits & 1 ? 1 : -1) * size[0] * 0.5,
      (bits & 2 ? 1 : -1) * size[1] * 0.5,
      (bits & 4 ? 1 : -1) * size[2] * 0.5
    ] as const);
    minimum = Math.min(minimum, rotateVectorByQuaternion(local, rotation)[1]);
  }
  return minimum;
}

function bearingVector(bearing: number): readonly [x: number, z: number] {
  return Object.freeze([Math.sin(bearing), Math.cos(bearing)] as const);
}

function quaternionFromAxisAngle(axis: Vector3Tuple, angle: number): QuaternionTuple {
  const length = Math.hypot(...axis);
  const half = angle * 0.5;
  const scale = Math.sin(half) / Math.max(1e-9, length);
  return Object.freeze([axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(half)] as const);
}

function multiplyQuaternion(left: QuaternionTuple, right: QuaternionTuple): QuaternionTuple {
  return Object.freeze([
    left[3] * right[0] + left[0] * right[3] + left[1] * right[2] - left[2] * right[1],
    left[3] * right[1] - left[0] * right[2] + left[1] * right[3] + left[2] * right[0],
    left[3] * right[2] + left[0] * right[1] - left[1] * right[0] + left[2] * right[3],
    left[3] * right[3] - left[0] * right[0] - left[1] * right[1] - left[2] * right[2]
  ] as const);
}

function normalizeQuaternion(quaternion: QuaternionTuple): QuaternionTuple {
  const length = Math.hypot(...quaternion);
  return Object.freeze(quaternion.map((component) => component / length) as [number, number, number, number]);
}

function quaternionToEulerXyzDegrees(
  quaternion: QuaternionTuple
): readonly [xDegrees: number, yDegrees: number, zDegrees: number] {
  const [x, y, z, w] = normalizeQuaternion(quaternion);
  const matrix00 = 1 - 2 * (y * y + z * z);
  const matrix10 = 2 * (x * y + z * w);
  const matrix20 = 2 * (x * z - y * w);
  const matrix21 = 2 * (y * z + x * w);
  const matrix22 = 1 - 2 * (x * x + y * y);
  const matrix01 = 2 * (x * y - z * w);
  const matrix11 = 1 - 2 * (x * x + z * z);
  const yRadians = Math.asin(clamp(-matrix20, -1, 1));
  const nearGimbalLock = Math.abs(Math.cos(yRadians)) < 1e-6;
  const xRadians = nearGimbalLock ? Math.atan2(-matrix01, matrix11) : Math.atan2(matrix21, matrix22);
  const zRadians = nearGimbalLock ? 0 : Math.atan2(matrix10, matrix00);
  return Object.freeze([
    normalizeDegrees(radiansToDegrees(xRadians)),
    normalizeDegrees(radiansToDegrees(yRadians)),
    normalizeDegrees(radiansToDegrees(zRadians))
  ] as const);
}

function rotateVectorByQuaternion(vector: Vector3Tuple, quaternion: QuaternionTuple): Vector3Tuple {
  const [axisX, axisY, axisZ, scalar] = quaternion;
  const crossX = axisY * vector[2] - axisZ * vector[1];
  const crossY = axisZ * vector[0] - axisX * vector[2];
  const crossZ = axisX * vector[1] - axisY * vector[0];
  const secondCrossX = axisY * crossZ - axisZ * crossY;
  const secondCrossY = axisZ * crossX - axisX * crossZ;
  const secondCrossZ = axisX * crossY - axisY * crossX;
  return Object.freeze([
    vector[0] + 2 * (scalar * crossX + secondCrossX),
    vector[1] + 2 * (scalar * crossY + secondCrossY),
    vector[2] + 2 * (scalar * crossZ + secondCrossZ)
  ] as const);
}

function rotateVectorByQuaternionConjugate(vector: Vector3Tuple, quaternion: QuaternionTuple): Vector3Tuple {
  return rotateVectorByQuaternion(vector, [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]]);
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
