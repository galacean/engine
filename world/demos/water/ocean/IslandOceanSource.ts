import {
  createWaterBodyAsset,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  type WaterBodySourceV1,
  createWaterBodyInstance,
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion
} from "@galacean/engine-water/water/index";
import { registerOceanAuthoring } from "@galacean/engine-water/water/presets/ocean/index";

import type { OceanNearshoreDescriptorV1 } from "@galacean/engine-water/water/index";

import type { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/index";
import {
  computeOceanWaterSourceHash,
  OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION,
  type OceanWaterBodyDescriptorV1
} from "@galacean/engine-water/water/runtime/ocean/index";

export const ISLAND_OCEAN_BODY_ID = "island-ocean";
export const ISLAND_GRID = Object.freeze({ origin: -191.25, spacing: 1.5, resolution: 256 });

function coastRadius(angle: number): number {
  return 76 + 9 * Math.sin(3 * angle + 0.6) + 5 * Math.cos(5 * angle - 0.8);
}

/** One deterministic terrain authority supplies both the visible island and Ocean bathymetry. */
export function sampleIslandHeight(x: number, z: number): number {
  const angle = Math.atan2(z, x);
  const radius = Math.hypot(x, z);
  const coast = coastRadius(angle);
  const inland = coast - radius;
  if (inland < 0) return Math.max(-28, inland * 0.16 + Math.min(0, inland + 28) * 0.24);
  const beach = Math.min(3.2, inland * 0.2);
  const foothill = Math.max(0, Math.min(1, (inland - 12) / 28));
  const peak = 25 * Math.exp(-((x + 12) ** 2 / 1_050 + (z + 9) ** 2 / 950));
  const ridge = 14 * Math.exp(-((x - 20) ** 2 / 620 + (z + 18) ** 2 / 480));
  const detail = 1.4 * Math.sin(x * 0.14) * Math.cos(z * 0.12) + 0.7 * Math.sin((x + z) * 0.32);
  return beach + foothill * (peak + ridge + 4 + detail);
}

export function createIslandOceanDescriptor(): Readonly<OceanWaterBodyDescriptorV1> {
  const { origin, spacing, resolution } = ISLAND_GRID;
  const bedHeights = new Float32Array(resolution * resolution);
  const signedShoreDistances = new Float32Array(bedHeights.length);
  const coast = Array.from({ length: 513 }, (_, index) => {
    const angle = (index / 512) * Math.PI * 2;
    return [coastRadius(angle) * Math.cos(angle), coastRadius(angle) * Math.sin(angle)] as const;
  });
  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const index = row * resolution + column;
      const x = origin + column * spacing;
      const z = origin + row * spacing;
      const height = sampleIslandHeight(x, z);
      bedHeights[index] = height;
      // Distance to a densely sampled continuous coastline avoids texel-shaped contact foam.
      let distanceSquared = Number.POSITIVE_INFINITY;
      for (let segment = 0; segment < coast.length - 1; segment++) {
        const a = coast[segment]!;
        const b = coast[segment + 1]!;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
        distanceSquared = Math.min(distanceSquared, (x - a[0] - t * dx) ** 2 + (z - a[1] - t * dz) ** 2);
      }
      signedShoreDistances[index] = Math.max(0.001, Math.sqrt(distanceSquared)) * (height < 0 ? 1 : -1);
    }
  }
  const nearshoreDescriptor: OceanNearshoreDescriptorV1 = {
    schemaVersion: OceanNearshoreSchemaVersion.V1,
    id: `${ISLAND_OCEAN_BODY_ID}:nearshore`,
    waterLevel: 0,
    grid: { originXZ: [origin, origin], cellSizeXZ: [spacing, spacing], width: resolution, height: resolution },
    bedHeights,
    signedShoreDistances,
    wetSource: { kind: "water-level", minimumDepth: 0 },
    outsidePolicy: {
      negativeX: OceanNearshoreOutsidePolicy.DeepOcean,
      positiveX: OceanNearshoreOutsidePolicy.DeepOcean,
      negativeZ: OceanNearshoreOutsidePolicy.DeepOcean,
      positiveZ: OceanNearshoreOutsidePolicy.DeepOcean
    }
  };
  return Object.freeze({
    schemaVersion: OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION,
    id: ISLAND_OCEAN_BODY_ID,
    config: { waterLevel: 0, nearshoreDescriptor }
  });
}

/** Uses the same semantic Body, canonical Look and fixed budget as SeedWorld. Only the physical source differs. */
export function createIslandOceanBody(assets: WaterBodyAssetRegistry, descriptor = createIslandOceanDescriptor()) {
  const authoring = registerOceanAuthoring(assets, descriptor.config);
  const asset = createWaterBodyAsset<WaterBodySourceV1>({
    id: descriptor.id,
    kind: "ocean",
    representation: { domain: "world-space-ocean", macroSurface: "gerstner" },
    sourceHash: computeOceanWaterSourceHash(descriptor),
    source: {
      schemaVersion: WaterBodySourceSchemaVersion.V1,
      kind: WaterBodySourceKind.OceanNearshore,
      capabilities: { localBathymetry: true, shoreSdf: true, current: false },
      descriptor
    }
  });
  const instance = createWaterBodyInstance({
    id: descriptor.id,
    assetId: asset.id,
    ...authoring,
    transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
    visible: true,
    priority: 0,
    interaction: { query: false, buoyancy: false, wake: false },
    representationState: {
      schemaVersion: 1,
      kind: "ocean-surface-layout",
      centerXZ: [0, 0],
      size: 4_096,
      surfaceTopology: "finite",
      finitePatchGridSize: 1
    }
  });
  return { asset, instance };
}
