import { GraphicsResource } from "./GraphicsResource";
import { RestoreContentInfo } from "./RestoreContentInfo";

/**
 * @internal
 */
export class DeviceRestoreManager {
  private _graphicResourcePool: Record<number, GraphicsResource> = Object.create(null);
  private _restoreContentInfoPool: Record<number, RestoreContentInfo> = Object.create(null);

  addGraphicResource(id: number, asset: GraphicsResource): void {
    this._graphicResourcePool[id] = asset;
  }

  deleteGraphicResource(id: number): void {
    delete this._graphicResourcePool[id];
  }

  addRestoreContentInfo(id: number, asset: RestoreContentInfo): void {
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
    for (const key in restoreContentInfoPool) {
      // @todo: use loader
      // restoreContentInfoPool[key].restoreContent();
    }
  }
}
