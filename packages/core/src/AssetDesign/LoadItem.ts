import { AssetType } from "./AssetType";

/**
 * 用于描述资源加载项。
 */
export class LoadItem {
  /** @internal */
  _path: string;
  /** @internal */
  _type: AssetType;

  /**
   * 创建资源描述项。
   * @param path - 资源路径
   * @param type - 资源类型
   * @param priority - 加载优先级
   */
  constructor(path: string, type?: AssetType) {
    this._path = path;
    this._type = type;
  }
}
