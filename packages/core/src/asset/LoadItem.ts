import { AssetType } from "./AssetType";

/**
 * Used to describe loading asset.
 */
export type LoadItem = {
  /**
   * Loading url.
   */
  url?: string;
  /**
   * Available when AssetType is TextureCube.
   */
  urls?: string[];
  /**
   * Asset Type.
   */
  type?: AssetType;
  /**
   * Number of retries after failed loading.
   */
  retryCount?: number;
  /**
   * Timeout.
   */
  timeout?: number;
  /**
   * Retry interval time.
   */
  retryInterval?: number;
};
