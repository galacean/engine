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
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFParserContext } from "./gltf/parser";
import { MeshoptDecoder } from "./gltf/extensions/MeshoptDecoder";

@resourceLoader(AssetType.GLTF, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  /**
   * Release glTF loader memory(includes meshopt workers).
   */
  static release(): void {
    MeshoptDecoder.release();
  }

  override initialize(_: Engine, configuration: EngineConfiguration): Promise<void> {
    const workerCount = configuration.glTF?.meshOpt?.workerCount ?? 4;
    if (workerCount > 0) MeshoptDecoder.useWorkers(workerCount);
    return Promise.resolve();
  }

  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const url = item.url;
    const params = <GLTFParams>item.params;
    const glTFResource = new GLTFResource(resourceManager.engine, url);
    const context = new GLTFParserContext(glTFResource, resourceManager, {
      keepMeshData: false,
      ...params
    });

    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
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
