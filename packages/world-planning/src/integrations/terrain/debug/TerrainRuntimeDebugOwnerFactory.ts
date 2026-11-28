import { TerrainDemoControls } from "./TerrainDemoControls.ts";
import { TerrainRuntimeDebug } from "@galacean/engine-terrain/terrain/debug/TerrainRuntimeDebug";
import { TerrainRuntimeDebugInspector } from "./TerrainRuntimeDebugInspector.ts";
import { TerrainRuntimeDebugOwner, type TerrainRuntimeDebugModuleFactory } from "./TerrainRuntimeDebugOwner.ts";
import { TerrainScreenSpaceReflectionPanel } from "@galacean/engine-terrain/terrain/debug/TerrainScreenSpaceReflectionPanel";
import { TerrainVolumetricCloudPanel } from "./TerrainVolumetricCloudPanel.ts";

const TERRAIN_RUNTIME_DEBUG_MODULE_FACTORY = Object.freeze<TerrainRuntimeDebugModuleFactory>({
  createRuntimeDebug: (engine, options) => TerrainRuntimeDebug.create(engine, options),
  createControls: (options) => new TerrainDemoControls(options),
  createInspector: (options) => new TerrainRuntimeDebugInspector(options),
  createScreenSpaceReflectionPanel: (inspector, options) =>
    new TerrainScreenSpaceReflectionPanel(inspector.ssrFolderHost, options),
  createVolumetricCloudPanel: (inspector, environment) =>
    new TerrainVolumetricCloudPanel(inspector.cloudFolderHost, environment)
});

/**
 * Creates the shared owner bound to the canonical five Terrain Debug modules.
 * @returns Empty owner ready to mount one page-provided runtime generation.
 */
export function createTerrainRuntimeDebugOwner(): TerrainRuntimeDebugOwner {
  return new TerrainRuntimeDebugOwner(TERRAIN_RUNTIME_DEBUG_MODULE_FACTORY);
}
