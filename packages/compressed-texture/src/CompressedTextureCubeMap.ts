import { TextureWrapMode, Logger, GLCompressedTextureInternalFormat } from "@alipay/o3-base";
import { TextureCubeMap, TextureConfig } from "@alipay/o3-material";

import { CompressedCubeData, Mipmap } from "./type";

/**
 * CubeMap 贴图数据对象
 */
export class CompressedTextureCubeMap extends TextureCubeMap {
  private _mipmapsFaces: Mipmap[][];
  private _internalFormat: GLCompressedTextureInternalFormat;

  public isCompressed: boolean = true;

  public needUpdateCubeTextureFace: Array<boolean> = [];

  /**
   * CompressedCubeMap 贴图数据对象
   * @param {String} name 名称
   * @param {CompressedData[]} compressedDataArray 压缩纹理内容
   * @param {TextureConfig} config 可选配置
   */
  constructor(name: string, compressedCubeData?: CompressedCubeData, config?: TextureConfig) {
    // 压缩纹理不可以flipY
    super(name, null, { ...config, flipY: false });

    this.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);

    /**
     * CubeMap 的数据, 顺序为[px, nx, py, ny, pz, nz]
     * @member {Array}
     */
    if (compressedCubeData) {
      this.setCompressedCubeData(compressedCubeData);
    }
  }
  get mipmapsFaces(): Mipmap[][] {
    return this._mipmapsFaces;
  }

  set mipmapsFaces(mipmapsFaces: Mipmap[][]) {
    this._mipmapsFaces = mipmapsFaces;
    this.updateTexture();
  }

  get internalFormat(): GLCompressedTextureInternalFormat {
    return this._internalFormat;
  }

  get flipY() {
    return false;
  }

  set flipY(value: boolean) {
    if (value === true) {
      Logger.warn("CompressedTextureCubeMap: flipY is always false");
    }
  }

  // 压缩纹理不支持运行时生成mipmap
  get canMipmap(): boolean {
    return false;
  }

  set canMipmap(value: boolean) {
    if (value === true) {
      Logger.warn("CompressedTextureCubeMap: can't generate mipmap");
    }
  }

  setCompressedCubeData(data: CompressedCubeData) {
    this.mipmapsFaces = data.mipmapsFaces;
    this._width = data.width;
    this._height = data.height;
    this._internalFormat = data.internalFormat;
  }

  updateFace(index: number, mipmapsFace: Mipmap[]) {
    this.mipmapsFaces[index] = mipmapsFace;
    this.needUpdateCubeTextureFace[index] = true;
  }

  /**
   * 重置共享状态，以防清除GL资源后重建时状态错误
   * @private
   */
  resetState() {
    if (this.images) this.images = this.images;
    super.resetState();
  }

  // 覆盖TextureCubeMap方法
  get images(): Array<any> {
    Logger.warn("CompressedTextureCubeMap: cant't get images from a compressed texture");
    return null;
  }

  set images(v: Array<any>) {
    Logger.warn("CompressedTextureCubeMap: cant't set images");
  }

  get mipMapLevel(): number {
    Logger.warn("CompressedTextureCubeMap: cant't get mipMapLevel");
    return null;
  }

  updateImage(index: number, image) {
    Logger.warn("CompressedTextureCubeMap: cant't update image");
  }

  configMipmap() {
    Logger.warn("CompressedTextureCubeMap: cant't config mipmap");
  }
}
