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
  type?: string;
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
  /**
   * Additional parameters for specified loader.
   */
  params?: Record<string, any>;
};
