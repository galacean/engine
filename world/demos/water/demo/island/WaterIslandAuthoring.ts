import { registerWaterIslandLook } from "./WaterIslandLook.ts";
import {
  computeWaterBodyAssetContentHash,
  createWaterBodyAsset,
  type WaterBodyAsset,
  createWaterBodyInstance,
  type WaterBodyInstance,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1,
  type HeightfieldWaterDescriptorV1,
  createWaterQualityPlanV2
} from "@galacean/engine-water/water/index";

import { hashStableValue } from "@galacean/engine-water/water/compiler/index";
import { createLakeSpatialFieldBudget, LAKE_WATER_LOOK_PRESET_ID } from "@galacean/engine-water/water/presets/lake/index";
import type { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/index";

export function createIslandLakeBody(assets: WaterBodyAssetRegistry, descriptor: HeightfieldWaterDescriptorV1) {
  const spatialField = createLakeSpatialFieldBudget(descriptor);
  const qualityPlanId = `${descriptor.id}-high:${hashStableValue(spatialField)}`;
  if (!assets.getQualityPlan(qualityPlanId))
    assets.registerQualityPlan(
      createWaterQualityPlanV2({
        id: qualityPlanId,
        geometry: "high",
        surfaceShading: "high",
        sceneFields: "scene-color-depth",
        reflectionBudget: { environment: true, screenSpace: true },
        query: "dense",
        spatialField
      })
    );
  const source = {
    schemaVersion: WaterBodySourceSchemaVersion.V1,
    kind: WaterBodySourceKind.GridMask,
    descriptor: createHeightfieldWaterBodySourceDescriptorV1(descriptor),
    capabilities: { localBathymetry: true, shoreSdf: true, current: true }
  } as const;
  const representationData = createHeightfieldWaterRepresentationDataV1(descriptor);
  const asset = createWaterBodyAsset({
    id: descriptor.id,
    kind: "lake",
    representation: { domain: "bounded-grid", macroSurface: "heightfield" },
    representationData,
    representationDataHash: hashStableValue(representationData),
    sourceHash: hashStableValue(source),
    source
  });
  const instance = createWaterBodyInstance({
    id: descriptor.id,
    assetId: asset.id,
    lookPresetId: registerWaterIslandLook(assets, LAKE_WATER_LOOK_PRESET_ID, "lake"),
    qualityPlanId,
    transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
    visible: true,
    priority: 20,
    interaction: { query: true, buoyancy: false, wake: false }
  });
  return { asset, instance };
}

/** Compare immutable authoring inputs, without rehashing terrain/atlas payloads or runtime closures. */
export function getIslandWaterBodyRevision(body: { asset: WaterBodyAsset; instance: WaterBodyInstance }): string {
  return hashStableValue({ asset: computeWaterBodyAssetContentHash(body.asset), instance: body.instance });
}
