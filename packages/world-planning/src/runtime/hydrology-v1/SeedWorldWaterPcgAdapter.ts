import {
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  type WaterBodySourceV1,
  createWaterBodyAsset,
  type WaterBodyAsset,
  createWaterGenerationAssetSetV1,
  type WaterGenerationAssetSetV1
} from "@galacean/engine-water/water/index";

import { WaterGenerationCompileContextV1 } from "@galacean/engine-water/water/compiler/index";
import type { SeedWorldWaterRenderErrorBudgetV1 } from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";
import type { SeedWorldHydrologyWaterBody } from "../SeedWorldHydrologyBake.ts";
import {
  SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES,
  SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES
} from "@galacean/engine-water/world/WaterMetricEncodingV1";
import type { SeedWorldHeightTileSnapshot } from "../../world/SeedWorldGridTileSnapshot.ts";
import { SeedWorldHydrologyArtifactV1, type SeedWorldWaterBodyCatalogEntryV1 } from "./SeedWorldHydrologyArtifact.ts";

export const SEED_WORLD_WATER_PCG_ADAPTER_SCHEMA_VERSION = 3 as const;

// Lake semantic source consumed by the Seed World Heightfield source compiler.
export interface SeedWorldAuthoritativeLakeSourceV1 {
  readonly schemaVersion: typeof SEED_WORLD_WATER_PCG_ADAPTER_SCHEMA_VERSION;
  readonly authoritativeKind: "lake-basin-coverage-v1";
  readonly bodyId: string;
  readonly surfaceHeightMillimetres: number;
}

/** Boundary-connected Ocean fact consumed by the Seed World Ocean source compiler. */
export interface SeedWorldAuthoritativeOceanSourceV1 {
  readonly schemaVersion: typeof SEED_WORLD_WATER_PCG_ADAPTER_SCHEMA_VERSION;
  readonly authoritativeKind: "ocean-boundary-connected-v1";
  readonly bodyId: string;
  readonly surfaceHeightMillimetres: number;
}

export type SeedWorldAuthoritativeWaterSourceDescriptorV1 =
  | SeedWorldAuthoritativeLakeSourceV1
  | SeedWorldAuthoritativeOceanSourceV1;

export interface SeedWorldWaterPcgAdapterResultV1 {
  readonly assetSet: Readonly<WaterGenerationAssetSetV1>;
  readonly compileContext: WaterGenerationCompileContextV1;
}

export interface SeedWorldWaterPcgAdapterInputV1 {
  readonly generationId: number;
  readonly artifact: SeedWorldHydrologyArtifactV1;
  readonly hfinalSnapshot: SeedWorldHeightTileSnapshot;
  readonly hydrologyWaterBodies: readonly SeedWorldHydrologyWaterBody[];
  readonly renderErrorBudget: SeedWorldWaterRenderErrorBudgetV1;
  readonly signal: AbortSignal;
}

// Adapts one authoritative Seed World generation to the current Ocean + Lake Water phase.
// River and Connection facts remain available to Terrain/Hydrology consumers, but are
// deliberately absent from the returned render AssetSet.
export function adaptSeedWorldHydrologyToWaterPcgV1(
  input: Readonly<SeedWorldWaterPcgAdapterInputV1>
): Readonly<SeedWorldWaterPcgAdapterResultV1> {
  validateGenerationIdentity(input);
  const bodies = input.artifact.waterBodyCatalog
    .filter(({ waterType }) => waterType === "ocean" || waterType === "lake")
    .map((body) => (body.waterType === "ocean" ? createOceanBodyAsset(body) : createLakeBodyAsset(body)));
  const assetSet = createWaterGenerationAssetSetV1(bodies);
  const bodyById = new Map(input.artifact.waterBodyCatalog.map((body) => [body.bodyId, body]));
  const bodyIndexById = new Map(input.artifact.waterBodyCatalog.map((body, index) => [body.bodyId, index + 1]));
  const hydrologyBodyById = new Map(input.hydrologyWaterBodies.map((body) => [body.id, body]));
  const hfinalLease = input.hfinalSnapshot.acquireLease();
  const ownershipLease = input.artifact.ownershipSnapshot.acquireLease();
  let compileContext: WaterGenerationCompileContextV1;
  try {
    compileContext = new WaterGenerationCompileContextV1({
      generationId: input.generationId,
      transform: Object.freeze({
        worldGridTransformHash: input.hfinalSnapshot.transform.worldGridTransformHash,
        worldMinXMillimetres: input.hfinalSnapshot.transform.worldMinXMillimetres,
        worldMinZMillimetres: input.hfinalSnapshot.transform.worldMinZMillimetres,
        worldSizeXMillimetres: input.hfinalSnapshot.transform.worldSizeXMillimetres,
        worldSizeZMillimetres: input.hfinalSnapshot.transform.worldSizeZMillimetres,
        hfinalResolution: input.hfinalSnapshot.transform.hfinalResolution,
        hfinalSpacingMillimetres: input.hfinalSnapshot.transform.hfinalSpacingMillimetres,
        ownershipResolution: input.hfinalSnapshot.transform.ownershipResolution,
        ownershipCellMillimetres: input.hfinalSnapshot.transform.ownershipCellMillimetres,
        rowDirection: input.hfinalSnapshot.transform.rowDirection,
        columnDirection: input.hfinalSnapshot.transform.columnDirection,
        boundaryRule: input.hfinalSnapshot.transform.boundaryRule
      }),
      hfinal: {
        resolution: input.hfinalSnapshot.canonicalView.resolution,
        minimumHeightMillimetres: SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES,
        maximumHeightMillimetres: SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES,
        sampleR16: (x, z) => input.hfinalSnapshot.canonicalView.sampleR16(x, z)
      },
      ownership: {
        resolution: input.artifact.ownershipView.resolution,
        sampleBodyIndex: (x, z) => input.artifact.ownershipView.sampleBodyIndex(x, z)
      },
      lakeBasinSupport: {
        sourceHash: (assetId) => {
          const body = bodyById.get(assetId);
          if (!body || body.waterType !== "lake" || !body.basinSupportHash) {
            throw new Error(`Lake Basin support request references non-Lake or missing body '${assetId}'.`);
          }
          return body.basinSupportHash;
        },
        shorelineMode: (assetId) => {
          const body = bodyById.get(assetId);
          if (!body || body.waterType !== "lake" || !body.lakeShorelineMode) {
            throw new Error(`Lake shoreline request references non-Lake or missing body '${assetId}'.`);
          }
          return body.lakeShorelineMode;
        },
        boundsMillimetres: (assetId) => {
          const bodyIndex = bodyIndexById.get(assetId);
          const body = bodyById.get(assetId);
          if (!bodyIndex || !body || body.waterType !== "lake") {
            throw new Error(`Lake Basin bounds request references non-Lake or missing body '${assetId}'.`);
          }
          return input.artifact.lakeBasinSupport.boundsMillimetres(bodyIndex);
        },
        sampleBasinSupport: (assetId, xOffsetMillimetres, zOffsetMillimetres) => {
          const bodyIndex = bodyIndexById.get(assetId);
          const body = bodyById.get(assetId);
          if (!bodyIndex || !body || body.waterType !== "lake") {
            throw new Error(`Lake Basin sample request references non-Lake or missing body '${assetId}'.`);
          }
          return input.artifact.lakeBasinSupport.sampleSupportAtWorldOffset(
            bodyIndex,
            xOffsetMillimetres,
            zOffsetMillimetres
          );
        },
        sampleSignedDistanceMillimetres: (assetId, xOffsetMillimetres, zOffsetMillimetres) => {
          const catalogBody = bodyById.get(assetId);
          const hydrologyBody = catalogBody?.basinId ? hydrologyBodyById.get(catalogBody.basinId) : undefined;
          if (!catalogBody || catalogBody.waterType !== "lake" || !hydrologyBody) {
            throw new Error(`Lake signed-distance request references non-Lake or missing body '${assetId}'.`);
          }
          const normalizedX = xOffsetMillimetres / input.hfinalSnapshot.transform.worldSizeXMillimetres;
          const normalizedZ = zOffsetMillimetres / input.hfinalSnapshot.transform.worldSizeZMillimetres;
          return Math.round(
            sampleCellCenteredField(
              hydrologyBody.signedDistanceMetres,
              hydrologyBody.resolution,
              normalizedX,
              normalizedZ
            ) * 1_000
          );
        },
        surfaceUnderlapMillimetres: (assetId) => {
          const catalogBody = bodyById.get(assetId);
          const hydrologyBody = catalogBody?.basinId ? hydrologyBodyById.get(catalogBody.basinId) : undefined;
          if (!catalogBody || catalogBody.waterType !== "lake" || !hydrologyBody) {
            throw new Error(`Lake surface-underlap request references non-Lake or missing body '${assetId}'.`);
          }
          return Math.round(hydrologyBody.surfaceUnderlapMetres * 1_000);
        }
      },
      // Ownership keeps all hydrology owners so excluded River cells are rejected
      // without being reinterpreted as dry, Ocean, or part of a neighboring Lake.
      ownerIndexToAssetId: Object.freeze([
        undefined,
        ...input.artifact.waterBodyCatalog.map(({ bodyId, waterType }) =>
          waterType === "ocean" || waterType === "lake" ? bodyId : undefined
        )
      ]),
      terrainTileDigestGrid: input.hfinalSnapshot.terrainTileDigestGrid,
      ownershipSourceHash: input.artifact.header.ownershipSourceHash,
      budget: Object.freeze({
        // The procedural Ocean floor reaches the render-relevant 12m depth
        // within roughly 128m of the authoritative sea-level coast. Keep that bounded band in the
        // Footprint so the source can saturate bathymetry without a Tile seam.
        maximumTerrainReadHaloMillimetres: 128_000,
        maximumFootprintHorizontalErrorMillimetres: input.renderErrorBudget.maximumFootprintHorizontalErrorMillimetres,
        maximumGpuDepthDecodeErrorMillimetres: input.renderErrorBudget.maximumGpuDepthDecodeErrorMillimetres,
        maximumGpuShoreDecodeErrorMillimetres: input.renderErrorBudget.maximumGpuShoreDecodeErrorMillimetres,
        maximumRenderSurfaceOffsetMillimetres: input.renderErrorBudget.maximumRenderSurfaceOffsetMillimetres,
        waterRenderErrorBudgetHash: input.renderErrorBudget.waterRenderErrorBudgetHash
      }),
      sampleSurfaceHeightMillimetres: (bodyId) => {
        const body = bodyById.get(bodyId);
        if (
          !body ||
          (body.waterType !== "ocean" && body.waterType !== "lake") ||
          body.uniformSurfaceHeightMillimetres === undefined
        ) {
          throw new Error(`Uniform Water surface request references River or missing body '${bodyId}'.`);
        }
        return body.uniformSurfaceHeightMillimetres;
      },
      signal: input.signal,
      releaseLease: () => {
        ownershipLease.release();
        hfinalLease.release();
      }
    });
  } catch (error) {
    ownershipLease.release();
    hfinalLease.release();
    throw error;
  }
  return Object.freeze({ assetSet, compileContext });
}

function sampleCellCenteredField(
  values: Float32Array,
  resolution: number,
  normalizedX: number,
  normalizedZ: number
): number {
  const coordinateX = Math.min(resolution - 1, Math.max(0, normalizedX * resolution - 0.5));
  const coordinateZ = Math.min(resolution - 1, Math.max(0, normalizedZ * resolution - 0.5));
  const x0 = Math.floor(coordinateX);
  const z0 = Math.floor(coordinateZ);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z1 = Math.min(resolution - 1, z0 + 1);
  const tx = coordinateX - x0;
  const tz = coordinateZ - z0;
  const top = values[z0 * resolution + x0]! * (1 - tx) + values[z0 * resolution + x1]! * tx;
  const bottom = values[z1 * resolution + x0]! * (1 - tx) + values[z1 * resolution + x1]! * tx;
  return top * (1 - tz) + bottom * tz;
}

function validateGenerationIdentity(input: Readonly<SeedWorldWaterPcgAdapterInputV1>): void {
  if (input.hfinalSnapshot.role !== "hfinal") {
    throw new Error("Seed World Water Adapter requires Hfinal, not BaseTerrain.");
  }
  const transformHash = input.hfinalSnapshot.transform.worldGridTransformHash;
  if (
    transformHash !== input.artifact.header.worldGridTransformHash ||
    transformHash !== input.artifact.ownershipView.transform.worldGridTransformHash
  ) {
    throw new Error("Seed World Water Adapter generation Grid Transform mismatch.");
  }
  if (input.artifact.header.terrainSourceHash.length !== 64) {
    throw new Error("Seed World Water Adapter requires authoritative Terrain identity.");
  }
}

function createOceanBodyAsset(
  body: Readonly<SeedWorldWaterBodyCatalogEntryV1>
): Readonly<WaterBodyAsset<WaterBodySourceV1>> {
  if (body.waterType !== "ocean" || body.uniformSurfaceHeightMillimetres === undefined) {
    throw new Error(`Seed World Ocean Adapter received non-Ocean body '${body.bodyId}'.`);
  }
  const descriptor: SeedWorldAuthoritativeOceanSourceV1 = Object.freeze({
    schemaVersion: SEED_WORLD_WATER_PCG_ADAPTER_SCHEMA_VERSION,
    authoritativeKind: "ocean-boundary-connected-v1",
    bodyId: body.bodyId,
    surfaceHeightMillimetres: body.uniformSurfaceHeightMillimetres
  });
  const source: WaterBodySourceV1 = Object.freeze({
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.OceanNearshore,
    capabilities: Object.freeze({ localBathymetry: true, shoreSdf: true, current: false }),
    descriptor
  });
  return createWaterBodyAsset({
    id: body.bodyId,
    kind: "ocean",
    representation: { domain: "world-space-ocean", macroSurface: "gerstner" },
    sourceHash: body.bodySourceHash,
    source
  });
}

function createLakeBodyAsset(
  body: Readonly<SeedWorldWaterBodyCatalogEntryV1>
): Readonly<WaterBodyAsset<WaterBodySourceV1>> {
  if (body.waterType !== "lake" || body.uniformSurfaceHeightMillimetres === undefined) {
    throw new Error(`Seed World Lake Adapter received non-Lake body '${body.bodyId}'.`);
  }
  const descriptor: SeedWorldAuthoritativeLakeSourceV1 = Object.freeze({
    schemaVersion: SEED_WORLD_WATER_PCG_ADAPTER_SCHEMA_VERSION,
    authoritativeKind: "lake-basin-coverage-v1",
    bodyId: body.bodyId,
    surfaceHeightMillimetres: body.uniformSurfaceHeightMillimetres
  });
  const source: WaterBodySourceV1 = Object.freeze({
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.GridMask,
    capabilities: Object.freeze({ localBathymetry: true, shoreSdf: true, current: false }),
    descriptor
  });
  return createWaterBodyAsset({
    id: body.bodyId,
    kind: "lake",
    representation: { domain: "bounded-grid", macroSurface: "heightfield" },
    sourceHash: body.bodySourceHash,
    source
  });
}
