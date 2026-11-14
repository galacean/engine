import type {
  SeedWorldAuthoritativePresentationSourceV2,
  SeedWorldLakeShorePlacementBodyV1
} from "../SeedWorldFieldWorkerProtocol.ts";
import { cloneSeedWorldFields, type SeedWorldFbmParameters, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  SEED_WORLD_DEFAULT_HYDROLOGY_BAKE_STYLE,
  type SeedWorldHydrologyBakeStyle,
  type SeedWorldHydrologyWaterBody
} from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyBake";
import { SeedWorldHydrologyCompiler } from "../SeedWorldHydrologyCompiler.ts";
import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldTerrainGenerationSettings } from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";
import { createSeedWorldProductionLakeHydrologyProfileV1 } from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldHydrologyProfileV1";
import {
  createSeedWorldCanonicalNaturalTerrainV1,
  decodeR16HeightMillimetres,
  encodeR16HeightMillimetres,
  hashSeedWorldHeightSnapshotV1,
  sampleSeedWorldAuthoringHeightDeltaMillimetresV1,
  type SeedWorldHydrologyAnalysisTerrainSnapshotV1
} from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldCanonicalNaturalTerrain";
import { SeedWorldHydrologyArtifactV1, sealSeedWorldHydrologyArtifactV1 } from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldHydrologyArtifact";
import {
  SeedWorldHeightTileSnapshot,
  SeedWorldUint16TilePool,
  createSeedWorldHeightTileSnapshot
} from "@galacean/engine-world-planning/world/SeedWorldGridTileSnapshot";
import { compileSeedWorldPlannedHydrologySolveResultV1 } from "./SeedWorldPlannedHydrologySolveResultV1.ts";
import { createSeedWorldWaterErrorBudgetV1, type SeedWorldWaterErrorBudgetV1 } from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";
import {
  SEED_WORLD_TILE_AXIS_COUNT,
  createSeedWorldWaterGridTransformV1,
  type SeedWorldWaterGridTransformV1
} from "@galacean/engine-water/world/SeedWorldWaterGrid";
import { applySeedWorldAuthoringStateToPlanV1, type SeedWorldAuthoringStateV1 } from "@galacean/engine-world-planning/world/SeedWorldWorldEdit";
import { createCanonicalWaterHashWriter } from "@galacean/engine-water/water/compiler/index";
import type { WaterGenerationPreparedTransferV1 } from "@galacean/engine-water/water/runtime/index";

const authoritativeHydrologyCompiler = new SeedWorldHydrologyCompiler();

export interface SeedWorldAuthoritativeGenerationWorkerInputV1 {
  readonly rootPlan: SeedWorldPlan;
  readonly terrainSettings: Readonly<SeedWorldTerrainGenerationSettings>;
  readonly fbm: Readonly<SeedWorldFbmParameters>;
  readonly hydrologyStyle?: Readonly<SeedWorldHydrologyBakeStyle>;
  readonly authoringState: Readonly<SeedWorldAuthoringStateV1>;
}

export interface BuildSeedWorldAuthoritativeGenerationInputV1 extends SeedWorldAuthoritativeGenerationWorkerInputV1 {
  readonly heightTilePool: SeedWorldUint16TilePool;
  readonly ownershipTilePool: SeedWorldUint16TilePool;
  readonly signal?: AbortSignal;
}

export interface SeedWorldAuthoritativeGenerationBuildResultV1 {
  readonly plan: SeedWorldPlan;
  readonly transform: SeedWorldWaterGridTransformV1;
  readonly errorBudget: SeedWorldWaterErrorBudgetV1;
  readonly analysisSnapshot: SeedWorldHydrologyAnalysisTerrainSnapshotV1;
  readonly baseTerrainSnapshot: SeedWorldHeightTileSnapshot;
  readonly hfinalSnapshot: SeedWorldHeightTileSnapshot;
  readonly artifact: SeedWorldHydrologyArtifactV1;
  readonly plannedHydrologyGeometryHash: number;
  readonly plannedHydrologyBakeHash: number;
  /** Exact Main-thread Hydrology fields transferred to the presentation Worker; never recomputed there. */
  readonly plannedPresentationFields: SeedWorldFields;
  /** Body-local signed-distance fields retained until Water finishes its one-time surface bake. */
  readonly plannedHydrologyWaterBodies: readonly SeedWorldHydrologyWaterBody[];
  readonly hydrologyStyle: Readonly<SeedWorldHydrologyBakeStyle>;
  /** Present when the authoritative Worker also completed the CPU-only Water phase. */
  readonly preparedWaterGeneration?: Readonly<WaterGenerationPreparedTransferV1>;
  /** Present when the authoritative Worker also prepared the next presentation-Worker handoff. */
  readonly preparedPresentationSource?: Readonly<SeedWorldAuthoritativePresentationSourceV2>;
  readonly diagnostics: Readonly<Record<string, unknown>>;
  release(): void;
}

export function buildSeedWorldAuthoritativeGenerationV1(
  input: Readonly<BuildSeedWorldAuthoritativeGenerationInputV1>
): SeedWorldAuthoritativeGenerationBuildResultV1 {
  const buildStartedAt = performance.now();
  const timingsMilliseconds: Record<string, number> = {};
  input.signal?.throwIfAborted();
  const settings = input.terrainSettings;
  if (
    ![97, 193, 385, 769].includes(settings.heightResolution) ||
    ![96, 192, 384, 768, 1536].includes(settings.coverageResolution)
  ) {
    throw new Error("Seed World Terrain settings do not map to a frozen Water Grid Profile.");
  }
  const transform = createSeedWorldWaterGridTransformV1({
    hfinalResolution: settings.heightResolution as 97 | 193 | 385 | 769,
    ownershipResolution: settings.coverageResolution as 96 | 192 | 384 | 768 | 1536
  });
  const authoredRootPlan = applySeedWorldAuthoringStateToPlanV1(input.rootPlan, input.authoringState);
  const hydrologyStyle = input.hydrologyStyle ?? SEED_WORLD_DEFAULT_HYDROLOGY_BAKE_STYLE;
  let phaseStartedAt = performance.now();
  const plannedHydrology = authoritativeHydrologyCompiler.compile(
    authoredRootPlan,
    input.fbm,
    settings,
    hydrologyStyle,
    Object.freeze({
      identity: input.authoringState.authoringStateHash,
      patchHfinalSamples: (sourceSamples: Uint16Array) =>
        createPatchedHeightSamples(sourceSamples, transform, input.authoringState)
    })
  );
  timingsMilliseconds.hydrologyCompiler = performance.now() - phaseStartedAt;
  input.signal?.throwIfAborted();
  const hydrologyProfile = createSeedWorldProductionLakeHydrologyProfileV1(plannedHydrology.bake.style);
  const naturalTerrainVersionHash = hashNaturalTerrainVersion(
    authoredRootPlan.rootSeed,
    input.fbm,
    plannedHydrology.topology.geometryHash,
    plannedHydrology.bake.bakeHash
  );
  let analysisSnapshot: SeedWorldHydrologyAnalysisTerrainSnapshotV1 | undefined;
  let baseTerrainSnapshot: SeedWorldHeightTileSnapshot | undefined;
  let hfinalSnapshot: SeedWorldHeightTileSnapshot | undefined;
  let artifact: SeedWorldHydrologyArtifactV1 | undefined;
  let solveResult: ReturnType<typeof compileSeedWorldPlannedHydrologySolveResultV1> | undefined;
  try {
    phaseStartedAt = performance.now();
    const natural = createSeedWorldCanonicalNaturalTerrainV1({
      transform,
      authoringState: input.authoringState,
      naturalTerrainVersionHash,
      sampleNaturalHeightMetres: (worldX, worldZ) =>
        sampleR16TerrainMetres(plannedHydrology.sourceFields, worldX, worldZ),
      sampleAnalysisHeightMetres: (worldX, worldZ) =>
        sampleFloatTerrainMetres(
          plannedHydrology.analysisHeightMetres,
          plannedHydrology.topology.analysisGrid.resolution,
          authoredRootPlan.sizeMetres,
          worldX,
          worldZ
        ),
      heightTilePool: input.heightTilePool
    });
    timingsMilliseconds.canonicalNaturalTerrain = performance.now() - phaseStartedAt;
    analysisSnapshot = natural.analysisSnapshot;
    baseTerrainSnapshot = natural.baseTerrainSnapshot;
    const errorBudget = createSeedWorldWaterErrorBudgetV1(transform);
    phaseStartedAt = performance.now();
    hfinalSnapshot = createPatchedHeightSnapshot(
      "hfinal",
      plannedHydrology.bake.fields.heightSamples,
      transform,
      input.authoringState,
      input.heightTilePool
    );
    timingsMilliseconds.hfinalSnapshot = performance.now() - phaseStartedAt;
    phaseStartedAt = performance.now();
    solveResult = compileSeedWorldPlannedHydrologySolveResultV1({
      topology: plannedHydrology.topology,
      bake: plannedHydrology.bake,
      analysisHeightMetres: plannedHydrology.analysisHeightMetres,
      transform
    });
    timingsMilliseconds.plannedSolve = performance.now() - phaseStartedAt;
    const plan = plannedHydrology.plan;
    const terrainSourceHash = hashSeedWorldHeightSnapshotV1(
      "seed-world-water/terrain-source/v1",
      naturalTerrainVersionHash,
      input.authoringState.authoringStateHash,
      hfinalSnapshot
    );
    phaseStartedAt = performance.now();
    artifact = sealSeedWorldHydrologyArtifactV1({
      worldIdentity: `seed-world:${authoredRootPlan.rootSeed >>> 0}`,
      authoringStateHash: input.authoringState.authoringStateHash,
      analysisTerrainSourceHash: analysisSnapshot.analysisTerrainSourceHash,
      baseTerrainSourceHash: natural.baseTerrainSourceHash,
      terrainSourceHash,
      transform,
      profile: hydrologyProfile,
      semanticErrorBudget: errorBudget.semantic,
      hfinalSnapshot,
      solveResult,
      lakeSearchDiagnostics: plannedHydrology.topology.lakeSearchDiagnostics,
      ownershipTilePool: input.ownershipTilePool
    });
    timingsMilliseconds.artifactSeal = performance.now() - phaseStartedAt;
    input.signal?.throwIfAborted();
    const hydrologyDiagnostics = solveResult.diagnostics;
    solveResult.release();
    solveResult = undefined;
    let released = false;
    return Object.freeze({
      plan,
      transform,
      errorBudget,
      analysisSnapshot,
      baseTerrainSnapshot,
      hfinalSnapshot,
      artifact,
      plannedHydrologyGeometryHash: plannedHydrology.topology.geometryHash,
      plannedHydrologyBakeHash: plannedHydrology.bake.bakeHash,
      plannedPresentationFields: plannedHydrology.bake.fields,
      plannedHydrologyWaterBodies: plannedHydrology.bake.waterBodies,
      hydrologyStyle: plannedHydrology.bake.style,
      diagnostics: Object.freeze({
        hydrology: hydrologyDiagnostics,
        plannerHydrology: plannedHydrology.diagnostics,
        lakeSearch: plannedHydrology.topology.lakeSearchDiagnostics,
        plannedHfinal: Object.freeze({
          source: "planned-hydrology-bake-v1",
          changedVertexCount: countChangedHeightVertices(
            baseTerrainSnapshot.canonicalView,
            hfinalSnapshot.canonicalView
          )
        }),
        waterBodyCount: artifact.diagnostics.waterBodyCount,
        timingsMilliseconds: Object.freeze({
          ...timingsMilliseconds,
          total: performance.now() - buildStartedAt
        })
      }),
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
    solveResult?.release();
    artifact?.release();
    hfinalSnapshot?.release();
    baseTerrainSnapshot?.release();
    analysisSnapshot?.release();
    throw error;
  }
}

/**
 * Packages the already-compiled Hydrology fields, shoreline geometry, and copied Hfinal for one
 * ownership-transferring Worker handoff. Water runtime retains the original body-local rasters.
 */
export function createSeedWorldAuthoritativePresentationSourceV2(
  build: Readonly<SeedWorldAuthoritativeGenerationBuildResultV1>,
  options: Readonly<{ clonePlannedFields?: boolean }> = {}
): SeedWorldAuthoritativePresentationSourceV2 {
  const hfinalSamples = new Uint16Array(build.hfinalSnapshot.canonicalView.resolution ** 2);
  build.hfinalSnapshot.canonicalView.forEachRow((z, sampleAtX) => {
    for (let x = 0; x < build.hfinalSnapshot.canonicalView.resolution; x++) {
      hfinalSamples[z * build.hfinalSnapshot.canonicalView.resolution + x] = sampleAtX(x);
    }
  });
  return Object.freeze({
    schemaVersion: 2 as const,
    artifactContentHash: build.artifact.header.artifactContentHash,
    terrainSourceHash: build.artifact.header.terrainSourceHash,
    plannedHydrologyGeometryHash: build.plannedHydrologyGeometryHash,
    plannedHydrologyBakeHash: build.plannedHydrologyBakeHash,
    plannedFields: options.clonePlannedFields
      ? cloneSeedWorldFields(build.plannedPresentationFields)
      : build.plannedPresentationFields,
    plannedHydrologyWaterBodies: Object.freeze(
      build.plannedHydrologyWaterBodies.map((body) =>
        Object.freeze({
          ...body,
          wetMask: new Uint8Array(body.wetMask),
          coverage: new Uint8Array(body.coverage),
          signedDistanceMetres: new Float32Array(body.signedDistanceMetres)
        })
      )
    ),
    lakeShorePlacementBodies: compileLakeShorePlacementBodies(build),
    hfinalSamples
  });
}

function compileLakeShorePlacementBodies(
  build: Readonly<SeedWorldAuthoritativeGenerationBuildResultV1>
): readonly SeedWorldLakeShorePlacementBodyV1[] {
  const ownership = build.artifact.ownershipView;
  const ownershipCellMillimetres = ownership.transform.ownershipCellMillimetres;
  const descriptors: SeedWorldLakeShorePlacementBodyV1[] = [];
  for (let catalogIndex = 0; catalogIndex < build.artifact.waterBodyCatalog.length; catalogIndex++) {
    const catalogBody = build.artifact.waterBodyCatalog[catalogIndex]!;
    if (catalogBody.waterType !== "lake") continue;
    if (!catalogBody.basinId || catalogBody.uniformSurfaceHeightMillimetres === undefined) {
      throw new Error(`Artifact Lake '${catalogBody.bodyId}' has no Basin or uniform surface authority.`);
    }
    const plannedBody = build.plannedHydrologyWaterBodies.find((body) => body.id === catalogBody.basinId);
    if (!plannedBody) {
      throw new Error(`Artifact Lake '${catalogBody.bodyId}' does not bind a planned Hydrology body.`);
    }
    const waterLevelMetres = catalogBody.uniformSurfaceHeightMillimetres / 1_000;
    if (Math.abs(plannedBody.waterLevelMetres - waterLevelMetres) > 0.001) {
      throw new Error(`Artifact Lake '${catalogBody.bodyId}' surface differs from its planned Hydrology body.`);
    }
    const bodyIndex = catalogIndex + 1;
    const resolution = plannedBody.resolution;
    const eligibleMask = new Uint8Array(resolution ** 2);
    for (let row = 0; row < resolution; row++) {
      for (let column = 0; column < resolution; column++) {
        const xOffsetMillimetres = Math.round(((column + 0.5) / resolution) * build.transform.worldSizeXMillimetres);
        const zOffsetMillimetres = Math.round(((row + 0.5) / resolution) * build.transform.worldSizeZMillimetres);
        const ownershipX = Math.min(
          ownership.resolution - 1,
          Math.floor(xOffsetMillimetres / ownershipCellMillimetres)
        );
        const ownershipZ = Math.min(
          ownership.resolution - 1,
          Math.floor(zOffsetMillimetres / ownershipCellMillimetres)
        );
        const sameLakeOwner = ownership.sampleBodyIndex(ownershipX, ownershipZ) === bodyIndex;
        const plannedStorage = build.artifact.lakeBasinTopology.isPlannedStorageAtWorldOffset(
          bodyIndex,
          xOffsetMillimetres,
          zOffsetMillimetres
        );
        const basinSupport = build.artifact.lakeBasinSupport.sampleSupportAtWorldOffset(
          bodyIndex,
          xOffsetMillimetres,
          zOffsetMillimetres
        );
        eligibleMask[row * resolution + column] = Number(sameLakeOwner && plannedStorage && basinSupport);
      }
    }
    descriptors.push(
      Object.freeze({
        schemaVersion: 1 as const,
        basinId: catalogBody.basinId,
        bodySourceHash: catalogBody.bodySourceHash,
        waterLevelMetres,
        resolution,
        eligibleMask
      })
    );
  }
  return Object.freeze(descriptors.sort((left, right) => left.bodySourceHash.localeCompare(right.bodySourceHash)));
}

function createPatchedHeightSnapshot(
  role: "hfinal",
  sourceSamples: Uint16Array,
  transform: SeedWorldWaterGridTransformV1,
  authoringState: Readonly<SeedWorldAuthoringStateV1>,
  pool: SeedWorldUint16TilePool
): SeedWorldHeightTileSnapshot {
  if (sourceSamples.length !== transform.hfinalResolution ** 2) {
    throw new RangeError("Planned Hfinal samples do not match the selected Grid Profile.");
  }
  const patchedSamples = createPatchedHeightSamples(sourceSamples, transform, authoringState);
  const cellsPerTile = 32_000 / transform.hfinalSpacingMillimetres;
  return createSeedWorldHeightTileSnapshot({
    role,
    transform,
    pool,
    valuesForTile: (tileId, width) => {
      const tileX = tileId % SEED_WORLD_TILE_AXIS_COUNT;
      const tileZ = Math.floor(tileId / SEED_WORLD_TILE_AXIS_COUNT);
      const values = new Uint16Array(width * width);
      for (let localZ = 0; localZ < width; localZ++) {
        for (let localX = 0; localX < width; localX++) {
          const x = tileX * cellsPerTile + localX;
          const z = tileZ * cellsPerTile + localZ;
          values[localZ * width + localX] = patchedSamples[z * transform.hfinalResolution + x]!;
        }
      }
      return values;
    }
  });
}

function createPatchedHeightSamples(
  sourceSamples: Uint16Array,
  transform: SeedWorldWaterGridTransformV1,
  authoringState: Readonly<SeedWorldAuthoringStateV1>
): Uint16Array {
  if (sourceSamples.length !== transform.hfinalResolution ** 2) {
    throw new RangeError("Planned Hfinal samples do not match the selected Grid Profile.");
  }
  const result = new Uint16Array(sourceSamples);
  for (let z = 0; z < transform.hfinalResolution; z++) {
    for (let x = 0; x < transform.hfinalResolution; x++) {
      const index = z * transform.hfinalResolution + x;
      const deltaMillimetres = sampleSeedWorldAuthoringHeightDeltaMillimetresV1(
        authoringState,
        x * transform.hfinalSpacingMillimetres,
        z * transform.hfinalSpacingMillimetres,
        transform.worldSizeXMillimetres / 1_000
      );
      if (deltaMillimetres === 0) continue;
      result[index] = encodeR16HeightMillimetres(decodeR16HeightMillimetres(result[index]!) + deltaMillimetres);
    }
  }
  return result;
}

function sampleR16TerrainMetres(fields: SeedWorldFields, worldX: number, worldZ: number): number {
  const normalizedX = Math.max(0, Math.min(1, worldX / fields.sizeMetres + 0.5));
  const normalizedZ = Math.max(0, Math.min(1, worldZ / fields.sizeMetres + 0.5));
  const x = Math.round(normalizedX * (fields.heightResolution - 1));
  const z = Math.round(normalizedZ * (fields.heightResolution - 1));
  return decodeR16HeightMillimetres(fields.heightSamples[z * fields.heightResolution + x]!) / 1_000;
}

function sampleFloatTerrainMetres(
  samples: Float32Array,
  resolution: number,
  sizeMetres: number,
  worldX: number,
  worldZ: number
): number {
  const x = Math.max(0, Math.min(1, worldX / sizeMetres + 0.5)) * (resolution - 1);
  const z = Math.max(0, Math.min(1, worldZ / sizeMetres + 0.5)) * (resolution - 1);
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z1 = Math.min(resolution - 1, z0 + 1);
  const tx = x - x0;
  const tz = z - z0;
  const top = samples[z0 * resolution + x0]! * (1 - tx) + samples[z0 * resolution + x1]! * tx;
  const bottom = samples[z1 * resolution + x0]! * (1 - tx) + samples[z1 * resolution + x1]! * tx;
  return top * (1 - tz) + bottom * tz;
}

function countChangedHeightVertices(
  base: SeedWorldHeightTileSnapshot["canonicalView"],
  hfinal: SeedWorldHeightTileSnapshot["canonicalView"]
): number {
  if (base.resolution !== hfinal.resolution) throw new Error("BaseTerrain and Hfinal resolution mismatch.");
  let changed = 0;
  base.forEachRow((z, sampleAtX) => {
    for (let x = 0; x < base.resolution; x++) {
      if (sampleAtX(x) !== hfinal.sampleR16(x, z)) changed++;
    }
  });
  return changed;
}

function hashNaturalTerrainVersion(
  rootSeed: number,
  fbm: Readonly<SeedWorldFbmParameters>,
  hydrologyGeometryHash: number,
  hydrologyBakeHash: number
): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writer
    .writeRecord("seed-world-water/natural-terrain-version/v2", 2)
    .writeUint32(rootSeed >>> 0)
    .writeInt32(Math.round(fbm.rollingAmplitudeMetres * 1_000))
    .writeInt32(Math.round(fbm.rollingWavelengthMetres * 1_000))
    .writeUint8(fbm.rollingOctaves)
    .writeInt32(Math.round(fbm.detailAmplitudeMetres * 1_000))
    .writeInt32(Math.round(fbm.detailWavelengthMetres * 1_000))
    .writeUint8(fbm.detailOctaves)
    .writeInt32(Math.round(fbm.warpAmplitudeMetres * 1_000))
    .writeInt32(Math.round(fbm.warpWavelengthMetres * 1_000))
    .writeUint8(fbm.warpOctaves)
    .writeUint32(hydrologyGeometryHash >>> 0)
    .writeUint32(hydrologyBakeHash >>> 0);
  return hash.digestHex();
}
