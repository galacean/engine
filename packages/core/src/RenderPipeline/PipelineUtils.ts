import { Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";

/**
 * @internal
 */
export class PipelineUtils {
  static readonly defaultViewport = new Vector4(0, 0, 1, 1);

  /**
   * Recreate texture if needed.
   * @param engine - Engine
   * @param currentTexture - Current texture
   * @param width - Need texture width
   * @param height - Need texture height
   * @param format - Need texture format
   * @param mipmap - Need texture mipmap
   * @param textureWrapMode - Texture wrap mode
   * @param textureFilterMode - Texture filter mode
   * @returns Texture
   */
  static recreateTextureIfNeeded(
    engine: Engine,
    currentTexture: Texture2D | null,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    textureWrapMode: TextureWrapMode,
    textureFilterMode: TextureFilterMode
  ): Texture2D {
    if (currentTexture) {
      if (
        currentTexture.width !== width ||
        currentTexture.height !== height ||
        currentTexture.format !== format ||
        currentTexture.mipmapCount > 1 !== mipmap
      ) {
        currentTexture.destroy(true);
        currentTexture = new Texture2D(engine, width, height, format, mipmap);
        currentTexture.isGCIgnored = true;
      }
    } else {
      currentTexture = new Texture2D(engine, width, height, format, mipmap);
      currentTexture.isGCIgnored = true;
    }

    currentTexture.wrapModeU = currentTexture.wrapModeV = textureWrapMode;
    currentTexture.filterMode = textureFilterMode;

    return currentTexture;
  }

  /**
   * Recreate render target if needed.
   * @param engine - Engine
   * @param currentRenderTarget - Current render target
   * @param width - Need render target width
   * @param height - Need render target height
   * @param colorFormat - Need render target color format
   * @param depthFormat - Need render target depth format
   * @param mipmap - Need render target mipmap
   * @param antiAliasing - Need render target anti aliasing
   * @param textureWrapMode - Texture wrap mode
   * @param textureFilterMode - Texture filter mode
   * @returns Render target
   */
  static recreateRenderTargetIfNeeded(
    engine: Engine,
    currentRenderTarget: RenderTarget | null,
    width: number,
    height: number,
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    needDepthTexture: boolean,
    mipmap: boolean,
    antiAliasing: number,
    textureWrapMode: TextureWrapMode,
    textureFilterMode: TextureFilterMode
  ): RenderTarget {
    const currentColorTexture = <Texture2D>currentRenderTarget?.getColorTexture(0);
    const colorTexture = colorFormat
      ? PipelineUtils.recreateTextureIfNeeded(
          engine,
          currentColorTexture,
          width,
          height,
          colorFormat,
          mipmap,
          textureWrapMode,
          textureFilterMode
        )
      : null;

    if (needDepthTexture) {
      const currentDepthTexture = <Texture2D>currentRenderTarget?.depthTexture;
      const needDepthTexture = depthFormat
        ? PipelineUtils.recreateTextureIfNeeded(
            engine,
            currentDepthTexture,
            width,
            height,
            depthFormat,
            mipmap,
            textureWrapMode,
            textureFilterMode
          )
        : null;

      if (currentColorTexture !== colorTexture || currentDepthTexture !== needDepthTexture) {
        currentRenderTarget?.destroy(true);
        currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, needDepthTexture, antiAliasing);
        currentRenderTarget.isGCIgnored = true;
      }
    } else {
      if (
        currentColorTexture !== colorTexture ||
        currentRenderTarget?._depthFormat !== depthFormat ||
        currentRenderTarget.antiAliasing !== antiAliasing
      ) {
        currentRenderTarget?.destroy(true);
        currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, depthFormat, antiAliasing);
        currentRenderTarget.isGCIgnored = true;
      }
    }

    return currentRenderTarget;
  }
}
