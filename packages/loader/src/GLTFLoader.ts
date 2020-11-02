import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem, ResourceManager, Texture2D } from "@alipay/o3-core";
import { GlTf, LoadedGLTFResource } from "./GLTF";
import { parseGLTF, GLTFResource } from "./gltf/glTF";
import { parseGLB } from "./gltf/glb";
import { loadImageBuffer, getBufferData, parseRelativeUrl } from "./gltf/Util";

@resourceLoader(AssetType.Perfab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  private baseUrl: string;
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GLTFResource> {
    return new AssetPromise((resolve, reject) => {
      const requestGLTFResource = this.isGLB(item.url) ? this.requestGLB : this.requestGLTF;
      requestGLTFResource(item, resourceManager)
        .then((res) => {
          parseGLTF(res, resourceManager.engine).then((gltf) => {
            resolve(gltf);
          });
        })
        .catch((e) => {
          console.error(e);
          reject("Error loading glTF JSON from " + item.url);
        });
    });
  }

  private requestGLTF = (item: LoadItem, resourceManager: ResourceManager): Promise<LoadedGLTFResource> => {
    return this.request<GlTf>(item.url, {
      ...item,
      type: "json"
    }).then((res) => this._loadGLTFResources(item, res, resourceManager));
  };

  private requestGLB = (item: LoadItem, resourceManager: ResourceManager): Promise<LoadedGLTFResource> => {
    return this.request<GlTf>(item.url, {
      ...item,
      type: "arraybuffer"
    })
      .then(parseGLB)
      .then((res) => {
        return { ...res, baseUrl: item.url, resourceManager };
      })
      .then(this._loadImages);
  };

  private isGLB(url: string): boolean {
    return url.substring(url.lastIndexOf(".") + 1) === "glb";
  }

  /**
   * 加载 gltf 内的资源
   * @param gltf
   * @param resourceManager
   */
  private _loadGLTFResources(
    item: LoadItem,
    gltf: GlTf,
    resourceManager: ResourceManager
  ): Promise<LoadedGLTFResource> {
    // 必须先加载 Buffer 再加载图片
    return this._loadBuffers(item.url, gltf, resourceManager).then(this._loadImages);
  }

  private _loadBuffers(baseUrl: string, gltf: GlTf, resourceManager: ResourceManager): Promise<LoadedGLTFResource> {
    if (gltf.buffers) {
      return Promise.all(
        gltf.buffers.map((item) => {
          if (item instanceof ArrayBuffer) {
            return Promise.resolve(item);
          }
          return resourceManager.load<ArrayBuffer>({
            url: parseRelativeUrl(baseUrl, item.uri),
            type: AssetType.Buffer
          });
        })
      ).then((buffers) => {
        return { buffers, gltf, baseUrl, resourceManager };
      });
    }
    return Promise.resolve({ baseUrl, gltf, resourceManager });
  }

  private _loadImages = ({
    gltf,
    buffers,
    baseUrl,
    resourceManager
  }: LoadedGLTFResource & { baseUrl: string; resourceManager: ResourceManager }): Promise<any> => {
    if (gltf.images) {
      return Promise.all(
        gltf.images.map(({ uri, bufferView: bufferViewIndex, mimeType }) => {
          if (uri) {
            // 使用 base64 或 url
            return resourceManager.load({ url: parseRelativeUrl(baseUrl, uri), type: AssetType.Texture2D });
          } else {
            // 使用 bufferView
            const bufferView = gltf.bufferViews[bufferViewIndex];
            const bufferData = getBufferData(bufferView, buffers);
            return loadImageBuffer(bufferData, mimeType).then((image) => {
              const tex = new Texture2D(resourceManager.engine, image.width, image.height);
              tex.setImageSource(image);
              tex.generateMipmaps();
              return tex;
            });
          }
        })
      ).then((textures) => {
        return { gltf, buffers, textures };
      });
    }
    return Promise.resolve({ gltf, buffers });
  };
}
