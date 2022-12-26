import { AssetPromise, AssetType, Loader, LoadItem, resourceLoader, ResourceManager } from "@oasis-engine/core";
import { GLTFParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFUtil } from "./gltf/GLTFUtil";
import { ParserContext } from "./gltf/parser/ParserContext";

function cache(resourceManager: ResourceManager, baseURL: string, query: string): void {}

@resourceLoader(AssetType.Prefab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    const url = item.url;
    return new AssetPromise((resolve, reject, _, onCancel) => {
      const context = new ParserContext();
      const glTFResource = new GLTFResource(resourceManager.engine);
      context.glTFResource = glTFResource;
      glTFResource.url = url;
      context.keepMeshData = item.params?.keepMeshData ?? false;

      let pipeline = GLTFParser.defaultPipeline;

      const { query, baseUrl } = GLTFUtil.parseUrl(url);
      if (query) {
        glTFResource.url = baseUrl;
        const path = GLTFUtil.stringToPath(query);
        const key = path[0];
        const value1 = Number(path[1]) || 0;
        const value2 = Number(path[2]) || 0;

        switch (key) {
          case "textures":
            pipeline = GLTFParser.texturePipeline;
            context.textureIndex = value1;
            break;
          case "materials":
            pipeline = GLTFParser.materialPipeline;
            context.materialIndex = value1;
            break;
          case "animations":
            pipeline = GLTFParser.animationPipeline;
            context.animationIndex = value1;
            break;
          case "meshes":
            pipeline = GLTFParser.meshPipeline;
            context.meshIndex = value1;
            context.subMeshIndex = value2;
            break;
          case "defaultSceneRoot":
            pipeline = GLTFParser.defaultPipeline;
            context.defaultSceneRootOnly = true;
            break;
        }
      }

      onCancel(() => {
        const { chainPromises } = context;
        for (const promise of chainPromises) {
          promise.cancel();
        }
      });

      pipeline
        .parse(context)
        .then(resolve)
        .catch((e) => {
          console.error(e);
          reject(`Error loading glTF model from ${url} .`);
        });
    });
  }
}

/**
 * GlTF loader params.
 */
export interface GLTFParams {
  /** Keep raw mesh data for glTF parser, default is false. */
  keepMeshData: boolean;
}
