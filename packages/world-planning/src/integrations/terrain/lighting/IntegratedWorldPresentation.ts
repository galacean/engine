import { type DirectLight, type Entity, type Scene } from "@galacean/engine";
import { INTEGRATED_WORLD_POST_PROCESS_PROFILE } from "@galacean/engine-terrain/terrain/project/IntegratedWorldPostProcessPreset";
import type { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import {
  INTEGRATED_WORLD_DEFAULT_TIME_HOURS,
  INTEGRATED_WORLD_DEFAULT_VISUAL_LIGHTING_TUNING,
  INTEGRATED_WORLD_TIME_OF_DAY_LIGHTING_PROFILE
} from "./IntegratedWorldLightingPreset.ts";
import { TerrainLightingRuntime } from "./TerrainLightingRuntime.ts";

/**
 * Creates the canonical Integrated World lighting owner from its single authored parameter source.
 *
 * The post-process profile must be installed before {@link TerrainLightingRuntime} captures the
 * Scene reference. The 24-hour lighting profile is then installed before the initial hour is
 * evaluated, so weather, day/night, fog, the procedural sky, and realtime IBL all consume the same
 * baseline on every Terrain entry point.
 */
export function createIntegratedWorldLightingRuntime(
  driverEntity: Entity,
  scene: Scene,
  directLight: DirectLight,
  postProcess: TerrainPostProcessRuntime
): TerrainLightingRuntime {
  postProcess.applyAuthoringProfile(INTEGRATED_WORLD_POST_PROCESS_PROFILE);
  const lighting = new TerrainLightingRuntime(driverEntity, scene, directLight, postProcess);
  lighting.setTimeOfDayLightingProfile(INTEGRATED_WORLD_TIME_OF_DAY_LIGHTING_PROFILE);
  lighting.applyVisualTuning(INTEGRATED_WORLD_DEFAULT_VISUAL_LIGHTING_TUNING);
  lighting.setTuning({ playing: false, timeHours: INTEGRATED_WORLD_DEFAULT_TIME_HOURS });
  return lighting;
}
