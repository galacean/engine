import { AssetType } from "@alipay/o3-base";
/**
 * 使用引用计数管理的资源对象基类
 */
export class AssetObject {
  /**
   * 资源对象的名称
   * @member
   * @readonly
   */
  get name(): string {
    return this._name;
  }

  public type: AssetType | string;

  private _name: string;
  /**
   * 构造函数
   * @constructor
   */
  constructor(name: string) {
    this._name = name;

    /**
     * 资源类型
     * @member {AssetType}
     */
    this.type = AssetType.Cache;
  }

  public _finalize() {}
}
