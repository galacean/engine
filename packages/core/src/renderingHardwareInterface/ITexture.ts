import { TextureWrapMode, TextureFilterMode } from "../texture";

/**
 * 纹理接口规范。
 */
export interface ITexture {
  /**
   * 纹理宽。
   */
  width: number;

  /**
   * 纹理高。
   */
  height: number;

  /**
   * 纹理坐标 U 的循环模式。
   */
  wrapModeU: TextureWrapMode;

  /**
   * 纹理坐标 V 的循环模式。
   */
  wrapModeV: TextureWrapMode;

  /**
   * 纹理的过滤模式。
   */
  filterMode: TextureFilterMode;

  /**
   * 多级纹理的数量。
   */
  mipmapCount: number;

  /**
   * 各向异性过滤等级。
   */
  anisoLevel: number;

  /**
   * 销毁纹理。
   */
  destroy(): void;

  /**
   * 根据第0级数据生成多级纹理。
   */
  generateMipmaps(): void;
}
