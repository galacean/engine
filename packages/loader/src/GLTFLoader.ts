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
  static destroyMeshOptWorkers() {
    MeshoptDecoder.destroy();
  }

  override initialize(_: Engine, configuration: EngineConfiguration): Promise<void> {
    const workerCount = configuration.glTF?.meshOpt?.workerCount;
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

    return <AssetPromise<GLTFResource>>context.parse();
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
