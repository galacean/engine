import type { OceanNearshoreDescriptorV1 } from "@galacean/engine-water/water/index";
import {
  createLakeFromTerrain,
  createRiver,
  RiverPathMode,
  WaterWaveModel,
  WaterWaveSchemaVersion,
  WaterQualityTier,
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion
} from "@galacean/engine-water/water/index";

import {
  OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION,
  type OceanWaterBodyDescriptorV1
} from "@galacean/engine-water/water/runtime/ocean/index";
import { createOceanNearshoreFromTerrain } from "@galacean/engine-water/water/compiler/index";
import { createIslandOceanOwnership } from "./WaterIslandOceanEditing.ts";
import { WATER_ISLAND_PRESET } from "./WaterIslandPreset.ts";
import {
  createWaterIslandTerrain,
  cropIslandTerrain,
  islandLakeBounds,
  islandLakeWaterLevel
} from "./WaterIslandTerrain.ts";

export function createWaterIslandBodies(
  source: ReturnType<typeof createWaterIslandTerrain>,
  nearshore?: OceanNearshoreDescriptorV1
) {
  const lakes = WATER_ISLAND_PRESET.lakes.map((lake, i) => {
    const bounds = islandLakeBounds[i];
    const terrain = cropIslandTerrain(
      source.terrain,
      bounds.minX - 3,
      bounds.minZ - 3,
      bounds.maxX + 3,
      bounds.maxZ + 3
    );
    return createLakeFromTerrain({
      id: lake.id,
      terrain,
      coverage: {
        kind: "authored",
        boundary: { ...lake.boundary, waterLevel: islandLakeWaterLevel(lake, source.waterLevel) }
      },
      quality: WaterQualityTier.High,
      waveAsset: { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
      surfaceMotion: { waveStrength: 0, shoreDampingWidth: 1 },
      spatialField: { signedDistanceRange: 8 },
      connections: source.connections.byBody[lake.id]
    });
  });
  const rivers = source.rivers.map((river) => {
    const x = river.points.map((p) => p.position[0]),
      z = river.points.map((p) => p.position[2]);
    const terrain = cropIslandTerrain(
      source.terrain,
      Math.min(...x) - 12,
      Math.min(...z) - 12,
      Math.max(...x) + 12,
      Math.max(...z) + 12
    );
    const descriptor = createRiver({ id: river.id, points: river.points, terrain, width: 8, depth: 1.25, speed: 0.85 });
    // The terrain and water use identical line segments; smooth bends are authored as extra anchors.
    descriptor.segments[0].curve.mode = RiverPathMode.Polyline;
    return { ...descriptor, connections: source.connections.byBody[river.id] };
  });
  if (!nearshore) {
    const size = 512;
    const template: Omit<OceanNearshoreDescriptorV1, "bedHeights"> = {
      schemaVersion: OceanNearshoreSchemaVersion.V1,
      id: "island-nearshore",
      waterLevel: source.waterLevel,
      grid: { originXZ: [-255.5, -255.5], cellSizeXZ: [1, 1], width: size, height: size },
      wetSource: { kind: "water-level" },
      outsidePolicy: {
        negativeX: OceanNearshoreOutsidePolicy.DeepOcean,
        positiveX: OceanNearshoreOutsidePolicy.DeepOcean,
        negativeZ: OceanNearshoreOutsidePolicy.DeepOcean,
        positiveZ: OceanNearshoreOutsidePolicy.DeepOcean
      },
      budget: { maxWidth: size, maxHeight: size, maxTexelCount: size * size, maxAtlasByteLength: size * size * 4 }
    };
    nearshore = createOceanNearshoreFromTerrain(template, createIslandOceanOwnership(source, template.grid), {
      waterLevel: source.waterLevel,
      terrain: source.terrain
    });
  }
  const ocean: OceanWaterBodyDescriptorV1 = {
    schemaVersion: OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION,
    id: "ocean",
    config: {
      waterLevel: source.waterLevel,
      connections: source.connections.byBody.ocean,
      nearshoreDescriptor: nearshore
    }
  };
  return { lakes, rivers, ocean };
}
