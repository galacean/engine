import type { Engine, Entity } from "@galacean/engine";
import type { RiverNetworkDescriptor } from "@galacean/engine-water/water/index";
import { PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1 } from "@galacean/engine-water/water/presets/river/index";
import {
  createRiverWaterBodyAsset,
  createRiverWaterBodyInstance,
  createWaterQualityPlanV2
} from "@galacean/engine-water/water/index";
import { registerRiverWaterBodyPresets } from "@galacean/engine-water/water/presets/river/index";

import { LAKE_WATER_LOOK_PRESET_ID } from "@galacean/engine-water/water/presets/lake/index";
import { RIVER_COMPILER_SEMANTIC_VERSION } from "@galacean/engine-water/water/compiler/index";
import { RIVER_WATER_BACKEND_ID, RiverWaterBackend } from "@galacean/engine-water/water/runtime/river/index";
import type { WaterSceneRuntimeHost } from "@galacean/engine-water/water/runtime/index";
import type { RiverTerrainInteractionData } from "@galacean/engine-water/water/compiler/index";
import {
  PROMPT_NOISE_HYDROLOGY_SEMANTIC_VERSION,
  resolvePromptNoiseRiverGeneration
} from "../../generation/noise/PromptNoiseRiverHydrologyResolver.ts";
import type { PromptNoiseRiverOperatorV1 } from "../../generation/noise/PromptNoiseTerrainProgram.ts";
import { TERRAIN_GRASSLANDS_RIVER_BODY_ID } from "./GrasslandsLakeRiverIdentity";

export { TERRAIN_GRASSLANDS_RIVER_BODY_ID } from "./GrasslandsLakeRiverIdentity";
export const TERRAIN_GRASSLANDS_RIVER_MOUTH_LEVEL = 12.2;
const TERRAIN_GRASSLANDS_RIVER_DEPTH = 3;
const TERRAIN_GRASSLANDS_RIVER_RENDER_PRIORITY = 1;
export const TERRAIN_GRASSLANDS_RIVER_QUALITY_PLAN_ID = "terrain-grasslands-river-high-v2";
export const TERRAIN_GRASSLANDS_RIVER_QUALITY_PLAN = createWaterQualityPlanV2({
  id: TERRAIN_GRASSLANDS_RIVER_QUALITY_PLAN_ID,
  geometry: "high",
  surfaceShading: "high",
  sceneFields: "scene-color-depth",
  reflectionBudget: { environment: true, screenSpace: true },
  query: "dense",
  spatialField: {
    maximumHorizontalError: 0.25,
    maximumDepthError: 0,
    maximumGpuDepthDecodeError: 0,
    maximumGpuShoreDecodeError: 0,
    maximumAtlasPixels: Number.MAX_SAFE_INTEGER
  }
});

const GRASSLANDS_RIVER_BACKENDS = new WeakMap<WaterSceneRuntimeHost, RiverWaterBackend>();

/**
 * Deterministic desktop acceptance river following the existing Grasslands
 * south-east valley into the canonical 12.2 m lake. Its resolved surface
 * remains within the High profile's 20% continuous-slope limit, while the
 * mouth finishes inside the lake's wet mask at the shared surface height.
 */
export const TERRAIN_GRASSLANDS_RIVER_OPERATOR: PromptNoiseRiverOperatorV1 = Object.freeze({
  id: 1202,
  enabled: true,
  kind: "river",
  templateId: "river-shallow",
  anchor: Object.freeze({ x: 1554.5, z: 1666.5 }),
  forward: Object.freeze({ x: -0.790700462207263, z: -0.6122032324917062 }),
  length: 145.41664202241753,
  bend: 20,
  halfWidth: 12,
  bankWidth: 8,
  // The 3 m bed clearance remains representable by the distant mobile Clipmap LODs.
  startHeight: 10,
  endHeight: TERRAIN_GRASSLANDS_RIVER_MOUTH_LEVEL - TERRAIN_GRASSLANDS_RIVER_DEPTH,
  bankHeight: TERRAIN_GRASSLANDS_RIVER_DEPTH / 0.1,
  strength: 1
});

export interface GrasslandsLakeRiverInspection {
  readonly bodyId: typeof TERRAIN_GRASSLANDS_RIVER_BODY_ID;
  readonly mouthLevel: typeof TERRAIN_GRASSLANDS_RIVER_MOUTH_LEVEL;
  readonly descriptorHash: string;
}

export interface GrasslandsLakeRiverStageResult {
  readonly inspection: GrasslandsLakeRiverInspection;
  readonly terrainInteraction: RiverTerrainInteractionData;
  readonly bodyOrigin: readonly [x: number, z: number];
}

export async function stageGrasslandsLakeRiver(
  host: WaterSceneRuntimeHost,
  engine: Engine,
  revision: number
): Promise<GrasslandsLakeRiverStageResult> {
  let riverBackend = GRASSLANDS_RIVER_BACKENDS.get(host);
  if (!host.hasBackend(RIVER_WATER_BACKEND_ID)) {
    riverBackend = new RiverWaterBackend();
    host.registerBackend(riverBackend);
    GRASSLANDS_RIVER_BACKENDS.set(host, riverBackend);
    host.registerAuthoring((assets) => {
      registerRiverWaterBodyPresets(assets);
      assets.registerQualityPlan(TERRAIN_GRASSLANDS_RIVER_QUALITY_PLAN);
    });
  }
  if (!riverBackend) {
    throw new Error("Terrain Grasslands River backend is owned by another composition root.");
  }
  const resolvedBase = resolvePromptNoiseRiverGeneration(
    TERRAIN_GRASSLANDS_RIVER_OPERATOR,
    PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1
  );
  const descriptor = Object.freeze({
    ...resolvedBase.descriptor,
    id: TERRAIN_GRASSLANDS_RIVER_BODY_ID,
    defaults: Object.freeze({
      ...resolvedBase.descriptor.defaults,
      surfaceMotion: Object.freeze({
        ...resolvedBase.descriptor.defaults.surfaceMotion,
        displacementAmplitude: 0
      })
    }),
    derivation: resolvedBase.descriptor.derivation
      ? Object.freeze({
          ...resolvedBase.descriptor.derivation,
          hydrologySemanticVersion: PROMPT_NOISE_HYDROLOGY_SEMANTIC_VERSION,
          compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION
        })
      : undefined,
    nodes: resolvedBase.descriptor.nodes.map((node) =>
      Object.freeze({
        ...node,
        id:
          node.kind === "source"
            ? `${TERRAIN_GRASSLANDS_RIVER_BODY_ID}-source`
            : `${TERRAIN_GRASSLANDS_RIVER_BODY_ID}-mouth`
      })
    ),
    segments: resolvedBase.descriptor.segments.map((segment) =>
      Object.freeze({
        ...segment,
        id: TERRAIN_GRASSLANDS_RIVER_BODY_ID,
        from: `${TERRAIN_GRASSLANDS_RIVER_BODY_ID}-source`,
        to: `${TERRAIN_GRASSLANDS_RIVER_BODY_ID}-mouth`
      })
    )
  }) as RiverNetworkDescriptor;
  const assetId = `${TERRAIN_GRASSLANDS_RIVER_BODY_ID}-asset`;
  const asset = createRiverWaterBodyAsset(descriptor, assetId);
  const transaction = host.beginBodySetTransaction(revision);
  transaction.stage({
    bodyId: TERRAIN_GRASSLANDS_RIVER_BODY_ID,
    asset,
    instance: createRiverWaterBodyInstance({
      id: TERRAIN_GRASSLANDS_RIVER_BODY_ID,
      assetId,
      lookPresetId: LAKE_WATER_LOOK_PRESET_ID,
      qualityPlanId: TERRAIN_GRASSLANDS_RIVER_QUALITY_PLAN_ID,
      visible: true,
      priority: TERRAIN_GRASSLANDS_RIVER_RENDER_PRIORITY
    }),
    bodyOrigin: resolvedBase.bodyOrigin,
    logicalBounds: resolvedBase.logicalBounds,
    profileId: resolvedBase.profile.id,
    profileVersion: resolvedBase.profile.version,
    descriptorSchemaVersion: descriptor.schemaVersion,
    compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION,
    canonicalDescriptorHash: asset.sourceHash,
    createRuntimeContext: (bodyRoot: Entity) => ({
      engine,
      root: bodyRoot,
      logicalBodyOrigin: resolvedBase.bodyOrigin
    })
  });
  await transaction.commit();
  const terrainInteraction = riverBackend.getTerrainInteractionSnapshot(TERRAIN_GRASSLANDS_RIVER_BODY_ID);
  if (!terrainInteraction) throw new Error("Terrain Grasslands River did not publish Terrain interaction data.");
  return Object.freeze({
    inspection: Object.freeze({
      bodyId: TERRAIN_GRASSLANDS_RIVER_BODY_ID,
      mouthLevel: TERRAIN_GRASSLANDS_RIVER_MOUTH_LEVEL,
      descriptorHash: asset.sourceHash
    }),
    terrainInteraction,
    bodyOrigin: resolvedBase.bodyOrigin
  });
}
