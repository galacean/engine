import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import {
  RiverReadonlyFloat32Buffer,
  RiverReadonlyInt32Buffer,
  RiverReadonlyUint32Buffer
} from "../shared/ReadonlyNumericBuffer";
import { hashRiverStableValue, hashRiverString } from "../shared/determinism";
import {
  RIVER_CATMULL_ROM_ALPHA,
  RIVER_CHUNK_WORLD_SIZE,
  RIVER_MAX_WATER_SURFACE_SLOPE,
  RIVER_QUERY_CELL_SIZE_BY_QUALITY,
  RIVER_TERRAIN_CORRIDOR_STRIDE
} from "./constants";
import { RiverResourceAssetVersion, RiverSerializedBufferKind } from "./RiverResourceEnums";
import type { RiverCompiledData } from "./types";

const RIVER_RESOURCE_BUFFER_TAG = "__riverNumericBuffer";
const RIVER_RESOURCE_BAKE_FORMAT_VERSION = 2;

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
  if (kind === RiverSerializedBufferKind.Float32) return new RiverReadonlyFloat32Buffer(value.values);
  if (kind === RiverSerializedBufferKind.Int32 && value.values.every(Number.isInteger)) {
    return new RiverReadonlyInt32Buffer(value.values);
  }
  if (kind === RiverSerializedBufferKind.Uint32 && value.values.every((entry) => Number.isInteger(entry) && entry >= 0)) {
    return new RiverReadonlyUint32Buffer(value.values);
  }
  return value;
}

function isFiniteTuple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isGeometryData(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.positions) || !Array.isArray(value.uvs) || !Array.isArray(value.uv1s)) {
    return false;
  }
  return (
    value.positions.every((position) => isFiniteTuple(position, 3)) &&
    value.uvs.every((uv) => isFiniteTuple(uv, 2)) &&
    value.uv1s.every((uv) => isFiniteTuple(uv, 2)) &&
    value.indices instanceof RiverReadonlyUint32Buffer &&
    isRecord(value.bounds) &&
    isFiniteTuple(value.bounds.min, 3) &&
    isFiniteTuple(value.bounds.max, 3) &&
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
        isFiniteTuple(region.min, 2) &&
        isFiniteTuple(region.max, 2) &&
        Array.isArray(region.packedChannels) &&
        region.packedChannels.every((channel) => typeof channel === "string")
    )
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
        isRecord(reach.artifact) &&
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
        isGeometryData(junction.surfaceGeometry) &&
        (junction.bankFoamGeometry === undefined || isGeometryData(junction.bankFoamGeometry))
    ) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(
      (chunk) =>
        isRecord(chunk) &&
        typeof chunk.id === "string" &&
        isFiniteTuple(chunk.localOrigin, 3) &&
        isGeometryData(chunk.surfaceGeometry) &&
        (chunk.bankFoamGeometry === undefined || isGeometryData(chunk.bankFoamGeometry))
    ) &&
    isQueryIndex(value.queryIndex) &&
    isTerrainInteraction(value.terrainInteraction) &&
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
    maxWaterSurfaceSlope: RIVER_MAX_WATER_SURFACE_SLOPE,
    terrainCorridorStride: RIVER_TERRAIN_CORRIDOR_STRIDE
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
