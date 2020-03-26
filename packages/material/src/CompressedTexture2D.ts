import { TextureFilter } from "@alipay/o3-base";

import { Texture2D } from "./Texture2D";
import { CompressedTextureConfig } from "./type";

/**
 * 2D 贴图数据对象
 */
export class CompressedTexture2D extends Texture2D {
  private _mipmaps: any;
  // 压缩纹理不支持运行时生成mipmap
  public canMipmap: boolean = false;

  public isCompressed: boolean = true;

  /**
   * 2D 贴图数据对象
   * @param {String} name 名称
   * @param {ArrayBuffer[]} mipmap 纹理mipmap内容
   * @param {TextureConfig} config 可选配置
   */
  constructor(name: string, mipmaps?: ArrayBuffer[], config?: CompressedTextureConfig) {
    // 压缩纹理不可以flipY
    super(name, null, { ...config, flipY: false });

    if (mipmaps) {
      this.mipmaps = mipmaps;
    }
  }

  get mipmaps(): ArrayBuffer[] {
    return this._mipmaps;
  }

  set mipmaps(mipmaps: ArrayBuffer[]) {
    this._mipmaps = mipmaps;
    // 压缩纹理不支持运行时生成mipmap，所以如果只传入一张纹理，要将minfilter改为linear
    if (mipmaps.length === 1) {
      this.setFilter(this.filterMag, TextureFilter.LINEAR);
    }
    this.updateTexture();
  }

  /**
   * 刷新整个纹理
   */
  updateTexture() {
    this.needUpdateWholeTexture = true;
    this.needUpdateFilers = true;
  }

  /**
   * 重置共享状态，以防清除GL资源后重建时状态错误
   * @private
   */
  resetState() {
    if (this.mipmaps) this.mipmaps = this.mipmaps;
    super.resetState();
  }
}
