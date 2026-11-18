import { Loader as TerrainScriptRegistryLoader } from "@galacean/engine";
import { TerrainNavigationRuntime as TerrainScriptClass0 } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { TerrainPostProcessRuntime as TerrainScriptClass1 } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { TerrainProjectWorldRuntime as TerrainScriptClass6 } from "@galacean/engine-terrain/terrain/project/TerrainProjectRuntime";
import { TerrainPrototypeMetadata as TerrainScriptClass7 } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import { TerrainWaterRuntime as TerrainScriptClass8 } from "../integrations/terrain/project/TerrainWaterRuntime.ts";
import { TerrainWindRuntime as TerrainScriptClass9 } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";

TerrainScriptRegistryLoader.registerClass("/Script/TerrainNavigationRuntime.ts", TerrainScriptClass0);
TerrainScriptRegistryLoader.registerClass("/Script/TerrainPostProcessRuntime.ts", TerrainScriptClass1);
TerrainScriptRegistryLoader.registerClass("/Script/TerrainProjectWorldRuntime.ts", TerrainScriptClass6);
TerrainScriptRegistryLoader.registerClass("/Script/TerrainPrototypeMetadata.ts", TerrainScriptClass7);
TerrainScriptRegistryLoader.registerClass("/Script/TerrainWaterRuntime.ts", TerrainScriptClass8);
TerrainScriptRegistryLoader.registerClass("/Script/TerrainWindRuntime.ts", TerrainScriptClass9);

export const terrainScriptRegistryComplete = true;
