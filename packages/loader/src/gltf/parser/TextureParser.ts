import { AssetType, Texture2D } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { getBufferViewData, loadImageBuffer, parseRelativeUrl } from "../Util";
import { Parser } from "./Parser";

export class TextureParser extends Parser {
  parse(context: GLTFResource): void | Promise<void> {
    const { gltf, buffers, engine, url } = context;

    if (gltf.images) {
      return Promise.all(
        gltf.images.map(({ uri, bufferView: bufferViewIndex, mimeType }) => {
          if (uri) {
            return engine.resourceManager.load<Texture2D>({
              url: parseRelativeUrl(url, uri),
              type: AssetType.Texture2D
            });
          } else {
            const bufferView = gltf.bufferViews[bufferViewIndex];
            const bufferViewData = getBufferViewData(bufferView, buffers);
            return loadImageBuffer(bufferViewData, mimeType).then((image) => {
              const texture = new Texture2D(engine, image.width, image.height);
              texture.setImageSource(image);
              texture.generateMipmaps();
              return texture;
            });
          }
        })
      ).then((textures: Texture2D[]) => {
        context.textures = textures;
      });
    }
  }
}
