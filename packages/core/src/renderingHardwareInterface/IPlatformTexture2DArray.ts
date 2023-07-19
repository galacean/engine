import { IPlatformTexture } from "./IPlatformTexture";

/**
 * 2D texture array interface specification.
 */
export interface IPlatformTexture2DArray extends IPlatformTexture {
  /**
   * Setting pixels data through color buffer data, designated area and texture mipmapping level,it's also applicable to compressed formats.
   * @param offsetIndex - The texture array element offset index
   * @param colorBuffer - Color buffer data
   * @param mipLevel - Texture mipmapping level
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Data width. if it's empty, width is the width corresponding to mipLevel minus x , width corresponding to mipLevel is Math.max(1, this.width >> mipLevel)
   * @param height - Data height. if it's empty, height is the height corresponding to mipLevel minus y , height corresponding to mipLevel is Math.max(1, this.height >> mipLevel)
   * @param length - Data length.
   */
  setPixelBuffer(
    offsetIndex: number,
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    x: number,
    y: number,
    width?: number,
    height?: number,
    length?: number
  ): void;

  /**
   * Setting pixels data through TexImageSource, designated area and texture mipmapping level.
   * @param index - The texture array element index
   * @param imageSource - The source of texture
   * @param mipLevel - Texture mipmapping level
   * @param flipY - Whether to flip the Y axis
   * @param premultiplyAlpha - Whether to premultiply the transparent channel
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   */
  setImageSource(
    index: number,
    imageSource: TexImageSource,
    mipLevel: number,
    flipY: boolean,
    premultiplyAlpha: boolean,
    x: number,
    y: number
  ): void;

  /**
   * Get the pixel color buffer according to the specified area.
   * @param elementIndex - The texture array element index
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param mipLevel - Set mip level the data want to get from
   * @param out - Color buffer
   */
  getPixelBuffer(
    elementIndex: number,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): void;
}
