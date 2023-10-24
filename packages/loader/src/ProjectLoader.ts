import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Scene
} from "@galacean/engine-core";
import { IProject } from "./resource-deserialize";

@resourceLoader(AssetType.Project, ["proj"], false)
class ProjectLoader extends Loader<void> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<void> {
    const { engine } = resourceManager;
    return new AssetPromise((resolve, reject) => {
      this.request<IProject>(item.url, { type: "json" })
        .then((data) => {
          // @ts-ignore
          engine.resourceManager.initVirtualResources(data.files);
          return resourceManager.load<Scene>({ type: AssetType.Scene, url: data.scene }).then((scene) => {
            engine.sceneManager.activeScene = scene;
            resolve();
          });
        })
        .catch(reject);
    });
  }
}
