import { resourceLoader, Loader, AssetPromise, LoaderType, LoadItem, ResourceManager } from "@alipay/o3-core";
import { GlTf, LoadedGLTFResource } from "./GLTF";
import { parseGLTF } from "./gltf/glTF";
import { parseGLB } from "./gltf/glb";
import { loadImageBuffer, getBufferData } from "./gltf/Util";

@resourceLoader(LoaderType.Perfab, ["gltf", "glb"])
export class GLTFLoader extends Loader<object> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<object> {
    return new AssetPromise((resolve, reject) => {
      const requestGLTFResource = this.isGLB(item.url) ? this.requestGLB : this.requestGLTF;
      requestGLTFResource(item, resourceManager)
        .then((res) => {
          const gltf = parseGLTF(res, resourceManager.engine);
          resolve(gltf);
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
    }).then((res) => this._loadGLTFResources(res, resourceManager));
  };

  private requestGLB = (item: LoadItem, resourceManager: ResourceManager): Promise<LoadedGLTFResource> => {
    return this.request<GlTf>(item.url, {
      ...item,
      type: "arraybuffer"
    })
      .then(parseGLB)
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
  private _loadGLTFResources(gltf: GlTf, resourceManager: ResourceManager): Promise<LoadedGLTFResource> {
    // 必须先加载 Buffer 再加载图片
    return this._loadBuffers(gltf, resourceManager).then(this._loadImages);
  }

  private _loadBuffers(gltf: GlTf, resourceManager: ResourceManager): Promise<LoadedGLTFResource> {
    if (gltf.buffers) {
      return Promise.all(
        gltf.buffers.map((item) => {
          if (item instanceof ArrayBuffer) {
            return Promise.resolve(item);
          }
          return resourceManager.load<ArrayBuffer>({ url: item.uri, type: LoaderType.Buffer });
        })
      ).then((buffers) => {
        return { buffers, gltf };
      });
    }
    return Promise.resolve({ gltf });
  }

  private _loadImages = ({ gltf, buffers }: LoadedGLTFResource): Promise<any> => {
    if (gltf.images) {
      return Promise.all(
        gltf.images.map(({ uri, bufferView: bufferViewIndex, mimeType }) => {
          if (uri) {
            // 使用 base64 或 url
            return this.request<HTMLImageElement>(uri, { type: "image" });
          } else {
            // 使用 bufferView
            const bufferView = gltf.bufferViews[bufferViewIndex];
            const bufferData = getBufferData(bufferView, buffers);
            return loadImageBuffer(bufferData, mimeType);
          }
        })
      ).then((images) => {
        return { gltf, buffers, images };
      });
    }
    return Promise.resolve({ gltf, buffers });
  };
}
