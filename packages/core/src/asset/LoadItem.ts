import { AssetType } from "./AssetType";

/**
 * 用于描述资产加载项。
 */
export type LoadItem = {
  /**
   * 加载的 url。
   */
  url?: string;
  /**
   * 当 AssetType 为 TextureCube 时可用
   */
  urls?: string[];
  /**
   * 资源类型。
   */
  type?: AssetType;
  /**
   * 加载失败后的重试次数
   */
  retryCount?: number;
  /**
   * 超时时间。
   */
  timeout?: number;
  /**
   * 重试间隔时间。
   */
  retryInterval?: number;
};
