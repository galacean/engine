import { createOceanNearshoreFromTerrain } from "../compiler/ocean/OceanTerrainCompiler";
import type { OceanNearshoreDescriptorV1 } from "../authoring/ocean/OceanNearshoreDescriptor";
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
  | {
      readonly kind: "ocean";
      readonly waterLevel: number;
      readonly layout: WaterOceanRepresentationStateV1;
      /** Body-local polygons whose interiors and boundaries never belong to this Ocean. */
      readonly excludedAreas?: readonly (readonly { readonly x: number; readonly z: number }[])[];
      /** Keep only submerged cells connected to the finite terrain boundary. */
      readonly boundaryConnected?: boolean;
    };

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
    if (shape.boundaryConnected !== undefined && typeof shape.boundaryConnected !== "boolean")
      throw new TypeError("INVALID_ARGUMENT: boundaryConnected must be boolean.");
    if (shape.excludedAreas !== undefined) {
      if (!Array.isArray(shape.excludedAreas) || shape.excludedAreas.length > 256)
        throw new RangeError("INVALID_ARGUMENT: excludedAreas must contain at most 256 polygons.");
      for (const ring of shape.excludedAreas) {
        if (
          !Array.isArray(ring) ||
          ring.length < 3 ||
          ring.length > 4096 ||
          ring.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.z))
        )
          throw new TypeError("INVALID_ARGUMENT: Ocean exclusions need 3..4096 finite XZ vertices.");
      }
    }
  }
  return createImmutableWaterSnapshot(shape);
}

export function validateWaterAuthoringSettings(input: {
  shape: WaterShapeAuthoring;
  terrain?: unknown;
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
        !["shape", "terrain", "quality", "material", "connections", "visible", "priority", "interaction"].includes(key)
    )
  )
    throw new TypeError("INVALID_ARGUMENT: Unknown Water authoring property.");
  const terrain = input.terrain as { mode?: string; description?: unknown; heights?: unknown } | undefined;
  if (
    !terrain ||
    !["host", "asset"].includes(terrain.mode ?? "") ||
    Object.keys(terrain).some(
      (key) => !(terrain.mode === "host" ? ["mode"] : ["mode", "description", "heights"]).includes(key)
    ) ||
    (terrain.mode === "asset" && (!terrain.description || !terrain.heights))
  )
    throw new TypeError(
      "INVALID_ARGUMENT: Water terrain requires host mode or a native description/height asset pair."
    );
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
  const quality = createWaterQualitySettings(input.shape.kind, input.quality);
  const interaction = input.interaction ?? { query: true, buoyancy: false, wake: false };
  const capabilities = getWaterAuthoringCapabilities(input.shape.kind);
  if ((!capabilities.wake && interaction.wake) || (!capabilities.buoyancy && interaction.buoyancy))
    throw new Error("NOT_SUPPORTED: Water wake and Ocean buoyancy are unavailable in the current native backends.");
  if (quality.query === "off" && (interaction.buoyancy || interaction.wake))
    throw new Error("INVALID_ARGUMENT: Water interaction requires a query quality other than off.");
  return quality;
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
      } as OceanNearshoreDescriptorV1
    }
  };
  if (shape.boundaryConnected || shape.excludedAreas?.length) {
    const count = terrain.columns * terrain.rows;
    if (!Number.isSafeInteger(count) || count < 4 || count > 1_048_576)
      throw new RangeError("RESOURCE_LIMIT: Ocean mask exceeds the finite terrain budget.");
    const ownership = new Uint8Array(count).fill(1);
    for (let row = 0; row < terrain.rows; row++)
      for (let column = 0; column < terrain.columns; column++) {
        const x = terrain.origin[0] + column * terrain.spacing;
        const z = terrain.origin[1] + row * (terrain.spacingZ ?? terrain.spacing);
        if (shape.excludedAreas?.some((ring) => oceanExcludedPoint(x, z, ring)))
          ownership[row * terrain.columns + column] = 0;
      }
    const template = descriptor.config.nearshoreDescriptor as OceanNearshoreDescriptorV1;
    const connected = createOceanNearshoreFromTerrain(template, ownership, { waterLevel: shape.waterLevel, terrain });
    if (!shape.boundaryConnected) {
      const mask = Uint8Array.from(ownership, (owned, i) =>
        owned && connected.bedHeights[i] < shape.waterLevel ? 1 : 0
      );
      descriptor.config.nearshoreDescriptor = {
        ...connected,
        wetSource: { kind: "mask", mask, minimumDepth: 0 }
      };
    } else descriptor.config.nearshoreDescriptor = connected;
  }
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

/** Final effective world placement, including all parents. Quaternion order is x/y/z/w. */
export function validateWaterWorldTransform(
  kind: WaterShapeAuthoring["kind"],
  connected: boolean,
  transform: {
    position: readonly number[];
    rotationQuaternion: readonly number[];
    scale: readonly number[];
  }
): void {
  const { position: p, rotationQuaternion: q, scale: s } = transform;
  if (p.length !== 3 || q.length !== 4 || s.length !== 3 || ![...p, ...q, ...s].every(Number.isFinite))
    throw new TypeError("INVALID_ARGUMENT: Water world transform must contain finite position, quaternion and scale.");
  const tolerance = 1e-6;
  if ([s[0] - 1, s[1] - 1, s[2] - 1, q[0], q[2]].some((value) => Math.abs(value) > tolerance))
    throw new Error("NOT_SUPPORTED: Water supports translation and yaw, with unit world scale.");
  if (
    (kind === "ocean" || connected) &&
    [...p, q[0], q[1], q[2], Math.abs(q[3]) - 1].some((value) => Math.abs(value) > tolerance)
  )
    throw new Error("NOT_SUPPORTED: Ocean and connected Water require identity world placement.");
}

/** Static native-backend request limits, not device readiness or physical force behavior. */
export function getWaterAuthoringCapabilities(kind: WaterShapeAuthoring["kind"]) {
  if (!["lake", "river", "ocean"].includes(kind)) throw new TypeError("INVALID_ARGUMENT: Unknown Water kind.");
  return Object.freeze({
    query: true,
    buoyancy: kind !== "ocean",
    wake: false,
    worldPlacement: kind === "ocean" ? ("identity" as const) : ("translation-yaw" as const),
    connectedWorldPlacement: "identity" as const,
    cameraCount: 1
  });
}

/** Shader asset metadata check shared with Headless author validation. Ocean assets own both region implementations. */
export function validateWaterShaderCapabilities(
  kind: WaterShapeAuthoring["kind"],
  subShaderNames: readonly string[]
): void {
  if (!subShaderNames.length || (kind === "ocean" && !subShaderNames.includes("WaterFar")))
    throw new Error(
      "NOT_SUPPORTED: Ocean Water Shader requires an authored WaterFar SubShader in addition to its near surface."
    );
}

/** Decode the native Material's integer profile without importing Engine or maintaining a second enum in Editor. */
export function resolveWaterMaterialProfile(
  profileIndex: unknown,
  riverDrops: unknown,
  expectedKind?: WaterShapeAuthoring["kind"]
): WaterShapeAuthoring["kind"] {
  const profiles = ["lake", "river", "ocean"] as const;
  const profile =
    typeof profileIndex === "number" && Number.isInteger(profileIndex) ? profiles[profileIndex] : undefined;
  if (!profile || (riverDrops !== 0 && riverDrops !== 1) || (riverDrops === 1 && profile !== "river"))
    throw new TypeError("INVALID_ARGUMENT: Water Material has an unsupported profile or river drop policy.");
  if (expectedKind !== undefined && expectedKind !== profile)
    throw new TypeError(
      `INVALID_ARGUMENT: ${expectedKind} Water requires a ${expectedKind} Material, received ${profile}.`
    );
  return profile;
}

/** Validate the ordinary .mat file's declared profile and shape compatibility before author commit. */
export function validateWaterMaterialCapabilities(
  kind: WaterShapeAuthoring["kind"],
  material: { readonly shaderData?: Readonly<Record<string, { readonly type?: string; readonly value?: unknown }>> }
): void {
  const data = material?.shaderData;
  const profile = data?.material_WaterProfile;
  const drops = data?.material_WaterRiverDrops;
  if (profile?.type !== "Integer" || (drops?.type !== "Boolean" && drops?.type !== "Integer"))
    throw new TypeError("INVALID_ARGUMENT: Water Material requires native profile and river drop declarations.");
  resolveWaterMaterialProfile(profile.value, drops.value === true ? 1 : drops.value === false ? 0 : drops.value, kind);
}

/** Closed polygon containment, including boundary points. */
function oceanExcludedPoint(x: number, z: number, ring: readonly { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const cross = (x - a.x) * dz - (z - a.z) * dx;
    if (
      Math.abs(cross) <= 1e-9 &&
      x >= Math.min(a.x, b.x) &&
      x <= Math.max(a.x, b.x) &&
      z >= Math.min(a.z, b.z) &&
      z <= Math.max(a.z, b.z)
    )
      return true;
    if (a.z > z !== b.z > z && x < a.x + ((z - a.z) * dx) / dz) inside = !inside;
  }
  return inside;
}
