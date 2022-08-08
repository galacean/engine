import { AssetPromise, AssetType, Loader, LoadItem, Logger, resourceLoader, ResourceManager } from "@oasis-engine/core";
import { GLTFParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";

@resourceLoader(AssetType.Prefab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const url = item.url;
    return new AssetPromise((resolve, reject) => {
      const resource = new GLTFResource(resourceManager.engine);
      resource.url = url;

      GLTFParser.instance
        .parse(resource)
        .then(resolve)
        .catch((e) => {
          Logger.error(e);
          reject(`Error loading glTF model from ${url} .`);
        });
    });
  }
}
