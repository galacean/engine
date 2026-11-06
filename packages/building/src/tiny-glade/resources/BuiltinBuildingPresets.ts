import type { RuntimeProjectManifest } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { BUILTIN_BUILDING_ASSETS } from "./BuiltinBuildingAssets";

/** Import descriptors for editable native Prefabs. Creation reads their current VFS contents. */
export const builtinBuildingPresets = [
  {
    name: "圆方 Gothic",
    path: "Building/Presets/round-gothic.prefab",
    url: new URL("../assets/prefabs/round-gothic.prefab", import.meta.url).href
  },
  {
    name: "双圆屋连接",
    path: "Building/Presets/circle-circle.prefab",
    url: new URL("../assets/prefabs/circle-circle.prefab", import.meta.url).href
  },
  {
    name: "山墙交接",
    path: "Building/Presets/gable-junction.prefab",
    url: new URL("../assets/prefabs/gable-junction.prefab", import.meta.url).href
  }
] as const;
export const builtinBuildingPresetFiles: RuntimeProjectManifest["files"] = builtinBuildingPresets.map((preset) => ({
  virtualPath: preset.path,
  path: preset.url,
  type: "Prefab",
  dependencies: [BUILTIN_BUILDING_ASSETS]
}));
