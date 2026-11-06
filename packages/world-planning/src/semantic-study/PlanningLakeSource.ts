import {
  createLake,
  createWaterBodyInstance,
  createWaterBodyAsset,
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  WaterQualityTier,
  WaterWaveModel,
  WaterWaveSchemaVersion,
  type GridMaskWaterBodySourceV1,
  createWaterQualityPlanV2
} from "@galacean/engine-water/water/index";
import {
  captureLakeTerrain,
  hashStableValue,
  resolveLakeTerrainBoundary,
  computeHeightfieldWaterPhysicalSourceHash,
  hashRiverStableValue
} from "@galacean/engine-water/water/compiler/index";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import {
  LAKE_WATER_SURFACE_MOTION,
  LAKE_WATER_LOOK_PRESET_ID,
  createLakeSpatialFieldBudget
} from "@galacean/engine-water/water/presets/lake/index";
import {
  SEED_WORLD_AUTHORED_BASIN_MINIMUM_SIGNED_DISTANCE_RANGE_METRES,
  SEED_WORLD_AUTHORED_BASIN_SIGNED_DISTANCE_CELL_MULTIPLIER
} from "../runtime/SeedWorldAuthoredBasinWater.ts";
import type { IslandPlan } from "./IslandPlanModel";
import { planningWaterTerrainSnapshot } from "./PlanningHeightmap";
import { planningLakeCaptureExtent } from "./PlanningLakeBasin";

/** Lake water reads the exact canonical Terrain bed, within a grid-aligned local domain. */
export function planningLakeAssets(plan: IslandPlan, ids?: ReadonlySet<string>) {
  const terrain = planningWaterTerrainSnapshot(plan),
    spacingZ = terrain.spacingZ ?? terrain.spacing;
  return plan.waters
    .filter((water) => water.kind === "lake" && !water.lake && (!ids || ids.has(water.id)))
    .flatMap((water) => {
      const resource = plan.authoredResources?.find(
        (resource) => resource.resourceType === "water-body" && resource.resourceId === water.id
      );
      if (
        resource?.resourceType === "water-body" &&
        resource.properties.waterLevelMetres <= resource.properties.minimumWaterLevelMetres
      )
        return [];
      const profile = plan.planning?.profiles.find(
        (profile) => profile.ownerId === water.id && profile.kind === "water"
      );
      if (!profile?.points.length) throw new Error(`Lake ${water.id} has no surface profile`);
      const captured = captureLakeTerrain(
        terrain,
        planningLakeCaptureExtent(
          terrain.origin,
          terrain.spacing,
          spacingZ,
          terrain.columns,
          terrain.rows,
          water.outline
        )
      );
      const level = profile.points[0].y,
        ring = createPlanningRingQuery(water.outline);
      // Select this basin's actual isoline without rewriting the canonical bed at ownership edges.
      const boundary = resolveLakeTerrainBoundary(captured, level, (x, z) => ring.inside({ x, z }));
      const descriptor = createLake({
        id: water.id,
        grid: captured.grid,
        bedHeights: captured.heights,
        bedTerrain: captured.bedTerrain,
        boundary,
        waveAsset: { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
        quality: WaterQualityTier.High,
        surfaceMotion: LAKE_WATER_SURFACE_MOTION,
        spatialField: {
          signedDistanceRange: Math.max(
            SEED_WORLD_AUTHORED_BASIN_MINIMUM_SIGNED_DISTANCE_RANGE_METRES,
            Math.max(...captured.grid.cellSizeXZ) * SEED_WORLD_AUTHORED_BASIN_SIGNED_DISTANCE_CELL_MULTIPLIER
          )
        }
      });
      const representationData = createHeightfieldWaterRepresentationDataV1(descriptor);
      const source: GridMaskWaterBodySourceV1 = {
        schemaVersion: WaterBodySourceSchemaVersion.V1,
        kind: WaterBodySourceKind.GridMask,
        capabilities: { localBathymetry: true, shoreSdf: true, current: true },
        descriptor: createHeightfieldWaterBodySourceDescriptorV1(descriptor)
      };
      return [
        {
          id: water.id,
          asset: createWaterBodyAsset({
            id: `planning-lake:${water.id}`,
            kind: "lake",
            representation: { domain: "bounded-grid", macroSurface: "heightfield" },
            representationData,
            representationDataHash: hashStableValue(representationData),
            sourceHash: hashStableValue(source),
            source
          })
        }
      ];
    });
}

import { planningLakeBoundary } from "./PlanningLakeBoundary";
import type { WaterSceneRuntimeHost, WaterSceneBodyRequest } from "@galacean/engine-water/water/runtime/index";
import type { Engine } from "@galacean/engine";

/** Lake reads the same accepted terrain as River; no private basin mesh or hidden carving. */
export function planningLakeRequests(
  plan: IslandPlan,
  host: WaterSceneRuntimeHost,
  engine: Engine,
  visible: boolean,
  ids?: ReadonlySet<string>
): WaterSceneBodyRequest[] {
  return plan.waters
    .filter((water) => water.kind === "lake" && water.lake && (!ids || ids.has(water.id)))
    .map((water) => {
      const { grid, heights, bedTerrain, boundary } = planningLakeBoundary(plan, water);
      const descriptor = createLake({
        id: water.id,
        grid,
        bedHeights: heights,
        bedTerrain,
        boundary,
        quality: WaterQualityTier.High,
        waveAsset: { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
        surfaceMotion: { waveStrength: 0, shoreDampingWidth: 1 },
        spatialField: { signedDistanceRange: 8 }
      });
      const source = {
        schemaVersion: WaterBodySourceSchemaVersion.V1,
        kind: WaterBodySourceKind.GridMask,
        descriptor: createHeightfieldWaterBodySourceDescriptorV1(descriptor),
        capabilities: { localBathymetry: true, shoreSdf: true, current: false }
      };
      const representationData = createHeightfieldWaterRepresentationDataV1(descriptor);
      const sourceHash = computeHeightfieldWaterPhysicalSourceHash(descriptor);
      const asset = createWaterBodyAsset({
        id: `planning-lake:${water.id}:${sourceHash}`,
        kind: "lake",
        representation: { domain: "bounded-grid", macroSurface: "heightfield" },
        source,
        sourceHash,
        representationData,
        representationDataHash: hashRiverStableValue(representationData)
      });
      const quality = createWaterQualityPlanV2({
        id: `planning-lake-quality:${asset.sourceHash}`,
        geometry: "high",
        surfaceShading: "high",
        sceneFields: "scene-color-depth",
        reflectionBudget: { environment: true, screenSpace: true },
        query: "dense",
        spatialField: createLakeSpatialFieldBudget(descriptor)
      });
      host.registerAuthoringOnce(quality.id, hashRiverStableValue(quality), (registry) =>
        registry.registerQualityPlan(quality)
      );
      return {
        bodyId: water.id,
        asset,
        instance: createWaterBodyInstance({
          id: water.id,
          assetId: asset.id,
          lookPresetId: LAKE_WATER_LOOK_PRESET_ID,
          qualityPlanId: quality.id,
          visible,
          priority: 12,
          transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
          interaction: { query: true, buoyancy: false, wake: false }
        }),
        createRuntimeContext: (root) => ({ engine, root })
      };
    });
}
