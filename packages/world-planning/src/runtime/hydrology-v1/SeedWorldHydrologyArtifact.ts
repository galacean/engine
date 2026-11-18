import {
  CANONICAL_WATER_ENCODING_VERSION,
  CANONICAL_WATER_HASH_ALGORITHM,
  CanonicalWaterBinaryWriterV1,
  CanonicalWaterByteCollector,
  bytesToHex,
  canonicalSha256HexToBytes,
  compareCanonicalBytes,
  createCanonicalWaterHashWriter,
  isCanonicalSha256Hex,
  type CanonicalUint64Lanes
} from "@galacean/engine-water/water/compiler/index";
import type { SeedWorldHydrologyProfileV1 } from "./SeedWorldHydrologyProfileV1.ts";
import { requireSeedWorldHydrologyProfileV1 } from "./SeedWorldHydrologyProfileV1.ts";
import { decodeR16HeightMillimetres } from "./SeedWorldCanonicalNaturalTerrain.ts";
import type { SeedWorldWaterSemanticErrorBudgetV1 } from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";
import {
  SeedWorldHeightTileSnapshot,
  SeedWorldOwnershipTileSnapshot,
  SeedWorldUint16TilePool,
  createSeedWorldOwnershipTileSnapshot
} from "../../world/SeedWorldGridTileSnapshot.ts";
import type { SeedWorldWaterGridTransformV1 } from "@galacean/engine-water/world/SeedWorldWaterGrid";
import {
  SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION,
  SEED_WORLD_TILE_AXIS_COUNT
} from "@galacean/engine-water/world/SeedWorldWaterGrid";
import {
  SEED_WORLD_R16_HEIGHT_SPAN_MILLIMETRES,
  SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES
} from "@galacean/engine-water/world/WaterMetricEncodingV1";
import {
  SEED_WORLD_LAKE_CANDIDATE_ACCEPTED,
  SeedWorldLakeCandidateRejectionError,
  freezeSeedWorldLakeSearchDiagnostics,
  rejectSeedWorldLakeCandidate,
  type SeedWorldLakeCandidateEvaluationResult,
  type SeedWorldLakeSearchDiagnostics
} from "@galacean/engine-water/world/SeedWorldLakeCandidate";

export const SEED_WORLD_HYDROLOGY_ARTIFACT_SCHEMA_VERSION = 7 as const;
export const SEED_WORLD_HYDROLOGY_SOLVER_VERSION = 6 as const;
export const SEED_WORLD_BODY_IDENTITY_SCHEMA_VERSION = 1 as const;
export const SEED_WORLD_BODY_SOURCE_SCHEMA_VERSION = 5 as const;
export const SEED_WORLD_OWNERSHIP_SCHEMA_VERSION = 1 as const;
export const SEED_WORLD_LAKE_BASIN_TOPOLOGY_SCHEMA_VERSION = 2 as const;
export const SEED_WORLD_LAKE_BASIN_SUPPORT_SCHEMA_VERSION = 3 as const;
export const SEED_WORLD_OWNERSHIP_DRY = 0;
export const SEED_WORLD_OWNERSHIP_INVALID = 0xffff;
export const SEED_WORLD_MAXIMUM_WATER_BODY_COUNT = 0xfffe;
export const SEED_WORLD_HYDROLOGY_ARTIFACT_MAXIMUM_BYTES = 12 * 1024 * 1024;
/**
 * One bounded Hfinal vertex beyond the coarse-to-fine projection allowance.
 * It gives the Terrain height crossing room to close before the artificial
 * Basin Support edge becomes visible, without changing semantic Ownership.
 */
export const SEED_WORLD_LAKE_SUPPORT_SHORELINE_GUARD_VERTICES = 2 as const;

export type SeedWorldWaterTypeV1 = "ocean" | "lake" | "river";
export type SeedWorldLakeShorelineModeV1 = "terrain-crossing" | "planned-footprint";

export type SeedWorldHydrologyIdentityNodeKindV1 =
  | "boundary-portal"
  | "basin-sink"
  | "river-source"
  | "confluence"
  | "divergence"
  | "lake-entry"
  | "lake-outlet"
  | "ocean-entry"
  | "world-boundary-exit";

export interface SeedWorldHydrologyIdentityNodeKeyV1 {
  readonly kind: SeedWorldHydrologyIdentityNodeKindV1;
  readonly identityVertexId: number;
}

export interface SeedWorldOceanTopologyKeyV1 {
  readonly kind: "ocean-v1";
  readonly boundaryPortalAnchorVertexIds: readonly number[];
}

export interface SeedWorldLakeTopologyKeyV1 {
  readonly kind: "lake-v1";
  readonly basinSinkAnchorVertexIds: readonly number[];
  readonly outletNodeKey: SeedWorldHydrologyIdentityNodeKeyV1;
  readonly receiverNodeKey?: SeedWorldHydrologyIdentityNodeKeyV1;
}

export interface SeedWorldRiverReachTopologyKeyV1 {
  readonly kind: "river-reach-v1";
  readonly fromNodeKey: SeedWorldHydrologyIdentityNodeKeyV1;
  readonly toNodeKey: SeedWorldHydrologyIdentityNodeKeyV1;
}

export type SeedWorldCanonicalTopologyKeyV1 =
  | SeedWorldOceanTopologyKeyV1
  | SeedWorldLakeTopologyKeyV1
  | SeedWorldRiverReachTopologyKeyV1;

export interface SeedWorldRiverProfileSampleV1 {
  readonly xOffsetMillimetres: number;
  readonly zOffsetMillimetres: number;
  readonly surfaceHeightMillimetres: number;
  readonly widthMillimetres: number;
  readonly depthMillimetres: number;
  readonly velocityMillimetresPerSecond: number;
  readonly distanceMillimetres: number;
}

export interface SeedWorldRiverProfileV1 {
  readonly profileSchemaVersion: 1;
  readonly bodyId: string;
  readonly samples: readonly Readonly<SeedWorldRiverProfileSampleV1>[];
}

export interface SeedWorldSolvedWaterBodyV1 {
  /** Candidate-local handle; never published or hashed. */
  readonly solverBodyHandle: string;
  readonly waterType: SeedWorldWaterTypeV1;
  readonly canonicalTopologyKey: SeedWorldCanonicalTopologyKeyV1;
  readonly uniformSurfaceHeightMillimetres?: number;
  readonly riverProfile?: Omit<SeedWorldRiverProfileV1, "bodyId">;
  readonly basinId?: string;
  readonly outletId?: string;
  readonly receiverSolverBodyHandles?: readonly string[];
  readonly capacityLitres?: CanonicalUint64Lanes;
  /** Lake-only shoreline closure policy; omitted legacy fixtures use terrain-crossing. */
  readonly lakeShorelineMode?: SeedWorldLakeShorelineModeV1;
}

/** One analysis-grid vertex hydrologically connected to a canonical Lake Basin. */
export interface SeedWorldLakeBasinSupportSampleV1 {
  readonly solverBodyHandle: string;
  /** True only where the Hydrology planner selected current Lake storage, not the whole drainage Basin. */
  readonly plannedStorage: boolean;
  /** Minimum horizontal water level that can reach this vertex along canonical receiver topology. */
  readonly minimumConnectionLevelMillimetres: number;
}

export interface SeedWorldHydrologySolveResultV1 {
  readonly solverVersion: typeof SEED_WORLD_HYDROLOGY_SOLVER_VERSION;
  readonly bodies: readonly Readonly<SeedWorldSolvedWaterBodyV1>[];
  /** `null` means Dry; `undefined` proves that Sealer did not assign the cell. */
  readonly ownershipAt: (x: number, z: number) => string | null | undefined;
  /** Analysis-grid Basin topology; `null` means the vertex drains to no published Lake. */
  readonly lakeBasinSupportAt: (
    analysisX: number,
    analysisZ: number
  ) => Readonly<SeedWorldLakeBasinSupportSampleV1> | null | undefined;
  /**
   * Optional Hydrology-published Hfinal support for an already planned topology.
   * Procedural solvers may omit it and let the Sealer close their coarse storage topology.
   */
  readonly lakeBasinFineSupportAt?: (hfinalX: number, hfinalZ: number) => string | null | undefined;
}

export interface SeedWorldWaterBodyCatalogEntryV1 {
  readonly bodyId: string;
  readonly waterType: SeedWorldWaterTypeV1;
  readonly canonicalTopologyKeyBytes: Uint8Array;
  readonly bodySourceHash: string;
  readonly uniformSurfaceHeightMillimetres?: number;
  readonly riverProfileIndex?: number;
  readonly basinId?: string;
  readonly outletId?: string;
  readonly receiverBodyIds: readonly string[];
  readonly capacityLitres?: CanonicalUint64Lanes;
  /** Canonical body-local Basin topology and connection-level identity; required only for Lake. */
  readonly basinSupportHash?: string;
  readonly lakeShorelineMode?: SeedWorldLakeShorelineModeV1;
}

export interface SeedWorldHydrologyArtifactHeaderV1 {
  readonly hydrologySchemaVersion: typeof SEED_WORLD_HYDROLOGY_ARTIFACT_SCHEMA_VERSION;
  readonly hydrologySolverVersion: typeof SEED_WORLD_HYDROLOGY_SOLVER_VERSION;
  readonly bodyIdentitySchemaVersion: typeof SEED_WORLD_BODY_IDENTITY_SCHEMA_VERSION;
  readonly canonicalWaterEncodingVersion: typeof CANONICAL_WATER_ENCODING_VERSION;
  readonly canonicalWaterHashAlgorithm: typeof CANONICAL_WATER_HASH_ALGORITHM;
  readonly authoringStateHash: string;
  readonly hydrologyProfileHash: string;
  readonly generationParametersHash: string;
  readonly waterSemanticErrorBudgetHash: string;
  readonly worldGridTransformHash: string;
  /** Ownership-only identity used for body compilation invalidation. */
  readonly ownershipSourceHash: string;
  readonly analysisTerrainSourceHash: string;
  readonly baseTerrainSourceHash: string;
  readonly terrainSourceHash: string;
  readonly artifactContentHash: string;
}

export interface SeedWorldHydrologyArtifactDiagnosticsV1 {
  readonly waterBodyCount: number;
  readonly oceanCount: number;
  readonly lakeCount: number;
  readonly riverCount: number;
  readonly wetOwnershipCellCount: number;
  readonly ownershipBytes: number;
  readonly lakeBasinTopologyBytes: number;
  readonly lakeBasinSupportBytes: number;
  readonly canonicalPayloadBytes: number;
  readonly artifactStructuralBytes: number;
  readonly semanticFloatBranchCount: 0;
  readonly flattenedCopyBytes: 0;
  readonly maximumCount: SeedWorldLakeSearchDiagnostics["maximumCount"];
  readonly publishedCount: number;
  readonly attemptedCandidateCount: number;
  readonly rejectionCounts: SeedWorldLakeSearchDiagnostics["rejectionCounts"];
}

export interface SeedWorldLakeBasinTopologyVertexV1 {
  /** One-based catalog index; zero means this vertex drains to no published Lake. */
  readonly bodyIndex: number;
  /** One-based catalog index only inside the planner-selected Lake storage footprint. */
  readonly plannedStorageBodyIndex: number;
  readonly minimumConnectionLevelMillimetres: number;
}

/** Immutable low-frequency Basin identity and reachability threshold grid owned by Hydrology. */
export class SeedWorldLakeBasinTopologyGridV1 {
  readonly schemaVersion = SEED_WORLD_LAKE_BASIN_TOPOLOGY_SCHEMA_VERSION;
  readonly resolution = SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION;
  readonly spacingMillimetres: number;
  readonly contentHash: string;
  readonly byteLength: number;
  private readonly _bodyIndices: Uint16Array;
  private readonly _plannedStorageBodyIndices: Uint16Array;
  private readonly _minimumConnectionLevelsMillimetres: Int32Array;

  constructor(
    readonly transform: Readonly<SeedWorldWaterGridTransformV1>,
    bodyIndices: Uint16Array,
    plannedStorageBodyIndices: Uint16Array,
    minimumConnectionLevelsMillimetres: Int32Array,
    maximumBodyIndex: number
  ) {
    const expectedLength = SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION ** 2;
    if (
      bodyIndices.length !== expectedLength ||
      plannedStorageBodyIndices.length !== expectedLength ||
      minimumConnectionLevelsMillimetres.length !== expectedLength
    ) {
      throw new RangeError("Lake Basin topology arrays must match the canonical Analysis Grid.");
    }
    if (!Number.isInteger(maximumBodyIndex) || maximumBodyIndex < 0 || maximumBodyIndex > 0xfffe) {
      throw new RangeError("Lake Basin topology maximum body index must fit canonical Uint16 ownership.");
    }
    this.spacingMillimetres = transform.analysisSpacingMillimetres;
    this._bodyIndices = new Uint16Array(bodyIndices);
    this._plannedStorageBodyIndices = new Uint16Array(plannedStorageBodyIndices);
    this._minimumConnectionLevelsMillimetres = new Int32Array(minimumConnectionLevelsMillimetres);
    for (let vertex = 0; vertex < expectedLength; vertex++) {
      const bodyIndex = this._bodyIndices[vertex]!;
      const plannedStorageBodyIndex = this._plannedStorageBodyIndices[vertex]!;
      if (bodyIndex > maximumBodyIndex) {
        throw new Error(`Lake Basin topology vertex ${vertex} references missing body index ${bodyIndex}.`);
      }
      if (
        plannedStorageBodyIndex > maximumBodyIndex ||
        (plannedStorageBodyIndex !== 0 && plannedStorageBodyIndex !== bodyIndex)
      ) {
        throw new Error(
          `Lake Basin topology vertex ${vertex} has invalid planned storage body index ${plannedStorageBodyIndex}.`
        );
      }
      if (bodyIndex === 0 && this._minimumConnectionLevelsMillimetres[vertex] !== 0) {
        throw new Error(`Lake Basin topology vertex ${vertex} has a connection level without a Lake owner.`);
      }
    }
    this.byteLength =
      this._bodyIndices.byteLength +
      this._plannedStorageBodyIndices.byteLength +
      this._minimumConnectionLevelsMillimetres.byteLength;
    this.contentHash = hashLakeBasinTopology(this);
  }

  sampleVertex(x: number, z: number): Readonly<SeedWorldLakeBasinTopologyVertexV1> {
    requireAnalysisIndex(x, "Lake Basin x");
    requireAnalysisIndex(z, "Lake Basin z");
    const index = z * this.resolution + x;
    return Object.freeze({
      bodyIndex: this._bodyIndices[index]!,
      plannedStorageBodyIndex: this._plannedStorageBodyIndices[index]!,
      minimumConnectionLevelMillimetres: this._minimumConnectionLevelsMillimetres[index]!
    });
  }

  isPlannedStorageAtWorldOffset(bodyIndex: number, xOffsetMillimetres: number, zOffsetMillimetres: number): boolean {
    requireCatalogBodyIndex(bodyIndex);
    requireWorldOffset(xOffsetMillimetres, this.transform.worldSizeXMillimetres, "Lake storage x offset");
    requireWorldOffset(zOffsetMillimetres, this.transform.worldSizeZMillimetres, "Lake storage z offset");
    const x = nearestGridVertex(xOffsetMillimetres, this.spacingMillimetres, this.resolution);
    const z = nearestGridVertex(zOffsetMillimetres, this.spacingMillimetres, this.resolution);
    return this._plannedStorageBodyIndices[z * this.resolution + x] === bodyIndex;
  }

  isActiveAtWorldOffset(
    bodyIndex: number,
    waterLevelMillimetres: number,
    xOffsetMillimetres: number,
    zOffsetMillimetres: number
  ): boolean {
    requireCatalogBodyIndex(bodyIndex);
    requireInt32(waterLevelMillimetres, "Lake Basin water level");
    requireWorldOffset(xOffsetMillimetres, this.transform.worldSizeXMillimetres, "Lake Basin topology x offset");
    requireWorldOffset(zOffsetMillimetres, this.transform.worldSizeZMillimetres, "Lake Basin topology z offset");
    const x = nearestGridVertex(xOffsetMillimetres, this.spacingMillimetres, this.resolution);
    const z = nearestGridVertex(zOffsetMillimetres, this.spacingMillimetres, this.resolution);
    const vertex = z * this.resolution + x;
    return (
      this._bodyIndices[vertex] === bodyIndex &&
      this._minimumConnectionLevelsMillimetres[vertex]! <= waterLevelMillimetres
    );
  }

  activeBoundsMillimetres(
    bodyIndex: number,
    waterLevelMillimetres: number
  ): Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }> | undefined {
    requireCatalogBodyIndex(bodyIndex);
    requireInt32(waterLevelMillimetres, "Lake Basin water level");
    let minimumX = this.resolution;
    let minimumZ = this.resolution;
    let maximumX = -1;
    let maximumZ = -1;
    for (let z = 0; z < this.resolution; z++) {
      for (let x = 0; x < this.resolution; x++) {
        const index = z * this.resolution + x;
        if (
          this._bodyIndices[index] !== bodyIndex ||
          this._minimumConnectionLevelsMillimetres[index]! > waterLevelMillimetres
        ) {
          continue;
        }
        minimumX = Math.min(minimumX, x);
        minimumZ = Math.min(minimumZ, z);
        maximumX = Math.max(maximumX, x);
        maximumZ = Math.max(maximumZ, z);
      }
    }
    if (maximumX < 0) return undefined;
    const halfSpacing = Math.floor(this.spacingMillimetres / 2);
    return Object.freeze({
      minX: Math.max(0, minimumX * this.spacingMillimetres - halfSpacing),
      minZ: Math.max(0, minimumZ * this.spacingMillimetres - halfSpacing),
      maxX: Math.min(this.transform.worldSizeXMillimetres, maximumX * this.spacingMillimetres + halfSpacing),
      maxZ: Math.min(this.transform.worldSizeZMillimetres, maximumZ * this.spacingMillimetres + halfSpacing)
    });
  }

  forEachVertex(visitor: (sample: Readonly<SeedWorldLakeBasinTopologyVertexV1>, vertex: number) => void): void {
    for (let vertex = 0; vertex < this._bodyIndices.length; vertex++) {
      visitor(
        Object.freeze({
          bodyIndex: this._bodyIndices[vertex]!,
          plannedStorageBodyIndex: this._plannedStorageBodyIndices[vertex]!,
          minimumConnectionLevelMillimetres: this._minimumConnectionLevelsMillimetres[vertex]!
        }),
        vertex
      );
    }
  }
}

/**
 * Fine Hydrology-owned Lake support domain derived from active Basin topology seeds and Hfinal.
 * Terrain-crossing Lakes require a closed low component; planned-footprint Lakes retain a bounded
 * Topology refinement band where Terrain cannot close the authored outlet. It is never an SDF or a render-derived mask.
 */
export class SeedWorldLakeBasinSupportGridV1 {
  readonly schemaVersion = SEED_WORLD_LAKE_BASIN_SUPPORT_SCHEMA_VERSION;
  readonly resolution: number;
  readonly spacingMillimetres: number;
  readonly contentHash: string;
  readonly byteLength: number;
  private readonly _bodyIndices: Uint16Array;
  private readonly _boundsByBodyIndex: readonly (
    | Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>
    | undefined
  )[];

  constructor(
    readonly transform: Readonly<SeedWorldWaterGridTransformV1>,
    bodyIndices: Uint16Array,
    maximumBodyIndex: number
  ) {
    this.resolution = transform.hfinalResolution;
    this.spacingMillimetres = transform.hfinalSpacingMillimetres;
    if (bodyIndices.length !== this.resolution ** 2) {
      throw new RangeError("Lake Basin support must match the Hfinal Grid.");
    }
    this._bodyIndices = new Uint16Array(bodyIndices);
    const minimumX = new Int32Array(maximumBodyIndex + 1).fill(this.resolution);
    const minimumZ = new Int32Array(maximumBodyIndex + 1).fill(this.resolution);
    const maximumX = new Int32Array(maximumBodyIndex + 1).fill(-1);
    const maximumZ = new Int32Array(maximumBodyIndex + 1).fill(-1);
    for (let vertex = 0; vertex < this._bodyIndices.length; vertex++) {
      const bodyIndex = this._bodyIndices[vertex]!;
      if (bodyIndex > maximumBodyIndex) {
        throw new Error(`Lake Basin support vertex ${vertex} references missing body index ${bodyIndex}.`);
      }
      if (bodyIndex === 0) continue;
      const x = vertex % this.resolution;
      const z = Math.floor(vertex / this.resolution);
      minimumX[bodyIndex] = Math.min(minimumX[bodyIndex]!, x);
      minimumZ[bodyIndex] = Math.min(minimumZ[bodyIndex]!, z);
      maximumX[bodyIndex] = Math.max(maximumX[bodyIndex]!, x);
      maximumZ[bodyIndex] = Math.max(maximumZ[bodyIndex]!, z);
    }
    const halfSpacing = Math.floor(this.spacingMillimetres / 2);
    this._boundsByBodyIndex = Object.freeze(
      Array.from({ length: maximumBodyIndex + 1 }, (_, bodyIndex) => {
        if (bodyIndex === 0 || maximumX[bodyIndex]! < 0) return undefined;
        return Object.freeze({
          minX: Math.max(0, minimumX[bodyIndex]! * this.spacingMillimetres - halfSpacing),
          minZ: Math.max(0, minimumZ[bodyIndex]! * this.spacingMillimetres - halfSpacing),
          maxX: Math.min(
            this.transform.worldSizeXMillimetres,
            maximumX[bodyIndex]! * this.spacingMillimetres + halfSpacing
          ),
          maxZ: Math.min(
            this.transform.worldSizeZMillimetres,
            maximumZ[bodyIndex]! * this.spacingMillimetres + halfSpacing
          )
        });
      })
    );
    this.byteLength = this._bodyIndices.byteLength;
    this.contentHash = hashLakeBasinSupport(this);
  }

  sampleSupportAtWorldOffset(bodyIndex: number, xOffsetMillimetres: number, zOffsetMillimetres: number): boolean {
    requireCatalogBodyIndex(bodyIndex);
    requireWorldOffset(xOffsetMillimetres, this.transform.worldSizeXMillimetres, "Lake Basin support x offset");
    requireWorldOffset(zOffsetMillimetres, this.transform.worldSizeZMillimetres, "Lake Basin support z offset");
    const x = nearestGridVertex(xOffsetMillimetres, this.spacingMillimetres, this.resolution);
    const z = nearestGridVertex(zOffsetMillimetres, this.spacingMillimetres, this.resolution);
    return this._bodyIndices[z * this.resolution + x] === bodyIndex;
  }

  boundsMillimetres(
    bodyIndex: number
  ): Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }> | undefined {
    requireCatalogBodyIndex(bodyIndex);
    return this._boundsByBodyIndex[bodyIndex];
  }

  forEachVertex(visitor: (bodyIndex: number, vertex: number) => void): void {
    for (let vertex = 0; vertex < this._bodyIndices.length; vertex++) {
      visitor(this._bodyIndices[vertex]!, vertex);
    }
  }
}

export interface SealSeedWorldHydrologyArtifactInputV1 {
  readonly worldIdentity: string;
  readonly authoringStateHash: string;
  readonly analysisTerrainSourceHash: string;
  readonly baseTerrainSourceHash: string;
  readonly terrainSourceHash: string;
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly profile: SeedWorldHydrologyProfileV1;
  readonly semanticErrorBudget: SeedWorldWaterSemanticErrorBudgetV1;
  readonly hfinalSnapshot: SeedWorldHeightTileSnapshot;
  readonly solveResult: SeedWorldHydrologySolveResultV1;
  readonly lakeSearchDiagnostics: SeedWorldLakeSearchDiagnostics;
  readonly ownershipTilePool: SeedWorldUint16TilePool;
}

export interface PreflightSeedWorldLakeCandidateInputV1 {
  readonly worldIdentity: string;
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly hfinalSamples: Uint16Array;
  readonly solveResult: SeedWorldHydrologySolveResultV1;
  readonly candidateSolverBodyHandle: string;
}

interface SeedWorldLakeGridCompileInputV1 {
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly solveResult: SeedWorldHydrologySolveResultV1;
  readonly hfinalSampleR16At: (x: number, z: number) => number;
}

export class SeedWorldHydrologyArtifactV1 {
  private _released = false;

  constructor(
    readonly header: Readonly<SeedWorldHydrologyArtifactHeaderV1>,
    readonly waterBodyCatalog: readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[],
    readonly riverProfileCatalog: readonly Readonly<SeedWorldRiverProfileV1>[],
    readonly lakeBasinTopology: SeedWorldLakeBasinTopologyGridV1,
    readonly lakeBasinSupport: SeedWorldLakeBasinSupportGridV1,
    readonly ownershipSnapshot: SeedWorldOwnershipTileSnapshot,
    readonly diagnostics: Readonly<SeedWorldHydrologyArtifactDiagnosticsV1>
  ) {}

  get ownershipView() {
    if (this._released) throw new Error("HydrologyArtifact has been released.");
    return this.ownershipSnapshot.canonicalView;
  }

  release(): void {
    if (this._released) return;
    this._released = true;
    this.ownershipSnapshot.release();
  }
}

interface IdentityBodyRecord {
  readonly solved: Readonly<SeedWorldSolvedWaterBodyV1>;
  readonly topologyBytes: Uint8Array;
  readonly bodyId: string;
}

function createLakeGridCompileInput(
  transform: SeedWorldWaterGridTransformV1,
  solveResult: SeedWorldHydrologySolveResultV1,
  hfinalSampleR16At: (x: number, z: number) => number
): SeedWorldLakeGridCompileInputV1 {
  return Object.freeze({ transform, solveResult, hfinalSampleR16At });
}

/**
 * Runs the same canonical Fine-grid support construction used by the strict Sealer.
 * Only conflicts attributable to the current natural candidate become a rejection result;
 * malformed Solve/Grid/identity data continues to throw.
 */
export function preflightSeedWorldLakeCandidateV1(
  input: Readonly<PreflightSeedWorldLakeCandidateInputV1>
): SeedWorldLakeCandidateEvaluationResult {
  if (typeof input.worldIdentity !== "string" || input.worldIdentity.trim().length === 0) {
    throw new TypeError("Lake candidate preflight requires a stable worldIdentity.");
  }
  if (typeof input.candidateSolverBodyHandle !== "string" || input.candidateSolverBodyHandle.length === 0) {
    throw new TypeError("Lake candidate preflight requires a candidate solver body handle.");
  }
  if (input.solveResult.solverVersion !== SEED_WORLD_HYDROLOGY_SOLVER_VERSION) {
    throw new RangeError(`Unsupported Hydrology Solver version ${input.solveResult.solverVersion}.`);
  }
  if (input.hfinalSamples.length !== input.transform.hfinalResolution ** 2) {
    throw new RangeError("Lake candidate Hfinal samples do not match the selected Grid Profile.");
  }
  const identities = createBodyIdentities(input.worldIdentity, input.solveResult.bodies);
  if (!identities.some((record) => record.solved.solverBodyHandle === input.candidateSolverBodyHandle)) {
    throw new Error(`Lake candidate '${input.candidateSolverBodyHandle}' is absent from Planned Hydrology Solve.`);
  }
  const sorted = [...identities].sort((left, right) =>
    compareCanonicalBytes(canonicalSha256HexToBytes(left.bodyId), canonicalSha256HexToBytes(right.bodyId))
  );
  const bodyIndexBySolverHandle = new Map<string, number>();
  sorted.forEach((record, index) => bodyIndexBySolverHandle.set(record.solved.solverBodyHandle, index + 1));
  const lakeGridInput = createLakeGridCompileInput(
    input.transform,
    input.solveResult,
    (x, z) => input.hfinalSamples[z * input.transform.hfinalResolution + x]!
  );
  try {
    const lakeBasinTopology = createLakeBasinTopologyGrid(lakeGridInput, sorted, bodyIndexBySolverHandle);
    const lakeBasinSupport = createLakeBasinSupportGrid(
      lakeGridInput,
      sorted,
      bodyIndexBySolverHandle,
      lakeBasinTopology,
      input.candidateSolverBodyHandle
    );
    validateTentativeLakeOwnershipWithinSupport(
      lakeGridInput,
      sorted,
      bodyIndexBySolverHandle,
      lakeBasinSupport,
      input.candidateSolverBodyHandle
    );
    return SEED_WORLD_LAKE_CANDIDATE_ACCEPTED;
  } catch (error) {
    if (error instanceof SeedWorldLakeCandidateRejectionError) {
      return rejectSeedWorldLakeCandidate(error.reason, error.message);
    }
    throw error;
  }
}

export function sealSeedWorldHydrologyArtifactV1(
  input: Readonly<SealSeedWorldHydrologyArtifactInputV1>
): SeedWorldHydrologyArtifactV1 {
  validateSealerInput(input);
  const generationParametersHash = hashGenerationParameters(input);
  const identities = createBodyIdentities(input.worldIdentity, input.solveResult.bodies);
  const solvedLakeCount = identities.filter((record) => record.solved.waterType === "lake").length;
  if (input.lakeSearchDiagnostics.publishedCount !== solvedLakeCount) {
    throw new Error(
      `Hydrology Lake search published ${input.lakeSearchDiagnostics.publishedCount} bodies but Solve contains ${solvedLakeCount}.`
    );
  }
  const sorted = [...identities].sort((left, right) =>
    compareCanonicalBytes(canonicalSha256HexToBytes(left.bodyId), canonicalSha256HexToBytes(right.bodyId))
  );
  const bodyIndexBySolverHandle = new Map<string, number>();
  const bodyIdBySolverHandle = new Map<string, string>();
  sorted.forEach((record, index) => {
    bodyIndexBySolverHandle.set(record.solved.solverBodyHandle, index + 1);
    bodyIdBySolverHandle.set(record.solved.solverBodyHandle, record.bodyId);
  });
  const lakeGridInput = createLakeGridCompileInput(input.transform, input.solveResult, (x, z) =>
    input.hfinalSnapshot.canonicalView.sampleR16(x, z)
  );
  const lakeBasinTopology = createLakeBasinTopologyGrid(lakeGridInput, sorted, bodyIndexBySolverHandle);
  const lakeBasinSupport = createLakeBasinSupportGrid(
    lakeGridInput,
    sorted,
    bodyIndexBySolverHandle,
    lakeBasinTopology
  );
  const basinSupportHashByBodyIndex = new Map<number, string>();
  sorted.forEach((record, index) => {
    if (record.solved.waterType !== "lake") return;
    basinSupportHashByBodyIndex.set(
      index + 1,
      hashBodyLakeBasinSupport(record.bodyId, index + 1, lakeBasinTopology, lakeBasinSupport)
    );
  });
  const riverProfiles: SeedWorldRiverProfileV1[] = [];
  const catalogWithoutHashes = sorted.map((record, sortedIndex) => {
    const receiverBodyIds = Object.freeze(
      (record.solved.receiverSolverBodyHandles ?? [])
        .map((handle) => {
          const bodyId = bodyIdBySolverHandle.get(handle);
          if (!bodyId)
            throw new Error(`WaterBody '${record.solved.solverBodyHandle}' references unknown receiver '${handle}'.`);
          return bodyId;
        })
        .sort(compareDigestHex)
    );
    let riverProfileIndex: number | undefined;
    if (record.solved.waterType === "river") {
      if (!record.solved.riverProfile)
        throw new Error(`River '${record.solved.solverBodyHandle}' has no River Profile.`);
      validateRiverProfile(record.solved.riverProfile, input.transform);
      riverProfileIndex = riverProfiles.length;
      riverProfiles.push(
        Object.freeze({
          profileSchemaVersion: 1,
          bodyId: record.bodyId,
          samples: Object.freeze(record.solved.riverProfile.samples.map((sample) => Object.freeze({ ...sample })))
        })
      );
    } else if (record.solved.riverProfile) {
      throw new Error(
        `${record.solved.waterType} WaterBody '${record.solved.solverBodyHandle}' cannot publish a River Profile.`
      );
    }
    if (record.solved.waterType !== "river" && record.solved.uniformSurfaceHeightMillimetres === undefined) {
      throw new Error(
        `${record.solved.waterType} WaterBody '${record.solved.solverBodyHandle}' requires one surface height.`
      );
    }
    if (record.solved.waterType === "river" && record.solved.uniformSurfaceHeightMillimetres !== undefined) {
      throw new Error(
        `River '${record.solved.solverBodyHandle}' cannot replace its Profile with a uniform water level.`
      );
    }
    if (record.solved.waterType !== "lake" && record.solved.lakeShorelineMode !== undefined) {
      throw new Error(
        `${record.solved.waterType} WaterBody '${record.solved.solverBodyHandle}' cannot publish a Lake shoreline mode.`
      );
    }
    const lakeShorelineMode =
      record.solved.waterType === "lake" ? (record.solved.lakeShorelineMode ?? "terrain-crossing") : undefined;
    return {
      record,
      receiverBodyIds,
      ...(record.solved.waterType === "lake"
        ? { basinSupportHash: basinSupportHashByBodyIndex.get(sortedIndex + 1)!, lakeShorelineMode }
        : {}),
      ...(record.solved.uniformSurfaceHeightMillimetres === undefined
        ? {}
        : { uniformSurfaceHeightMillimetres: record.solved.uniformSurfaceHeightMillimetres }),
      ...(riverProfileIndex === undefined ? {} : { riverProfileIndex })
    };
  });
  const catalog = catalogWithoutHashes.map(({ record, receiverBodyIds, ...surface }) => {
    const bodySourceHash = hashBodySource(record, receiverBodyIds, surface, riverProfiles);
    return Object.freeze({
      bodyId: record.bodyId,
      waterType: record.solved.waterType,
      canonicalTopologyKeyBytes: record.topologyBytes.slice(),
      bodySourceHash,
      ...surface,
      ...(record.solved.basinId === undefined ? {} : { basinId: record.solved.basinId }),
      ...(record.solved.outletId === undefined ? {} : { outletId: record.solved.outletId }),
      receiverBodyIds,
      ...(record.solved.capacityLitres === undefined ? {} : { capacityLitres: record.solved.capacityLitres })
    });
  });

  const ownershipCounts = new Uint32Array(catalog.length);
  const ownershipSnapshot = createSeedWorldOwnershipTileSnapshot({
    transform: input.transform,
    pool: input.ownershipTilePool,
    valuesForTile: (tileId, tileCellWidth) => {
      const values = new Uint16Array(tileCellWidth * tileCellWidth);
      values.fill(SEED_WORLD_OWNERSHIP_INVALID);
      const tileX = tileId % SEED_WORLD_TILE_AXIS_COUNT;
      const tileZ = Math.floor(tileId / SEED_WORLD_TILE_AXIS_COUNT);
      for (let localZ = 0; localZ < tileCellWidth; localZ++) {
        for (let localX = 0; localX < tileCellWidth; localX++) {
          const x = tileX * tileCellWidth + localX;
          const z = tileZ * tileCellWidth + localZ;
          const solverHandle = input.solveResult.ownershipAt(x, z);
          if (solverHandle === undefined) throw new Error(`UNASSIGNED_WATER_OWNERSHIP at (${x}, ${z}).`);
          const index = localZ * tileCellWidth + localX;
          if (solverHandle === null) {
            values[index] = SEED_WORLD_OWNERSHIP_DRY;
            continue;
          }
          const bodyIndex = bodyIndexBySolverHandle.get(solverHandle);
          if (bodyIndex === undefined)
            throw new Error(`Ownership at (${x}, ${z}) references unknown body '${solverHandle}'.`);
          values[index] = bodyIndex;
          ownershipCounts[bodyIndex - 1]! += 1;
        }
      }
      return values;
    }
  });

  try {
    for (let index = 0; index < ownershipCounts.length; index++) {
      if (ownershipCounts[index] === 0)
        throw new Error(`WaterBody '${catalog[index]!.bodyId}' owns no published cell.`);
    }
    validateLakeBasinTopology(catalog, lakeBasinTopology);
    validateLakeBasinSupport(catalog, lakeBasinSupport);
    validateLakeOwnershipWithinSupport(catalog, lakeBasinSupport, ownershipSnapshot);
    validateWaterClearance(input, catalog, riverProfiles, ownershipSnapshot);
    const headerWithoutArtifactHash = {
      hydrologySchemaVersion: SEED_WORLD_HYDROLOGY_ARTIFACT_SCHEMA_VERSION,
      hydrologySolverVersion: input.solveResult.solverVersion,
      bodyIdentitySchemaVersion: SEED_WORLD_BODY_IDENTITY_SCHEMA_VERSION,
      canonicalWaterEncodingVersion: CANONICAL_WATER_ENCODING_VERSION,
      canonicalWaterHashAlgorithm: CANONICAL_WATER_HASH_ALGORITHM,
      authoringStateHash: input.authoringStateHash,
      hydrologyProfileHash: input.profile.hydrologyProfileHash,
      generationParametersHash,
      waterSemanticErrorBudgetHash: input.semanticErrorBudget.waterSemanticErrorBudgetHash,
      worldGridTransformHash: input.transform.worldGridTransformHash,
      ownershipSourceHash: ownershipSnapshot.ownershipSourceHash,
      analysisTerrainSourceHash: input.analysisTerrainSourceHash,
      baseTerrainSourceHash: input.baseTerrainSourceHash,
      terrainSourceHash: input.terrainSourceHash
    };
    const { artifactContentHash, canonicalPayloadBytes } = hashArtifact(
      headerWithoutArtifactHash,
      catalog,
      riverProfiles,
      lakeBasinTopology,
      lakeBasinSupport,
      ownershipSnapshot
    );
    const ownershipBytes = input.transform.ownershipResolution ** 2 * Uint16Array.BYTES_PER_ELEMENT;
    const artifactStructuralBytes = ownershipBytes + canonicalPayloadBytes;
    if (artifactStructuralBytes > SEED_WORLD_HYDROLOGY_ARTIFACT_MAXIMUM_BYTES) {
      throw new Error(
        `HYDROLOGY_ARTIFACT_EXCEEDS_HARD_LIMIT: ${artifactStructuralBytes} > ${SEED_WORLD_HYDROLOGY_ARTIFACT_MAXIMUM_BYTES}.`
      );
    }
    const header = Object.freeze({ ...headerWithoutArtifactHash, artifactContentHash });
    const diagnostics = Object.freeze({
      waterBodyCount: catalog.length,
      oceanCount: catalog.filter(({ waterType }) => waterType === "ocean").length,
      lakeCount: catalog.filter(({ waterType }) => waterType === "lake").length,
      riverCount: catalog.filter(({ waterType }) => waterType === "river").length,
      wetOwnershipCellCount: ownershipCounts.reduce((sum, count) => sum + count, 0),
      ownershipBytes,
      lakeBasinTopologyBytes: lakeBasinTopology.byteLength,
      lakeBasinSupportBytes: lakeBasinSupport.byteLength,
      canonicalPayloadBytes,
      artifactStructuralBytes,
      semanticFloatBranchCount: 0 as const,
      flattenedCopyBytes: 0 as const,
      maximumCount: input.lakeSearchDiagnostics.maximumCount,
      publishedCount: input.lakeSearchDiagnostics.publishedCount,
      attemptedCandidateCount: input.lakeSearchDiagnostics.attemptedCandidateCount,
      rejectionCounts: input.lakeSearchDiagnostics.rejectionCounts
    });
    return new SeedWorldHydrologyArtifactV1(
      header,
      Object.freeze(catalog),
      Object.freeze(riverProfiles),
      lakeBasinTopology,
      lakeBasinSupport,
      ownershipSnapshot,
      diagnostics
    );
  } catch (error) {
    ownershipSnapshot.release();
    throw error;
  }
}

function createLakeBasinTopologyGrid(
  input: Readonly<SeedWorldLakeGridCompileInputV1>,
  sortedBodies: readonly IdentityBodyRecord[],
  bodyIndexBySolverHandle: ReadonlyMap<string, number>
): SeedWorldLakeBasinTopologyGridV1 {
  const resolution = input.transform.analysisResolution;
  if (resolution !== SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION) {
    throw new Error("Hydrology Sealer requires the canonical Lake Basin Analysis Grid.");
  }
  const bodyIndices = new Uint16Array(resolution * resolution);
  const plannedStorageBodyIndices = new Uint16Array(resolution * resolution);
  const minimumConnectionLevelsMillimetres = new Int32Array(resolution * resolution);
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const sample = input.solveResult.lakeBasinSupportAt(x, z);
      if (sample === undefined) throw new Error(`UNASSIGNED_LAKE_BASIN_TOPOLOGY at (${x}, ${z}).`);
      if (sample === null) continue;
      const bodyIndex = bodyIndexBySolverHandle.get(sample.solverBodyHandle);
      if (bodyIndex === undefined) {
        throw new Error(`Lake Basin topology references unknown body '${sample.solverBodyHandle}'.`);
      }
      if (sortedBodies[bodyIndex - 1]!.solved.waterType !== "lake") {
        throw new Error(`Lake Basin topology references non-Lake body '${sample.solverBodyHandle}'.`);
      }
      if (typeof sample.plannedStorage !== "boolean") {
        throw new TypeError(`Lake Basin topology at (${x}, ${z}) has invalid planned storage state.`);
      }
      requireInt32(sample.minimumConnectionLevelMillimetres, "Lake Basin minimum connection level");
      const vertex = z * resolution + x;
      bodyIndices[vertex] = bodyIndex;
      if (sample.plannedStorage) plannedStorageBodyIndices[vertex] = bodyIndex;
      minimumConnectionLevelsMillimetres[vertex] = sample.minimumConnectionLevelMillimetres;
    }
  }
  return new SeedWorldLakeBasinTopologyGridV1(
    input.transform,
    bodyIndices,
    plannedStorageBodyIndices,
    minimumConnectionLevelsMillimetres,
    sortedBodies.length
  );
}

function createLakeBasinSupportGrid(
  input: Readonly<SeedWorldLakeGridCompileInputV1>,
  sortedBodies: readonly IdentityBodyRecord[],
  bodyIndexBySolverHandle: ReadonlyMap<string, number>,
  lakeBasinTopology: SeedWorldLakeBasinTopologyGridV1,
  recoverableCandidateSolverBodyHandle?: string
): SeedWorldLakeBasinSupportGridV1 {
  if (input.solveResult.lakeBasinFineSupportAt) {
    return createPublishedLakeBasinSupportGrid(input, sortedBodies, bodyIndexBySolverHandle);
  }
  const resolution = input.transform.hfinalResolution;
  const spacingMillimetres = input.transform.hfinalSpacingMillimetres;
  const heights = new Int32Array(resolution ** 2);
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      heights[z * resolution + x] = decodeR16HeightMillimetres(input.hfinalSampleR16At(x, z));
    }
  }
  const bodyIndices = new Uint16Array(resolution ** 2);
  const fineOwnershipBodyIndices = compileFineOwnershipSupportSeeds(input, bodyIndexBySolverHandle);
  for (const record of sortedBodies) {
    if (record.solved.waterType !== "lake") continue;
    const bodyIndex = bodyIndexBySolverHandle.get(record.solved.solverBodyHandle)!;
    const waterLevelMillimetres = record.solved.uniformSurfaceHeightMillimetres;
    if (waterLevelMillimetres === undefined) {
      throw new Error(`Lake '${record.solved.solverBodyHandle}' has no uniform surface height.`);
    }
    const shorelineMode = record.solved.lakeShorelineMode ?? "terrain-crossing";
    const visited = new Uint8Array(heights.length);
    const plannedDistance = new Uint16Array(heights.length);
    plannedDistance.fill(0xffff);
    const queue = new Uint32Array(heights.length);
    let head = 0;
    let tail = 0;
    const maximumPlannedExpansionVertices =
      Math.max(
        1,
        Math.ceil((input.transform.analysisSpacingMillimetres + spacingMillimetres) / (2 * spacingMillimetres))
      ) + SEED_WORLD_LAKE_SUPPORT_SHORELINE_GUARD_VERTICES;
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        if (
          !lakeBasinTopology.isPlannedStorageAtWorldOffset(bodyIndex, x * spacingMillimetres, z * spacingMillimetres)
        ) {
          continue;
        }
        const vertex = z * resolution + x;
        plannedDistance[vertex] = 0;
        queue[tail++] = vertex;
      }
    }
    if (tail === 0) {
      throwFineCandidateRejectionOrContract(
        record.solved.solverBodyHandle,
        recoverableCandidateSolverBodyHandle,
        "invalid-or-disconnected-footprint",
        `Lake '${record.solved.solverBodyHandle}' has no planned storage support.`
      );
    }
    while (head < tail) {
      const vertex = queue[head++]!;
      const distance = plannedDistance[vertex]!;
      if (distance >= maximumPlannedExpansionVertices) continue;
      const x = vertex % resolution;
      const z = Math.floor(vertex / resolution);
      expandPlannedDistance(x - 1, z - 1, distance + 1);
      expandPlannedDistance(x, z - 1, distance + 1);
      expandPlannedDistance(x + 1, z - 1, distance + 1);
      expandPlannedDistance(x - 1, z, distance + 1);
      expandPlannedDistance(x + 1, z, distance + 1);
      expandPlannedDistance(x - 1, z + 1, distance + 1);
      expandPlannedDistance(x, z + 1, distance + 1);
      expandPlannedDistance(x + 1, z + 1, distance + 1);
    }
    head = 0;
    tail = 0;
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const vertex = z * resolution + x;
        const fineOwned = fineOwnershipBodyIndices[vertex] === bodyIndex;
        if ((!fineOwned && plannedDistance[vertex] !== 0) || heights[vertex]! >= waterLevelMillimetres) continue;
        if (
          !fineOwned &&
          !lakeBasinTopology.isActiveAtWorldOffset(
            bodyIndex,
            waterLevelMillimetres,
            x * spacingMillimetres,
            z * spacingMillimetres
          )
        ) {
          continue;
        }
        visited[vertex] = 1;
        queue[tail++] = vertex;
      }
    }
    if (tail === 0) {
      throwFineCandidateRejectionOrContract(
        record.solved.solverBodyHandle,
        recoverableCandidateSolverBodyHandle,
        "invalid-or-disconnected-footprint",
        `Lake '${record.solved.solverBodyHandle}' has no fine Hfinal support seed.`
      );
    }
    while (head < tail) {
      const vertex = queue[head++]!;
      const x = vertex % resolution;
      const z = Math.floor(vertex / resolution);
      visit(x - 1, z);
      visit(x + 1, z);
      visit(x, z - 1);
      visit(x, z + 1);
    }
    for (let vertex = 0; vertex < visited.length; vertex++) {
      if (visited[vertex] === 0) continue;
      const x = vertex % resolution;
      const z = Math.floor(vertex / resolution);
      assertPlannedBoundaryClosed(x - 1, z);
      assertPlannedBoundaryClosed(x + 1, z);
      assertPlannedBoundaryClosed(x, z - 1);
      assertPlannedBoundaryClosed(x, z + 1);
    }
    for (let vertex = 0; vertex < visited.length; vertex++) {
      if (visited[vertex] === 0) continue;
      const x = vertex % resolution;
      const z = Math.floor(vertex / resolution);
      includeBodySupport(vertex, x, z);
    }
    // Ownership is Hydrology's fine, body-local surface core. Basin support
    // may be broader, but it must never punch a hole through an owned Lake
    // branch merely because the coarser Analysis-grid mask missed the curve.
    for (let vertex = 0; vertex < fineOwnershipBodyIndices.length; vertex++) {
      if (fineOwnershipBodyIndices[vertex] !== bodyIndex) continue;
      includeBodySupport(vertex, vertex % resolution, Math.floor(vertex / resolution));
    }
    // A one-Hfinal-vertex dry ring keeps the continuous height crossing inside
    // authoritative support without admitting another low component.
    for (let vertex = 0; vertex < visited.length; vertex++) {
      if (visited[vertex] === 0 && fineOwnershipBodyIndices[vertex] !== bodyIndex) continue;
      const x = vertex % resolution;
      const z = Math.floor(vertex / resolution);
      includeDryGuard(x - 1, z - 1);
      includeDryGuard(x, z - 1);
      includeDryGuard(x + 1, z - 1);
      includeDryGuard(x - 1, z);
      includeDryGuard(x + 1, z);
      includeDryGuard(x - 1, z + 1);
      includeDryGuard(x, z + 1);
      includeDryGuard(x + 1, z + 1);
    }

    function visit(x: number, z: number): void {
      if (x < 0 || z < 0 || x >= resolution || z >= resolution) return;
      const vertex = z * resolution + x;
      if (
        visited[vertex] !== 0 ||
        (fineOwnershipBodyIndices[vertex] !== bodyIndex && plannedDistance[vertex] > maximumPlannedExpansionVertices) ||
        heights[vertex]! >= waterLevelMillimetres!
      ) {
        return;
      }
      visited[vertex] = 1;
      queue[tail++] = vertex;
    }

    function expandPlannedDistance(x: number, z: number, distance: number): void {
      if (x < 0 || z < 0 || x >= resolution || z >= resolution) return;
      const vertex = z * resolution + x;
      if (plannedDistance[vertex]! <= distance) return;
      plannedDistance[vertex] = distance;
      queue[tail++] = vertex;
    }

    function assertPlannedBoundaryClosed(x: number, z: number): void {
      if (x < 0 || z < 0 || x >= resolution || z >= resolution) return;
      const vertex = z * resolution + x;
      if (
        visited[vertex] !== 0 ||
        plannedDistance[vertex]! <= maximumPlannedExpansionVertices ||
        heights[vertex]! >= waterLevelMillimetres!
      ) {
        return;
      }
      // A planned Lake/branch footprint can contain a real open outlet where
      // Terrain stays below its horizontal datum. Hydrology still owns the
      // bounded support domain; Water may not flood beyond it.
      if (shorelineMode === "planned-footprint") return;
      throw new Error(
        `LAKE_BASIN_SUPPORT_EXCEEDS_PLANNED_DOMAIN: '${record.solved.solverBodyHandle}' at (${x}, ${z}).`
      );
    }

    function includeBodySupport(vertex: number, x: number, z: number): void {
      if (x === 0 || z === 0 || x === resolution - 1 || z === resolution - 1) {
        throwFineCandidateRejectionOrContract(
          record.solved.solverBodyHandle,
          recoverableCandidateSolverBodyHandle,
          "world-boundary-clearance",
          `LAKE_BASIN_SUPPORT_REACHES_WORLD_BOUNDARY: '${record.solved.solverBodyHandle}'.`
        );
      }
      const existing = bodyIndices[vertex]!;
      if (existing !== 0 && existing !== bodyIndex) {
        const existingHandle = sortedBodies[existing - 1]?.solved.solverBodyHandle;
        if (!existingHandle) {
          throw new Error(`Fine Lake Basin support references missing body index ${existing}.`);
        }
        if (
          record.solved.solverBodyHandle === recoverableCandidateSolverBodyHandle ||
          existingHandle === recoverableCandidateSolverBodyHandle
        ) {
          throw new SeedWorldLakeCandidateRejectionError(
            "fine-basin-support-overlap",
            `LAKE_BASIN_SUPPORT_OVERLAP: bodies ${existing} and ${bodyIndex} share fine Hfinal vertex ${vertex}.`
          );
        }
        throw new Error(
          `LAKE_BASIN_SUPPORT_OVERLAP: bodies ${existing} and ${bodyIndex} share fine Hfinal vertex ${vertex}.`
        );
      }
      bodyIndices[vertex] = bodyIndex;
    }

    function includeDryGuard(x: number, z: number): void {
      if (x < 0 || z < 0 || x >= resolution || z >= resolution) return;
      const vertex = z * resolution + x;
      if (heights[vertex]! < waterLevelMillimetres! || bodyIndices[vertex] !== 0) return;
      bodyIndices[vertex] = bodyIndex;
    }
  }
  return new SeedWorldLakeBasinSupportGridV1(input.transform, bodyIndices, sortedBodies.length);
}

function throwFineCandidateRejectionOrContract(
  bodyHandle: string,
  recoverableCandidateSolverBodyHandle: string | undefined,
  reason: "world-boundary-clearance" | "invalid-or-disconnected-footprint",
  message: string
): never {
  if (bodyHandle === recoverableCandidateSolverBodyHandle) {
    throw new SeedWorldLakeCandidateRejectionError(reason, message);
  }
  throw new Error(message);
}

function compileFineOwnershipSupportSeeds(
  input: Readonly<SeedWorldLakeGridCompileInputV1>,
  bodyIndexBySolverHandle: ReadonlyMap<string, number>
): Uint16Array {
  const transform = input.transform;
  const resolution = transform.hfinalResolution;
  const result = new Uint16Array(resolution ** 2);
  const sampleRadiusMillimetres = Math.floor(transform.hfinalSpacingMillimetres / 2);
  for (let z = 0; z < resolution; z++) {
    const zOffsetMillimetres = z * transform.hfinalSpacingMillimetres;
    const minimumCellZ = Math.floor(
      Math.max(0, zOffsetMillimetres - sampleRadiusMillimetres) / transform.ownershipCellMillimetres
    );
    const maximumCellZ = Math.floor(
      Math.min(transform.worldSizeZMillimetres - 1, zOffsetMillimetres + sampleRadiusMillimetres) /
        transform.ownershipCellMillimetres
    );
    for (let x = 0; x < resolution; x++) {
      const xOffsetMillimetres = x * transform.hfinalSpacingMillimetres;
      const minimumCellX = Math.floor(
        Math.max(0, xOffsetMillimetres - sampleRadiusMillimetres) / transform.ownershipCellMillimetres
      );
      const maximumCellX = Math.floor(
        Math.min(transform.worldSizeXMillimetres - 1, xOffsetMillimetres + sampleRadiusMillimetres) /
          transform.ownershipCellMillimetres
      );
      let selectedBodyIndex = 0;
      let ambiguous = false;
      for (let ownershipZ = minimumCellZ; ownershipZ <= maximumCellZ && !ambiguous; ownershipZ++) {
        for (let ownershipX = minimumCellX; ownershipX <= maximumCellX; ownershipX++) {
          const solverBodyHandle = input.solveResult.ownershipAt(ownershipX, ownershipZ);
          if (solverBodyHandle === undefined) {
            throw new Error(`UNASSIGNED_WATER_OWNERSHIP at (${ownershipX}, ${ownershipZ}).`);
          }
          if (solverBodyHandle === null) continue;
          const bodyIndex = bodyIndexBySolverHandle.get(solverBodyHandle);
          if (bodyIndex === undefined) {
            throw new Error(
              `Ownership at (${ownershipX}, ${ownershipZ}) references unknown body '${solverBodyHandle}'.`
            );
          }
          if (selectedBodyIndex === 0) selectedBodyIndex = bodyIndex;
          else if (selectedBodyIndex !== bodyIndex) {
            ambiguous = true;
            break;
          }
        }
      }
      if (!ambiguous) result[z * resolution + x] = selectedBodyIndex;
    }
  }
  return result;
}

function createPublishedLakeBasinSupportGrid(
  input: Readonly<SeedWorldLakeGridCompileInputV1>,
  sortedBodies: readonly IdentityBodyRecord[],
  bodyIndexBySolverHandle: ReadonlyMap<string, number>
): SeedWorldLakeBasinSupportGridV1 {
  const resolution = input.transform.hfinalResolution;
  const bodyIndices = new Uint16Array(resolution ** 2);
  const supportAt = input.solveResult.lakeBasinFineSupportAt!;
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const solverHandle = supportAt(x, z);
      if (solverHandle === undefined) throw new Error(`UNASSIGNED_FINE_LAKE_BASIN_SUPPORT at (${x}, ${z}).`);
      if (solverHandle === null) continue;
      const bodyIndex = bodyIndexBySolverHandle.get(solverHandle);
      if (bodyIndex === undefined) {
        throw new Error(`Fine Lake Basin support references unknown body '${solverHandle}'.`);
      }
      if (sortedBodies[bodyIndex - 1]!.solved.waterType !== "lake") {
        throw new Error(`Fine Lake Basin support references non-Lake body '${solverHandle}'.`);
      }
      bodyIndices[z * resolution + x] = bodyIndex;
    }
  }
  return new SeedWorldLakeBasinSupportGridV1(input.transform, bodyIndices, sortedBodies.length);
}

function hashBodyLakeBasinSupport(
  bodyId: string,
  bodyIndex: number,
  topology: SeedWorldLakeBasinTopologyGridV1,
  support: SeedWorldLakeBasinSupportGridV1
): string {
  const entries: Array<
    Readonly<{ vertex: number; plannedStorage: boolean; minimumConnectionLevelMillimetres: number }>
  > = [];
  topology.forEachVertex((sample, vertex) => {
    if (sample.bodyIndex === bodyIndex) {
      entries.push(
        Object.freeze({
          vertex,
          plannedStorage: sample.plannedStorageBodyIndex === bodyIndex,
          minimumConnectionLevelMillimetres: sample.minimumConnectionLevelMillimetres
        })
      );
    }
  });
  if (entries.length === 0) throw new Error(`Lake '${bodyId}' owns no Basin topology vertex.`);
  const supportVertices: number[] = [];
  support.forEachVertex((supportBodyIndex, vertex) => {
    if (supportBodyIndex === bodyIndex) supportVertices.push(vertex);
  });
  if (supportVertices.length === 0) throw new Error(`Lake '${bodyId}' owns no fine Basin support vertex.`);
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/lake-basin-support/v3", 3)
    .writeFixedBytes(canonicalSha256HexToBytes(bodyId), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(topology.transform.worldGridTransformHash), 32)
    .writeArray(entries, (itemWriter, entry) => {
      itemWriter
        .writeUint32(entry.vertex)
        .writeBoolean(entry.plannedStorage)
        .writeInt32(entry.minimumConnectionLevelMillimetres);
    })
    .writeArray(supportVertices, (itemWriter, vertex) => itemWriter.writeUint32(vertex));
  return hash.digestHex();
}

function validateLakeBasinTopology(
  catalog: readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[],
  topology: SeedWorldLakeBasinTopologyGridV1
): void {
  const supportCounts = new Uint32Array(catalog.length);
  const plannedStorageCounts = new Uint32Array(catalog.length);
  topology.forEachVertex(({ bodyIndex, plannedStorageBodyIndex }) => {
    if (bodyIndex === 0) return;
    const body = catalog[bodyIndex - 1];
    if (!body || body.waterType !== "lake") {
      throw new Error(`Lake Basin topology references invalid catalog body index ${bodyIndex}.`);
    }
    supportCounts[bodyIndex - 1]! += 1;
    if (plannedStorageBodyIndex === bodyIndex) plannedStorageCounts[bodyIndex - 1]! += 1;
  });
  for (let index = 0; index < catalog.length; index++) {
    const body = catalog[index]!;
    if (body.waterType === "lake") {
      requireHash(body.basinSupportHash ?? "", `Lake '${body.bodyId}' basinSupportHash`);
      if (supportCounts[index] === 0) throw new Error(`Lake '${body.bodyId}' has no Basin topology support.`);
      if (plannedStorageCounts[index] === 0) {
        throw new Error(`Lake '${body.bodyId}' has no planned storage topology.`);
      }
      if (
        body.uniformSurfaceHeightMillimetres === undefined ||
        !topology.activeBoundsMillimetres(index + 1, body.uniformSurfaceHeightMillimetres)
      ) {
        throw new Error(`Lake '${body.bodyId}' has no active Basin support at its published water level.`);
      }
    } else if (body.basinSupportHash !== undefined) {
      throw new Error(`${body.waterType} WaterBody '${body.bodyId}' cannot publish Lake Basin support.`);
    }
  }
}

function validateLakeBasinSupport(
  catalog: readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[],
  support: SeedWorldLakeBasinSupportGridV1
): void {
  const supportCounts = new Uint32Array(catalog.length);
  support.forEachVertex((bodyIndex) => {
    if (bodyIndex === 0) return;
    const body = catalog[bodyIndex - 1];
    if (!body || body.waterType !== "lake") {
      throw new Error(`Fine Lake Basin support references invalid catalog body index ${bodyIndex}.`);
    }
    supportCounts[bodyIndex - 1]! += 1;
  });
  for (let index = 0; index < catalog.length; index++) {
    const body = catalog[index]!;
    if (body.waterType === "lake" && (supportCounts[index] === 0 || !support.boundsMillimetres(index + 1))) {
      throw new Error(`Lake '${body.bodyId}' has no fine Basin support domain.`);
    }
  }
}

function validateLakeOwnershipWithinSupport(
  catalog: readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[],
  support: SeedWorldLakeBasinSupportGridV1,
  ownership: SeedWorldOwnershipTileSnapshot
): void {
  const transform = ownership.canonicalView.transform;
  const cellSizeMillimetres = transform.ownershipCellMillimetres;
  ownership.canonicalView.forEachRow((z, sampleAtX) => {
    for (let x = 0; x < ownership.canonicalView.resolution; x++) {
      const bodyIndex = sampleAtX(x);
      if (bodyIndex === SEED_WORLD_OWNERSHIP_DRY) continue;
      const body = catalog[bodyIndex - 1];
      if (!body || body.waterType !== "lake") continue;
      const xOffsetMillimetres = x * cellSizeMillimetres + Math.floor(cellSizeMillimetres / 2);
      const zOffsetMillimetres = z * cellSizeMillimetres + Math.floor(cellSizeMillimetres / 2);
      if (!support.sampleSupportAtWorldOffset(bodyIndex, xOffsetMillimetres, zOffsetMillimetres)) {
        throw new Error(`LAKE_OWNERSHIP_OUTSIDE_BASIN_SUPPORT: '${body.bodyId}' at Ownership cell (${x}, ${z}).`);
      }
    }
  });
}

function validateTentativeLakeOwnershipWithinSupport(
  input: Readonly<SeedWorldLakeGridCompileInputV1>,
  sortedBodies: readonly IdentityBodyRecord[],
  bodyIndexBySolverHandle: ReadonlyMap<string, number>,
  support: SeedWorldLakeBasinSupportGridV1,
  recoverableCandidateSolverBodyHandle: string
): void {
  const candidateBodyIndex = bodyIndexBySolverHandle.get(recoverableCandidateSolverBodyHandle);
  if (candidateBodyIndex === undefined) {
    throw new Error(`Lake candidate '${recoverableCandidateSolverBodyHandle}' has no canonical body index.`);
  }
  if (sortedBodies[candidateBodyIndex - 1]?.solved.waterType !== "lake") {
    throw new Error(`Lake candidate '${recoverableCandidateSolverBodyHandle}' is not a Lake WaterBody.`);
  }
  const transform = input.transform;
  const cellSizeMillimetres = transform.ownershipCellMillimetres;
  for (let z = 0; z < transform.ownershipResolution; z++) {
    for (let x = 0; x < transform.ownershipResolution; x++) {
      const solverHandle = input.solveResult.ownershipAt(x, z);
      if (solverHandle === undefined) throw new Error(`UNASSIGNED_WATER_OWNERSHIP at (${x}, ${z}).`);
      if (solverHandle === null) continue;
      const bodyIndex = bodyIndexBySolverHandle.get(solverHandle);
      if (bodyIndex === undefined) {
        throw new Error(`Ownership at (${x}, ${z}) references unknown body '${solverHandle}'.`);
      }
      if (sortedBodies[bodyIndex - 1]?.solved.waterType !== "lake") continue;
      const xOffsetMillimetres = x * cellSizeMillimetres + Math.floor(cellSizeMillimetres / 2);
      const zOffsetMillimetres = z * cellSizeMillimetres + Math.floor(cellSizeMillimetres / 2);
      if (support.sampleSupportAtWorldOffset(bodyIndex, xOffsetMillimetres, zOffsetMillimetres)) continue;
      throw new SeedWorldLakeCandidateRejectionError(
        "ownership-outside-basin-support",
        `LAKE_OWNERSHIP_OUTSIDE_BASIN_SUPPORT: '${solverHandle}' at Ownership cell (${x}, ${z}).`
      );
    }
  }
}

function validateSealerInput(input: Readonly<SealSeedWorldHydrologyArtifactInputV1>): void {
  if (typeof input.worldIdentity !== "string" || input.worldIdentity.trim().length === 0) {
    throw new TypeError("Hydrology Sealer requires a stable worldIdentity.");
  }
  requireHash(input.authoringStateHash, "authoringStateHash");
  requireHash(input.analysisTerrainSourceHash, "analysisTerrainSourceHash");
  requireHash(input.baseTerrainSourceHash, "baseTerrainSourceHash");
  requireHash(input.terrainSourceHash, "terrainSourceHash");
  requireHash(input.semanticErrorBudget.waterSemanticErrorBudgetHash, "waterSemanticErrorBudgetHash");
  requireSeedWorldHydrologyProfileV1(input.profile);
  if (input.solveResult.solverVersion !== SEED_WORLD_HYDROLOGY_SOLVER_VERSION) {
    throw new RangeError(`Unsupported Hydrology Solver version ${input.solveResult.solverVersion}.`);
  }
  if (input.solveResult.bodies.length > SEED_WORLD_MAXIMUM_WATER_BODY_COUNT) {
    throw new Error("WATER_BODY_COUNT_EXCEEDS_UINT16_CAPACITY");
  }
  const verifiedLakeSearchDiagnostics = freezeSeedWorldLakeSearchDiagnostics(
    input.lakeSearchDiagnostics.publishedCount,
    input.lakeSearchDiagnostics.attemptedCandidateCount,
    input.lakeSearchDiagnostics.rejectionCounts
  );
  if (input.lakeSearchDiagnostics.maximumCount !== verifiedLakeSearchDiagnostics.maximumCount) {
    throw new Error("Hydrology Lake search diagnostics contradict the optional slot contract.");
  }
  if (input.hfinalSnapshot.transform.worldGridTransformHash !== input.transform.worldGridTransformHash) {
    throw new Error("Hfinal and Hydrology WorldGridTransform hashes differ.");
  }
}

function createBodyIdentities(
  worldIdentity: string,
  bodies: readonly Readonly<SeedWorldSolvedWaterBodyV1>[]
): readonly IdentityBodyRecord[] {
  const handles = new Set<string>();
  const topologyByBytes = new Map<string, string>();
  const identityByBodyId = new Map<string, string>();
  return bodies.map((solved) => {
    if (typeof solved.solverBodyHandle !== "string" || solved.solverBodyHandle.length === 0) {
      throw new TypeError("Hydrology Solver body handle must be non-empty.");
    }
    if (handles.has(solved.solverBodyHandle))
      throw new Error(`Duplicate Solver body handle '${solved.solverBodyHandle}'.`);
    handles.add(solved.solverBodyHandle);
    validateTopologyForWaterType(solved.waterType, solved.canonicalTopologyKey);
    const topologyBytes = encodeCanonicalTopologyKey(solved.canonicalTopologyKey);
    const topologyIdentity = `${solved.waterType}:${bytesToHex(topologyBytes)}`;
    const previousHandle = topologyByBytes.get(topologyIdentity);
    if (previousHandle) {
      throw new Error(`DUPLICATE_CANONICAL_TOPOLOGY_KEY: '${previousHandle}' and '${solved.solverBodyHandle}'.`);
    }
    topologyByBytes.set(topologyIdentity, solved.solverBodyHandle);
    const { writer, hash } = createCanonicalWaterHashWriter();
    writer
      .writeRecord("seed-world-water/body-id/v1", SEED_WORLD_BODY_IDENTITY_SCHEMA_VERSION)
      .writeString(worldIdentity)
      .writeUint8(waterTypeTag(solved.waterType))
      .writeBytes(topologyBytes);
    const bodyId = hash.digestHex();
    const priorIdentity = identityByBodyId.get(bodyId);
    if (priorIdentity && priorIdentity !== topologyIdentity) throw new Error("HASH_COLLISION_DETECTED for bodyId.");
    identityByBodyId.set(bodyId, topologyIdentity);
    return Object.freeze({ solved, topologyBytes, bodyId });
  });
}

function encodeCanonicalTopologyKey(topology: SeedWorldCanonicalTopologyKeyV1): Uint8Array {
  const collector = new CanonicalWaterByteCollector();
  const writer = new CanonicalWaterBinaryWriterV1(collector);
  if (topology.kind === "ocean-v1") {
    const portals = sortedUniqueIdentityVertices(topology.boundaryPortalAnchorVertexIds, "Ocean boundary Portal");
    if (portals.length === 0) throw new Error("Ocean topology requires at least one boundary Portal.");
    writer.writeRecord("seed-world-water/ocean-topology-key/v1", 1).writeArray(portals, (itemWriter, value) => {
      itemWriter.writeUint32(value);
    });
  } else if (topology.kind === "lake-v1") {
    const sinks = sortedUniqueIdentityVertices(topology.basinSinkAnchorVertexIds, "Lake Basin Sink");
    if (sinks.length === 0) throw new Error("Lake topology requires at least one Basin Sink.");
    writer.writeRecord("seed-world-water/lake-topology-key/v1", 1).writeArray(sinks, (itemWriter, value) => {
      itemWriter.writeUint32(value);
    });
    writeNodeKey(writer, topology.outletNodeKey);
    writer.writeOptional(topology.receiverNodeKey, (itemWriter, value) => writeNodeKey(itemWriter, value));
  } else {
    writer.writeRecord("seed-world-water/river-reach-topology-key/v1", 1);
    writeNodeKey(writer, topology.fromNodeKey);
    writeNodeKey(writer, topology.toNodeKey);
    if (sameNodeKey(topology.fromNodeKey, topology.toNodeKey)) {
      throw new Error("River Reach cannot start and end at the same canonical Node Key.");
    }
  }
  return collector.bytes();
}

function hashBodySource(
  record: IdentityBodyRecord,
  receiverBodyIds: readonly string[],
  surface: Readonly<{
    uniformSurfaceHeightMillimetres?: number;
    riverProfileIndex?: number;
    basinSupportHash?: string;
    lakeShorelineMode?: SeedWorldLakeShorelineModeV1;
  }>,
  riverProfiles: readonly SeedWorldRiverProfileV1[]
): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/body-source/v5", SEED_WORLD_BODY_SOURCE_SCHEMA_VERSION)
    .writeFixedBytes(canonicalSha256HexToBytes(record.bodyId), 32)
    .writeUint8(waterTypeTag(record.solved.waterType))
    .writeBytes(record.topologyBytes)
    .writeOptional(surface.uniformSurfaceHeightMillimetres, (itemWriter, value) => itemWriter.writeInt32(value))
    .writeOptional(surface.basinSupportHash, (itemWriter, value) =>
      itemWriter.writeFixedBytes(canonicalSha256HexToBytes(value), 32)
    )
    .writeOptional(surface.lakeShorelineMode, (itemWriter, value) => itemWriter.writeUint8(lakeShorelineModeTag(value)))
    .writeOptional(record.solved.basinId, (itemWriter, value) => itemWriter.writeString(value))
    .writeOptional(record.solved.outletId, (itemWriter, value) => itemWriter.writeString(value))
    .writeArray(receiverBodyIds, (itemWriter, value) =>
      itemWriter.writeFixedBytes(canonicalSha256HexToBytes(value), 32)
    )
    .writeOptional(record.solved.capacityLitres, (itemWriter, value) => itemWriter.writeUint64(value));
  if (surface.riverProfileIndex === undefined) writer.writeUint8(0);
  else {
    writer.writeUint8(1);
    writeRiverProfile(writer, riverProfiles[surface.riverProfileIndex]!);
  }
  return hash.digestHex();
}

function hashGenerationParameters(input: Readonly<SealSeedWorldHydrologyArtifactInputV1>): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/generation-parameters/v1", 1)
    .writeFixedBytes(canonicalSha256HexToBytes(input.authoringStateHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(input.profile.hydrologyProfileHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(input.semanticErrorBudget.waterSemanticErrorBudgetHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(input.transform.worldGridTransformHash), 32);
  return hash.digestHex();
}

function hashArtifact(
  header: Omit<SeedWorldHydrologyArtifactHeaderV1, "artifactContentHash">,
  catalog: readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[],
  riverProfiles: readonly Readonly<SeedWorldRiverProfileV1>[],
  lakeBasinTopology: SeedWorldLakeBasinTopologyGridV1,
  lakeBasinSupport: SeedWorldLakeBasinSupportGridV1,
  ownership: SeedWorldOwnershipTileSnapshot
): { readonly artifactContentHash: string; readonly canonicalPayloadBytes: number } {
  const { writer, hash } = createCanonicalWaterHashWriter();
  let canonicalPayloadBytes = 0;
  writer.writeRecord("seed-world-water/artifact/v7", header.hydrologySchemaVersion);
  writeHeaderWithoutArtifactHash(writer, header);
  writer.writeUint32(catalog.length);
  for (const body of catalog) {
    writeCatalogEntry(writer, body);
    canonicalPayloadBytes += body.canonicalTopologyKeyBytes.byteLength + 256;
  }
  writer.writeUint32(riverProfiles.length);
  for (const profile of riverProfiles) {
    writeRiverProfile(writer, profile);
    canonicalPayloadBytes += profile.samples.length * 28 + 64;
  }
  writer
    .writeUint16(lakeBasinTopology.schemaVersion)
    .writeUint16(lakeBasinTopology.resolution)
    .writeUint32(lakeBasinTopology.spacingMillimetres)
    .writeFixedBytes(canonicalSha256HexToBytes(lakeBasinTopology.contentHash), 32);
  lakeBasinTopology.forEachVertex(({ bodyIndex, plannedStorageBodyIndex, minimumConnectionLevelMillimetres }) => {
    writer.writeUint16(bodyIndex).writeUint16(plannedStorageBodyIndex).writeInt32(minimumConnectionLevelMillimetres);
  });
  canonicalPayloadBytes += lakeBasinTopology.byteLength + 40;
  writer
    .writeUint16(lakeBasinSupport.schemaVersion)
    .writeUint16(lakeBasinSupport.resolution)
    .writeUint32(lakeBasinSupport.spacingMillimetres)
    .writeFixedBytes(canonicalSha256HexToBytes(lakeBasinSupport.contentHash), 32);
  lakeBasinSupport.forEachVertex((bodyIndex) => writer.writeUint16(bodyIndex));
  canonicalPayloadBytes += lakeBasinSupport.byteLength + 40;
  writer.writeUint16(SEED_WORLD_OWNERSHIP_SCHEMA_VERSION).writeUint32(ownership.canonicalView.resolution);
  ownership.canonicalView.forEachRow((_z, sampleAtX) => {
    for (let x = 0; x < ownership.canonicalView.resolution; x++) {
      writer.writeUint16(sampleAtX(x));
    }
  });
  return Object.freeze({ artifactContentHash: hash.digestHex(), canonicalPayloadBytes });
}

function writeHeaderWithoutArtifactHash(
  writer: CanonicalWaterBinaryWriterV1,
  header: Omit<SeedWorldHydrologyArtifactHeaderV1, "artifactContentHash">
): void {
  writer
    .writeUint16(header.hydrologySolverVersion)
    .writeUint16(header.bodyIdentitySchemaVersion)
    .writeUint16(header.canonicalWaterEncodingVersion)
    .writeString(header.canonicalWaterHashAlgorithm)
    .writeFixedBytes(canonicalSha256HexToBytes(header.authoringStateHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(header.hydrologyProfileHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(header.generationParametersHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(header.waterSemanticErrorBudgetHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(header.worldGridTransformHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(header.ownershipSourceHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(header.analysisTerrainSourceHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(header.baseTerrainSourceHash), 32)
    .writeFixedBytes(canonicalSha256HexToBytes(header.terrainSourceHash), 32);
}

function writeCatalogEntry(writer: CanonicalWaterBinaryWriterV1, body: SeedWorldWaterBodyCatalogEntryV1): void {
  writer
    .writeRecord("seed-world-water/catalog-body/v3", 3)
    .writeFixedBytes(canonicalSha256HexToBytes(body.bodyId), 32)
    .writeUint8(waterTypeTag(body.waterType))
    .writeBytes(body.canonicalTopologyKeyBytes)
    .writeFixedBytes(canonicalSha256HexToBytes(body.bodySourceHash), 32)
    .writeOptional(body.uniformSurfaceHeightMillimetres, (itemWriter, value) => itemWriter.writeInt32(value))
    .writeOptional(body.riverProfileIndex, (itemWriter, value) => itemWriter.writeUint32(value))
    .writeOptional(body.basinId, (itemWriter, value) => itemWriter.writeString(value))
    .writeOptional(body.outletId, (itemWriter, value) => itemWriter.writeString(value))
    .writeOptional(body.basinSupportHash, (itemWriter, value) =>
      itemWriter.writeFixedBytes(canonicalSha256HexToBytes(value), 32)
    )
    .writeOptional(body.lakeShorelineMode, (itemWriter, value) => itemWriter.writeUint8(lakeShorelineModeTag(value)))
    .writeArray(body.receiverBodyIds, (itemWriter, value) =>
      itemWriter.writeFixedBytes(canonicalSha256HexToBytes(value), 32)
    )
    .writeOptional(body.capacityLitres, (itemWriter, value) => itemWriter.writeUint64(value));
}

function writeRiverProfile(writer: CanonicalWaterBinaryWriterV1, profile: SeedWorldRiverProfileV1): void {
  writer
    .writeRecord("seed-world-water/river-profile/v1", profile.profileSchemaVersion)
    .writeFixedBytes(canonicalSha256HexToBytes(profile.bodyId), 32)
    .writeArray(profile.samples, (itemWriter, sample) => {
      itemWriter
        .writeUint32(sample.xOffsetMillimetres)
        .writeUint32(sample.zOffsetMillimetres)
        .writeInt32(sample.surfaceHeightMillimetres)
        .writeUint32(sample.widthMillimetres)
        .writeUint32(sample.depthMillimetres)
        .writeUint32(sample.velocityMillimetresPerSecond)
        .writeUint32(sample.distanceMillimetres);
    });
}

function validateRiverProfile(
  profile: Omit<SeedWorldRiverProfileV1, "bodyId">,
  transform: SeedWorldWaterGridTransformV1
): void {
  if (profile.profileSchemaVersion !== 1 || profile.samples.length < 2) {
    throw new Error("River Profile requires schema v1 and at least two samples.");
  }
  let previousDistance = -1;
  let previousSurface: number | undefined;
  for (const sample of profile.samples) {
    const unsigned = [
      sample.xOffsetMillimetres,
      sample.zOffsetMillimetres,
      sample.widthMillimetres,
      sample.depthMillimetres,
      sample.velocityMillimetresPerSecond,
      sample.distanceMillimetres
    ];
    if (unsigned.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffff_ffff)) {
      throw new RangeError("River Profile contains an invalid unsigned canonical metric.");
    }
    if (!Number.isInteger(sample.surfaceHeightMillimetres)) {
      throw new RangeError("River Profile surface height must be an Int32 millimetre value.");
    }
    if (
      sample.xOffsetMillimetres > transform.worldSizeXMillimetres ||
      sample.zOffsetMillimetres > transform.worldSizeZMillimetres
    ) {
      throw new RangeError("River Profile sample lies outside the WorldGridTransform.");
    }
    if (sample.distanceMillimetres <= previousDistance) {
      throw new Error("River Profile distance must increase strictly downstream.");
    }
    if (previousSurface !== undefined && sample.surfaceHeightMillimetres > previousSurface) {
      throw new Error("River Profile surface must not rise downstream.");
    }
    previousDistance = sample.distanceMillimetres;
    previousSurface = sample.surfaceHeightMillimetres;
  }
}

function validateWaterClearance(
  input: Readonly<SealSeedWorldHydrologyArtifactInputV1>,
  catalog: readonly Readonly<SeedWorldWaterBodyCatalogEntryV1>[],
  riverProfiles: readonly Readonly<SeedWorldRiverProfileV1>[],
  ownership: SeedWorldOwnershipTileSnapshot
): void {
  const ownershipCell = input.transform.ownershipCellMillimetres;
  ownership.canonicalView.forEachRow((z, sampleAtX) => {
    for (let x = 0; x < ownership.canonicalView.resolution; x++) {
      const bodyIndex = sampleAtX(x);
      if (bodyIndex === SEED_WORLD_OWNERSHIP_DRY) continue;
      if (bodyIndex === SEED_WORLD_OWNERSHIP_INVALID || bodyIndex > catalog.length) {
        throw new Error(`Invalid published Ownership bodyIndex ${bodyIndex} at (${x}, ${z}).`);
      }
      const body = catalog[bodyIndex - 1]!;
      const worldXOffsetMillimetres = x * ownershipCell + Math.floor(ownershipCell * 0.5);
      const worldZOffsetMillimetres = z * ownershipCell + Math.floor(ownershipCell * 0.5);
      const surfaceHeightMillimetres =
        body.uniformSurfaceHeightMillimetres ??
        sampleSeedWorldRiverSurfaceHeightMillimetres(
          riverProfiles[body.riverProfileIndex!]!,
          worldXOffsetMillimetres,
          worldZOffsetMillimetres
        );
      if (
        !isSurfaceAboveBilinearHfinal(
          input.hfinalSnapshot,
          worldXOffsetMillimetres,
          worldZOffsetMillimetres,
          surfaceHeightMillimetres,
          input.semanticErrorBudget.interiorClearanceToleranceMillimetres
        )
      ) {
        throw new Error(`WATER_INTERIOR_CLEARANCE_FAILED for '${body.bodyId}' at Ownership (${x}, ${z}).`);
      }
    }
  });
}

function isSurfaceAboveBilinearHfinal(
  snapshot: SeedWorldHeightTileSnapshot,
  xOffsetMillimetres: number,
  zOffsetMillimetres: number,
  surfaceHeightMillimetres: number,
  clearanceMillimetres: number
): boolean {
  const spacing = snapshot.transform.hfinalSpacingMillimetres;
  const maximumVertex = snapshot.transform.hfinalResolution - 1;
  const x0 = Math.min(maximumVertex, Math.floor(xOffsetMillimetres / spacing));
  const z0 = Math.min(maximumVertex, Math.floor(zOffsetMillimetres / spacing));
  const x1 = Math.min(maximumVertex, x0 + 1);
  const z1 = Math.min(maximumVertex, z0 + 1);
  const remainderX = x1 === x0 ? 0 : xOffsetMillimetres - x0 * spacing;
  const remainderZ = z1 === z0 ? 0 : zOffsetMillimetres - z0 * spacing;
  const inverseX = spacing - remainderX;
  const inverseZ = spacing - remainderZ;
  const denominator = BigInt(spacing) * BigInt(spacing);
  const weightedR16 =
    BigInt(snapshot.canonicalView.sampleR16(x0, z0)) * BigInt(inverseX) * BigInt(inverseZ) +
    BigInt(snapshot.canonicalView.sampleR16(x1, z0)) * BigInt(remainderX) * BigInt(inverseZ) +
    BigInt(snapshot.canonicalView.sampleR16(x0, z1)) * BigInt(inverseX) * BigInt(remainderZ) +
    BigInt(snapshot.canonicalView.sampleR16(x1, z1)) * BigInt(remainderX) * BigInt(remainderZ);
  const scaledSurface =
    BigInt(surfaceHeightMillimetres - clearanceMillimetres - SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES) *
    65_535n *
    denominator;
  const scaledBed = BigInt(SEED_WORLD_R16_HEIGHT_SPAN_MILLIMETRES) * weightedR16;
  return scaledSurface > scaledBed;
}

function sampleSeedWorldRiverSurfaceHeightMillimetres(
  profile: SeedWorldRiverProfileV1,
  xOffsetMillimetres: number,
  zOffsetMillimetres: number
): number {
  let bestNumerator = 0n;
  let bestDenominator = 1n;
  let bestDistanceNumerator: bigint | undefined;
  let bestDistanceDenominator = 1n;
  for (let index = 1; index < profile.samples.length; index++) {
    const from = profile.samples[index - 1]!;
    const to = profile.samples[index]!;
    const dx = BigInt(to.xOffsetMillimetres - from.xOffsetMillimetres);
    const dz = BigInt(to.zOffsetMillimetres - from.zOffsetMillimetres);
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared === 0n) throw new Error(`River Profile '${profile.bodyId}' contains duplicate positions.`);
    const px = BigInt(xOffsetMillimetres - from.xOffsetMillimetres);
    const pz = BigInt(zOffsetMillimetres - from.zOffsetMillimetres);
    const projection = clampBigInt(px * dx + pz * dz, 0n, lengthSquared);
    const closestXNumerator = BigInt(from.xOffsetMillimetres) * lengthSquared + dx * projection;
    const closestZNumerator = BigInt(from.zOffsetMillimetres) * lengthSquared + dz * projection;
    const deltaXNumerator = BigInt(xOffsetMillimetres) * lengthSquared - closestXNumerator;
    const deltaZNumerator = BigInt(zOffsetMillimetres) * lengthSquared - closestZNumerator;
    const distanceNumerator = deltaXNumerator * deltaXNumerator + deltaZNumerator * deltaZNumerator;
    const distanceDenominator = lengthSquared * lengthSquared;
    if (
      bestDistanceNumerator === undefined ||
      distanceNumerator * bestDistanceDenominator < bestDistanceNumerator * distanceDenominator
    ) {
      bestDistanceNumerator = distanceNumerator;
      bestDistanceDenominator = distanceDenominator;
      bestNumerator =
        BigInt(from.surfaceHeightMillimetres) * (lengthSquared - projection) +
        BigInt(to.surfaceHeightMillimetres) * projection;
      bestDenominator = lengthSquared;
    }
  }
  return divideRoundTiesToEven(bestNumerator, bestDenominator);
}

function divideRoundTiesToEven(numerator: bigint, denominator: bigint): number {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absoluteTwiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  let rounded = quotient;
  if (absoluteTwiceRemainder > denominator) rounded += numerator >= 0n ? 1n : -1n;
  else if (absoluteTwiceRemainder === denominator && (quotient & 1n) !== 0n) {
    rounded += numerator >= 0n ? 1n : -1n;
  }
  const numeric = Number(rounded);
  if (!Number.isSafeInteger(numeric)) throw new RangeError("River Profile interpolation exceeds safe integer range.");
  return numeric;
}

function writeNodeKey(writer: CanonicalWaterBinaryWriterV1, node: SeedWorldHydrologyIdentityNodeKeyV1): void {
  validateNodeKey(node);
  writer.writeUint8(nodeKindTag(node.kind)).writeUint32(node.identityVertexId);
}

function validateTopologyForWaterType(
  waterType: SeedWorldWaterTypeV1,
  topology: SeedWorldCanonicalTopologyKeyV1
): void {
  const expected = waterType === "ocean" ? "ocean-v1" : waterType === "lake" ? "lake-v1" : "river-reach-v1";
  if (topology.kind !== expected) throw new Error(`${waterType} WaterBody requires '${expected}' topology.`);
}

function validateNodeKey(node: SeedWorldHydrologyIdentityNodeKeyV1): void {
  nodeKindTag(node.kind);
  if (!Number.isInteger(node.identityVertexId) || node.identityVertexId < 0 || node.identityVertexId > 16_640) {
    throw new RangeError("Hydrology identityVertexId must be within the fixed 129x129 Analysis Grid.");
  }
}

function sortedUniqueIdentityVertices(values: readonly number[], label: string): readonly number[] {
  const sorted = [...values].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length; index++) {
    const value = sorted[index]!;
    if (!Number.isInteger(value) || value < 0 || value > 16_640) {
      throw new RangeError(`${label} identityVertexId must be within [0, 16640].`);
    }
    if (index > 0 && value === sorted[index - 1]) throw new Error(`${label} anchors must be unique.`);
  }
  return Object.freeze(sorted);
}

function sameNodeKey(left: SeedWorldHydrologyIdentityNodeKeyV1, right: SeedWorldHydrologyIdentityNodeKeyV1): boolean {
  return left.kind === right.kind && left.identityVertexId === right.identityVertexId;
}

function waterTypeTag(waterType: SeedWorldWaterTypeV1): number {
  if (waterType === "ocean") return 1;
  if (waterType === "lake") return 2;
  if (waterType === "river") return 3;
  throw new RangeError(`Unsupported Water type '${String(waterType)}'.`);
}

function lakeShorelineModeTag(mode: SeedWorldLakeShorelineModeV1): number {
  if (mode === "terrain-crossing") return 1;
  if (mode === "planned-footprint") return 2;
  throw new RangeError(`Unsupported Lake shoreline mode '${String(mode)}'.`);
}

function nodeKindTag(kind: SeedWorldHydrologyIdentityNodeKindV1): number {
  const tags: Record<SeedWorldHydrologyIdentityNodeKindV1, number> = {
    "boundary-portal": 1,
    "basin-sink": 2,
    "river-source": 3,
    confluence: 4,
    divergence: 5,
    "lake-entry": 6,
    "lake-outlet": 7,
    "ocean-entry": 8,
    "world-boundary-exit": 9
  };
  const tag = tags[kind];
  if (tag === undefined) throw new RangeError(`Unsupported Hydrology Node kind '${String(kind)}'.`);
  return tag;
}

function compareDigestHex(left: string, right: string): number {
  return compareCanonicalBytes(canonicalSha256HexToBytes(left), canonicalSha256HexToBytes(right));
}

function hashLakeBasinTopology(topology: SeedWorldLakeBasinTopologyGridV1): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/lake-basin-topology/v2", topology.schemaVersion)
    .writeFixedBytes(canonicalSha256HexToBytes(topology.transform.worldGridTransformHash), 32)
    .writeUint16(topology.resolution)
    .writeUint32(topology.spacingMillimetres);
  topology.forEachVertex(({ bodyIndex, plannedStorageBodyIndex, minimumConnectionLevelMillimetres }) => {
    writer.writeUint16(bodyIndex).writeUint16(plannedStorageBodyIndex).writeInt32(minimumConnectionLevelMillimetres);
  });
  return hash.digestHex();
}

function hashLakeBasinSupport(support: SeedWorldLakeBasinSupportGridV1): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/lake-basin-support-grid/v3", support.schemaVersion)
    .writeFixedBytes(canonicalSha256HexToBytes(support.transform.worldGridTransformHash), 32)
    .writeUint16(support.resolution)
    .writeUint32(support.spacingMillimetres);
  support.forEachVertex((bodyIndex) => writer.writeUint16(bodyIndex));
  return hash.digestHex();
}

function nearestGridVertex(offsetMillimetres: number, spacingMillimetres: number, resolution: number): number {
  const quotient = Math.floor(offsetMillimetres / spacingMillimetres);
  const remainder = offsetMillimetres - quotient * spacingMillimetres;
  const rounded = remainder > spacingMillimetres * 0.5 ? quotient + 1 : quotient;
  return Math.max(0, Math.min(resolution - 1, rounded));
}

function requireAnalysisIndex(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= SEED_WORLD_HYDROLOGY_ANALYSIS_RESOLUTION) {
    throw new RangeError(`${label} must be within the canonical 129x129 Analysis Grid.`);
  }
}

function requireCatalogBodyIndex(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 0xfffe) {
    throw new RangeError("Lake Basin body index must be a positive canonical Uint16 value.");
  }
}

function requireWorldOffset(value: number, worldSizeMillimetres: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > worldSizeMillimetres) {
    throw new RangeError(`${label} must be a canonical millimetre offset inside the World domain.`);
  }
}

function requireInt32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new RangeError(`${label} must be an Int32 integer.`);
  }
}

function requireHash(value: string, label: string): void {
  if (!isCanonicalSha256Hex(value)) throw new TypeError(`${label} must be a full lowercase SHA-256 digest.`);
}

function clampBigInt(value: bigint, minimum: bigint, maximum: bigint): bigint {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}
