import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, ResourceManager } from "@galacean/engine-core";
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFParserContext } from "./gltf/parser";

@resourceLoader(AssetType.GLTF, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const url = item.url;
    const params = <GLTFParams>item.params;
    const glTFResource = new GLTFResource(resourceManager.engine, url);
    const context = new GLTFParserContext(glTFResource, resourceManager, {
      keepMeshData: false,
      ...params
    });

    return new AssetPromise((resolve, reject, setProgress) => {
      context._setProgress = setProgress;
      context.parse().then(resolve).catch(reject);
    });
  }
}

/**
 * GlTF loader params.
 */
export interface GLTFParams {
  /**
   * @beta Now only contains vertex information, need to improve.
   * Keep raw mesh data for glTF parser, default is false.
   */
  keepMeshData?: boolean;
  [key: string]: any;
}
