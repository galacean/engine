import { AssetType } from "./AssetType";

/**
 * 用于描述资产加载项。
 */
export interface LoadItem {
  /** 资产路径。 */
  path: string;
  /** 资产类型。 */
  type?: AssetType;
}
