import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  Logger,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { GLTFPipeline } from "./gltf/GLTFPipeline";
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFParserContext } from "./gltf/parser/GLTFParserContext";

@resourceLoader(AssetType.Prefab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  load(item: LoadItem, resourceManager: ResourceManager): Record<string, AssetPromise<any>> {
    const { url } = item;
    const params = <GLTFParams>item.params;
    const context = new GLTFParserContext(url);
    const glTFResource = new GLTFResource(resourceManager.engine, url);
    const masterPromiseInfo = context.masterPromiseInfo;

    context.glTFResource = glTFResource;
    context.keepMeshData = params?.keepMeshData ?? false;

    masterPromiseInfo.onCancel(() => {
      const { chainPromises } = context;
      for (const promise of chainPromises) {
        promise.cancel();
      }
    });

    (params?.pipeline || GLTFPipeline.defaultPipeline)
      ._parse(context)
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
  /** Custom glTF pipeline. */
  pipeline: GLTFPipeline;
}
