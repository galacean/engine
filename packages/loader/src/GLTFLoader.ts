import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, ResourceManager } from "@oasis-engine/core";
import { gltfParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";

@resourceLoader(AssetType.Perfab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const url = item.url;

    return new AssetPromise((resolve, reject) => {
      const resource = new GLTFResource(resourceManager.engine);
      resource.url = url;
      gltfParser
        .parse(resource)
        .then(resolve)
        .catch((e) => {
          console.error(e);
          reject("Error loading glTF JSON from " + url);
        });
    });
  }
}
