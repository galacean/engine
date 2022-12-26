import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, ResourceManager } from "@oasis-engine/core";
import { GLTFParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";
import { ParserContext } from "./gltf/parser/ParserContext";

@resourceLoader(AssetType.Prefab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  load(item: LoadItem, resourceManager: ResourceManager): Record<string, AssetPromise<any>> {
    const context = new ParserContext();
    const url = item.url;

    const promiseMap: Record<string, AssetPromise<any>> = {};
    promiseMap[`${url}?q=textures`] = context.texturesPromiseInfo.promise;
    promiseMap[`${url}?q=materials`] = context.materialsPromiseInfo.promise;
    promiseMap[`${url}?q=meshes`] = context.meshesPromiseInfo.promise;
    promiseMap[`${url}?q=animations`] = context.animationClipsPromiseInfo.promise;
    promiseMap[`${url}?q=defaultSceneRoot`] = context.defaultSceneRootPromiseInfo.promise;
    promiseMap[`${url}`] = context.masterPromiseInfo.promise;

    const masterPromiseInfo = context.masterPromiseInfo;

    const glTFResource = new GLTFResource(resourceManager.engine);
    context.glTFResource = glTFResource;
    glTFResource.url = url;
    context.keepMeshData = item.params?.keepMeshData ?? false;

    let pipeline = GLTFParser.defaultPipeline;

    masterPromiseInfo.onCancel(() => {
      const { chainPromises } = context;
      for (const promise of chainPromises) {
        promise.cancel();
      }
    });

    pipeline
      .parse(context)
      .then(masterPromiseInfo.resolve)
      .catch((e) => {
        console.error(e);
        masterPromiseInfo.reject(`Error loading glTF model from ${url} .`);
      });

    return promiseMap;
  }
}

/**
 * GlTF loader params.
 */
export interface GLTFParams {
  /** Keep raw mesh data for glTF parser, default is false. */
  keepMeshData: boolean;
}
