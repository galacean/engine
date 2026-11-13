import { WaterReadonlyUint8Buffer } from "../../compiler/shared/ReadonlyNumericBuffer";
import { decodeWaterConnectionPorts } from "../../authoring/connections/WaterConnection";
/** Immutable compiler output for the finite, render-only Ocean backend. */
import { createPhysicalSurfaceIdentity } from "../../authoring/body/PhysicalSurfaceIdentity";
import { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import { createWaterRepresentationV1 } from "../../authoring/body/WaterBodyRepresentation";
import type { OceanNearshoreDiagnostic } from "../../authoring/ocean/OceanNearshoreTypes";
import { OCEAN_LOOK } from "../../authoring/ocean/presets/OceanLook";
import {
  WaterReferenceCountedCompiledResource,
  type WaterCompiledBackendRouteIdentity
} from "../../compiler/body/WaterCompiledResource";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import type {
  OceanNearshoreCompiledData,
  OceanNearshoreStaticAtlas
} from "../../compiler/ocean/OceanNearshoreCompiledTypes";

import { WaterBufferOwnership } from "../../compiler/shared/WaterBufferOwnership";
import { hashStableValue } from "../../compiler/shared/determinism";
import { createWaterResourceMemoryMetrics, measureWaterOwnedCpuBytes } from "../resources/WaterResourceMetrics";
import { OceanNearshoreFieldResource } from "./OceanNearshoreFieldResource";
import type { OceanWaterSourceConfig } from "./OceanWaterRuntimeTypes";

export const OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION = 2 as const;
export const OCEAN_WATER_COMPILER_VERSION = 2 as const;
export const OCEAN_WATER_COMPILED_TRANSFER_SCHEMA_VERSION = 1 as const;

export interface OceanWaterCompiledTransferV1 {
  readonly schemaVersion: typeof OCEAN_WATER_COMPILED_TRANSFER_SCHEMA_VERSION;
  readonly kind: "ocean-water-compiled-transfer-v1";
  readonly compileKey: string;
  readonly sourceHash: string;
  readonly physicalSourceHash: string;
  readonly data: Readonly<OceanWaterCompiledData>;
  readonly nearshoreData: Readonly<
    Omit<OceanNearshoreCompiledData, "staticAtlas"> & {
      staticAtlas: Readonly<Omit<OceanNearshoreStaticAtlas, "pixels"> & { pixels: Uint8Array }>;
    }
  >;
}

export interface OceanWaterBodyDescriptorV1 {
  readonly schemaVersion: typeof OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION;
  readonly id: string;
  readonly config: OceanWaterSourceConfig;
}

export interface OceanWaterCompiledData {
  readonly schemaVersion: typeof OCEAN_WATER_COMPILER_VERSION;
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly compiledHash: string;
  readonly config: OceanWaterSourceConfig;
  readonly lookParameterHash: string;
}

export class OceanWaterCompileError extends Error {
  constructor(readonly diagnostics: readonly OceanNearshoreDiagnostic[]) {
    super(diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join("; "));
    this.name = "OceanWaterCompileError";
  }
}

const DESCRIPTOR_KEYS = new Set(["schemaVersion", "id", "config"]);
const CONFIG_KEYS = new Set(["waterLevel", "nearshoreDescriptor", "connections"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function assertAllowedKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new Error(`Ocean source '${path}' contains unsupported field '${String(key)}'.`);
    }
  }
}

function assertEngineObjectFree(value: unknown, path: string, ancestors: WeakSet<object>): void {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value !== "object") throw new Error(`Ocean source '${path}' must contain data only.`);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error(`Ocean source '${path}' must not contain engine or class instances.`);
  }
  if (ancestors.has(value)) throw new Error(`Ocean source '${path}' must not be cyclic.`);
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(`Ocean source '${path}' must not contain symbol keys.`);
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !("value" in property))
      throw new Error(`Ocean source '${path}.${key}' must not contain accessors.`);
    assertEngineObjectFree(property.value, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

export function assertOceanWaterBodyDescriptor(value: unknown): asserts value is OceanWaterBodyDescriptorV1 {
  if (!isRecord(value)) throw new Error("Ocean WaterBody descriptor must be an object.");
  assertAllowedKeys(value, DESCRIPTOR_KEYS, "$");
  if (value.schemaVersion !== OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION) {
    throw new Error(`Ocean WaterBody descriptor requires schema ${OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION}.`);
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new Error("Ocean WaterBody descriptor id must be non-empty.");
  }
  if (!isRecord(value.config)) throw new Error("Ocean WaterBody descriptor config must be an object.");
  assertAllowedKeys(value.config, CONFIG_KEYS, "$.config");
  decodeWaterConnectionPorts(value.config.connections);
  if (!Number.isFinite(value.config.waterLevel)) throw new Error("Ocean WaterBody waterLevel must be finite.");
  if (!isRecord(value.config.nearshoreDescriptor)) {
    throw new Error("Finite Ocean WaterBody requires one nearshore descriptor.");
  }
  const nearshoreWaterLevel = (value.config.nearshoreDescriptor as { waterLevel?: unknown }).waterLevel;
  if (nearshoreWaterLevel !== value.config.waterLevel) {
    throw new Error("Ocean WaterBody waterLevel must equal its authoritative nearshore waterLevel.");
  }
  assertEngineObjectFree(value.config, "$.config", new WeakSet());
}

function hashableDescriptor(descriptor: Readonly<OceanWaterBodyDescriptorV1>): object {
  const nearshore = descriptor.config.nearshoreDescriptor;
  return {
    schemaVersion: descriptor.schemaVersion,
    id: descriptor.id,
    config: {
      waterLevel: descriptor.config.waterLevel,
      ...(descriptor.config.connections ? { connections: descriptor.config.connections } : {}),
      nearshoreDescriptor: {
        schemaVersion: nearshore.schemaVersion,
        id: nearshore.id,
        waterLevel: nearshore.waterLevel,
        grid: nearshore.grid,
        bedHeights: Array.from(nearshore.bedHeights),
        signedShoreDistances: nearshore.signedShoreDistances ? Array.from(nearshore.signedShoreDistances) : undefined,
        wetSource:
          nearshore.wetSource.kind === "mask"
            ? {
                kind: nearshore.wetSource.kind,
                minimumDepth: nearshore.wetSource.minimumDepth,
                mask: Array.from(nearshore.wetSource.mask)
              }
            : nearshore.wetSource,
        outsidePolicy: nearshore.outsidePolicy,
        budget: nearshore.budget
      }
    }
  };
}

export function computeOceanWaterSourceHash(descriptor: OceanWaterBodyDescriptorV1): string {
  assertOceanWaterBodyDescriptor(descriptor);
  return hashStableValue({ compilerVersion: OCEAN_WATER_COMPILER_VERSION, descriptor: hashableDescriptor(descriptor) });
}

export function computeOceanWaterCompileKey(descriptor: OceanWaterBodyDescriptorV1): string {
  return computeOceanWaterSourceHash(descriptor);
}

export function computeOceanWaterPhysicalSourceHash(descriptor: OceanWaterBodyDescriptorV1): string {
  assertOceanWaterBodyDescriptor(descriptor);
  return hashStableValue({
    physicalSchemaVersion: 3,
    body: hashableDescriptor(descriptor),
    responseModel: OCEAN_LOOK
  });
}

function freezeSnapshot<T>(value: T): T {
  if (typeof value !== "object" || value === null || ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeSnapshot(child);
  return Object.freeze(value);
}

const EFFECTIVE_CACHE = new WeakMap<object, OceanWaterBodyDescriptorV1>();

export function createEffectiveOceanWaterBodyDescriptor(value: unknown): OceanWaterBodyDescriptorV1 {
  assertOceanWaterBodyDescriptor(value);
  const cached = EFFECTIVE_CACHE.get(value);
  if (cached) return cached;
  const effective = freezeSnapshot<OceanWaterBodyDescriptorV1>({
    schemaVersion: OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION,
    id: value.id,
    config: {
      waterLevel: value.config.waterLevel,
      ...(value.config.connections ? { connections: decodeWaterConnectionPorts(value.config.connections) } : {}),
      nearshoreDescriptor: structuredClone(value.config.nearshoreDescriptor)
    }
  });
  assertOceanWaterBodyDescriptor(effective);
  EFFECTIVE_CACHE.set(value, effective);
  EFFECTIVE_CACHE.set(effective, effective);
  return effective;
}

export class OceanWaterCompiledResource extends WaterReferenceCountedCompiledResource<OceanWaterCompiledData> {
  readonly nearshoreResource: OceanNearshoreFieldResource;

  static compile(
    descriptor: OceanWaterBodyDescriptorV1,
    route: Readonly<WaterCompiledBackendRouteIdentity> = Object.freeze({
      resolvedBackendId: "ocean",
      representation: createWaterRepresentationV1({ domain: "world-space-ocean", macroSurface: "gerstner" }),
      sourceKind: WaterBodySourceKind.OceanNearshore
    }),
    physicalSourceHash?: string
  ): OceanWaterCompiledResource {
    const source = createEffectiveOceanWaterBodyDescriptor(descriptor);
    return OceanWaterCompiledResource.compileWithIdentity(
      source,
      route,
      computeOceanWaterSourceHash(source),
      physicalSourceHash ?? computeOceanWaterPhysicalSourceHash(source)
    );
  }

  private static compileWithIdentity(
    source: OceanWaterBodyDescriptorV1,
    route: Readonly<WaterCompiledBackendRouteIdentity>,
    sourceHash: string,
    physicalSourceHash: string
  ): OceanWaterCompiledResource {
    const compiledNearshore = OceanNearshoreCompiler.compile(source.config.nearshoreDescriptor);
    if (!compiledNearshore.valid || !compiledNearshore.data) {
      throw new OceanWaterCompileError(compiledNearshore.diagnostics);
    }
    const nearshoreResource = OceanNearshoreFieldResource.create(compiledNearshore.data, route);
    try {
      const lookParameterHash = hashStableValue(OCEAN_LOOK);
      const compiledHash = hashStableValue({
        compilerVersion: OCEAN_WATER_COMPILER_VERSION,
        sourceHash,
        nearshoreHash: nearshoreResource.identity.compiledHash,
        lookParameterHash
      });
      const data: OceanWaterCompiledData = Object.freeze({
        schemaVersion: OCEAN_WATER_COMPILER_VERSION,
        sourceId: source.id,
        sourceHash,
        compiledHash,
        config: source.config,
        lookParameterHash
      });
      return new OceanWaterCompiledResource(data, nearshoreResource, route, physicalSourceHash);
    } catch (error) {
      nearshoreResource.dispose();
      throw error;
    }
  }

  /** Worker boundary for the complete CPU-only Ocean compile. */
  static compileForTransfer(
    descriptor: OceanWaterBodyDescriptorV1,
    route: Readonly<WaterCompiledBackendRouteIdentity> = Object.freeze({
      resolvedBackendId: "ocean",
      representation: createWaterRepresentationV1({ domain: "world-space-ocean", macroSurface: "gerstner" }),
      sourceKind: WaterBodySourceKind.OceanNearshore
    })
  ): Readonly<OceanWaterCompiledTransferV1> {
    const source = createEffectiveOceanWaterBodyDescriptor(descriptor);
    // Both identities keep their existing hash formats, sharing the owned numeric view.
    const body = hashableDescriptor(source);
    const sourceHash = hashStableValue({ compilerVersion: OCEAN_WATER_COMPILER_VERSION, descriptor: body });
    const compileKey = sourceHash;
    const physicalSourceHash = hashStableValue({ physicalSchemaVersion: 3, body, responseModel: OCEAN_LOOK });
    const resource = OceanWaterCompiledResource.compileWithIdentity(source, route, sourceHash, physicalSourceHash);
    try {
      const nearshoreData = resource.nearshoreResource.data;
      return Object.freeze({
        schemaVersion: OCEAN_WATER_COMPILED_TRANSFER_SCHEMA_VERSION,
        kind: "ocean-water-compiled-transfer-v1" as const,
        compileKey,
        sourceHash,
        physicalSourceHash,
        data: resource.data,
        nearshoreData: Object.freeze({
          ...nearshoreData,
          staticAtlas: Object.freeze({
            ...nearshoreData.staticAtlas,
            pixels: nearshoreData.staticAtlas.pixels.borrowTypedArray()
          })
        })
      });
    } finally {
      resource.dispose();
    }
  }

  /** Main-thread revival performs no grid scan, distance transform, or content hashing. */
  static createFromTransfer(
    transferred: Readonly<OceanWaterCompiledTransferV1>,
    route: Readonly<WaterCompiledBackendRouteIdentity>
  ): OceanWaterCompiledResource {
    if (!isOceanWaterCompiledTransferV1(transferred)) {
      throw new TypeError("Ocean compiled transfer is invalid.");
    }
    const pixels = transferred.nearshoreData.staticAtlas.pixels;
    const nearshoreData: OceanNearshoreCompiledData = Object.freeze({
      ...transferred.nearshoreData,
      staticAtlas: Object.freeze({
        ...transferred.nearshoreData.staticAtlas,
        pixels: new WaterReadonlyUint8Buffer(pixels, WaterBufferOwnership.Transfer)
      })
    });
    const nearshoreResource = OceanNearshoreFieldResource.create(nearshoreData, route);
    try {
      return new OceanWaterCompiledResource(transferred.data, nearshoreResource, route, transferred.physicalSourceHash);
    } catch (error) {
      nearshoreResource.dispose();
      throw error;
    }
  }

  private constructor(
    data: OceanWaterCompiledData,
    nearshoreResource: OceanNearshoreFieldResource,
    route: Readonly<WaterCompiledBackendRouteIdentity>,
    physicalSourceHash: string
  ) {
    const physicalWaveHash = hashStableValue({
      responseModel: "ocean",
      lookParameterHash: data.lookParameterHash
    });
    super(
      Object.freeze({
        ...route,
        sourceId: data.sourceId,
        sourceHash: data.sourceHash,
        physicalSurfaceHash: createPhysicalSurfaceIdentity({ sourceHash: physicalSourceHash, physicalWaveHash })
          .contentHash,
        compiledHash: data.compiledHash,
        schemaVersion: data.schemaVersion
      }),
      data,
      createWaterResourceMemoryMetrics({
        cpuStaticBytes: measureWaterOwnedCpuBytes(data.config) + nearshoreResource.memory.cpuStaticBytes
      })
    );
    this.nearshoreResource = nearshoreResource;
  }

  protected override onFinalizeDispose(): void {
    this.nearshoreResource.dispose();
  }
}

export function isOceanWaterCompiledTransferV1(value: unknown): value is Readonly<OceanWaterCompiledTransferV1> {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === OCEAN_WATER_COMPILED_TRANSFER_SCHEMA_VERSION &&
    value.kind === "ocean-water-compiled-transfer-v1" &&
    typeof value.compileKey === "string" &&
    typeof value.sourceHash === "string" &&
    typeof value.physicalSourceHash === "string" &&
    isRecord(value.data) &&
    isRecord(value.nearshoreData) &&
    isRecord(value.nearshoreData.staticAtlas) &&
    value.nearshoreData.staticAtlas.pixels instanceof Uint8Array
  );
}
