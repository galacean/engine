import { cloneSeedWorldFields, seedWorldFieldTransferables, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  seedWorldAuthoritativePresentationSourceTransferablesV2,
  type SeedWorldAuthoritativePresentationSourceV2
} from "../SeedWorldFieldWorkerProtocol.ts";
import type { SeedWorldHydrologyBakeStyle, SeedWorldHydrologyWaterBody } from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyBake";
import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldAuthoritativeGenerationBuildResultV1 } from "./SeedWorldAuthoritativeGenerationBuilderV1.ts";
import {
  SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION,
  createSeedWorldHydrologyAnalysisTerrainSnapshotFromValuesV1,
  type SeedWorldHydrologyAnalysisTerrainSnapshotV1
} from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldCanonicalNaturalTerrain";
import {
  SEED_WORLD_HYDROLOGY_ARTIFACT_SCHEMA_VERSION,
  SeedWorldHydrologyArtifactV1,
  SeedWorldLakeBasinSupportGridV1,
  SeedWorldLakeBasinTopologyGridV1,
  type SeedWorldHydrologyArtifactDiagnosticsV1,
  type SeedWorldHydrologyArtifactHeaderV1,
  type SeedWorldRiverProfileV1,
  type SeedWorldWaterBodyCatalogEntryV1
} from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldHydrologyArtifact";
import {
  SEED_WORLD_GRID_TILE_SCHEMA_VERSION,
  SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES,
  SEED_WORLD_TERRAIN_TILE_DIGEST_GRID_BYTES,
  SeedWorldHeightTileSnapshot,
  SeedWorldOwnershipTileSnapshot,
  SeedWorldUint16TilePool,
  type SeedWorldHeightSnapshotRole,
  type SeedWorldTransferredUint16TileV1,
  type SeedWorldUint16TileResource,
  type SeedWorldUint16TileSchema
} from "@galacean/engine-world-planning/world/SeedWorldGridTileSnapshot";
import type { SeedWorldWaterErrorBudgetV1 } from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";
import { SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION, SEED_WORLD_TILE_COUNT } from "@galacean/engine-water/world/SeedWorldWaterGrid";
import type { SeedWorldWaterGridTransformV1 } from "@galacean/engine-water/world/SeedWorldWaterGrid";
import {
  collectWaterGenerationPreparedTransferablesV1,
  type WaterGenerationPreparedTransferV1
} from "@galacean/engine-water/water/runtime/index";

export const SEED_WORLD_AUTHORITATIVE_GENERATION_TRANSFER_SCHEMA_VERSION = 1 as const;

interface SeedWorldTransferredHydrologyAnalysisTerrainSnapshotV1 {
  readonly schemaVersion: typeof SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION;
  readonly values: Int32Array;
  readonly analysisTerrainSourceHash: string;
  readonly authoringStateHash: string;
}

interface SeedWorldTransferredHeightTileSnapshotV1 {
  readonly schemaVersion: typeof SEED_WORLD_GRID_TILE_SCHEMA_VERSION;
  readonly kind: "height";
  readonly role: SeedWorldHeightSnapshotRole;
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly tileWidth: number;
  readonly tileValues: Uint16Array;
  readonly tileDigestGrid: Uint8Array;
}

interface SeedWorldTransferredOwnershipTileSnapshotV1 {
  readonly schemaVersion: typeof SEED_WORLD_GRID_TILE_SCHEMA_VERSION;
  readonly kind: "ownership";
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly tileWidth: number;
  readonly tileValues: Uint16Array;
  readonly tileDigestGrid: Uint8Array;
}

interface SeedWorldTransferredHydrologyArtifactV1 {
  readonly schemaVersion: typeof SEED_WORLD_HYDROLOGY_ARTIFACT_SCHEMA_VERSION;
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly header: Readonly<SeedWorldHydrologyArtifactHeaderV1>;
  readonly waterBodyCatalog: readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[];
  readonly riverProfileCatalog: readonly Readonly<SeedWorldRiverProfileV1>[];
  readonly lakeBasinTopology: Readonly<{
    contentHash: string;
    bodyIndices: Uint16Array;
    plannedStorageBodyIndices: Uint16Array;
    minimumConnectionLevelsMillimetres: Int32Array;
  }>;
  readonly lakeBasinSupport: Readonly<{
    contentHash: string;
    bodyIndices: Uint16Array;
  }>;
  readonly ownershipSnapshot: SeedWorldTransferredOwnershipTileSnapshotV1;
  readonly diagnostics: Readonly<SeedWorldHydrologyArtifactDiagnosticsV1>;
}

export interface SeedWorldTransferredAuthoritativeGenerationV1 {
  readonly schemaVersion: typeof SEED_WORLD_AUTHORITATIVE_GENERATION_TRANSFER_SCHEMA_VERSION;
  readonly plan: SeedWorldPlan;
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly errorBudget: SeedWorldWaterErrorBudgetV1;
  readonly analysisSnapshot: SeedWorldTransferredHydrologyAnalysisTerrainSnapshotV1;
  readonly baseTerrainSnapshot: SeedWorldTransferredHeightTileSnapshotV1;
  readonly hfinalSnapshot: SeedWorldTransferredHeightTileSnapshotV1;
  readonly artifact: SeedWorldTransferredHydrologyArtifactV1;
  readonly plannedHydrologyGeometryHash: number;
  readonly plannedHydrologyBakeHash: number;
  readonly plannedPresentationFields: SeedWorldFields;
  readonly plannedHydrologyWaterBodies: readonly SeedWorldHydrologyWaterBody[];
  readonly hydrologyStyle: Readonly<SeedWorldHydrologyBakeStyle>;
  readonly preparedWaterGeneration?: Readonly<WaterGenerationPreparedTransferV1>;
  readonly preparedPresentationSource?: Readonly<SeedWorldAuthoritativePresentationSourceV2>;
  readonly diagnostics: Readonly<Record<string, unknown>>;
}

export function transferSeedWorldAuthoritativeGenerationV1(
  build: Readonly<SeedWorldAuthoritativeGenerationBuildResultV1>,
  preparedWaterGeneration?: Readonly<WaterGenerationPreparedTransferV1>,
  preparedPresentationSource?: Readonly<SeedWorldAuthoritativePresentationSourceV2>
): SeedWorldTransferredAuthoritativeGenerationV1 {
  return Object.freeze({
    schemaVersion: SEED_WORLD_AUTHORITATIVE_GENERATION_TRANSFER_SCHEMA_VERSION,
    plan: build.plan,
    transform: build.transform,
    errorBudget: build.errorBudget,
    analysisSnapshot: transferAnalysisSnapshot(build.analysisSnapshot),
    baseTerrainSnapshot: transferHeightSnapshot(build.baseTerrainSnapshot),
    hfinalSnapshot: transferHeightSnapshot(build.hfinalSnapshot),
    artifact: transferArtifact(build.artifact),
    plannedHydrologyGeometryHash: build.plannedHydrologyGeometryHash,
    plannedHydrologyBakeHash: build.plannedHydrologyBakeHash,
    // The compiler cache retains its own fields. Only the transfer clone may be detached by postMessage.
    plannedPresentationFields: cloneSeedWorldFields(build.plannedPresentationFields),
    plannedHydrologyWaterBodies: cloneHydrologyWaterBodies(build.plannedHydrologyWaterBodies),
    hydrologyStyle: build.hydrologyStyle,
    preparedWaterGeneration,
    preparedPresentationSource,
    diagnostics: build.diagnostics
  });
}

export async function hydrateSeedWorldAuthoritativeGenerationV1(
  transferred: Readonly<SeedWorldTransferredAuthoritativeGenerationV1>,
  heightTilePool: SeedWorldUint16TilePool,
  ownershipTilePool: SeedWorldUint16TilePool,
  signal?: AbortSignal
): Promise<SeedWorldAuthoritativeGenerationBuildResultV1> {
  signal?.throwIfAborted();
  if (transferred.schemaVersion !== SEED_WORLD_AUTHORITATIVE_GENERATION_TRANSFER_SCHEMA_VERSION) {
    throw new Error("Unsupported transferred authoritative generation schema.");
  }
  let analysisSnapshot: SeedWorldHydrologyAnalysisTerrainSnapshotV1 | undefined;
  let baseTerrainSnapshot: SeedWorldHeightTileSnapshot | undefined;
  let hfinalSnapshot: SeedWorldHeightTileSnapshot | undefined;
  let artifact: SeedWorldHydrologyArtifactV1 | undefined;
  try {
    analysisSnapshot = hydrateAnalysisSnapshot(transferred.analysisSnapshot);
    baseTerrainSnapshot = await hydrateHeightSnapshot(transferred.baseTerrainSnapshot, heightTilePool, signal);
    hfinalSnapshot = await hydrateHeightSnapshot(transferred.hfinalSnapshot, heightTilePool, signal);
    artifact = await hydrateArtifact(transferred.artifact, ownershipTilePool, signal);
    signal?.throwIfAborted();
    if (
      transferred.transform.worldGridTransformHash !== hfinalSnapshot.transform.worldGridTransformHash ||
      transferred.transform.worldGridTransformHash !== artifact.header.worldGridTransformHash
    ) {
      throw new Error("Transferred authoritative generation contains cross-profile Grid resources.");
    }
    let released = false;
    return Object.freeze({
      plan: Object.freeze({ ...transferred.plan }),
      transform: Object.freeze({ ...transferred.transform }),
      errorBudget: transferred.errorBudget,
      analysisSnapshot,
      baseTerrainSnapshot,
      hfinalSnapshot,
      artifact,
      plannedHydrologyGeometryHash: transferred.plannedHydrologyGeometryHash,
      plannedHydrologyBakeHash: transferred.plannedHydrologyBakeHash,
      plannedPresentationFields: Object.freeze({ ...transferred.plannedPresentationFields }),
      plannedHydrologyWaterBodies: Object.freeze(
        transferred.plannedHydrologyWaterBodies.map((body) => Object.freeze({ ...body }))
      ),
      hydrologyStyle: Object.freeze({ ...transferred.hydrologyStyle }),
      preparedWaterGeneration: transferred.preparedWaterGeneration,
      preparedPresentationSource: transferred.preparedPresentationSource,
      diagnostics: Object.freeze({ ...transferred.diagnostics }),
      release: () => {
        if (released) return;
        released = true;
        artifact!.release();
        hfinalSnapshot!.release();
        baseTerrainSnapshot!.release();
        analysisSnapshot!.release();
      }
    });
  } catch (error) {
    artifact?.release();
    hfinalSnapshot?.release();
    baseTerrainSnapshot?.release();
    analysisSnapshot?.release();
    throw error;
  }
}

export function seedWorldTransferredAuthoritativeGenerationTransferablesV1(
  transferred: Readonly<SeedWorldTransferredAuthoritativeGenerationV1>
): Transferable[] {
  return [
    ...new Set<Transferable>([
      transferred.analysisSnapshot.values.buffer,
      ...tileSnapshotTransferables(transferred.baseTerrainSnapshot),
      ...tileSnapshotTransferables(transferred.hfinalSnapshot),
      ...artifactTransferables(transferred.artifact),
      ...seedWorldFieldTransferables(transferred.plannedPresentationFields),
      ...transferred.plannedHydrologyWaterBodies.flatMap((body) => [
        body.wetMask.buffer,
        body.coverage.buffer,
        body.signedDistanceMetres.buffer
      ]),
      ...(transferred.preparedWaterGeneration
        ? collectWaterGenerationPreparedTransferablesV1(transferred.preparedWaterGeneration)
        : []),
      ...(transferred.preparedPresentationSource
        ? seedWorldAuthoritativePresentationSourceTransferablesV2(transferred.preparedPresentationSource)
        : [])
    ])
  ];
}

function cloneHydrologyWaterBodies(
  bodies: readonly SeedWorldHydrologyWaterBody[]
): readonly SeedWorldHydrologyWaterBody[] {
  return Object.freeze(
    bodies.map((body) =>
      Object.freeze({
        ...body,
        wetMask: new Uint8Array(body.wetMask),
        coverage: new Uint8Array(body.coverage),
        signedDistanceMetres: new Float32Array(body.signedDistanceMetres)
      })
    )
  );
}

function transferAnalysisSnapshot(
  snapshot: SeedWorldHydrologyAnalysisTerrainSnapshotV1
): SeedWorldTransferredHydrologyAnalysisTerrainSnapshotV1 {
  const values = new Int32Array(SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION ** 2);
  for (let z = 0; z < SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION; z++) {
    for (let x = 0; x < SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION; x++) {
      values[z * SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION + x] = snapshot.sampleHeightMillimetres(x, z);
    }
  }
  return Object.freeze({
    schemaVersion: SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION,
    values,
    analysisTerrainSourceHash: snapshot.analysisTerrainSourceHash,
    authoringStateHash: snapshot.authoringStateHash
  });
}

function hydrateAnalysisSnapshot(
  transferred: Readonly<SeedWorldTransferredHydrologyAnalysisTerrainSnapshotV1>
): SeedWorldHydrologyAnalysisTerrainSnapshotV1 {
  if (transferred.schemaVersion !== SEED_WORLD_CANONICAL_NATURAL_TERRAIN_SCHEMA_VERSION) {
    throw new Error("Unsupported transferred Hydrology Analysis Terrain Snapshot.");
  }
  return createSeedWorldHydrologyAnalysisTerrainSnapshotFromValuesV1(
    transferred.values,
    transferred.analysisTerrainSourceHash,
    transferred.authoringStateHash
  );
}

function transferHeightSnapshot(snapshot: SeedWorldHeightTileSnapshot): SeedWorldTransferredHeightTileSnapshotV1 {
  return Object.freeze({
    schemaVersion: SEED_WORLD_GRID_TILE_SCHEMA_VERSION,
    kind: "height" as const,
    role: snapshot.role,
    transform: snapshot.transform,
    ...transferTiles(snapshot)
  });
}

function transferOwnershipSnapshot(
  snapshot: SeedWorldOwnershipTileSnapshot
): SeedWorldTransferredOwnershipTileSnapshotV1 {
  return Object.freeze({
    schemaVersion: SEED_WORLD_GRID_TILE_SCHEMA_VERSION,
    kind: "ownership" as const,
    transform: snapshot.transform,
    ...transferTiles(snapshot)
  });
}

function transferTiles(
  snapshot: SeedWorldHeightTileSnapshot | SeedWorldOwnershipTileSnapshot
): Readonly<{ tileWidth: number; tileValues: Uint16Array; tileDigestGrid: Uint8Array }> {
  const first = snapshot.resourceAt(0);
  if (first.width !== first.height) throw new Error("Grid Tile transfer requires square Tiles.");
  const tileWidth = first.width;
  const valuesPerTile = tileWidth * tileWidth;
  const tileValues = new Uint16Array(SEED_WORLD_TILE_COUNT * valuesPerTile);
  const tileDigestGrid = new Uint8Array(SEED_WORLD_TERRAIN_TILE_DIGEST_GRID_BYTES);
  for (let tileId = 0; tileId < SEED_WORLD_TILE_COUNT; tileId++) {
    const resource = snapshot.resourceAt(tileId);
    if (resource.width !== tileWidth || resource.height !== tileWidth) {
      throw new Error(`Grid Tile ${tileId} dimensions differ inside one Snapshot.`);
    }
    const offset = tileId * valuesPerTile;
    resource.forEachValue((value, localIndex) => {
      tileValues[offset + localIndex] = value;
    });
    tileDigestGrid.set(resource.digestBytes, tileId * SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES);
  }
  return Object.freeze({ tileWidth, tileValues, tileDigestGrid });
}

async function hydrateHeightSnapshot(
  transferred: Readonly<SeedWorldTransferredHeightTileSnapshotV1>,
  pool: SeedWorldUint16TilePool,
  signal?: AbortSignal
): Promise<SeedWorldHeightTileSnapshot> {
  requireTransferredSnapshot(transferred, "height");
  const acquired = await acquireTransferredTiles(transferred, pool, "terrain-height-r16-v1", signal);
  try {
    return new SeedWorldHeightTileSnapshot(
      transferred.role,
      transferred.transform,
      acquired.resources,
      acquired.reusedTileCount,
      SEED_WORLD_TILE_COUNT - acquired.reusedTileCount
    );
  } catch (error) {
    releaseResources(acquired.resources);
    throw error;
  }
}

async function hydrateOwnershipSnapshot(
  transferred: Readonly<SeedWorldTransferredOwnershipTileSnapshotV1>,
  pool: SeedWorldUint16TilePool,
  signal?: AbortSignal
): Promise<SeedWorldOwnershipTileSnapshot> {
  requireTransferredSnapshot(transferred, "ownership");
  const acquired = await acquireTransferredTiles(transferred, pool, "water-ownership-u16-v1", signal);
  try {
    return new SeedWorldOwnershipTileSnapshot(
      transferred.transform,
      acquired.resources,
      acquired.reusedTileCount,
      SEED_WORLD_TILE_COUNT - acquired.reusedTileCount
    );
  } catch (error) {
    releaseResources(acquired.resources);
    throw error;
  }
}

async function acquireTransferredTiles(
  transferred: Readonly<SeedWorldTransferredHeightTileSnapshotV1 | SeedWorldTransferredOwnershipTileSnapshotV1>,
  pool: SeedWorldUint16TilePool,
  expectedSchema: SeedWorldUint16TileSchema,
  signal?: AbortSignal
): Promise<Readonly<{ resources: readonly SeedWorldUint16TileResource[]; reusedTileCount: number }>> {
  const valuesPerTile = requirePackedTiles(transferred);
  const resources: SeedWorldUint16TileResource[] = [];
  let reusedTileCount = 0;
  try {
    for (let tileId = 0; tileId < SEED_WORLD_TILE_COUNT; tileId++) {
      if (tileId % 512 === 0) {
        signal?.throwIfAborted();
        if (tileId > 0) await yieldToHost();
      }
      const offset = tileId * valuesPerTile;
      const input: SeedWorldTransferredUint16TileV1 = {
        schema: expectedSchema,
        tileId,
        width: transferred.tileWidth,
        height: transferred.tileWidth,
        values: transferred.tileValues.subarray(offset, offset + valuesPerTile),
        digestBytes: transferred.tileDigestGrid.subarray(
          tileId * SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES,
          (tileId + 1) * SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES
        )
      };
      const acquired = pool.acquireTransferred(input, transferred.transform);
      resources.push(acquired.resource);
      if (acquired.reused) reusedTileCount++;
    }
    signal?.throwIfAborted();
    return Object.freeze({ resources: Object.freeze(resources), reusedTileCount });
  } catch (error) {
    releaseResources(resources);
    throw error;
  }
}

function requirePackedTiles(
  transferred: Readonly<SeedWorldTransferredHeightTileSnapshotV1 | SeedWorldTransferredOwnershipTileSnapshotV1>
): number {
  const valuesPerTile = transferred.tileWidth ** 2;
  if (
    !Number.isInteger(transferred.tileWidth) ||
    transferred.tileWidth <= 0 ||
    transferred.tileValues.length !== SEED_WORLD_TILE_COUNT * valuesPerTile ||
    transferred.tileDigestGrid.length !== SEED_WORLD_TERRAIN_TILE_DIGEST_GRID_BYTES
  ) {
    throw new RangeError(`Transferred Grid Tile Snapshot requires ${SEED_WORLD_TILE_COUNT} packed tiles.`);
  }
  return valuesPerTile;
}

function requireTransferredSnapshot(
  snapshot: Readonly<SeedWorldTransferredHeightTileSnapshotV1 | SeedWorldTransferredOwnershipTileSnapshotV1>,
  kind: "height" | "ownership"
): void {
  if (snapshot.schemaVersion !== SEED_WORLD_GRID_TILE_SCHEMA_VERSION || snapshot.kind !== kind) {
    throw new Error(`Unsupported transferred ${kind} Grid Tile Snapshot.`);
  }
}

function tileSnapshotTransferables(
  transferred: Readonly<SeedWorldTransferredHeightTileSnapshotV1 | SeedWorldTransferredOwnershipTileSnapshotV1>
): Transferable[] {
  return [transferred.tileValues.buffer, transferred.tileDigestGrid.buffer];
}

function transferArtifact(artifact: SeedWorldHydrologyArtifactV1): SeedWorldTransferredHydrologyArtifactV1 {
  const topologyLength = artifact.lakeBasinTopology.resolution ** 2;
  const bodyIndices = new Uint16Array(topologyLength);
  const plannedStorageBodyIndices = new Uint16Array(topologyLength);
  const minimumConnectionLevelsMillimetres = new Int32Array(topologyLength);
  artifact.lakeBasinTopology.forEachVertex(
    ({ bodyIndex, plannedStorageBodyIndex, minimumConnectionLevelMillimetres }, vertex) => {
      bodyIndices[vertex] = bodyIndex;
      plannedStorageBodyIndices[vertex] = plannedStorageBodyIndex;
      minimumConnectionLevelsMillimetres[vertex] = minimumConnectionLevelMillimetres;
    }
  );
  const supportBodyIndices = new Uint16Array(artifact.lakeBasinSupport.resolution ** 2);
  artifact.lakeBasinSupport.forEachVertex((bodyIndex, vertex) => {
    supportBodyIndices[vertex] = bodyIndex;
  });
  return Object.freeze({
    schemaVersion: SEED_WORLD_HYDROLOGY_ARTIFACT_SCHEMA_VERSION,
    transform: artifact.ownershipSnapshot.transform,
    header: artifact.header,
    waterBodyCatalog: Object.freeze(
      artifact.waterBodyCatalog.map((entry) =>
        Object.freeze({ ...entry, canonicalTopologyKeyBytes: new Uint8Array(entry.canonicalTopologyKeyBytes) })
      )
    ),
    riverProfileCatalog: artifact.riverProfileCatalog,
    lakeBasinTopology: Object.freeze({
      contentHash: artifact.lakeBasinTopology.contentHash,
      bodyIndices,
      plannedStorageBodyIndices,
      minimumConnectionLevelsMillimetres
    }),
    lakeBasinSupport: Object.freeze({
      contentHash: artifact.lakeBasinSupport.contentHash,
      bodyIndices: supportBodyIndices
    }),
    ownershipSnapshot: transferOwnershipSnapshot(artifact.ownershipSnapshot),
    diagnostics: artifact.diagnostics
  });
}

async function hydrateArtifact(
  transferred: Readonly<SeedWorldTransferredHydrologyArtifactV1>,
  ownershipTilePool: SeedWorldUint16TilePool,
  signal?: AbortSignal
): Promise<SeedWorldHydrologyArtifactV1> {
  signal?.throwIfAborted();
  if (transferred.schemaVersion !== SEED_WORLD_HYDROLOGY_ARTIFACT_SCHEMA_VERSION) {
    throw new Error("Unsupported transferred HydrologyArtifact schema.");
  }
  if (
    transferred.transform.worldGridTransformHash !== transferred.header.worldGridTransformHash ||
    transferred.ownershipSnapshot.transform.worldGridTransformHash !== transferred.header.worldGridTransformHash
  ) {
    throw new Error("Transferred HydrologyArtifact Grid Transform does not match its canonical header.");
  }
  const maximumBodyIndex = transferred.waterBodyCatalog.length;
  const lakeBasinTopology = new SeedWorldLakeBasinTopologyGridV1(
    transferred.transform,
    transferred.lakeBasinTopology.bodyIndices,
    transferred.lakeBasinTopology.plannedStorageBodyIndices,
    transferred.lakeBasinTopology.minimumConnectionLevelsMillimetres,
    maximumBodyIndex
  );
  if (lakeBasinTopology.contentHash !== transferred.lakeBasinTopology.contentHash) {
    throw new Error("Transferred Lake Basin Topology content hash does not match its payload.");
  }
  signal?.throwIfAborted();
  const lakeBasinSupport = new SeedWorldLakeBasinSupportGridV1(
    transferred.transform,
    transferred.lakeBasinSupport.bodyIndices,
    maximumBodyIndex
  );
  if (lakeBasinSupport.contentHash !== transferred.lakeBasinSupport.contentHash) {
    throw new Error("Transferred Lake Basin Support content hash does not match its payload.");
  }
  const ownershipSnapshot = await hydrateOwnershipSnapshot(transferred.ownershipSnapshot, ownershipTilePool, signal);
  try {
    signal?.throwIfAborted();
    if (ownershipSnapshot.ownershipSourceHash !== transferred.header.ownershipSourceHash) {
      throw new Error("Transferred Ownership Snapshot content hash does not match the HydrologyArtifact header.");
    }
    return new SeedWorldHydrologyArtifactV1(
      Object.freeze({ ...transferred.header }),
      freezeWaterBodyCatalog(transferred.waterBodyCatalog),
      freezeRiverProfileCatalog(transferred.riverProfileCatalog),
      lakeBasinTopology,
      lakeBasinSupport,
      ownershipSnapshot,
      Object.freeze({ ...transferred.diagnostics })
    );
  } catch (error) {
    ownershipSnapshot.release();
    throw error;
  }
}

function artifactTransferables(transferred: Readonly<SeedWorldTransferredHydrologyArtifactV1>): Transferable[] {
  return [
    transferred.lakeBasinTopology.bodyIndices.buffer,
    transferred.lakeBasinTopology.plannedStorageBodyIndices.buffer,
    transferred.lakeBasinTopology.minimumConnectionLevelsMillimetres.buffer,
    transferred.lakeBasinSupport.bodyIndices.buffer,
    ...tileSnapshotTransferables(transferred.ownershipSnapshot),
    ...transferred.waterBodyCatalog.map(({ canonicalTopologyKeyBytes }) => canonicalTopologyKeyBytes.buffer)
  ];
}

function freezeWaterBodyCatalog(
  catalog: readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[]
): readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[] {
  return Object.freeze(
    catalog.map((entry) =>
      Object.freeze({
        ...entry,
        canonicalTopologyKeyBytes: entry.canonicalTopologyKeyBytes,
        receiverBodyIds: Object.freeze([...entry.receiverBodyIds]),
        ...(entry.capacityLitres === undefined ? {} : { capacityLitres: Object.freeze({ ...entry.capacityLitres }) })
      })
    )
  );
}

function freezeRiverProfileCatalog(
  catalog: readonly Readonly<SeedWorldRiverProfileV1>[]
): readonly Readonly<SeedWorldRiverProfileV1>[] {
  return Object.freeze(
    catalog.map((profile) =>
      Object.freeze({
        ...profile,
        samples: Object.freeze(profile.samples.map((sample) => Object.freeze({ ...sample })))
      })
    )
  );
}

function releaseResources(resources: readonly SeedWorldUint16TileResource[]): void {
  for (const resource of resources) resource.release();
}

function yieldToHost(): Promise<void> {
  const runtimeScheduler = (
    globalThis as typeof globalThis & {
      scheduler?: Readonly<{ yield?: () => Promise<void> }>;
    }
  ).scheduler;
  return runtimeScheduler?.yield ? runtimeScheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));
}
