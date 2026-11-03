/** Engine-object-free WaterBody instance state. */
import type { WaterVector2Tuple, WaterVector3Tuple } from "./WaterBodyAuthoringTypes";

export const WATER_BODY_INSTANCE_SCHEMA_VERSION = 2 as const;

export interface WaterPlanarTransformV1 {
  readonly position: WaterVector3Tuple;
  readonly yawDegrees: number;
  readonly scaleXZ: WaterVector2Tuple;
}

export interface WaterInteractionRequestV1 {
  readonly query: boolean;
  readonly buoyancy: boolean;
  readonly wake: boolean;
}

/** Instance-owned realization of world-space Ocean Representation semantics. */
export interface WaterOceanRepresentationStateV1 {
  readonly schemaVersion: 1;
  readonly kind: "ocean-surface-layout";
  readonly centerXZ: WaterVector2Tuple;
  readonly size: number;
  readonly surfaceTopology: "fixed-lod" | "finite";
  readonly finitePatchGridSize?: number;
  readonly fixedLodCentralPatchGridSize?: number;
  /** Visual half-width of the packed thin-film occupancy transition. */
  readonly nearshoreThinFilmTransitionWidth?: number;
  readonly shoreViewEnvelope?: Readonly<{
    readonly centerXZ: WaterVector2Tuple;
    readonly halfExtentXZ: WaterVector2Tuple;
    readonly maximumVisibleDistance: number;
  }>;
}

export type WaterRepresentationInstanceStateV1 = WaterOceanRepresentationStateV1;

export interface WaterBodyInstance {
  readonly schemaVersion: typeof WATER_BODY_INSTANCE_SCHEMA_VERSION;
  readonly id: string;
  readonly assetId: string;
  readonly lookPresetId: string;
  readonly qualityPlanId: string;
  readonly transform: WaterPlanarTransformV1;
  readonly visible: boolean;
  readonly priority: number;
  readonly interaction: WaterInteractionRequestV1;
  readonly representationState?: WaterRepresentationInstanceStateV1;
}

export type WaterBodyInstanceInput = Omit<WaterBodyInstance, "schemaVersion">;

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_POSITION_MAGNITUDE = 10_000_000;
const MAX_PRIORITY_MAGNITUDE = 1_000_000;

function requireStableId(value: string, path: string): string {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    throw new TypeError(`${path} must be a stable non-empty id.`);
  }
  return value;
}

function requireFiniteNumber(value: number, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number.`);
  }
  if (value < minimum || value > maximum) {
    throw new RangeError(`${path} must be within [${minimum}, ${maximum}].`);
  }
  return value;
}

function cloneVector2(value: WaterVector2Tuple, path: string): WaterVector2Tuple {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`${path} must contain exactly two numbers.`);
  }
  return Object.freeze([
    requireFiniteNumber(value[0], `${path}[0]`, -Number.MAX_VALUE, Number.MAX_VALUE),
    requireFiniteNumber(value[1], `${path}[1]`, -Number.MAX_VALUE, Number.MAX_VALUE)
  ] as const);
}

function cloneVector3(value: WaterVector3Tuple, path: string): WaterVector3Tuple {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${path} must contain exactly three numbers.`);
  }
  return Object.freeze([
    requireFiniteNumber(value[0], `${path}[0]`, -MAX_POSITION_MAGNITUDE, MAX_POSITION_MAGNITUDE),
    requireFiniteNumber(value[1], `${path}[1]`, -MAX_POSITION_MAGNITUDE, MAX_POSITION_MAGNITUDE),
    requireFiniteNumber(value[2], `${path}[2]`, -MAX_POSITION_MAGNITUDE, MAX_POSITION_MAGNITUDE)
  ] as const);
}

function createPlanarTransform(source: Readonly<WaterPlanarTransformV1>): Readonly<WaterPlanarTransformV1> {
  const position = cloneVector3(source.position, "$.transform.position");
  const yawDegrees = requireFiniteNumber(
    source.yawDegrees,
    "$.transform.yawDegrees",
    -Number.MAX_VALUE,
    Number.MAX_VALUE
  );
  const scaleXZ = cloneVector2(source.scaleXZ, "$.transform.scaleXZ");
  if (scaleXZ[0] !== 1 || scaleXZ[1] !== 1) {
    throw new RangeError("$.transform.scaleXZ must be [1, 1]; non-unit planar scale is unsupported.");
  }
  return Object.freeze({ position, yawDegrees, scaleXZ });
}

function createInteraction(source: Readonly<WaterInteractionRequestV1>): Readonly<WaterInteractionRequestV1> {
  if (typeof source.query !== "boolean" || typeof source.buoyancy !== "boolean" || typeof source.wake !== "boolean") {
    throw new TypeError("$.interaction query, buoyancy, and wake must be booleans.");
  }
  if (source.buoyancy && !source.query) {
    throw new Error("$.interaction.buoyancy requires query registration.");
  }
  if (source.wake && !source.query) {
    throw new Error("$.interaction.wake requires query registration.");
  }
  return Object.freeze({ query: source.query, buoyancy: source.buoyancy, wake: source.wake });
}

export function createWaterRepresentationInstanceStateV1(
  source: Readonly<WaterRepresentationInstanceStateV1> | undefined
): Readonly<WaterRepresentationInstanceStateV1> | undefined {
  if (!source) return undefined;
  if (source.schemaVersion !== 1 || source.kind !== "ocean-surface-layout") {
    throw new TypeError("$.representationState must use the Ocean surface-layout schema version 1.");
  }
  const positiveInteger = (value: number | undefined, path: string): number | undefined => {
    if (value === undefined) return undefined;
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${path} must be a positive integer.`);
    return value;
  };
  const envelope = source.shoreViewEnvelope
    ? Object.freeze({
        centerXZ: cloneVector2(source.shoreViewEnvelope.centerXZ, "$.representationState.shoreViewEnvelope.centerXZ"),
        halfExtentXZ: (() => {
          const value = cloneVector2(
            source.shoreViewEnvelope!.halfExtentXZ,
            "$.representationState.shoreViewEnvelope.halfExtentXZ"
          );
          if (value[0] <= 0 || value[1] <= 0) {
            throw new RangeError("$.representationState.shoreViewEnvelope.halfExtentXZ must be positive.");
          }
          return value;
        })(),
        maximumVisibleDistance: requireFiniteNumber(
          source.shoreViewEnvelope.maximumVisibleDistance,
          "$.representationState.shoreViewEnvelope.maximumVisibleDistance",
          Number.EPSILON,
          Number.MAX_VALUE
        )
      })
    : undefined;
  if (source.surfaceTopology !== "finite" && source.surfaceTopology !== "fixed-lod") {
    throw new TypeError("$.representationState.surfaceTopology must be 'finite' or 'fixed-lod'.");
  }
  const finitePatchGridSize = positiveInteger(source.finitePatchGridSize, "$.representationState.finitePatchGridSize");
  const fixedLodCentralPatchGridSize = positiveInteger(
    source.fixedLodCentralPatchGridSize,
    "$.representationState.fixedLodCentralPatchGridSize"
  );
  const nearshoreThinFilmTransitionWidth =
    source.nearshoreThinFilmTransitionWidth === undefined
      ? undefined
      : requireFiniteNumber(
          source.nearshoreThinFilmTransitionWidth,
          "$.representationState.nearshoreThinFilmTransitionWidth",
          0,
          Number.MAX_VALUE
        );
  if (source.surfaceTopology === "finite") {
    if (finitePatchGridSize === undefined) {
      throw new TypeError("$.representationState.finitePatchGridSize is required for finite topology.");
    }
    if (fixedLodCentralPatchGridSize !== undefined) {
      throw new TypeError("$.representationState fixed-LOD fields must be absent for finite topology.");
    }
  } else {
    if (finitePatchGridSize !== undefined) {
      throw new TypeError("$.representationState.finitePatchGridSize must be absent for fixed-lod topology.");
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: "ocean-surface-layout",
    centerXZ: cloneVector2(source.centerXZ, "$.representationState.centerXZ"),
    size: requireFiniteNumber(source.size, "$.representationState.size", Number.EPSILON, Number.MAX_VALUE),
    surfaceTopology: source.surfaceTopology,
    finitePatchGridSize,
    fixedLodCentralPatchGridSize,
    nearshoreThinFilmTransitionWidth,
    shoreViewEnvelope: envelope
  });
}

export function createWaterBodyInstance(source: Readonly<WaterBodyInstanceInput>): Readonly<WaterBodyInstance> {
  if (typeof source.visible !== "boolean") throw new TypeError("$.visible must be a boolean.");
  return Object.freeze({
    schemaVersion: WATER_BODY_INSTANCE_SCHEMA_VERSION,
    id: requireStableId(source.id, "$.id"),
    assetId: requireStableId(source.assetId, "$.assetId"),
    lookPresetId: requireStableId(source.lookPresetId, "$.lookPresetId"),
    qualityPlanId: requireStableId(source.qualityPlanId, "$.qualityPlanId"),
    transform: createPlanarTransform(source.transform),
    visible: source.visible,
    priority: requireFiniteNumber(source.priority, "$.priority", -MAX_PRIORITY_MAGNITUDE, MAX_PRIORITY_MAGNITUDE),
    interaction: createInteraction(source.interaction),
    representationState: createWaterRepresentationInstanceStateV1(source.representationState)
  });
}
