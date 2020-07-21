import { AssetType } from "@alipay/o3-base";

/**
 * 使用引用计数管理的资源对象基类
 */
export class AssetObject {
  public type: AssetType | string;

  public name: string;
  public cacheID: number;
  public needRecreate: boolean;

  /**
   * 构造函数
   * @constructor
   */
  constructor() {
    this.name = name;

    /**
     * 资源类型
     * @member {AssetType}
     */
    this.type = AssetType.Cache;
  }

  public _finalize() {}
}
