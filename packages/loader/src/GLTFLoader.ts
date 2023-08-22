import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  Logger,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFParserContext } from "./gltf/parser";

@resourceLoader(AssetType.GLTF, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const url = item.url;
    const params = <GLTFParams>item.params;
    const glTFResource = new GLTFResource(resourceManager.engine, url);
    const context = new GLTFParserContext(glTFResource, resourceManager, params?.keepMeshData ?? false, url);

    return <AssetPromise<GLTFResource>>context._parse().catch((e) => {
      const msg = `Error loading glTF model from ${url} : ${e}`;
      Logger.error(msg);
      throw e;
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
}
