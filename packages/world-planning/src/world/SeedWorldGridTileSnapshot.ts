import {
  bytesToHex,
  canonicalSha256HexToBytes,
  createCanonicalWaterHashWriter,
  type CanonicalWaterBinaryWriterV1
} from "@galacean/engine-water/water/compiler/index";
import {
  SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES,
  SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES
} from "@galacean/engine-water/world/WaterMetricEncodingV1";
import {
  SEED_WORLD_TILE_AXIS_COUNT,
  SEED_WORLD_TILE_COUNT,
  SEED_WORLD_TILE_SIZE_METRES,
  type SeedWorldWaterGridTransformV1
} from "@galacean/engine-water/world/SeedWorldWaterGrid";

export const SEED_WORLD_GRID_TILE_SCHEMA_VERSION = 1 as const;
export const SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES = 32;
export const SEED_WORLD_TERRAIN_TILE_DIGEST_GRID_BYTES = SEED_WORLD_TILE_COUNT * SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES;

export type SeedWorldHeightSnapshotRole = "base-terrain" | "hfinal";
export type SeedWorldUint16TileSchema = "terrain-height-r16-v1" | "water-ownership-u16-v1";

export interface SeedWorldGridTileDiagnostics {
  readonly tileCount: number;
  readonly reusedTileCount: number;
  readonly newTileCount: number;
  readonly uniqueTileBytes: number;
  readonly flattenedCopyBytes: 0;
}

export interface SeedWorldGridTileSnapshotLease {
  readonly released: boolean;
  release(): void;
}

interface SeedWorldUint16TileInput {
  readonly schema: SeedWorldUint16TileSchema;
  readonly tileId: number;
  readonly width: number;
  readonly height: number;
  readonly values: Uint16Array;
  readonly transform: SeedWorldWaterGridTransformV1;
}

export interface SeedWorldTransferredUint16TileV1 {
  readonly schema: SeedWorldUint16TileSchema;
  readonly tileId: number;
  readonly width: number;
  readonly height: number;
  readonly values: Uint16Array;
  readonly digestBytes: Uint8Array;
}

/** One immutable content resource shared by Base/Hfinal roles and generations. */
export class SeedWorldUint16TileResource {
  readonly digestBytes: Uint8Array;
  readonly byteLength: number;
  private _referenceCount = 0;

  constructor(
    readonly schema: SeedWorldUint16TileSchema,
    readonly tileId: number,
    readonly width: number,
    readonly height: number,
    private readonly _values: Uint16Array,
    digest: string | Uint8Array,
    private readonly _onUnreferenced: (resource: SeedWorldUint16TileResource) => void
  ) {
    this.digestBytes = typeof digest === "string" ? canonicalSha256HexToBytes(digest) : new Uint8Array(digest);
    if (this.digestBytes.length !== SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES) {
      throw new RangeError("Grid Tile digest must contain one canonical SHA-256 value.");
    }
    this.byteLength = _values.byteLength;
  }

  get referenceCount(): number {
    return this._referenceCount;
  }

  retain(): void {
    this._referenceCount++;
  }

  release(): void {
    if (this._referenceCount <= 0) throw new Error(`Tile ${this.tileId} has no lease to release.`);
    this._referenceCount--;
    if (this._referenceCount === 0) this._onUnreferenced(this);
  }

  sample(localX: number, localZ: number): number {
    if (!Number.isInteger(localX) || localX < 0 || localX >= this.width) {
      throw new RangeError(`Tile ${this.tileId} local x is outside [0, ${this.width - 1}].`);
    }
    if (!Number.isInteger(localZ) || localZ < 0 || localZ >= this.height) {
      throw new RangeError(`Tile ${this.tileId} local z is outside [0, ${this.height - 1}].`);
    }
    return this._values[localZ * this.width + localX]!;
  }

  forEachValue(visitor: (value: number, localIndex: number) => void): void {
    for (let index = 0; index < this._values.length; index++) visitor(this._values[index]!, index);
  }

  bytesEqual(values: Uint16Array): boolean {
    if (values.length !== this._values.length) return false;
    for (let index = 0; index < values.length; index++) {
      if (values[index] !== this._values[index]) return false;
    }
    return true;
  }
}

/** Content-addressed pool. Full digest hits still require schema and byte equality. */
export class SeedWorldUint16TilePool {
  private readonly _resources = new Map<string, SeedWorldUint16TileResource[]>();

  acquire(input: Readonly<SeedWorldUint16TileInput>): {
    readonly resource: SeedWorldUint16TileResource;
    readonly reused: boolean;
  } {
    validateTileInput(input);
    const digestHex = hashSeedWorldUint16Tile(input);
    const key = `${input.schema}:${input.tileId}:${digestHex}`;
    const bucket = this._resources.get(key);
    const existing = bucket?.find(
      (resource) =>
        resource.width === input.width && resource.height === input.height && resource.bytesEqual(input.values)
    );
    if (existing) {
      existing.retain();
      return Object.freeze({ resource: existing, reused: true });
    }
    if (bucket && bucket.length > 0) {
      throw new Error(`HASH_COLLISION_DETECTED for ${input.schema} Tile ${input.tileId}.`);
    }
    const resource = new SeedWorldUint16TileResource(
      input.schema,
      input.tileId,
      input.width,
      input.height,
      new Uint16Array(input.values),
      digestHex,
      (unreferenced) => this._remove(key, unreferenced)
    );
    resource.retain();
    this._resources.set(key, [resource]);
    return Object.freeze({ resource, reused: false });
  }

  /**
   * Consumes one packed same-origin Worker tile and its precomputed canonical digest.
   * New resources copy their small tile slice so one surviving tile cannot pin a whole generation transfer buffer.
   */
  acquireTransferred(
    input: Readonly<SeedWorldTransferredUint16TileV1>,
    transform: SeedWorldWaterGridTransformV1
  ): {
    readonly resource: SeedWorldUint16TileResource;
    readonly reused: boolean;
  } {
    validateTileInput({ ...input, transform });
    if (input.digestBytes.length !== SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES) {
      throw new TypeError("Transferred Grid Tile digest must contain one canonical SHA-256 value.");
    }
    const key = `${input.schema}:${input.tileId}:${bytesToHex(input.digestBytes)}`;
    const bucket = this._resources.get(key);
    const existing = bucket?.find(
      (resource) =>
        resource.width === input.width && resource.height === input.height && resource.bytesEqual(input.values)
    );
    if (existing) {
      existing.retain();
      return Object.freeze({ resource: existing, reused: true });
    }
    if (bucket && bucket.length > 0) {
      throw new Error(`HASH_COLLISION_DETECTED for ${input.schema} Tile ${input.tileId}.`);
    }
    const resource = new SeedWorldUint16TileResource(
      input.schema,
      input.tileId,
      input.width,
      input.height,
      new Uint16Array(input.values),
      input.digestBytes,
      (unreferenced) => this._remove(key, unreferenced)
    );
    resource.retain();
    this._resources.set(key, [resource]);
    return Object.freeze({ resource, reused: false });
  }

  get resourceCount(): number {
    let count = 0;
    for (const bucket of this._resources.values()) count += bucket.length;
    return count;
  }

  private _remove(key: string, resource: SeedWorldUint16TileResource): void {
    const bucket = this._resources.get(key);
    if (!bucket) return;
    const index = bucket.indexOf(resource);
    if (index >= 0) bucket.splice(index, 1);
    if (bucket.length === 0) this._resources.delete(key);
  }
}

export interface CanonicalSeedWorldHfinalView {
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly resolution: number;
  sampleR16(x: number, z: number): number;
  forEachRow(visitor: (z: number, sampleAtX: (x: number) => number) => void): void;
}

export interface CanonicalSeedWorldOwnershipView {
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly resolution: number;
  sampleBodyIndex(x: number, z: number): number;
  forEachRow(visitor: (z: number, sampleAtX: (x: number) => number) => void): void;
}

abstract class SeedWorldGridTileSnapshotBase {
  protected readonly tileDigestGrid: Uint8Array;
  readonly diagnostics: Readonly<SeedWorldGridTileDiagnostics>;
  private _released = false;

  protected constructor(
    readonly transform: SeedWorldWaterGridTransformV1,
    protected readonly resources: readonly SeedWorldUint16TileResource[],
    reusedTileCount: number,
    newTileCount: number
  ) {
    if (resources.length !== SEED_WORLD_TILE_COUNT) {
      throw new RangeError(`Grid Tile Snapshot requires ${SEED_WORLD_TILE_COUNT} resources.`);
    }
    const digestGrid = new Uint8Array(SEED_WORLD_TERRAIN_TILE_DIGEST_GRID_BYTES);
    for (let tileId = 0; tileId < resources.length; tileId++) {
      const resource = resources[tileId]!;
      if (resource.tileId !== tileId) throw new Error(`Tile Handle table mismatch at Tile ${tileId}.`);
      digestGrid.set(resource.digestBytes, tileId * SEED_WORLD_TERRAIN_TILE_DIGEST_BYTES);
    }
    this.tileDigestGrid = digestGrid;
    this.diagnostics = Object.freeze({
      tileCount: resources.length,
      reusedTileCount,
      newTileCount,
      uniqueTileBytes: resources.reduce(
        (sum, resource) => sum + (resource.referenceCount === 1 ? resource.byteLength : 0),
        0
      ),
      flattenedCopyBytes: 0
    });
  }

  release(): void {
    if (this._released) return;
    this._released = true;
    for (const resource of this.resources) resource.release();
  }

  acquireLease(): SeedWorldGridTileSnapshotLease {
    this.requireActive();
    for (const resource of this.resources) resource.retain();
    let released = false;
    return Object.freeze({
      get released() {
        return released;
      },
      release: () => {
        if (released) return;
        released = true;
        for (let index = this.resources.length - 1; index >= 0; index--) this.resources[index]!.release();
      }
    });
  }

  protected requireActive(): void {
    if (this._released) throw new Error("Grid Tile Snapshot has been released.");
  }

  resourceAt(tileId: number): SeedWorldUint16TileResource {
    this.requireActive();
    requireTileId(tileId);
    return this.resources[tileId]!;
  }
}

export class SeedWorldHeightTileSnapshot extends SeedWorldGridTileSnapshotBase {
  readonly canonicalView: CanonicalSeedWorldHfinalView;
  readonly terrainTileDigestGrid: Uint8Array;

  constructor(
    readonly role: SeedWorldHeightSnapshotRole,
    transform: SeedWorldWaterGridTransformV1,
    resources: readonly SeedWorldUint16TileResource[],
    reusedTileCount: number,
    newTileCount: number
  ) {
    super(transform, resources, reusedTileCount, newTileCount);
    this.terrainTileDigestGrid = this.tileDigestGrid;
    this._validateSharedBoundaries();
    this.canonicalView = Object.freeze({
      transform,
      resolution: transform.hfinalResolution,
      sampleR16: (x: number, z: number) => this._sample(x, z),
      forEachRow: (visitor: (z: number, sampleAtX: (x: number) => number) => void) => {
        this.requireActive();
        for (let z = 0; z < transform.hfinalResolution; z++) visitor(z, (x) => this._sample(x, z));
      }
    });
  }

  private _sample(x: number, z: number): number {
    this.requireActive();
    requireGridIndex(x, this.transform.hfinalResolution, "Hfinal x");
    requireGridIndex(z, this.transform.hfinalResolution, "Hfinal z");
    const cellsPerTile = (SEED_WORLD_TILE_SIZE_METRES * 1_000) / this.transform.hfinalSpacingMillimetres;
    const tileX = ownerTileForHeightVertex(x, cellsPerTile);
    const tileZ = ownerTileForHeightVertex(z, cellsPerTile);
    const localX = x - tileX * cellsPerTile;
    const localZ = z - tileZ * cellsPerTile;
    return this.resources[tileZ * SEED_WORLD_TILE_AXIS_COUNT + tileX]!.sample(localX, localZ);
  }

  private _validateSharedBoundaries(): void {
    const cellsPerTile = (SEED_WORLD_TILE_SIZE_METRES * 1_000) / this.transform.hfinalSpacingMillimetres;
    for (let tileZ = 0; tileZ < SEED_WORLD_TILE_AXIS_COUNT; tileZ++) {
      for (let tileX = 0; tileX < SEED_WORLD_TILE_AXIS_COUNT; tileX++) {
        const tile = this.resources[tileZ * SEED_WORLD_TILE_AXIS_COUNT + tileX]!;
        if (tile.schema !== "terrain-height-r16-v1") throw new Error("Height Snapshot contains a non-height Tile.");
        if (tile.width !== cellsPerTile + 1 || tile.height !== cellsPerTile + 1) {
          throw new Error(`Height Tile ${tile.tileId} dimensions do not match its Grid Profile.`);
        }
        if (tileX + 1 < SEED_WORLD_TILE_AXIS_COUNT) {
          const right = this.resources[tileZ * SEED_WORLD_TILE_AXIS_COUNT + tileX + 1]!;
          for (let localZ = 0; localZ <= cellsPerTile; localZ++) {
            if (tile.sample(cellsPerTile, localZ) !== right.sample(0, localZ)) {
              throw new Error(`Height Tile shared edge mismatch between ${tile.tileId} and ${right.tileId}.`);
            }
          }
        }
        if (tileZ + 1 < SEED_WORLD_TILE_AXIS_COUNT) {
          const bottom = this.resources[(tileZ + 1) * SEED_WORLD_TILE_AXIS_COUNT + tileX]!;
          for (let localX = 0; localX <= cellsPerTile; localX++) {
            if (tile.sample(localX, cellsPerTile) !== bottom.sample(localX, 0)) {
              throw new Error(`Height Tile shared edge mismatch between ${tile.tileId} and ${bottom.tileId}.`);
            }
          }
        }
      }
    }
  }
}

export class SeedWorldOwnershipTileSnapshot extends SeedWorldGridTileSnapshotBase {
  readonly canonicalView: CanonicalSeedWorldOwnershipView;
  readonly ownershipTileDigestGrid: Uint8Array;
  /** Ownership-only identity, independent from Terrain and generation envelopes. */
  readonly ownershipSourceHash: string;

  constructor(
    transform: SeedWorldWaterGridTransformV1,
    resources: readonly SeedWorldUint16TileResource[],
    reusedTileCount: number,
    newTileCount: number
  ) {
    super(transform, resources, reusedTileCount, newTileCount);
    this.ownershipTileDigestGrid = this.tileDigestGrid;
    this.ownershipSourceHash = hashSeedWorldTileDigestGrid(
      "seed-world-water/ownership-snapshot/v1",
      transform,
      this.ownershipTileDigestGrid
    );
    const cellsPerTile = (SEED_WORLD_TILE_SIZE_METRES * 1_000) / transform.ownershipCellMillimetres;
    for (const resource of resources) {
      if (resource.schema !== "water-ownership-u16-v1") {
        throw new Error("Ownership Snapshot contains a non-ownership Tile.");
      }
      if (resource.width !== cellsPerTile || resource.height !== cellsPerTile) {
        throw new Error(`Ownership Tile ${resource.tileId} dimensions do not match its Grid Profile.`);
      }
    }
    this.canonicalView = Object.freeze({
      transform,
      resolution: transform.ownershipResolution,
      sampleBodyIndex: (x: number, z: number) => this._sample(x, z),
      forEachRow: (visitor: (z: number, sampleAtX: (x: number) => number) => void) => {
        this.requireActive();
        for (let z = 0; z < transform.ownershipResolution; z++) visitor(z, (x) => this._sample(x, z));
      }
    });
  }

  private _sample(x: number, z: number): number {
    this.requireActive();
    requireGridIndex(x, this.transform.ownershipResolution, "Ownership x");
    requireGridIndex(z, this.transform.ownershipResolution, "Ownership z");
    const cellsPerTile = (SEED_WORLD_TILE_SIZE_METRES * 1_000) / this.transform.ownershipCellMillimetres;
    const tileX = Math.floor(x / cellsPerTile);
    const tileZ = Math.floor(z / cellsPerTile);
    const localX = x - tileX * cellsPerTile;
    const localZ = z - tileZ * cellsPerTile;
    return this.resources[tileZ * SEED_WORLD_TILE_AXIS_COUNT + tileX]!.sample(localX, localZ);
  }
}

export interface SeedWorldHeightTileSnapshotBuildInput {
  readonly role: SeedWorldHeightSnapshotRole;
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly pool: SeedWorldUint16TilePool;
  readonly valuesForTile: (tileId: number, tileVertexWidth: number) => Uint16Array;
}

export function createSeedWorldHeightTileSnapshot(
  input: Readonly<SeedWorldHeightTileSnapshotBuildInput>
): SeedWorldHeightTileSnapshot {
  const cellsPerTile = (SEED_WORLD_TILE_SIZE_METRES * 1_000) / input.transform.hfinalSpacingMillimetres;
  const tileVertexWidth = cellsPerTile + 1;
  const acquired: SeedWorldUint16TileResource[] = [];
  let reusedTileCount = 0;
  try {
    for (let tileId = 0; tileId < SEED_WORLD_TILE_COUNT; tileId++) {
      const result = input.pool.acquire({
        schema: "terrain-height-r16-v1",
        tileId,
        width: tileVertexWidth,
        height: tileVertexWidth,
        values: input.valuesForTile(tileId, tileVertexWidth),
        transform: input.transform
      });
      acquired.push(result.resource);
      if (result.reused) reusedTileCount++;
    }
    return new SeedWorldHeightTileSnapshot(
      input.role,
      input.transform,
      Object.freeze(acquired),
      reusedTileCount,
      SEED_WORLD_TILE_COUNT - reusedTileCount
    );
  } catch (error) {
    for (const resource of acquired) resource.release();
    throw error;
  }
}

export interface SeedWorldOwnershipTileSnapshotBuildInput {
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly pool: SeedWorldUint16TilePool;
  readonly valuesForTile: (tileId: number, tileCellWidth: number) => Uint16Array;
}

export function createSeedWorldOwnershipTileSnapshot(
  input: Readonly<SeedWorldOwnershipTileSnapshotBuildInput>
): SeedWorldOwnershipTileSnapshot {
  const tileCellWidth = (SEED_WORLD_TILE_SIZE_METRES * 1_000) / input.transform.ownershipCellMillimetres;
  const acquired: SeedWorldUint16TileResource[] = [];
  let reusedTileCount = 0;
  try {
    for (let tileId = 0; tileId < SEED_WORLD_TILE_COUNT; tileId++) {
      const result = input.pool.acquire({
        schema: "water-ownership-u16-v1",
        tileId,
        width: tileCellWidth,
        height: tileCellWidth,
        values: input.valuesForTile(tileId, tileCellWidth),
        transform: input.transform
      });
      acquired.push(result.resource);
      if (result.reused) reusedTileCount++;
    }
    return new SeedWorldOwnershipTileSnapshot(
      input.transform,
      Object.freeze(acquired),
      reusedTileCount,
      SEED_WORLD_TILE_COUNT - reusedTileCount
    );
  } catch (error) {
    for (const resource of acquired) resource.release();
    throw error;
  }
}

function hashSeedWorldUint16Tile(input: Readonly<SeedWorldUint16TileInput>): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  if (input.schema === "terrain-height-r16-v1") writeTerrainTile(writer, input);
  else writeOwnershipTile(writer, input);
  return hash.digestHex();
}

function hashSeedWorldTileDigestGrid(
  record: string,
  transform: Readonly<SeedWorldWaterGridTransformV1>,
  digestGrid: Uint8Array
): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord(record, SEED_WORLD_GRID_TILE_SCHEMA_VERSION)
    .writeFixedBytes(canonicalSha256HexToBytes(transform.worldGridTransformHash), 32)
    .writeUint32(SEED_WORLD_TILE_COUNT)
    .writeBytes(digestGrid);
  return hash.digestHex();
}

function writeTerrainTile(writer: CanonicalWaterBinaryWriterV1, input: Readonly<SeedWorldUint16TileInput>): void {
  writer
    .writeRecord("seed-world-water/terrain-tile/v1", SEED_WORLD_GRID_TILE_SCHEMA_VERSION)
    .writeUint16(input.tileId)
    .writeFixedBytes(canonicalSha256HexToBytes(input.transform.worldGridTransformHash), 32)
    .writeInt32(SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES)
    .writeInt32(SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES)
    .writeUint16(input.width)
    .writeUint16(input.height)
    .writeUint32(input.values.length);
  for (const value of input.values) writer.writeUint16(value);
}

function writeOwnershipTile(writer: CanonicalWaterBinaryWriterV1, input: Readonly<SeedWorldUint16TileInput>): void {
  writer
    .writeRecord("seed-world-water/ownership-tile/v1", SEED_WORLD_GRID_TILE_SCHEMA_VERSION)
    .writeUint16(input.tileId)
    .writeFixedBytes(canonicalSha256HexToBytes(input.transform.worldGridTransformHash), 32)
    .writeUint16(input.width)
    .writeUint16(input.height)
    .writeUint32(input.values.length);
  for (const value of input.values) writer.writeUint16(value);
}

function validateTileInput(input: Readonly<SeedWorldUint16TileInput>): void {
  requireTileId(input.tileId);
  if (!Number.isInteger(input.width) || input.width <= 0 || !Number.isInteger(input.height) || input.height <= 0) {
    throw new RangeError(`Tile ${input.tileId} dimensions must be positive integers.`);
  }
  if (!(input.values instanceof Uint16Array) || input.values.length !== input.width * input.height) {
    throw new RangeError(`Tile ${input.tileId} values do not match its dimensions.`);
  }
}

function requireTileId(tileId: number): void {
  if (!Number.isInteger(tileId) || tileId < 0 || tileId >= SEED_WORLD_TILE_COUNT) {
    throw new RangeError(`Tile id must be within [0, ${SEED_WORLD_TILE_COUNT - 1}].`);
  }
}

function requireGridIndex(value: number, resolution: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= resolution) {
    throw new RangeError(`${label} must be an integer within [0, ${resolution - 1}].`);
  }
}

function ownerTileForHeightVertex(vertex: number, cellsPerTile: number): number {
  if (vertex === 0) return 0;
  return Math.min(SEED_WORLD_TILE_AXIS_COUNT - 1, Math.ceil(vertex / cellsPerTile) - 1);
}
