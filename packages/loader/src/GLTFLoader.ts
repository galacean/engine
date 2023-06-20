import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  Logger,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { GLTFParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";
import { ParserContext } from "./gltf/parser/ParserContext";

@resourceLoader(AssetType.Prefab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  load(item: LoadItem, resourceManager: ResourceManager): Record<string, AssetPromise<any>> {
    const url = item.url;
    const context = new ParserContext(url);
    const glTFResource = new GLTFResource(resourceManager.engine, url);
    const masterPromiseInfo = context.masterPromiseInfo;

    context.glTFResource = glTFResource;
    context.keepMeshData = item.params?.keepMeshData ?? false;

    masterPromiseInfo.onCancel(() => {
      const { chainPromises } = context;
      for (const promise of chainPromises) {
        promise.cancel();
      }
    });

    GLTFParser.defaultPipeline
      .parse(context)
      .then(masterPromiseInfo.resolve)
      .catch((e) => {
        const msg = `Error loading glTF model from ${url} .`;
        Logger.error(msg);
        masterPromiseInfo.reject(msg);
        context.defaultSceneRootPromiseInfo.reject(e);
        context.texturesPromiseInfo.reject(e);
        context.materialsPromiseInfo.reject(e);
        context.meshesPromiseInfo.reject(e);
        context.animationClipsPromiseInfo.reject(e);
      });

    return context.promiseMap;
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
  keepMeshData: boolean;
}
