import { ContentRestoreInfo } from "./ContentRestoreInfo";
import { GraphicsResource } from "./GraphicsResource";

/**
 * @internal
 */
export class DeviceRestoreManager {
  private _graphicResourcePool: Record<number, GraphicsResource> = Object.create(null);
  private _restoreContentInfoPool: Record<number, ContentRestoreInfo> = Object.create(null);

  addGraphicResource(id: number, asset: GraphicsResource): void {
    this._graphicResourcePool[id] = asset;
  }

  deleteGraphicResource(id: number): void {
    delete this._graphicResourcePool[id];
  }

  addRestoreContentInfo(id: number, asset: ContentRestoreInfo): void {
    this._restoreContentInfoPool[id] = asset;
  }

  deleteRestoreContentInfo(id: number): void {
    delete this._restoreContentInfoPool[id];
  }

  restoreGraphicResources(): void {
    const graphicResourcePool = this._graphicResourcePool;
    for (const id in graphicResourcePool) {
      graphicResourcePool[id]._rebuild();
    }
  }

  restoreResourcesContent(): void {
    const restoreContentInfoPool = this._restoreContentInfoPool;
    for (const k in restoreContentInfoPool) {
      const restoreInfo = restoreContentInfoPool[k];
      //@todo: get host
      restoreInfo._loader.restoreContent(null,restoreInfo);
    }
  }
}
