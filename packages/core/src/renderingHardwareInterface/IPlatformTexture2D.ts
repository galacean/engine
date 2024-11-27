import { RenderTarget } from "../texture";
import { IPlatformTexture } from "./IPlatformTexture";

/**
 * 2D texture interface specification.
 */
export interface IPlatformTexture2D extends IPlatformTexture {
  /**
   * Setting pixels data through color buffer data, designated area and texture mipmapping level,it's also applicable to compressed formats.
   * @remarks If it is the WebGL1.0 platform and the texture format is compressed, the first upload must be filled with textures.
   * @param colorBuffer - Color buffer data
   * @param mipLevel - Texture mipmapping level
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Data width. if it's empty, width is the width corresponding to mipLevel minus x , width corresponding to mipLevel is Math.max(1, this.width >> mipLevel)
   * @param height - Data height. if it's empty, height is the height corresponding to mipLevel minus y , height corresponding to mipLevel is Math.max(1, this.height >> mipLevel)
   */
  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void;

  /**
   * Setting pixels data through TexImageSource, designated area and texture mipmapping level.
   * @param imageSource - The source of texture
   * @param mipLevel - Texture mipmapping level
   * @param flipY - Whether to flip the Y axis
   * @param premultiplyAlpha - Whether to premultiply the transparent channel
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   */
  setImageSource(
    imageSource: TexImageSource,
    mipLevel: number,
    flipY: boolean,
    premultiplyAlpha: boolean,
    x: number,
    y: number
  ): void;

  /**
   * Get the pixel color buffer according to the specified area.
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param mipLevel - Set mip level the data want to get from
   * @param out - Color buffer
   */
  getPixelBuffer(x: number, y: number, width: number, height: number, mipLevel: number, out: ArrayBufferView): void;

  /**
   * Copy the specified area of the render target to the sub texture.
   * @param renderTarget - The render target to copy from
   * @param level - Texture mipmapping level
   * @param xOffset - Specifying the horizontal offset within the texture image
   * @param yOffset - Specifying the vertical offset within the texture image
   * @param x - Specifying the x coordinate of the lower left corner where to start copying
   * @param y - Specifying the x coordinate of the lower left corner where to start copying
   * @param width - The width of the copy area
   * @param height - The height of the copy area
   */
  copySubFromRenderTarget(
    renderTarget: RenderTarget,
    level: number,
    xOffset: number,
    yOffset: number,
    x: number,
    y: number,
    width: number,
    height: number
  );
}
