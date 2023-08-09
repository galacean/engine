import { Engine } from "../Engine";
import { RenderTarget, Texture2D, TextureFormat } from "../texture";

/**
 * @internal
 */
export class PipelineUtils {
  /**
   * Recreate texture if needed.
   * @param engine - Engine
   * @param currentTexture - Current texture
   * @param width - Need texture width
   * @param height - Need texture height
   * @param format - Need texture format
   * @param mipmap - Need texture mipmap
   * @returns Texture
   */
  static recreateTextureIfNeeded(
    engine: Engine,
    currentTexture: Texture2D | null,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean
  ): Texture2D {
    if (currentTexture) {
      if (
        currentTexture.width !== width ||
        currentTexture.height !== height ||
        currentTexture.format !== format ||
        currentTexture.mipmapCount > 1 !== mipmap
      ) {
        currentTexture.destroy();
        const texture = new Texture2D(engine, width, height, format, mipmap);
        texture.isGCIgnored = true;
        return texture;
      } else {
        return currentTexture;
      }
    } else {
      const texture = new Texture2D(engine, width, height, format, mipmap);
      texture.isGCIgnored = true;
      return texture;
    }
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
   * @returns Render target
   */
  static recreateRenderTargetIfNeeded(
    engine: Engine,
    currentRenderTarget: RenderTarget | null,
    width: number,
    height: number,
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    mipmap: boolean
  ): RenderTarget {
    const currentColorTexture = <Texture2D>currentRenderTarget?.getColorTexture(0);
    const currentDepthTexture = <Texture2D>currentRenderTarget?.depthTexture;
    const colorTexture = colorFormat
      ? PipelineUtils.recreateTextureIfNeeded(engine, currentColorTexture, width, height, colorFormat, mipmap)
      : null;

    const depthTexture = depthFormat
      ? PipelineUtils.recreateTextureIfNeeded(engine, currentDepthTexture, width, height, depthFormat, mipmap)
      : null;

    if (currentColorTexture !== colorTexture || currentDepthTexture !== depthTexture) {
      currentRenderTarget?.destroy();
      currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, depthTexture);
      currentRenderTarget.isGCIgnored = true;
    }

    return currentRenderTarget;
  }
}
