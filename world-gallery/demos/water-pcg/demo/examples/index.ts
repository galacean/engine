/**
 * Water PCG example registry.
 *
 * Add new gallery cases here instead of growing main.ts. The render entry reads
 * this registry to build the top case switcher and clone the selected authoring
 * config into mutable runtime state.
 */
import { showcaseRiverExample } from "./river/showcaseRiver";
import { multiTributaryRiverExample } from "./river/multiTributaryRiver";
import { indoorReflectivePoolExample } from "./pool/indoorReflectivePool";
import {
  indoorReflectivePoolOceanPreview,
  multiTributaryOceanPreview,
  showcaseOceanPreview
} from "./ocean-preview/presets";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import { OceanConfig, WaterPcgExample } from "./types";

export const waterPcgExamples: readonly WaterPcgExample[] = [
  { ...showcaseRiverExample, ocean: showcaseOceanPreview },
  { ...multiTributaryRiverExample, ocean: multiTributaryOceanPreview },
  { ...indoorReflectivePoolExample, ocean: indoorReflectivePoolOceanPreview }
];

function cloneNearshoreDescriptor(
  descriptor: OceanNearshoreDescriptorV1
): OceanNearshoreDescriptorV1 {
  return {
    ...descriptor,
    grid: {
      ...descriptor.grid,
      originXZ: [...descriptor.grid.originXZ],
      cellSizeXZ: [...descriptor.grid.cellSizeXZ]
    },
    bedHeights: new Float32Array(descriptor.bedHeights),
    baseCurrentsXZ: descriptor.baseCurrentsXZ
      ? new Float32Array(descriptor.baseCurrentsXZ)
      : undefined,
    wetSource:
      descriptor.wetSource.kind === "mask"
        ? {
            ...descriptor.wetSource,
            mask: new Uint8Array(descriptor.wetSource.mask)
          }
        : { ...descriptor.wetSource },
    outsidePolicy: { ...descriptor.outsidePolicy },
    obstacles: descriptor.obstacles?.map((obstacle) =>
      obstacle.shape === "circle"
        ? {
            ...obstacle,
            centerXZ: [...obstacle.centerXZ]
          }
        : {
            ...obstacle,
            centerXZ: [...obstacle.centerXZ],
            radiiXZ: [...obstacle.radiiXZ]
          }
    ),
    budget: descriptor.budget ? { ...descriptor.budget } : undefined
  };
}

export function cloneOceanConfig(config: OceanConfig): OceanConfig {
  return {
    ...config,
    surfaceDetail: config.surfaceDetail
      ? {
          ...config.surfaceDetail,
          wind: [config.surfaceDetail.wind[0], config.surfaceDetail.wind[1]]
        }
      : undefined,
    nearshoreDescriptor: config.nearshoreDescriptor
      ? cloneNearshoreDescriptor(config.nearshoreDescriptor)
      : undefined,
    waveAsset:
      config.waveAsset.model === WaterWaveModel.DirectionalGerstner
        ? { ...config.waveAsset, generator: { ...config.waveAsset.generator } }
        : { ...config.waveAsset }
  };
}

export type { OceanConfig, WaterPcgExample };
