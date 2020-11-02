import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  TextureCubeFace,
  TextureCubeMap
} from "@oasis-engine/core";

@resourceLoader(AssetType.TextureCube, [""])
class TextureCubeLoader extends Loader<TextureCubeMap> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCubeMap> {
    return new AssetPromise((resolve, reject) => {
      Promise.all(
        item.urls.map((url) =>
          this.request<HTMLImageElement>(url, {
            ...item,
            type: "image"
          })
        )
      )
        .then((images) => {
          const { width, height } = images[0];

          if (width !== height) {
            console.error("The cube texture must have the same width and height");
            return;
          }

          const tex = new TextureCubeMap(width, undefined, undefined, resourceManager.engine);
          tex.name = name;

          if (!tex._glTexture) return;

          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            tex.setImageSource(TextureCubeFace.PositiveX + faceIndex, images[faceIndex], 0);
          }

          tex.generateMipmaps();
          resolve(tex);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
