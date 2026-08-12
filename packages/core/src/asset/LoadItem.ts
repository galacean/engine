type PickOnlyOne<T extends {}, Keys extends keyof T = keyof T> = Keys extends unknown
  ? { [K in Keys]: T[Keys] } & { [K in Exclude<keyof T, Keys>]?: never }
  : never;

/**
 * Used to describe loading asset.
 */
export type LoadItem = {
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
} & PickOnlyOne<{
  /**
   * Loading url.
   */
  url: string;
  /**
   * Available when AssetType is TextureCube.
   */
  urls: string[];
}>;
