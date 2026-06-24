import type { SkeletonData, TextureAtlas } from "@esotericsoftware/spine-core";
import { AssetPromise, AssetType, Engine, Texture2D } from "@galacean/engine";
import { getSpineRuntime } from "../runtime/SpineRuntimeRegistry";

/**
 * @internal
 */
export class LoaderUtils {
  static createSkeletonData(
    skeletonRawData: string | ArrayBuffer,
    textureAtlas: TextureAtlas,
    skeletonDataScale: number
  ): SkeletonData {
    return getSpineRuntime().createSkeletonData(skeletonRawData, textureAtlas, skeletonDataScale);
  }

  static createTextureAtlas(atlasText: string, textures: Texture2D[]): TextureAtlas {
    return getSpineRuntime().createTextureAtlas(atlasText, textures);
  }

  static loadTexturesByPaths(
    imagePaths: string[],
    imageExtensions: string[],
    engine: Engine,
    reject: (reason?: any) => void
  ): Promise<Texture2D[]> {
    const resourceManager = engine.resourceManager;
    // @ts-ignore
    const virtualPathResourceMap = resourceManager._virtualPathResourceMap;
    const texturePromises: AssetPromise<Texture2D>[] = imagePaths.map((imagePath, index) => {
      const ext = imageExtensions[index];
      let imageLoaderType = AssetType.Texture;
      const virtualElement = virtualPathResourceMap[imagePath];
      if (virtualElement) {
        imageLoaderType = virtualElement.type;
      } else if (ext === "ktx") {
        imageLoaderType = AssetType.KTX;
      } else if (ext === "ktx2") {
        imageLoaderType = AssetType.KTX2;
      }
      return resourceManager.load({
        url: imagePath,
        type: imageLoaderType
      });
    });
    return Promise.all(texturePromises).catch((error) => {
      reject(error);
      return [];
    });
  }

  static loadTextureAtlas(atlasPath: string, engine: Engine, reject: (reason?: any) => void): Promise<TextureAtlas> {
    const baseUrl = LoaderUtils.getBaseUrl(atlasPath);
    const resourceManager = engine.resourceManager;
    let atlasText: string;
    return (
      resourceManager
        // @ts-ignore
        ._request(atlasPath, { type: "text" })
        .then((text: string) => {
          atlasText = text;
          const runtime = getSpineRuntime();
          const pageNames = runtime.parseAtlasPageNames(atlasText);
          const loadTexturePromises = pageNames.map((name) => {
            const textureUrl = baseUrl + name;
            return resourceManager.load({
              url: textureUrl,
              type: AssetType.Texture
            }) as unknown as Promise<Texture2D>;
          });
          return Promise.all(loadTexturePromises).then((textures) => {
            return runtime.createTextureAtlas(atlasText, textures);
          });
        })
        .catch((err) => {
          reject(new Error(`Spine Atlas: ${atlasPath} load error: ${err}`));
          return null;
        })
    );
  }

  static getBaseUrl(url: string): string {
    const isLocalPath = !/^(http|https|ftp):\/\/.*/i.test(url);
    if (isLocalPath) {
      const lastSlashIndex = url.lastIndexOf("/");
      if (lastSlashIndex === -1) {
        return "";
      }
      return url.substring(0, lastSlashIndex + 1);
    } else {
      const parsedUrl = new URL(url);
      const basePath = parsedUrl.origin + parsedUrl.pathname;
      return basePath.endsWith("/") ? basePath : basePath.substring(0, basePath.lastIndexOf("/") + 1);
    }
  }
}
