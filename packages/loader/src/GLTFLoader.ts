import {
  AssetPromise,
  AssetType,
  Engine,
  EngineConfiguration,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine-core";
import { getMeshoptDecoder, ready } from "./gltf/extensions/MeshoptDecoder";
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFParserContext } from "./gltf/parser";

@resourceLoader(AssetType.GLTF, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  /**
   * Release glTF loader memory(includes meshopt workers).
   * @remarks If use loader after releasing, we should release again.
   */
  static release(): void {
    if (ready) {
      getMeshoptDecoder().then((meshoptDecoder) => {
        meshoptDecoder.release();
      });
    }
  }

  override initialize(_: Engine, configuration: EngineConfiguration): Promise<void> {
    const meshOptOptions = configuration.glTFLoader?.meshOpt ?? configuration.glTF?.meshOpt;
    if (meshOptOptions) {
      return getMeshoptDecoder().then((meshoptDecoder) => {
        meshoptDecoder.useWorkers(meshOptOptions.workerCount);
      });
    }
    return Promise.resolve();
  }

  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const params = <GLTFParams>item.params;
    const glTFResource = new GLTFResource(resourceManager.engine, item.url!);
    const context = new GLTFParserContext(glTFResource, resourceManager, {
      keepMeshData: false,
      ...params
    });

    // Hold an in-flight reference until parsing settles so concurrent gc() will not collect half-parsed resources
    glTFResource._addReferCount(1);
    let holdingRef = true;
    const releaseHold = () => {
      if (holdingRef) {
        holdingRef = false;
        if (!glTFResource.destroyed) {
          glTFResource._addReferCount(-1);
        }
      }
    };

    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress, onTaskCancel) => {
      context._setTaskCompleteProgress = setTaskCompleteProgress;
      context._setTaskDetailProgress = setTaskDetailProgress;
      onTaskCancel(() => {
        releaseHold();
        context._abort();
      });
      context
        .parse()
        .then((res) => {
          if (!context._aborted) {
            releaseHold();
            resolve(res);
          }
        })
        .catch((e) => {
          releaseHold();
          context._abort();
          reject(e);
        });
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
