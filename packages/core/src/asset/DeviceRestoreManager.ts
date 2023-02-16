import { LoaderUtil } from "../LoaderUtil";
import { GraphicsResource } from "./GraphicsResource";
import {  MeshContentInfo } from "./MeshContentInfo";
import { request } from "./request";
import { TextureContentInfo } from "./TextureContentInfo";

/**
 * @internal
 */
export class DeviceRestoreManager {
  private _graphicResourcePool: Record<number, GraphicsResource> = Object.create(null);

  private _textureContentInfos: TextureContentInfo[] = [];
  private _meshContentInfos: MeshContentInfo[] = [];

  addGraphicResource(id: number, asset: GraphicsResource): void {
    this._graphicResourcePool[id] = asset;
  }

  deleteGraphicResource(id: number): void {
    delete this._graphicResourcePool[id];
  }

  restoreGraphicResources(): void {
    const { _graphicResourcePool } = this;
    for (const id in _graphicResourcePool) {
      _graphicResourcePool[id]._rebuild();
    }
  }

  restoreResourcesContent(): void {
    const textureRestoreInfos = this._textureContentInfos;
    for (let i = 0, n = textureRestoreInfos.length; i < n; i++) {
      const restoreInfo = textureRestoreInfos[i];
      const texture = restoreInfo.texture;

      if (restoreInfo.bufferOffset > 0) {
        request<ArrayBuffer>(restoreInfo.url, restoreInfo.requestConfig).then((arrayBuffer) => {
          const bufferViewData = arrayBuffer.slice(
            restoreInfo.bufferOffset,
            restoreInfo.bufferOffset + restoreInfo.bufferLength
          );
          LoaderUtil.loadImageBuffer(bufferViewData, restoreInfo.mimeType)
            .then((image) => {
              texture.setImageSource(image, 0, false, false, 0, 0);
              texture.generateMipmaps();
            })
            .catch((e) => {
              console.warn("Texture2D: rebuild failed.");
            });
        });
      } else {
        request<HTMLImageElement>(restoreInfo.url, restoreInfo.requestConfig)
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
}
