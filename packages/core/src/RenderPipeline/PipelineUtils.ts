import { Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";

/**
 * @internal
 */
export class PipelineUtils {
  static readonly defaultViewport = new Vector4(0, 0, 1, 1);

  static recreateTextureIfNeeded(
    engine: Engine,
    currentTexture: Texture2D | null,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    textureWrapMode: TextureWrapMode,
    textureFilterMode: TextureFilterMode
  ): Texture2D {
    if (
      currentTexture &&
      currentTexture.width === width &&
      currentTexture.height === height &&
      currentTexture.format === format &&
      currentTexture.isSRGBColorSpace === isSRGBColorSpace &&
      currentTexture.mipmapCount > 1 === mipmap
    ) {
      currentTexture.wrapModeU = currentTexture.wrapModeV = textureWrapMode;
      currentTexture.filterMode = textureFilterMode;
      return currentTexture;
    }

    const pool = engine._renderTargetPool;
    if (currentTexture) {
      pool.freeTexture(currentTexture);
    }
    return pool.allocateTexture(width, height, format, mipmap, isSRGBColorSpace, textureWrapMode, textureFilterMode);
  }

  static recreateRenderTargetIfNeeded(
    engine: Engine,
    currentRenderTarget: RenderTarget | null,
    width: number,
    height: number,
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    needDepthTexture: boolean,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    antiAliasing: number,
    textureWrapMode: TextureWrapMode,
    textureFilterMode: TextureFilterMode
  ): RenderTarget {
    if (currentRenderTarget) {
      const colorTexture = currentRenderTarget.getColorTexture(0) as Texture2D;
      const depthTexture = currentRenderTarget.depthTexture as Texture2D;

      let matched = true;

      if (colorFormat != null) {
        if (
          !colorTexture ||
          colorTexture.width !== width ||
          colorTexture.height !== height ||
          colorTexture.format !== colorFormat ||
          colorTexture.isSRGBColorSpace !== isSRGBColorSpace ||
          colorTexture.mipmapCount > 1 !== mipmap
        ) {
          matched = false;
        }
      } else if (colorTexture) {
        matched = false;
      }

      if (matched && currentRenderTarget.antiAliasing !== antiAliasing) {
        matched = false;
      }

      if (matched) {
        if (needDepthTexture) {
          if (depthFormat) {
            if (
              !depthTexture ||
              depthTexture.width !== width ||
              depthTexture.height !== height ||
              depthTexture.format !== depthFormat
            ) {
              matched = false;
            }
          } else if (depthTexture) {
            matched = false;
          }
        } else {
          if (currentRenderTarget._depthFormat !== depthFormat) {
            matched = false;
          }
        }
      }

      if (matched) {
        return currentRenderTarget;
      }

      engine._renderTargetPool.freeRenderTarget(currentRenderTarget);
    }

    return engine._renderTargetPool.allocateRenderTarget(
      width,
      height,
      colorFormat,
      depthFormat,
      needDepthTexture,
      mipmap,
      isSRGBColorSpace,
      antiAliasing,
      textureWrapMode,
      textureFilterMode
    );
  }
}
