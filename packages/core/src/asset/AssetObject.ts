import { InternalAssetType, EngineObject } from "../base";

/**
 * 使用引用计数管理的资源对象基类
 */
export class AssetObject extends EngineObject {
  public type: InternalAssetType | string;

  public name: string;
  public cacheID: number;
  public needRecreate: boolean;
  constructor() {
    super();
  }
}
