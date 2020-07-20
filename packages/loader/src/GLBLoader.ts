import { resourceLoader, Loader, AssetPromise, LoaderType, LoadItem, ResourceManager } from "@alipay/o3-core";
import { GlTf, LoadedGLTFResource } from "./GLTF";
import { parseGLB } from "./gltf/glb";
import { GLTFLoader } from "./GLTFLoader";

@resourceLoader(LoaderType.Perfab, ["glb"])
export class GLBLoader extends GLTFLoader {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<object> {
    return new AssetPromise((resolve, reject) => {
      this.request<GlTf>(item.url, {
        ...item,
        type: "arraybuffer"
      }).then((bin) => {
        const res = parseGLB(bin);
      });
    });
  }
}
