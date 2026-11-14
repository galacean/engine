import { canonicalSha256HexToBytes, isCanonicalSha256Hex } from "../shared/CanonicalWaterBinaryWriterV1";

export const WATER_GENERATION_COMPILE_CONTEXT_SCHEMA_VERSION = 1 as const;
export const WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT = 96;
export const WATER_GENERATION_TERRAIN_TILE_COUNT = 96 * 96;
export const WATER_GENERATION_TERRAIN_TILE_DIGEST_BYTES = 32;

export interface WaterGenerationGridTransformV1 {
  readonly worldGridTransformHash: string;
  readonly worldMinXMillimetres: number;
  readonly worldMinZMillimetres: number;
  readonly worldSizeXMillimetres: number;
  readonly worldSizeZMillimetres: number;
  readonly hfinalResolution: number;
  readonly hfinalSpacingMillimetres: number;
  readonly ownershipResolution: number;
  readonly ownershipCellMillimetres: number;
  readonly rowDirection: "positive-z";
  readonly columnDirection: "positive-x";
  readonly boundaryRule: "half-open-world-max";
}

export interface WaterGenerationHfinalViewV1 {
  readonly resolution: number;
  readonly minimumHeightMillimetres: number;
  readonly maximumHeightMillimetres: number;
  sampleR16(x: number, z: number): number;
}

export interface WaterGenerationOwnershipViewV1 {
  readonly resolution: number;
  sampleBodyIndex(x: number, z: number): number;
}

export type WaterGenerationLakeShorelineModeV1 = "terrain-crossing" | "planned-footprint";

/** Immutable Hydrology-owned Basin topology view used only during generation compilation. */
export interface WaterGenerationLakeBasinSupportViewV1 {
  sourceHash(assetId: string): string;
  shorelineMode(assetId: string): WaterGenerationLakeShorelineModeV1;
  boundsMillimetres(assetId: string): Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }> | undefined;
  sampleBasinSupport(assetId: string, xOffsetMillimetres: number, zOffsetMillimetres: number): boolean;
  /** Optional canonical signed distance; negative values are inside the authored water footprint. */
  sampleSignedDistanceMillimetres?(assetId: string, xOffsetMillimetres: number, zOffsetMillimetres: number): number;
  /** Optional body-local distance that a planar Lake surface extends beneath its bank. */
  surfaceUnderlapMillimetres?(assetId: string): number;
}

export interface WaterGenerationCompileBudgetV1 {
  readonly maximumTerrainReadHaloMillimetres: number;
  readonly maximumFootprintHorizontalErrorMillimetres: number;
  readonly maximumGpuDepthDecodeErrorMillimetres: number;
  readonly maximumGpuShoreDecodeErrorMillimetres: number;
  readonly maximumRenderSurfaceOffsetMillimetres: number;
  readonly waterRenderErrorBudgetHash: string;
}

export interface WaterGenerationCompileContextInputV1 {
  readonly generationId: number;
  readonly transform: Readonly<WaterGenerationGridTransformV1>;
  readonly hfinal: WaterGenerationHfinalViewV1;
  readonly ownership: WaterGenerationOwnershipViewV1;
  readonly lakeBasinSupport: WaterGenerationLakeBasinSupportViewV1;
  /** Index 0 is Dry; later undefined entries are owners explicitly excluded from this render AssetSet. */
  readonly ownerIndexToAssetId: readonly (string | undefined)[];
  readonly terrainTileDigestGrid: Uint8Array;
  /** Ownership-only canonical identity; Terrain edits outside Water must not change it. */
  readonly ownershipSourceHash: string;
  readonly budget: Readonly<WaterGenerationCompileBudgetV1>;
  readonly sampleSurfaceHeightMillimetres: (assetId: string, ownershipX: number, ownershipZ: number) => number;
  readonly signal: AbortSignal;
  readonly releaseLease: () => void;
}

export interface WaterGenerationScopedTerrainViewV1 {
  readonly dependencyTileIds: readonly number[];
  sampleR16(x: number, z: number): number;
}

/**
 * Generation-scoped, zero-copy views. The context cannot be retained by an
 * asset, Backend runtime, or compiled cache entry after `release()`.
 */
export class WaterGenerationCompileContextV1 {
  readonly schemaVersion = WATER_GENERATION_COMPILE_CONTEXT_SCHEMA_VERSION;
  readonly generationId: number;
  readonly transform: Readonly<WaterGenerationGridTransformV1>;
  readonly hfinal: WaterGenerationHfinalViewV1;
  readonly ownership: WaterGenerationOwnershipViewV1;
  readonly ownerIndexToAssetId: readonly (string | undefined)[];
  readonly ownershipSourceHash: string;
  readonly budget: Readonly<WaterGenerationCompileBudgetV1>;
  readonly signal: AbortSignal;
  private readonly _terrainTileDigestGrid: Uint8Array;
  private readonly _lakeBasinSupport: WaterGenerationLakeBasinSupportViewV1;
  private readonly _sampleSurfaceHeightMillimetres: WaterGenerationCompileContextInputV1["sampleSurfaceHeightMillimetres"];
  private readonly _releaseLease: () => void;
  private _released = false;

  constructor(input: Readonly<WaterGenerationCompileContextInputV1>) {
    validateInput(input);
    this.generationId = input.generationId;
    this.transform = Object.freeze({ ...input.transform });
    this.hfinal = input.hfinal;
    this.ownership = input.ownership;
    this._lakeBasinSupport = input.lakeBasinSupport;
    this.ownerIndexToAssetId = Object.freeze([...input.ownerIndexToAssetId]);
    this._terrainTileDigestGrid = input.terrainTileDigestGrid;
    this.ownershipSourceHash = input.ownershipSourceHash;
    this.budget = Object.freeze({ ...input.budget });
    this._sampleSurfaceHeightMillimetres = input.sampleSurfaceHeightMillimetres;
    this.signal = input.signal;
    this._releaseLease = input.releaseLease;
  }

  assertUsable(): void {
    if (this._released) throw new Error("Water Generation Compile Context has been released.");
    if (this.signal.aborted) throw new DOMException("Water generation compilation was aborted.", "AbortError");
  }

  bodyIdForOwnerIndex(bodyIndex: number): string | undefined {
    this.assertUsable();
    if (!Number.isInteger(bodyIndex) || bodyIndex < 0 || bodyIndex >= this.ownerIndexToAssetId.length) {
      throw new RangeError("Water ownerIndex lies outside the generation mapping.");
    }
    return this.ownerIndexToAssetId[bodyIndex];
  }

  sampleSurfaceHeightMillimetres(assetId: string, ownershipX: number, ownershipZ: number): number {
    this.assertUsable();
    const value = this._sampleSurfaceHeightMillimetres(assetId, ownershipX, ownershipZ);
    if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
      throw new RangeError(`Water surface sampler for '${assetId}' returned a non-canonical Int32 value.`);
    }
    return value;
  }

  lakeBasinSupportSourceHash(assetId: string): string {
    this.assertUsable();
    requireHash(assetId, "Lake Basin assetId");
    const value = this._lakeBasinSupport.sourceHash(assetId);
    requireHash(value, `Lake '${assetId}' Basin support sourceHash`);
    return value;
  }

  lakeShorelineMode(assetId: string): WaterGenerationLakeShorelineModeV1 {
    this.assertUsable();
    requireHash(assetId, "Lake Basin assetId");
    const value = this._lakeBasinSupport.shorelineMode(assetId);
    if (value !== "terrain-crossing" && value !== "planned-footprint") {
      throw new TypeError(`Lake '${assetId}' Basin support returned an invalid shoreline mode.`);
    }
    return value;
  }

  lakeBasinBoundsMillimetres(
    assetId: string
  ): Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }> | undefined {
    this.assertUsable();
    requireHash(assetId, "Lake Basin assetId");
    const bounds = this._lakeBasinSupport.boundsMillimetres(assetId);
    if (!bounds) return undefined;
    const values = [bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ];
    if (
      values.some((value) => !Number.isInteger(value)) ||
      bounds.minX < 0 ||
      bounds.minZ < 0 ||
      bounds.maxX > this.transform.worldSizeXMillimetres ||
      bounds.maxZ > this.transform.worldSizeZMillimetres ||
      bounds.minX >= bounds.maxX ||
      bounds.minZ >= bounds.maxZ
    ) {
      throw new Error(`Lake '${assetId}' Basin support returned invalid World bounds.`);
    }
    return Object.freeze({ ...bounds });
  }

  sampleLakeBasinSupport(assetId: string, xOffsetMillimetres: number, zOffsetMillimetres: number): boolean {
    this.assertUsable();
    requireHash(assetId, "Lake Basin assetId");
    requireWorldOffset(xOffsetMillimetres, this.transform.worldSizeXMillimetres, "Lake Basin x offset");
    requireWorldOffset(zOffsetMillimetres, this.transform.worldSizeZMillimetres, "Lake Basin z offset");
    const value = this._lakeBasinSupport.sampleBasinSupport(assetId, xOffsetMillimetres, zOffsetMillimetres);
    if (typeof value !== "boolean") throw new TypeError(`Lake '${assetId}' Basin support sampler must return boolean.`);
    return value;
  }

  sampleLakeSignedDistanceMillimetres(
    assetId: string,
    xOffsetMillimetres: number,
    zOffsetMillimetres: number
  ): number | undefined {
    this.assertUsable();
    const sample = this._lakeBasinSupport.sampleSignedDistanceMillimetres;
    if (!sample) return undefined;
    requireHash(assetId, "Lake Basin assetId");
    requireWorldOffset(xOffsetMillimetres, this.transform.worldSizeXMillimetres, "Lake Basin x offset");
    requireWorldOffset(zOffsetMillimetres, this.transform.worldSizeZMillimetres, "Lake Basin z offset");
    const value = sample(assetId, xOffsetMillimetres, zOffsetMillimetres);
    if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
      throw new RangeError(`Lake '${assetId}' signed-distance sampler returned a non-canonical Int32 value.`);
    }
    return value;
  }

  lakeSurfaceUnderlapMillimetres(assetId: string): number {
    this.assertUsable();
    const sample = this._lakeBasinSupport.surfaceUnderlapMillimetres;
    if (!sample) return 0;
    requireHash(assetId, "Lake Basin assetId");
    const value = sample(assetId);
    if (!Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) {
      throw new RangeError(`Lake '${assetId}' surface underlap must be a canonical non-negative Int32 value.`);
    }
    return value;
  }

  terrainTileDigest(tileId: number): Uint8Array {
    this.assertUsable();
    requireTerrainTileId(tileId);
    const offset = tileId * WATER_GENERATION_TERRAIN_TILE_DIGEST_BYTES;
    return this._terrainTileDigestGrid.subarray(offset, offset + WATER_GENERATION_TERRAIN_TILE_DIGEST_BYTES);
  }

  createScopedTerrainView(dependencyTileIds: readonly number[]): WaterGenerationScopedTerrainViewV1 {
    this.assertUsable();
    const sorted = normalizeTerrainTileIds(dependencyTileIds);
    const allowed = new Set(sorted);
    return Object.freeze({
      dependencyTileIds: sorted,
      sampleR16: (x: number, z: number) => {
        this.assertUsable();
        requireGridIndex(x, this.transform.hfinalResolution, "Hfinal x");
        requireGridIndex(z, this.transform.hfinalResolution, "Hfinal z");
        const worldXMillimetres = x * this.transform.hfinalSpacingMillimetres;
        const worldZMillimetres = z * this.transform.hfinalSpacingMillimetres;
        const tileX = Math.min(95, Math.floor(worldXMillimetres / 32_000));
        const tileZ = Math.min(95, Math.floor(worldZMillimetres / 32_000));
        const tileId = tileZ * WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT + tileX;
        if (!allowed.has(tileId)) {
          throw new Error(`OUT_OF_SCOPE_TERRAIN_TILE_READ: Tile ${tileId} is outside the declared dependency set.`);
        }
        return this.hfinal.sampleR16(x, z);
      }
    });
  }

  release(): void {
    if (this._released) return;
    this._released = true;
    this._releaseLease();
  }
}

export function normalizeTerrainTileIds(tileIds: readonly number[]): readonly number[] {
  const sorted = [...tileIds].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length; index++) {
    requireTerrainTileId(sorted[index]!);
    if (index > 0 && sorted[index] === sorted[index - 1]) {
      throw new Error(`Terrain dependency Tile ${sorted[index]} is duplicated.`);
    }
  }
  return Object.freeze(sorted);
}

function validateInput(input: Readonly<WaterGenerationCompileContextInputV1>): void {
  if (!Number.isSafeInteger(input.generationId) || input.generationId <= 0) {
    throw new RangeError("Water generationId must be a positive safe integer.");
  }
  requireHash(input.transform.worldGridTransformHash, "worldGridTransformHash");
  requireHash(input.ownershipSourceHash, "ownershipSourceHash");
  requireHash(input.budget.waterRenderErrorBudgetHash, "waterRenderErrorBudgetHash");
  if (
    !Number.isInteger(input.budget.maximumTerrainReadHaloMillimetres) ||
    input.budget.maximumTerrainReadHaloMillimetres <= 0 ||
    input.budget.maximumTerrainReadHaloMillimetres > 0xffff_ffff
  ) {
    throw new RangeError("maximumTerrainReadHaloMillimetres must be a positive Uint32.");
  }
  if (input.hfinal.resolution !== input.transform.hfinalResolution) {
    throw new Error("Water compile Hfinal View resolution differs from WorldGridTransform.");
  }
  if (
    !Number.isInteger(input.hfinal.minimumHeightMillimetres) ||
    !Number.isInteger(input.hfinal.maximumHeightMillimetres) ||
    input.hfinal.minimumHeightMillimetres >= input.hfinal.maximumHeightMillimetres
  ) {
    throw new RangeError("Water compile Hfinal View requires a valid canonical R16 height domain.");
  }
  if (input.ownership.resolution !== input.transform.ownershipResolution) {
    throw new Error("Water compile Ownership View resolution differs from WorldGridTransform.");
  }
  if (
    !input.lakeBasinSupport ||
    typeof input.lakeBasinSupport.sourceHash !== "function" ||
    typeof input.lakeBasinSupport.shorelineMode !== "function" ||
    typeof input.lakeBasinSupport.boundsMillimetres !== "function" ||
    typeof input.lakeBasinSupport.sampleBasinSupport !== "function" ||
    (input.lakeBasinSupport.sampleSignedDistanceMillimetres !== undefined &&
      typeof input.lakeBasinSupport.sampleSignedDistanceMillimetres !== "function") ||
    (input.lakeBasinSupport.surfaceUnderlapMillimetres !== undefined &&
      typeof input.lakeBasinSupport.surfaceUnderlapMillimetres !== "function")
  ) {
    throw new TypeError("Water compile context requires one Hydrology-owned Lake Basin support view.");
  }
  if (input.ownerIndexToAssetId[0] !== undefined) throw new Error("Water ownerIndex 0 must remain Dry.");
  if (
    !(input.terrainTileDigestGrid instanceof Uint8Array) ||
    input.terrainTileDigestGrid.byteLength !==
      WATER_GENERATION_TERRAIN_TILE_COUNT * WATER_GENERATION_TERRAIN_TILE_DIGEST_BYTES
  ) {
    throw new RangeError("Water compile context requires the packed 96x96 full SHA-256 Terrain Digest Grid.");
  }
  for (let index = 1; index < input.ownerIndexToAssetId.length; index++) {
    const assetId = input.ownerIndexToAssetId[index];
    if (assetId !== undefined && !isCanonicalSha256Hex(assetId)) {
      throw new TypeError(`Water ownerIndex ${index} must be excluded or map to one SHA-256 body id.`);
    }
  }
  canonicalSha256HexToBytes(input.transform.worldGridTransformHash);
}

function requireHash(value: string, label: string): void {
  if (!isCanonicalSha256Hex(value)) throw new TypeError(`${label} must be a lowercase SHA-256 digest.`);
}

function requireWorldOffset(value: number, worldSize: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > worldSize) {
    throw new RangeError(`${label} must be a canonical millimetre offset inside the World domain.`);
  }
}

function requireTerrainTileId(tileId: number): void {
  if (!Number.isInteger(tileId) || tileId < 0 || tileId >= WATER_GENERATION_TERRAIN_TILE_COUNT) {
    throw new RangeError(`Terrain Tile id must be within [0, ${WATER_GENERATION_TERRAIN_TILE_COUNT - 1}].`);
  }
}

function requireGridIndex(value: number, resolution: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= resolution) {
    throw new RangeError(`${label} must be an integer within [0, ${resolution - 1}].`);
  }
}
