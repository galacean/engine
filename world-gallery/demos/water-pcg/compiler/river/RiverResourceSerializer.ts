import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import {
  RIVER_SURFACE_MOTION_QUALITY_SCALE,
  RIVER_SURFACE_MOTION_STYLE_PRESET
} from "../../authoring/river/RiverAuthoringLimits";
import {
  RiverReadonlyFloat32Buffer,
  RiverReadonlyInt32Buffer,
  RiverReadonlyUint32Buffer,
  RiverReadonlyUint8Buffer
} from "../shared/ReadonlyNumericBuffer";
import { hashRiverStableValue, hashRiverString } from "../shared/determinism";
import {
  RIVER_CATMULL_ROM_ALPHA,
  RIVER_CHUNK_WORLD_SIZE,
  RIVER_FLOW_TRAVEL_MIN_SPEED,
  RIVER_FLOW_UV_SCALE,
  RIVER_JUNCTION_CORE_RING_SCALE,
  RIVER_JUNCTION_INNER_RING_SCALE,
  RIVER_LOCAL_MAP_MAX_ATLAS_WIDTH,
  RIVER_LOCAL_MAP_PADDING,
  RIVER_LOCAL_MAP_SIGNED_DISTANCE_RANGE,
  RIVER_LOCAL_MAP_TILE_RESOLUTION_BY_QUALITY,
  RIVER_LOCAL_MAP_TUNING,
  RIVER_OBSTACLE_MAP_RADIUS_SCALE,
  RIVER_MAX_WATER_SURFACE_SLOPE,
  RIVER_QUERY_CELL_SIZE_BY_QUALITY,
  RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY,
  RIVER_SURFACE_DERIVATIVE_STEP,
  RIVER_SURFACE_DOMAIN_WARP_SCALE,
  RIVER_SURFACE_DOMAIN_WARP_STRENGTH,
  RIVER_SURFACE_HASH_MULTIPLIER,
  RIVER_SURFACE_HASH_SEED_SCALE,
  RIVER_SURFACE_MACRO_NOISE,
  RIVER_SURFACE_REFERENCE_FLOW_SPEED,
  RIVER_SURFACE_TIME_DERIVATIVE_STEP,
  RIVER_TERRAIN_CORRIDOR_STRIDE
} from "./constants";
import { RiverLocalMapRegionKind } from "./RiverGeometryEnums";
import { RiverResourceAssetVersion, RiverSerializedBufferKind } from "./RiverResourceEnums";
import type { RiverCompiledData } from "./types";

const RIVER_RESOURCE_BUFFER_TAG = "__riverNumericBuffer";
const RIVER_RESOURCE_BAKE_FORMAT_VERSION = 7;

interface SerializedNumericBuffer {
  readonly [RIVER_RESOURCE_BUFFER_TAG]: RiverSerializedBufferKind;
  readonly values: readonly number[];
}

interface RiverResourceEnvelopeV1 {
  readonly assetVersion: RiverResourceAssetVersion.V1;
  readonly descriptorHash: string;
  readonly bakeOptionsHash: string;
  readonly compiledHash: string;
  readonly compiledData: RiverCompiledData;
}

export interface RiverResourceMetadata {
  readonly assetVersion: RiverResourceAssetVersion;
  readonly descriptorHash: string;
  readonly bakeOptionsHash: string;
  readonly compiledHash: string;
}

export interface RiverSerializedResource {
  readonly bytes: Uint8Array;
  readonly metadata: RiverResourceMetadata;
}

export interface RiverDeserializedResource {
  readonly data: RiverCompiledData;
  readonly metadata: RiverResourceMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freezePlainData<T>(value: T): T {
  if (typeof value !== "object" || value === null || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) freezePlainData(record[key]);
  return Object.freeze(value);
}

function serializeNumericBuffer(value: unknown): SerializedNumericBuffer | undefined {
  if (value instanceof RiverReadonlyUint8Buffer) {
    return { [RIVER_RESOURCE_BUFFER_TAG]: RiverSerializedBufferKind.Uint8, values: Array.from(value) };
  }
  if (value instanceof RiverReadonlyFloat32Buffer) {
    return { [RIVER_RESOURCE_BUFFER_TAG]: RiverSerializedBufferKind.Float32, values: Array.from(value) };
  }
  if (value instanceof RiverReadonlyInt32Buffer) {
    return { [RIVER_RESOURCE_BUFFER_TAG]: RiverSerializedBufferKind.Int32, values: Array.from(value) };
  }
  if (value instanceof RiverReadonlyUint32Buffer) {
    return { [RIVER_RESOURCE_BUFFER_TAG]: RiverSerializedBufferKind.Uint32, values: Array.from(value) };
  }
  return undefined;
}

function stringifyCompiledData(data: RiverCompiledData): string {
  return JSON.stringify(data, (_key, value: unknown) => serializeNumericBuffer(value) ?? value);
}

function reviveNumericBuffer(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.values)) return value;
  const kind = value[RIVER_RESOURCE_BUFFER_TAG];
  if (!value.values.every((entry) => typeof entry === "number" && Number.isFinite(entry))) return value;
  if (
    kind === RiverSerializedBufferKind.Uint8 &&
    value.values.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)
  ) {
    return new RiverReadonlyUint8Buffer(value.values);
  }
  if (kind === RiverSerializedBufferKind.Float32) return new RiverReadonlyFloat32Buffer(value.values);
  if (kind === RiverSerializedBufferKind.Int32 && value.values.every(Number.isInteger)) {
    return new RiverReadonlyInt32Buffer(value.values);
  }
  if (
    kind === RiverSerializedBufferKind.Uint32 &&
    value.values.every((entry) => Number.isInteger(entry) && entry >= 0)
  ) {
    return new RiverReadonlyUint32Buffer(value.values);
  }
  return value;
}

function isFiniteTuple(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isGeometryData(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.positions) || !Array.isArray(value.uvs) || !Array.isArray(value.uv1s)) {
    return false;
  }
  return (
    value.positions.every((position) => isFiniteTuple(position, 3)) &&
    (value.normals === undefined ||
      (Array.isArray(value.normals) &&
        value.normals.length === value.positions.length &&
        value.normals.every((normal) => isFiniteTuple(normal, 3)))) &&
    (value.tangents === undefined ||
      (Array.isArray(value.tangents) &&
        value.tangents.length === value.positions.length &&
        value.tangents.every((tangent) => isFiniteTuple(tangent, 4)))) &&
    value.uvs.every((uv) => isFiniteTuple(uv, 2)) &&
    value.uv1s.every((uv) => isFiniteTuple(uv, 2)) &&
    (value.uv2s === undefined ||
      (Array.isArray(value.uv2s) &&
        value.uv2s.length === value.positions.length &&
        value.uv2s.every((uv) => isFiniteTuple(uv, 2)))) &&
    (value.uv3s === undefined ||
      (Array.isArray(value.uv3s) &&
        value.uv3s.length === value.positions.length &&
        value.uv3s.every((uv) => isFiniteTuple(uv, 2)))) &&
    (value.colors === undefined ||
      (Array.isArray(value.colors) &&
        value.colors.length === value.positions.length &&
        value.colors.every((color) => isFiniteTuple(color, 4)))) &&
    value.indices instanceof RiverReadonlyUint32Buffer &&
    isRecord(value.bounds) &&
    isFiniteTuple(value.bounds.min, 3) &&
    isFiniteTuple(value.bounds.max, 3) &&
    typeof value.maxDisplacement === "number" &&
    Number.isFinite(value.maxDisplacement) &&
    typeof value.drawStart === "number" &&
    typeof value.drawCount === "number"
  );
}

function isQueryIndex(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.cellSize === "number" &&
    typeof value.primitiveCount === "number" &&
    typeof value.cellCount === "number" &&
    value.primitiveKinds instanceof RiverReadonlyUint32Buffer &&
    value.primitiveSourceIndices instanceof RiverReadonlyUint32Buffer &&
    value.primitiveLocalIndices instanceof RiverReadonlyUint32Buffer &&
    value.primitiveBounds instanceof RiverReadonlyFloat32Buffer &&
    value.cellCoordinates instanceof RiverReadonlyInt32Buffer &&
    value.cellOffsets instanceof RiverReadonlyUint32Buffer &&
    value.cellPrimitiveIndices instanceof RiverReadonlyUint32Buffer
  );
}

function isLocalMapAtlas(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    !Number.isInteger(value.padding) ||
    (value.width as number) <= 0 ||
    (value.height as number) <= 0 ||
    !(value.pixels instanceof RiverReadonlyUint8Buffer) ||
    value.pixels.length !== (value.width as number) * (value.height as number) * 4 ||
    !Array.isArray(value.tiles)
  ) {
    return false;
  }
  const width = value.width as number;
  const height = value.height as number;
  const padding = value.padding as number;
  if (padding < 0) return false;
  const tolerance = 1e-5;
  return value.tiles.every((tile) => {
    if (
      !isRecord(tile) ||
      typeof tile.id !== "string" ||
      !Object.values(RiverLocalMapRegionKind).includes(tile.kind as RiverLocalMapRegionKind) ||
      !Number.isInteger(tile.sourceIndex) ||
      (tile.sourceIndex as number) < 0 ||
      !Number.isInteger(tile.resolution) ||
      (tile.resolution as number) <= 0 ||
      !isFiniteTuple(tile.min, 2) ||
      !isFiniteTuple(tile.max, 2) ||
      !isFiniteTuple(tile.pixelRect, 4) ||
      !isFiniteTuple(tile.uvRect, 4) ||
      !isFiniteTuple(tile.worldToUv, 4)
    ) {
      return false;
    }
    const min = tile.min as number[];
    const max = tile.max as number[];
    const pixelRect = tile.pixelRect as number[];
    const uvRect = tile.uvRect as number[];
    const worldToUv = tile.worldToUv as number[];
    const resolution = tile.resolution as number;
    const integerPixelRect = pixelRect.every(Number.isInteger);
    const pixelRectInsideAtlas =
      pixelRect[0] >= padding &&
      pixelRect[1] >= padding &&
      pixelRect[2] === resolution &&
      pixelRect[3] === resolution &&
      pixelRect[0] + resolution + padding <= width &&
      pixelRect[1] + resolution + padding <= height;
    const uvRectInsideAtlas =
      uvRect[0] >= 0 &&
      uvRect[1] >= 0 &&
      uvRect[2] <= 1 &&
      uvRect[3] <= 1 &&
      uvRect[0] < uvRect[2] &&
      uvRect[1] < uvRect[3];
    const mappedMinX = min[0] * worldToUv[0] + worldToUv[2];
    const mappedMinZ = min[1] * worldToUv[1] + worldToUv[3];
    const mappedMaxX = max[0] * worldToUv[0] + worldToUv[2];
    const mappedMaxZ = max[1] * worldToUv[1] + worldToUv[3];
    const transformMatches =
      Math.abs(mappedMinX - uvRect[0]) <= tolerance &&
      Math.abs(mappedMinZ - uvRect[1]) <= tolerance &&
      Math.abs(mappedMaxX - uvRect[2]) <= tolerance &&
      Math.abs(mappedMaxZ - uvRect[3]) <= tolerance;
    return (
      min[0] < max[0] &&
      min[1] < max[1] &&
      integerPixelRect &&
      pixelRectInsideAtlas &&
      uvRectInsideAtlas &&
      worldToUv[0] > 0 &&
      worldToUv[1] > 0 &&
      transformMatches
    );
  });
}

function isTerrainInteraction(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.terrainSurfaceOwnership === "string" &&
    Array.isArray(value.maskChannels) &&
    value.maskChannels.every((channel) => typeof channel === "string") &&
    Array.isArray(value.reachCorridors) &&
    value.reachCorridors.every(
      (corridor) =>
        isRecord(corridor) &&
        typeof corridor.id === "string" &&
        typeof corridor.reachIndex === "number" &&
        typeof corridor.stride === "number" &&
        typeof corridor.sampleCount === "number" &&
        corridor.samples instanceof RiverReadonlyFloat32Buffer
    ) &&
    Array.isArray(value.junctionCorridors) &&
    value.junctionCorridors.every(
      (corridor) =>
        isRecord(corridor) &&
        typeof corridor.id === "string" &&
        Array.isArray(corridor.boundary) &&
        corridor.boundary.every((position) => isFiniteTuple(position, 3)) &&
        typeof corridor.waterSurfaceElevation === "number" &&
        typeof corridor.riverBedElevation === "number"
    ) &&
    Array.isArray(value.localMapBakeRegions) &&
    value.localMapBakeRegions.every(
      (region) =>
        isRecord(region) &&
        typeof region.id === "string" &&
        typeof region.kind === "string" &&
        Number.isInteger(region.sourceIndex) &&
        isFiniteTuple(region.min, 2) &&
        isFiniteTuple(region.max, 2) &&
        Array.isArray(region.packedChannels) &&
        region.packedChannels.every((channel) => typeof channel === "string")
    ) &&
    (value.localMapAtlas === undefined || isLocalMapAtlas(value.localMapAtlas))
  );
}

function isSurfaceMotion(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isInteger(value.seed) &&
    typeof value.maxDisplacement === "number" &&
    Number.isFinite(value.maxDisplacement) &&
    typeof value.displacementLengthScale === "number" &&
    Number.isFinite(value.displacementLengthScale) &&
    typeof value.shoreDampingWidth === "number" &&
    Number.isFinite(value.shoreDampingWidth) &&
    typeof value.turbulence === "number" &&
    Number.isFinite(value.turbulence) &&
    typeof value.crestIntensity === "number" &&
    Number.isFinite(value.crestIntensity) &&
    typeof value.microNormalStrength === "number" &&
    Number.isFinite(value.microNormalStrength)
  );
}

function isCompiledData(value: unknown): value is RiverCompiledData {
  if (!isRecord(value)) return false;
  return (
    typeof value.sourceId === "string" &&
    Array.isArray(value.nodes) &&
    value.nodes.every(
      (node) =>
        isRecord(node) &&
        typeof node.id === "string" &&
        isFiniteTuple(node.position, 3) &&
        node.incomingReachIndices instanceof RiverReadonlyUint32Buffer &&
        node.outgoingReachIndices instanceof RiverReadonlyUint32Buffer
    ) &&
    Array.isArray(value.reaches) &&
    value.reaches.every(
      (reach) =>
        isRecord(reach) &&
        typeof reach.id === "string" &&
        typeof reach.flowTravelDuration === "number" &&
        Number.isFinite(reach.flowTravelDuration) &&
        typeof reach.networkFlowTimeOffset === "number" &&
        Number.isFinite(reach.networkFlowTimeOffset) &&
        isRecord(reach.artifact) &&
        Array.isArray(reach.artifact.samples) &&
        reach.artifact.samples.every(
          (sample) =>
            isRecord(sample) && typeof sample.flowTravelTime === "number" && Number.isFinite(sample.flowTravelTime)
        ) &&
        isGeometryData(reach.artifact.surfaceGeometry) &&
        (reach.artifact.bankFoamGeometry === undefined || isGeometryData(reach.artifact.bankFoamGeometry)) &&
        isRecord(reach.artifact.querySource) &&
        reach.artifact.querySource.samples instanceof RiverReadonlyFloat32Buffer
    ) &&
    Array.isArray(value.junctions) &&
    value.junctions.every(
      (junction) =>
        isRecord(junction) &&
        typeof junction.id === "string" &&
        Array.isArray(junction.queryBoundary) &&
        junction.queryBoundary.every((position) => isFiniteTuple(position, 3)) &&
        junction.incomingReachIndices instanceof RiverReadonlyUint32Buffer &&
        junction.outgoingReachIndices instanceof RiverReadonlyUint32Buffer &&
        typeof junction.networkFlowTime === "number" &&
        Number.isFinite(junction.networkFlowTime) &&
        typeof junction.phaseHalfWidth === "number" &&
        Number.isFinite(junction.phaseHalfWidth) &&
        Array.isArray(junction.flowAnchors) &&
        junction.flowAnchors.every(
          (anchor) =>
            isRecord(anchor) &&
            isFiniteTuple(anchor.position, 3) &&
            isFiniteTuple(anchor.flowDirection, 3) &&
            typeof anchor.flowSpeed === "number" &&
            typeof anchor.incoming === "boolean"
        ) &&
        isGeometryData(junction.surfaceGeometry) &&
        (junction.bankFoamGeometry === undefined || isGeometryData(junction.bankFoamGeometry))
    ) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(
      (chunk) =>
        isRecord(chunk) &&
        typeof chunk.id === "string" &&
        isFiniteTuple(chunk.localOrigin, 3) &&
        (chunk.localMapTileIndex === undefined || Number.isInteger(chunk.localMapTileIndex)) &&
        isGeometryData(chunk.surfaceGeometry) &&
        (chunk.bankFoamGeometry === undefined || isGeometryData(chunk.bankFoamGeometry))
    ) &&
    isQueryIndex(value.queryIndex) &&
    isTerrainInteraction(value.terrainInteraction) &&
    isSurfaceMotion(value.surfaceMotion) &&
    Array.isArray(value.disturbances) &&
    value.disturbances.every(
      (disturbance) =>
        isRecord(disturbance) &&
        typeof disturbance.id === "string" &&
        typeof disturbance.kind === "string" &&
        isFiniteTuple(disturbance.position, 3) &&
        typeof disturbance.radius === "number" &&
        Number.isFinite(disturbance.radius) &&
        typeof disturbance.strength === "number" &&
        Number.isFinite(disturbance.strength)
    ) &&
    isRecord(value.stats) &&
    Array.isArray(value.diagnostics) &&
    value.topologicalNodeIndices instanceof RiverReadonlyUint32Buffer &&
    value.waterSurfaceElevations instanceof RiverReadonlyFloat32Buffer
  );
}

function createBakeOptionsHash(descriptor: RiverNetworkDescriptor): string {
  return hashRiverStableValue({
    formatVersion: RIVER_RESOURCE_BAKE_FORMAT_VERSION,
    quality: descriptor.defaults.quality,
    budget: descriptor.budget ?? null,
    chunkWorldSize: RIVER_CHUNK_WORLD_SIZE,
    queryCellSizes: RIVER_QUERY_CELL_SIZE_BY_QUALITY,
    catmullRomAlpha: RIVER_CATMULL_ROM_ALPHA,
    flowUvScale: RIVER_FLOW_UV_SCALE,
    flowTravelMinSpeed: RIVER_FLOW_TRAVEL_MIN_SPEED,
    junctionCoreRingScale: RIVER_JUNCTION_CORE_RING_SCALE,
    junctionInnerRingScale: RIVER_JUNCTION_INNER_RING_SCALE,
    maxWaterSurfaceSlope: RIVER_MAX_WATER_SURFACE_SLOPE,
    terrainCorridorStride: RIVER_TERRAIN_CORRIDOR_STRIDE,
    surfaceCrossSegments: RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY,
    surfaceMotionStyle: RIVER_SURFACE_MOTION_STYLE_PRESET,
    surfaceMotionQuality: RIVER_SURFACE_MOTION_QUALITY_SCALE,
    surfaceReferenceFlowSpeed: RIVER_SURFACE_REFERENCE_FLOW_SPEED,
    surfaceDerivativeStep: RIVER_SURFACE_DERIVATIVE_STEP,
    surfaceTimeDerivativeStep: RIVER_SURFACE_TIME_DERIVATIVE_STEP,
    surfaceHashMultiplier: RIVER_SURFACE_HASH_MULTIPLIER,
    surfaceHashSeedScale: RIVER_SURFACE_HASH_SEED_SCALE,
    surfaceDomainWarpScale: RIVER_SURFACE_DOMAIN_WARP_SCALE,
    surfaceDomainWarpStrength: RIVER_SURFACE_DOMAIN_WARP_STRENGTH,
    surfaceMacroNoise: RIVER_SURFACE_MACRO_NOISE,
    localMapTileResolution: RIVER_LOCAL_MAP_TILE_RESOLUTION_BY_QUALITY,
    localMapPadding: RIVER_LOCAL_MAP_PADDING,
    localMapMaxAtlasWidth: RIVER_LOCAL_MAP_MAX_ATLAS_WIDTH,
    localMapSignedDistanceRange: RIVER_LOCAL_MAP_SIGNED_DISTANCE_RANGE,
    obstacleMapRadiusScale: RIVER_OBSTACLE_MAP_RADIUS_SCALE,
    localMapTuning: RIVER_LOCAL_MAP_TUNING
  });
}

function createMetadata(descriptor: RiverNetworkDescriptor, compiledJson: string): RiverResourceMetadata {
  return Object.freeze({
    assetVersion: RiverResourceAssetVersion.V1,
    descriptorHash: hashRiverStableValue(descriptor),
    bakeOptionsHash: createBakeOptionsHash(descriptor),
    compiledHash: hashRiverString(compiledJson)
  });
}

export function serializeRiverResource(
  descriptor: RiverNetworkDescriptor,
  data: RiverCompiledData
): RiverSerializedResource {
  const compiledJson = stringifyCompiledData(data);
  const metadata = createMetadata(descriptor, compiledJson);
  const envelope: RiverResourceEnvelopeV1 = {
    ...metadata,
    assetVersion: RiverResourceAssetVersion.V1,
    compiledData: data
  };
  const json = JSON.stringify(envelope, (_key, value: unknown) => serializeNumericBuffer(value) ?? value);
  return Object.freeze({ bytes: new TextEncoder().encode(json), metadata });
}

export function deserializeRiverResource(bytes: Uint8Array): RiverDeserializedResource {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(text, (_key, value: unknown) => reviveNumericBuffer(value));
  if (!isRecord(parsed) || parsed.assetVersion !== RiverResourceAssetVersion.V1) {
    throw new Error("Unsupported river resource asset version.");
  }
  if (
    typeof parsed.descriptorHash !== "string" ||
    typeof parsed.bakeOptionsHash !== "string" ||
    typeof parsed.compiledHash !== "string" ||
    !isCompiledData(parsed.compiledData)
  ) {
    throw new Error("Malformed river resource envelope.");
  }
  const compiledHash = hashRiverString(stringifyCompiledData(parsed.compiledData));
  if (compiledHash !== parsed.compiledHash) throw new Error("River resource compiled-data hash mismatch.");
  const metadata: RiverResourceMetadata = Object.freeze({
    assetVersion: RiverResourceAssetVersion.V1,
    descriptorHash: parsed.descriptorHash,
    bakeOptionsHash: parsed.bakeOptionsHash,
    compiledHash: parsed.compiledHash
  });
  return Object.freeze({ data: freezePlainData(parsed.compiledData), metadata });
}
