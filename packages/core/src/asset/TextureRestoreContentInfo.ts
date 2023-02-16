import { LoaderUtil } from "../LoaderUtil";
import { Texture2D } from "../texture";
import { request, RequestConfig } from "./request";
import { RestoreContentInfo } from "./RestoreContentInfo";

export class TextureRestoreContentInfo extends RestoreContentInfo {
  constructor(
    public texture: Texture2D,
    public url: string,
    public requestConfig: RequestConfig,
    public bufferOffset?: number,
    public bufferLength?: number,
    public mimeType?: string
  ) {
    super();
  }

  restoreContent(): void {
    const texture = this.texture;

    if (this.bufferOffset > 0) {
      request<ArrayBuffer>(this.url, this.requestConfig).then((arrayBuffer) => {
        const bufferViewData = arrayBuffer.slice(this.bufferOffset, this.bufferOffset + this.bufferLength);
        LoaderUtil.loadImageBuffer(bufferViewData, this.mimeType)
          .then((image) => {
            texture.setImageSource(image, 0, false, false, 0, 0);
            texture.generateMipmaps();
          })
          .catch((e) => {
            console.warn("Texture2D: rebuild failed.");
          });
      });
    } else {
      request<HTMLImageElement>(this.url, this.requestConfig)
        .then((image) => {
          texture.setImageSource(image, 0, false, false, 0, 0);
          texture.generateMipmaps();
        })
        .catch((e) => {
          console.warn("Texture2D: rebuild failed.");
        });
    }
  }
}
