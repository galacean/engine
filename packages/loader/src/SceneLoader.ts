import { AssetPromise, Loader, LoadItem, resourceLoader, ResourceManager, AssetType, Scene } from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { SceneParser } from "@oasis-engine/resource-process";

@resourceLoader(AssetType.Scene, ["prefab"], true)
class SceneLoader extends Loader<Scene> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Scene> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, { type: "json" }).then((data) => {
        engine.resourceManager.initVirtualResources(data.files);
        debugger;
        SceneParser.parse(engine, data).then((scene) => {
          const entity = scene.findEntityByName("Camera");
          entity.transform.setPosition(10, 10, 10);
          entity.transform.lookAt(new Vector3());
          engine.sceneManager.activeScene = scene;
        });
      });
      //
    });
  }
}
