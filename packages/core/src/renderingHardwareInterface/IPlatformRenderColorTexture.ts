import { TextureCubeFace } from "../texture";
import { IPlatformTexture } from "./IPlatformTexture";

/**
 * Rendering color texture interface specification.
 */
export interface IPlatformRenderColorTexture extends IPlatformTexture {
  /**
   * Get the pixel color buffer according to the specified cube face and area.
   * @param face - You can choose which cube face to read if it's cube texture
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   * @param mipLevel - Set mip level the data want to get from
   */
  getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView,
    mipLevel: number
  ): void;
}
