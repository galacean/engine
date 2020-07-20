import { resourceLoader, Loader, AssetPromise, LoaderType, LoadItem, ResourceManager } from "@alipay/o3-core";
import { Texture2D, TextureCubeMap } from "@alipay/o3-material";
import { TextureCubeFace } from "@alipay/o3-base";

@resourceLoader(LoaderType.TextureCube, [""])
class TextureCubeLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      Promise.all(
        item.urls.map((url) =>
          this.request<HTMLImageElement>(url, {
            ...item,
            type: "image"
          })
        )
      ).then((images) => {
        // const { data, name } = resource;
        const { width, height } = images[0];

        // if (width !== height) {
        // Logger.error("The cube texture must have the same width and height");
        // return;
        // }

        const tex = new TextureCubeMap(resourceManager.engine.hardwareRenderer, width);
        tex.name = name;

        if (!tex._glTexture) return;

        // for (let miplevel = 0; miplevel < images.length; miplevel++) {
        //   for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        //     tex.setImageSource(TextureCubeFace.PositiveX + faceIndex, data[miplevel][faceIndex], miplevel);
        //   }
        // }

        // if (data.length === 1) {
        //   tex.generateMipmaps();
        // }

        // tex.type = resource.assetType;
        // resource.asset = tex;
      });
    });
  }
}
