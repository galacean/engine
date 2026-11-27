import type {
  HeightfieldWaterDescriptorV1,
  TerrainRegionWaterBodySourceV1,
  WaterSpatialFieldSourcesV1
} from "@galacean/engine-water/water/index";

import { decodeWaterSpatialFieldSources, encodeWaterSpatialFieldSourcesV1 } from "@galacean/engine-water/water/index";
import { GRASSLANDS_TERRAIN_WATER_PROVIDER_ID } from "./GrasslandsWaterBodyAuthoring";
import type {
  WaterBodyProviderResolveContext,
  WaterBodySourceProviderFactory
} from "@galacean/engine-water/water/runtime/index";

export interface GrasslandsTerrainWaterProviderContext {
  readonly descriptor: HeightfieldWaterDescriptorV1;
  readonly regionContentHash: string;
  readonly spatialFields: WaterSpatialFieldSourcesV1;
}

export function createGrasslandsTerrainWaterProviderContext(
  descriptor: HeightfieldWaterDescriptorV1,
  regionContentHash: string,
  spatialFields: WaterSpatialFieldSourcesV1
): Readonly<GrasslandsTerrainWaterProviderContext> {
  const decodedSpatialFields = decodeWaterSpatialFieldSources(spatialFields);
  if (!decodedSpatialFields.valid || !decodedSpatialFields.value) {
    const first = decodedSpatialFields.diagnostics[0];
    throw new Error(
      first
        ? `Grasslands Water provider spatial fields are invalid at ${first.path}: ${first.message}`
        : "Grasslands Water provider spatial fields are invalid."
    );
  }
  return Object.freeze({
    descriptor,
    regionContentHash,
    spatialFields: decodedSpatialFields.value
  });
}

export function createGrasslandsTerrainWaterProvider(
  providerContext: Readonly<GrasslandsTerrainWaterProviderContext>
): WaterBodySourceProviderFactory {
  const expectedSpatialFields = encodeWaterSpatialFieldSourcesV1(providerContext.spatialFields);
  return Object.freeze({
    id: GRASSLANDS_TERRAIN_WATER_PROVIDER_ID,
    resolve(source: TerrainRegionWaterBodySourceV1, context: WaterBodyProviderResolveContext) {
      if (context.providerContext !== providerContext) {
        throw new Error("Grasslands Terrain provider requires its detached Water region context.");
      }
      if (
        Object.keys(source.parameters).length !== 1 ||
        source.parameters.regionContentHash !== providerContext.regionContentHash
      ) {
        throw new Error("Grasslands Terrain provider source identity does not match the detached region.");
      }
      if (!source.spatialFields || encodeWaterSpatialFieldSourcesV1(source.spatialFields) !== expectedSpatialFields) {
        throw new Error("Grasslands Terrain provider spatial fields do not match the compiled detached region.");
      }
      return providerContext.descriptor;
    }
  });
}
