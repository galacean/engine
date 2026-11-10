import {
  computeWaterBodyAssetContentHash,
  createWaterBodyAsset,
  type WaterBodyAsset
} from "../../authoring/body/WaterBodyAsset";
import type { WaterBodySourceV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterGenerationAssetSetV1 } from "../../authoring/generation/WaterGenerationAssetSet";
import { createWaterGenerationAssetSetV1 } from "../../authoring/generation/WaterGenerationAssetSet";
import {
  hashWaterFootprintPrecompileIdentity,
  hashWaterTerrainDependencies,
  WaterFootprintCompilerV1,
  type CompiledWaterFootprintV1
} from "../../compiler/generation/WaterFootprintCompiler";
import { WaterGenerationCompileContextV1 } from "../../compiler/generation/WaterGenerationCompileContext";
import {
  WaterGenerationResourceLeasePool,
  type WaterGenerationContentResource,
  type WaterGenerationResourceLease
} from "../../compiler/generation/WaterGenerationResourceLease";
import {
  canonicalSha256HexToBytes,
  CanonicalWaterBinaryWriterV1,
  CanonicalWaterByteCollector
} from "../../compiler/shared/CanonicalWaterBinaryWriterV1";

export class CompiledWaterFootprintResourceV1 implements WaterGenerationContentResource {
  private _destroyed = false;

  constructor(
    readonly contentKey: string,
    readonly footprint: Readonly<CompiledWaterFootprintV1>,
    readonly precompileIdentityHash: string,
    private readonly _onDestroyed: (resource: CompiledWaterFootprintResourceV1) => void
  ) {}

  get destroyed(): boolean {
    return this._destroyed;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._onDestroyed(this);
  }
}

export interface ActiveWaterGenerationResourcesV1 {
  readonly generationId: number;
  readonly footprints: ReadonlyMap<string, Readonly<CompiledWaterFootprintV1>>;
  /** Backend-native detached sources prepared from the shared Footprint exactly once. */
  readonly runtimeAssetSet: Readonly<WaterGenerationAssetSetV1>;
  readonly retired: boolean;
  retire(): void;
}

export interface PreparedWaterGenerationResourcesV1 {
  readonly generationId: number;
  readonly active: boolean;
  readonly runtimeAssetSet: Readonly<WaterGenerationAssetSetV1>;
  commit(): ActiveWaterGenerationResourcesV1;
  rollback(): void;
}

export const WATER_GENERATION_PREPARED_TRANSFER_SCHEMA_VERSION = 1 as const;

/**
 * Pure-data generation output produced in a Worker and hydrated into the
 * page-lifetime resource pool before Scene/GPU preparation begins.
 */
export interface WaterGenerationPreparedTransferV1 {
  readonly schemaVersion: typeof WATER_GENERATION_PREPARED_TRANSFER_SCHEMA_VERSION;
  readonly sourceAssetSet: Readonly<WaterGenerationAssetSetV1>;
  readonly runtimeAssetSet: Readonly<WaterGenerationAssetSetV1>;
  readonly footprints: readonly Readonly<CompiledWaterFootprintV1>[];
  readonly precompileIdentities: readonly Readonly<{
    bodyId: string;
    precompileIdentityHash: string;
  }>[];
}

export function collectWaterGenerationPreparedTransferablesV1(
  transferred: Readonly<WaterGenerationPreparedTransferV1>
): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  collectTransferableBuffers(transferred, buffers, new WeakSet<object>());
  return [...buffers];
}

export interface WaterGenerationPreparerOptionsV1 {
  readonly requireBackendRoute: (asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>) => void;
  readonly footprintPool?: WaterGenerationResourceLeasePool<CompiledWaterFootprintResourceV1>;
  readonly bodySourceCompilers?: readonly WaterGenerationBodySourceCompilerV1[];
}

export interface WaterGenerationBodySourceCompilerV1 {
  readonly id: string;
  matches(asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>): boolean;
  compile(
    asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>,
    footprint: Readonly<CompiledWaterFootprintV1>,
    context: WaterGenerationCompileContextV1
  ): Readonly<{
    source: WaterBodySourceV1;
    representationData?: unknown;
    representationDataHash?: string;
  }>;
}

/** Generic Water prepare boundary. It owns no Seed World types or semantics. */
export class WaterGenerationPreparerV1 {
  private readonly _requireBackendRoute: WaterGenerationPreparerOptionsV1["requireBackendRoute"];
  private readonly _footprintCompiler = new WaterFootprintCompilerV1();
  private readonly _footprintPool: WaterGenerationResourceLeasePool<CompiledWaterFootprintResourceV1>;
  private readonly _bodySourceCompilers: readonly WaterGenerationBodySourceCompilerV1[];
  private readonly _liveFootprintsByBodyId = new Map<string, Set<CompiledWaterFootprintResourceV1>>();
  private readonly _runtimeAssetCache = new WeakMap<
    CompiledWaterFootprintResourceV1,
    Map<string, Readonly<WaterBodyAsset<WaterBodySourceV1>>>
  >();

  constructor(options: Readonly<WaterGenerationPreparerOptionsV1>) {
    this._requireBackendRoute = options.requireBackendRoute;
    this._footprintPool = options.footprintPool ?? new WaterGenerationResourceLeasePool();
    this._bodySourceCompilers = Object.freeze([...(options.bodySourceCompilers ?? [])]);
    const compilerIds = new Set<string>();
    for (const compiler of this._bodySourceCompilers) {
      if (compiler.id.trim().length === 0)
        throw new Error("Water generation Body Source Compiler id must be non-empty.");
      if (compilerIds.has(compiler.id))
        throw new Error(`Duplicate Water generation Body Source Compiler '${compiler.id}'.`);
      compilerIds.add(compiler.id);
    }
  }

  prepareGeneration(
    assetSet: Readonly<WaterGenerationAssetSetV1>,
    context: WaterGenerationCompileContextV1
  ): PreparedWaterGenerationResourcesV1 {
    context.assertUsable();
    const footprintLeases: WaterGenerationResourceLease<CompiledWaterFootprintResourceV1>[] = [];
    try {
      for (const body of assetSet.bodies) this._requireBackendRoute(body);
      const assetIds = new Set(assetSet.bodies.map(({ id }) => id));
      for (const ownerBodyId of context.ownerIndexToAssetId) {
        if (ownerBodyId && !assetIds.has(ownerBodyId)) {
          throw new Error(`Water Ownership references body '${ownerBodyId}' missing from the complete AssetSet.`);
        }
      }
      const footprintByBodyId = new Map<string, Readonly<CompiledWaterFootprintV1>>();
      const footprintResourceByBodyId = new Map<string, CompiledWaterFootprintResourceV1>();
      const precompileIdentityByBodyId = new Map<string, string>();
      const bodiesToCompile: Readonly<WaterBodyAsset<WaterBodySourceV1>>[] = [];
      for (const asset of assetSet.bodies) {
        const precompileIdentityHash = hashWaterFootprintPrecompileIdentity(asset, context);
        precompileIdentityByBodyId.set(asset.id, precompileIdentityHash);
        const reusable = this._findReusableFootprint(asset.id, precompileIdentityHash, context);
        if (!reusable) {
          bodiesToCompile.push(asset);
          continue;
        }
        const lease = this._footprintPool.acquire(
          reusable.contentKey,
          encodeFootprintLeaseIdentity(asset, reusable.footprint),
          () => {
            throw new Error(`Reusable Water footprint '${asset.id}' disappeared before lease acquisition.`);
          }
        );
        footprintLeases.push(lease);
        footprintByBodyId.set(asset.id, reusable.footprint);
        footprintResourceByBodyId.set(asset.id, reusable);
      }
      const compiled =
        bodiesToCompile.length > 0
          ? this._footprintCompiler.compile(bodiesToCompile, context, {
              skipOwnersOutsideSelection: bodiesToCompile.length !== assetSet.bodies.length
            })
          : undefined;
      for (const footprint of compiled?.footprints ?? []) {
        const asset = assetSet.bodies.find(({ id }) => id === footprint.bodyId)!;
        const identityBytes = encodeFootprintLeaseIdentity(asset, footprint);
        const lease = this._footprintPool.acquire(footprint.footprintHash, identityBytes, () => {
          const resource = new CompiledWaterFootprintResourceV1(
            footprint.footprintHash,
            footprint,
            precompileIdentityByBodyId.get(footprint.bodyId)!,
            (destroyed) => this._untrackFootprint(destroyed)
          );
          this._trackFootprint(resource);
          return resource;
        });
        footprintLeases.push(lease);
        footprintByBodyId.set(footprint.bodyId, lease.resource.footprint);
        footprintResourceByBodyId.set(footprint.bodyId, lease.resource);
      }
      if (footprintByBodyId.size !== assetSet.bodies.length) {
        throw new Error("Water generation did not resolve one Footprint for every Body.");
      }
      const runtimeBodies = assetSet.bodies.map((asset) => {
        const matches = this._bodySourceCompilers.filter((compiler) => compiler.matches(asset));
        if (matches.length > 1) {
          throw new Error(
            `Water generation Body Source routing is ambiguous for '${asset.id}': ${matches.map(({ id }) => id).join(", ")}.`
          );
        }
        if (matches.length === 0) return asset;
        const footprint = footprintByBodyId.get(asset.id);
        if (!footprint) throw new Error(`Water generation has no compiled Footprint for '${asset.id}'.`);
        const footprintResource = footprintResourceByBodyId.get(asset.id)!;
        let cachedByCompiler = this._runtimeAssetCache.get(footprintResource);
        const compiler = matches[0]!;
        const compilerInputKey = `${compiler.id}:${computeWaterBodyAssetContentHash(asset)}`;
        const cached = cachedByCompiler?.get(compilerInputKey);
        if (cached) {
          return cached;
        }
        const compiledInputs = compiler.compile(asset, footprint, context);
        const runtimeAsset = createWaterBodyAsset({
          id: asset.id,
          kind: asset.kind,
          representation: asset.representation,
          representationData: compiledInputs.representationData,
          representationDataHash: compiledInputs.representationDataHash,
          sourceHash: asset.sourceHash,
          source: compiledInputs.source
        });
        if (!cachedByCompiler) {
          cachedByCompiler = new Map();
          this._runtimeAssetCache.set(footprintResource, cachedByCompiler);
        }
        cachedByCompiler.set(compilerInputKey, runtimeAsset);
        return runtimeAsset;
      });
      const runtimeAssetSet = createWaterGenerationAssetSetV1(runtimeBodies);
      return createPreparedResources(context.generationId, footprintLeases, runtimeAssetSet);
    } catch (error) {
      releaseAll(footprintLeases);
      throw error;
    } finally {
      context.release();
    }
  }

  /** Worker entrypoint: compile every CPU-only artifact and expose transferable data. */
  compileGenerationForTransfer(
    assetSet: Readonly<WaterGenerationAssetSetV1>,
    context: WaterGenerationCompileContextV1
  ): Readonly<WaterGenerationPreparedTransferV1> {
    const precompileIdentities = Object.freeze(
      assetSet.bodies.map((asset) =>
        Object.freeze({
          bodyId: asset.id,
          precompileIdentityHash: hashWaterFootprintPrecompileIdentity(asset, context)
        })
      )
    );
    const prepared = this.prepareGeneration(assetSet, context);
    const active = prepared.commit();
    try {
      return Object.freeze({
        schemaVersion: WATER_GENERATION_PREPARED_TRANSFER_SCHEMA_VERSION,
        sourceAssetSet: assetSet,
        runtimeAssetSet: active.runtimeAssetSet,
        footprints: Object.freeze([...active.footprints.values()]),
        precompileIdentities
      });
    } finally {
      active.retire();
    }
  }

  /** Main-thread hydration boundary for CPU artifacts compiled by a Worker. */
  prepareTransferredGeneration(
    generationId: number,
    transferred: Readonly<WaterGenerationPreparedTransferV1>,
    expectedSourceAssetSet: Readonly<WaterGenerationAssetSetV1>
  ): PreparedWaterGenerationResourcesV1 {
    if (!Number.isSafeInteger(generationId) || generationId <= 0) {
      throw new RangeError("Transferred Water generationId must be a positive safe integer.");
    }
    if (transferred.schemaVersion !== WATER_GENERATION_PREPARED_TRANSFER_SCHEMA_VERSION) {
      throw new Error("Unsupported transferred Water generation schema.");
    }
    const transferredSourceById = new Map(transferred.sourceAssetSet.bodies.map((asset) => [asset.id, asset]));
    const runtimeBodies = transferred.runtimeAssetSet.bodies.map((asset) =>
      createWaterBodyAsset({
        id: asset.id,
        kind: asset.kind,
        representation: asset.representation,
        representationData: asset.representationData,
        representationDataHash: asset.representationDataHash,
        sourceHash: asset.sourceHash,
        source: asset.source
      })
    );
    const runtimeAssetSet = createWaterGenerationAssetSetV1(runtimeBodies);
    const runtimeById = new Map(runtimeBodies.map((asset) => [asset.id, asset]));
    const footprintById = new Map(transferred.footprints.map((footprint) => [footprint.bodyId, footprint]));
    const precompileIdentityById = new Map(
      transferred.precompileIdentities.map(({ bodyId, precompileIdentityHash }) => [bodyId, precompileIdentityHash])
    );
    if (
      transferredSourceById.size !== expectedSourceAssetSet.bodies.length ||
      runtimeById.size !== expectedSourceAssetSet.bodies.length ||
      footprintById.size !== expectedSourceAssetSet.bodies.length ||
      precompileIdentityById.size !== expectedSourceAssetSet.bodies.length
    ) {
      throw new Error("Transferred Water generation does not contain one artifact per expected Body.");
    }

    const footprintLeases: WaterGenerationResourceLease<CompiledWaterFootprintResourceV1>[] = [];
    try {
      for (const expectedAsset of expectedSourceAssetSet.bodies) {
        const transferredSource = transferredSourceById.get(expectedAsset.id);
        const runtimeAsset = runtimeById.get(expectedAsset.id);
        const footprint = footprintById.get(expectedAsset.id);
        const precompileIdentityHash = precompileIdentityById.get(expectedAsset.id);
        if (!transferredSource || !runtimeAsset || !footprint || !precompileIdentityHash) {
          throw new Error(`Transferred Water generation is missing Body '${expectedAsset.id}'.`);
        }
        if (computeWaterBodyAssetContentHash(transferredSource) !== computeWaterBodyAssetContentHash(expectedAsset)) {
          throw new Error(`Transferred Water Body '${expectedAsset.id}' does not match the authoritative source.`);
        }
        this._requireBackendRoute(runtimeAsset);
        const lease = this._footprintPool.acquire(
          footprint.footprintHash,
          encodeFootprintLeaseIdentity(expectedAsset, footprint),
          () => {
            const resource = new CompiledWaterFootprintResourceV1(
              footprint.footprintHash,
              footprint,
              precompileIdentityHash,
              (destroyed) => this._untrackFootprint(destroyed)
            );
            this._trackFootprint(resource);
            return resource;
          }
        );
        footprintLeases.push(lease);

        const matches = this._bodySourceCompilers.filter((compiler) => compiler.matches(expectedAsset));
        if (matches.length > 1) {
          throw new Error(`Transferred Water generation Body Source routing is ambiguous for '${expectedAsset.id}'.`);
        }
        if (matches.length === 1) {
          let cachedByCompiler = this._runtimeAssetCache.get(lease.resource);
          if (!cachedByCompiler) {
            cachedByCompiler = new Map();
            this._runtimeAssetCache.set(lease.resource, cachedByCompiler);
          }
          cachedByCompiler.set(`${matches[0]!.id}:${computeWaterBodyAssetContentHash(expectedAsset)}`, runtimeAsset);
        }
      }
      return createPreparedResources(generationId, footprintLeases, runtimeAssetSet);
    } catch (error) {
      releaseAll(footprintLeases);
      throw error;
    }
  }

  get footprintResourceCount(): number {
    return this._footprintPool.resourceCount;
  }

  private _findReusableFootprint(
    bodyId: string,
    precompileIdentityHash: string,
    context: WaterGenerationCompileContextV1
  ): CompiledWaterFootprintResourceV1 | undefined {
    const candidates = this._liveFootprintsByBodyId.get(bodyId);
    if (!candidates) return undefined;
    for (const candidate of candidates) {
      if (candidate.destroyed || candidate.precompileIdentityHash !== precompileIdentityHash) continue;
      const currentTerrainDependencyHash = hashWaterTerrainDependencies(
        candidate.footprint.terrainDependencyTileIds,
        candidate.footprint.maximumTerrainReadHaloMillimetres,
        context
      );
      if (currentTerrainDependencyHash === candidate.footprint.terrainDependencyHash) return candidate;
    }
    return undefined;
  }

  private _trackFootprint(resource: CompiledWaterFootprintResourceV1): void {
    let resources = this._liveFootprintsByBodyId.get(resource.footprint.bodyId);
    if (!resources) {
      resources = new Set();
      this._liveFootprintsByBodyId.set(resource.footprint.bodyId, resources);
    }
    resources.add(resource);
  }

  private _untrackFootprint(resource: CompiledWaterFootprintResourceV1): void {
    const resources = this._liveFootprintsByBodyId.get(resource.footprint.bodyId);
    if (!resources) return;
    resources.delete(resource);
    if (resources.size === 0) this._liveFootprintsByBodyId.delete(resource.footprint.bodyId);
  }
}

function createPreparedResources(
  generationId: number,
  footprintLeases: readonly WaterGenerationResourceLease<CompiledWaterFootprintResourceV1>[],
  runtimeAssetSet: Readonly<WaterGenerationAssetSetV1>
): PreparedWaterGenerationResourcesV1 {
  let active = true;
  return Object.freeze({
    generationId,
    get active() {
      return active;
    },
    runtimeAssetSet,
    commit: () => {
      if (!active) throw new Error(`Prepared Water generation ${generationId} is inactive.`);
      active = false;
      let retired = false;
      const footprints = new Map(
        footprintLeases.map((lease) => [lease.resource.footprint.bodyId, lease.resource.footprint] as const)
      );
      return Object.freeze({
        generationId,
        footprints,
        runtimeAssetSet,
        get retired() {
          return retired;
        },
        retire: () => {
          if (retired) return;
          retired = true;
          releaseAll(footprintLeases);
        }
      });
    },
    rollback: () => {
      if (!active) return;
      active = false;
      releaseAll(footprintLeases);
    }
  });
}

function encodeFootprintLeaseIdentity(
  asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>,
  footprint: Readonly<CompiledWaterFootprintV1>
): Uint8Array {
  const collector = new CanonicalWaterByteCollector();
  const writer = new CanonicalWaterBinaryWriterV1(collector);
  writer
    .writeRecord("seed-world-water/footprint-lease-identity/v1", 1)
    .writeUint16(footprint.compilerVersion)
    .writeFixedBytes(canonicalSha256HexToBytes(asset.id), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(asset.sourceHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(footprint.terrainDependencyHash), 32)
    .writeUint32(footprint.wetOwnershipCellCount)
    .writeUint32(footprint.compiledNearshoreCellCount)
    .writeUint32(footprint.logicalBounds.minX)
    .writeUint32(footprint.logicalBounds.minZ)
    .writeUint32(footprint.logicalBounds.maxX)
    .writeUint32(footprint.logicalBounds.maxZ)
    .writeUint32(footprint.lakeSurface?.triangleCount ?? 0);
  return collector.bytes();
}

function releaseAll<TResource extends WaterGenerationContentResource>(
  leases: readonly WaterGenerationResourceLease<TResource>[]
): void {
  for (let index = leases.length - 1; index >= 0; index--) leases[index]!.release();
}

function collectTransferableBuffers(value: unknown, buffers: Set<ArrayBuffer>, visited: WeakSet<object>): void {
  if (value === null || typeof value !== "object") return;
  if (value instanceof ArrayBuffer) {
    buffers.add(value);
    return;
  }
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer);
    return;
  }
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) collectTransferableBuffers(entry, buffers, visited);
    return;
  }
  for (const entry of Object.values(value as Readonly<Record<string, unknown>>)) {
    collectTransferableBuffers(entry, buffers, visited);
  }
}
