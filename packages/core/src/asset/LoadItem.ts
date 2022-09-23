import type { TextureFormat } from "../texture";

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
  /**
   * GlTF loader params.
   */
  glTFParams?: {
    /** Keep raw mesh data for glTF parser, default is false/ */
    keepMeshData?: boolean;
  };
  /**
   * Texture2D loader params.
   */
  texture2DParams?: {
    /** Texture format. default  `TextureFormat.R8G8B8A8`. */
    format?: TextureFormat;
    /** Whether to use multi-level texture, default is true. */
    mipmap: boolean;
  };
};
