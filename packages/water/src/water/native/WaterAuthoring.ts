import { createImmutableWaterSnapshot } from "../authoring/identity/WaterImmutableSnapshot";
import { createLakeFromTerrain } from "../authoring/lake/createLakeFromTerrain";
import {
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1
} from "../authoring/heightfield/HeightfieldWaterDescriptor";
import { createWaterBodyAsset, type WaterBodyAsset } from "../authoring/body/WaterBodyAsset";
import { WaterBodySourceKind, WaterBodySourceSchemaVersion } from "../authoring/body/WaterBodyAuthoringTypes";
import { WaterQualityTier } from "../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../authoring/wave/enums/WaterWaveSchemaVersion";
import { createRiverWaterBodyAsset } from "../authoring/river/RiverWaterBodyAuthoring";
import {
  resolveWatercourse,
  validateWatercourseAuthoring,
  type WatercourseAuthoring
} from "../authoring/river/Watercourse";
import { createWatercourseRiver } from "../authoring/river/WatercourseGeometry";
import { sampleWaterTerrainHeight, type WaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";
import { hashStableValue } from "../compiler/shared/determinism";
import { createWaterQualitySettings, type WaterQualityInput, type WaterQualitySettings } from "./WaterQualitySettings";
import { OceanNearshoreOutsidePolicy, OceanNearshoreSchemaVersion } from "../authoring/ocean/OceanNearshoreTypes";
import {
  createWaterBodyInstance,
  createWaterRepresentationInstanceStateV1,
  type WaterInteractionRequestV1,
  type WaterOceanRepresentationStateV1
} from "../authoring/body/WaterBodyInstance";

export interface WaterShorePoint {
  readonly id: string;
  readonly ring: string;
  readonly x: number;
  readonly z: number;
}

/** All shape coordinates and elevations are body-local metres. Entity Transform supplies placement. */
export type WaterShapeAuthoring =
  | {
      readonly kind: "lake";
      readonly shoreline: readonly WaterShorePoint[];
      readonly referenceLevel: number;
      readonly levelOffsetM: number;
      readonly basin?: { readonly depthM: number; readonly bankWidthM: number; readonly carve: boolean };
    }
  | {
      readonly kind: "river";
      readonly course: WatercourseAuthoring;
      readonly speed: number;
      readonly bankWidthM?: number;
    }
  | { readonly kind: "ocean"; readonly waterLevel: number; readonly layout: WaterOceanRepresentationStateV1 };

const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new TypeError(`INVALID_ARGUMENT: ${label} must be finite.`);
  return value;
};

/** Shared by project validation and live component writes. No Engine or GPU is required. */
export function validateWaterShape(shape: WaterShapeAuthoring): Readonly<WaterShapeAuthoring> {
  if (!shape || !["lake", "river", "ocean"].includes(shape.kind))
    throw new TypeError("INVALID_ARGUMENT: Unknown Water shape.");
  if (shape.kind === "lake") {
    finite(shape.referenceLevel, "referenceLevel");
    finite(shape.levelOffsetM, "levelOffsetM");
    if (shape.basin) {
      for (const field of ["depthM", "bankWidthM"] as const)
        if (finite(shape.basin[field], `basin.${field}`) <= 0)
          throw new RangeError(`INVALID_ARGUMENT: basin.${field} must be positive.`);
      if (typeof shape.basin.carve !== "boolean") throw new TypeError("INVALID_ARGUMENT: basin.carve must be boolean.");
    }
    const ids = new Set<string>(),
      rings = new Map<string, number>();
    if (!Array.isArray(shape.shoreline)) throw new TypeError("INVALID_ARGUMENT: Lake shoreline is required.");
    for (const point of shape.shoreline) {
      if (!point.id?.trim() || !point.ring?.trim() || ids.has(point.id))
        throw new TypeError("INVALID_ARGUMENT: Shore points need unique IDs and a ring.");
      ids.add(point.id);
      finite(point.x, "shoreline.x");
      finite(point.z, "shoreline.z");
      rings.set(point.ring, (rings.get(point.ring) ?? 0) + 1);
    }
    if (!rings.size || [...rings.values()].some((count) => count < 3))
      throw new RangeError("INVALID_ARGUMENT: Each Lake ring needs at least three points.");
  } else if (shape.kind === "river") {
    finite(shape.speed, "speed");
    if (shape.speed < 0) throw new RangeError("INVALID_ARGUMENT: River speed must be nonnegative.");
    validateWatercourseAuthoring(shape.course);
    if (shape.bankWidthM !== undefined && finite(shape.bankWidthM, "bankWidthM") <= 0)
      throw new RangeError("INVALID_ARGUMENT: bankWidthM must be positive.");
  } else {
    finite(shape.waterLevel, "waterLevel");
    if (shape.layout?.kind !== "ocean-surface-layout")
      throw new TypeError("INVALID_ARGUMENT: Ocean layout is required.");
    createWaterRepresentationInstanceStateV1(shape.layout);
  }
  return createImmutableWaterSnapshot(shape);
}

export function validateWaterAuthoringSettings(input: {
  shape: WaterShapeAuthoring;
  quality?: WaterQualityInput;
  visible?: boolean;
  priority?: number;
  interaction?: WaterInteractionRequestV1;
  connections?: readonly {
    id: string;
    target: unknown;
    section: readonly (readonly number[])[];
    transitionLengths: readonly number[];
  }[];
}): Readonly<WaterQualitySettings> {
  if (
    !input ||
    Object.keys(input).some(
      (key) =>
        ![
          "shape",
          "terrain",
          "terrainBinding",
          "quality",
          "material",
          "connections",
          "visible",
          "priority",
          "interaction"
        ].includes(key)
    )
  )
    throw new TypeError("INVALID_ARGUMENT: Unknown Water authoring property.");
  validateWaterShape(input.shape);
  if (input.connections !== undefined) {
    if (
      !Array.isArray(input.connections) ||
      input.connections.length > 4 ||
      new Set(input.connections.map((connection) => connection.id)).size !== input.connections.length
    )
      throw new Error("INVALID_ARGUMENT: Water connections require at most four unique IDs.");
    for (const connection of input.connections)
      if (
        !connection.id?.trim() ||
        !connection.target ||
        !Array.isArray(connection.section) ||
        connection.section.length !== 2 ||
        connection.section.some(
          (point: readonly number[]) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
        ) ||
        !Array.isArray(connection.transitionLengths) ||
        connection.transitionLengths.length !== 2 ||
        connection.transitionLengths.some((value: number) => !Number.isFinite(value) || value <= 0)
      )
        throw new Error(
          "INVALID_ARGUMENT: Water connection sections and transition lengths must be finite world metres."
        );
  }
  if (input.visible !== undefined && typeof input.visible !== "boolean")
    throw new TypeError("INVALID_ARGUMENT: visible must be boolean.");
  if (input.priority !== undefined) finite(input.priority, "priority");
  if (input.interaction !== undefined && (!input.interaction || typeof input.interaction !== "object"))
    throw new TypeError("INVALID_ARGUMENT: interaction must contain query, buoyancy and wake booleans.");
  createWaterBodyInstance({
    id: "authoring",
    assetId: "authoring",
    lookPresetId: "authoring",
    qualityPlanId: "authoring",
    visible: input.visible ?? true,
    priority: input.priority ?? 0,
    interaction: input.interaction ?? { query: true, buoyancy: false, wake: false },
    representationState: input.shape.kind === "ocean" ? input.shape.layout : undefined,
    transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] }
  });
  return createWaterQualitySettings(input.shape.kind, input.quality);
}

/** Build derived compiler input from the accepted shape and a read-only bed. Never persists sampling caches. */
export function compileWaterShape(
  shape: WaterShapeAuthoring,
  terrain: WaterTerrainSnapshot,
  id: string
): Readonly<WaterBodyAsset> {
  validateWaterShape(shape);
  if (shape.kind === "river") {
    const course = resolveWatercourse(shape.course, (x, z) => sampleWaterTerrainHeight(terrain, x, z), {
      terrainSurface: "bed"
    });
    if (course.sections.some((section) => section.carve))
      throw new Error("NOT_SUPPORTED: This read-only Terrain adapter cannot carve a river bed.");
    for (const point of course.points)
      if (Math.abs(point.bedElevation - sampleWaterTerrainHeight(terrain, point.x, point.z)!) > 1e-4)
        throw new Error(
          "TERRAIN_CHANGE_REQUIRED: River depth must match the accepted bed; this adapter cannot carve Terrain."
        );
    return createRiverWaterBodyAsset(createWatercourseRiver(course, { terrain, speed: shape.speed }), id);
  }
  if (shape.kind === "lake") {
    if (shape.basin?.carve) throw new Error("NOT_SUPPORTED: This read-only Terrain adapter cannot carve a lake basin.");
    const rings = new Map<string, Array<{ position: readonly [number, number] }>>();
    for (const point of shape.shoreline) {
      const ring = rings.get(point.ring) ?? [];
      ring.push({ position: [point.x, point.z] });
      rings.set(point.ring, ring);
    }
    const descriptor = createLakeFromTerrain({
      id,
      terrain,
      coverage: {
        kind: "authored",
        boundary: {
          schemaVersion: 1,
          waterLevel: shape.referenceLevel + shape.levelOffsetM,
          rings: [...rings.values()],
          maxChordError: 0.05,
          maxSegmentLength: 1
        }
      },
      waveAsset: { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
      quality: WaterQualityTier.High,
      surfaceMotion: { waveStrength: 0, shoreDampingWidth: 1 },
      spatialField: { signedDistanceRange: 8 }
    });
    const source = {
      schemaVersion: WaterBodySourceSchemaVersion.V1,
      kind: WaterBodySourceKind.GridMask,
      descriptor: createHeightfieldWaterBodySourceDescriptorV1(descriptor),
      capabilities: { localBathymetry: true, shoreSdf: true, current: false }
    };
    const representationData = createHeightfieldWaterRepresentationDataV1(descriptor);
    return createWaterBodyAsset({
      id,
      kind: "lake",
      representation: { domain: "bounded-grid", macroSurface: "heightfield" },
      source,
      sourceHash: hashStableValue(source),
      representationData,
      representationDataHash: hashStableValue(representationData)
    });
  }
  const outside = OceanNearshoreOutsidePolicy.DeepOcean;
  const descriptor = {
    schemaVersion: 2,
    id,
    config: {
      waterLevel: shape.waterLevel,
      nearshoreDescriptor: {
        schemaVersion: OceanNearshoreSchemaVersion.V1,
        id: `${id}:nearshore`,
        waterLevel: shape.waterLevel,
        grid: {
          originXZ: terrain.origin,
          cellSizeXZ: [terrain.spacing, terrain.spacingZ ?? terrain.spacing],
          width: terrain.columns,
          height: terrain.rows
        },
        bedHeights: Float32Array.from(terrain.heights),
        wetSource: { kind: "water-level", minimumDepth: 0 },
        outsidePolicy: { negativeX: outside, positiveX: outside, negativeZ: outside, positiveZ: outside }
      }
    }
  };
  const source = {
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.OceanNearshore,
    descriptor,
    capabilities: { localBathymetry: true, shoreSdf: true, current: false }
  };
  return createWaterBodyAsset({
    id,
    kind: "ocean",
    representation: { domain: "world-space-ocean", macroSurface: "gerstner" },
    source,
    sourceHash: hashStableValue(source)
  });
}
