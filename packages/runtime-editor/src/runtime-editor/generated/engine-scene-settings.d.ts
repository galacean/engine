import type { Scene, SceneFile, ResourceManager } from "@galacean/engine";
export declare function applySceneData(
  scene: Scene,
  data: SceneFile["scene"],
  manager: ResourceManager,
  refs: SceneFile["refs"]
): Promise<void>;
