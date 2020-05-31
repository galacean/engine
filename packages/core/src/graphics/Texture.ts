import { TextureWrapMode } from "@alipay/o3-base";
import { set } from "@alipay/o3-math/types/mat2/mat2";
import { TextureFilterMode } from "./TextureFilterMode";

/**
 * 纹理的基类，包含了纹理相关类的一些公共功能。
 */
export class Texture {
  /**
   * 宽。
   */
  get width(): number {
    //TODO:
    return 0;
  }

  /**
   * 宽。
   */
  get height(): number {
    //TODO:
    return 0;
  }

  /**
   * 纹理坐标U的循环模式。
   */
  get wrapModeU(): TextureWrapMode {
    //TODO:
    return null;
  }
  set wrapModeU(value: TextureWrapMode) {
    //TODO:
  }

  /**
   * 纹理坐标V的循环模式。
   */
  get wrapModeV(): TextureWrapMode {
    //TODO:
    return null;
  }
  set wrapModeV(value: TextureWrapMode) {
    //TODO:
  }

  /**
   * 分级纹理的数量。
   */
  get mipmapCount(): number {
    //TODO:
    return 0;
  }

  /**
   * 纹理的过滤模式，
   */
  get filterMode(): TextureFilterMode {
    //TODO:
    return 0;
  }
  set filterMode(value: TextureFilterMode) {
    //TODO:
  }

  /**
   * 各向异性过滤等级。
   */
  get anisoLevel(): number {
    //TODO:
    return 0;
  }
  set anisoLevel(value: number) {
    //TODO:
  }
}
