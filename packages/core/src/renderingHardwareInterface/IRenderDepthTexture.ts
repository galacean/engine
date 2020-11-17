import { RenderBufferDepthFormat } from "../texture";
import { ITexture } from "./ITexture";

/**
 *  渲染深度纹理接口规范。
 */
export interface IRenderDepthTexture extends ITexture {
  /**
   * 渲染深度纹理的格式。
   */
  format: RenderBufferDepthFormat;

  /**
   * 是否自动生成多级纹理。
   */
  autoGenerateMipmaps: boolean;
}
