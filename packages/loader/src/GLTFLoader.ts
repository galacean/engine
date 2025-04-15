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
    const glTFResource = new GLTFResource(resourceManager.engine, item.url);
    const context = new GLTFParserContext(glTFResource, resourceManager, {
      keepMeshData: false,
      ...params
    });

    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress, onCancel) => {
      context._setTaskCompleteProgress = setTaskCompleteProgress;
      context._setTaskDetailProgress = setTaskDetailProgress;
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
