import { AssetPromise, decode, Loader, LoadItem, resourceLoader, ResourceManager } from "@galacean/engine";
import { XRReferenceImage } from "../feature/trackable/image/XRReferenceImage";

@resourceLoader("XRReferenceImage", [])
export class XRReferenceImageLoader extends Loader<XRReferenceImage> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<XRReferenceImage> {
    return new AssetPromise((resolve, reject) => {
      this.request<ArrayBuffer>(item.url, { type: "arraybuffer" })
        .then((data) => {
          decode<XRReferenceImage>(data, resourceManager.engine).then((referenceImage) => {
            resolve(referenceImage);
          });
        })
        .catch(reject);
    });
  }
}
