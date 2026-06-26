import { Engine } from "../Engine";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";

/**
 * @internal
 */
export class RenderTargetPool {
  private _freeRenderTargets: RenderTarget[] = [];
  private _freeTextures: Texture2D[] = [];
  private _engine: Engine;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  allocateRenderTarget(
    width: number,
    height: number,
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    needDepthTexture: boolean,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    antiAliasing: number,
    wrapMode: TextureWrapMode,
    filterMode: TextureFilterMode
  ): RenderTarget {
    const freeRenderTargets = this._freeRenderTargets;
    for (let i = freeRenderTargets.length - 1; i >= 0; i--) {
      const renderTarget = freeRenderTargets[i];
      if (
        RenderTargetPool._matchRenderTarget(
          renderTarget,
          width,
          height,
          colorFormat,
          depthFormat,
          needDepthTexture,
          mipmap,
          isSRGBColorSpace,
          antiAliasing
        )
      ) {
        freeRenderTargets[i] = freeRenderTargets[freeRenderTargets.length - 1];
        freeRenderTargets.length--;
        const colorTexture = renderTarget.getColorTexture(0) as Texture2D;
        if (colorTexture) {
          colorTexture.wrapModeU = colorTexture.wrapModeV = wrapMode;
          colorTexture.filterMode = filterMode;
        }
        const depthTexture = renderTarget.depthTexture as Texture2D;
        if (depthTexture) {
          depthTexture.wrapModeU = depthTexture.wrapModeV = wrapMode;
          depthTexture.filterMode = filterMode;
        }
        return renderTarget;
      }
    }

    const engine = this._engine;
    let colorTexture: Texture2D = null;
    if (colorFormat != null) {
      colorTexture = new Texture2D(engine, width, height, colorFormat, mipmap, isSRGBColorSpace);
      colorTexture.isGCIgnored = true;
      colorTexture.wrapModeU = colorTexture.wrapModeV = wrapMode;
      colorTexture.filterMode = filterMode;
    }

    let renderTarget: RenderTarget;
    if (needDepthTexture) {
      let depthTexture: Texture2D = null;
      if (depthFormat) {
        depthTexture = new Texture2D(engine, width, height, depthFormat, mipmap, isSRGBColorSpace);
        depthTexture.isGCIgnored = true;
        depthTexture.wrapModeU = depthTexture.wrapModeV = wrapMode;
        depthTexture.filterMode = filterMode;
      }
      renderTarget = new RenderTarget(engine, width, height, colorTexture, depthTexture, antiAliasing);
    } else {
      renderTarget = new RenderTarget(engine, width, height, colorTexture, depthFormat, antiAliasing);
    }
    renderTarget.isGCIgnored = true;

    return renderTarget;
  }

  allocateTexture(
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    wrapMode: TextureWrapMode,
    filterMode: TextureFilterMode
  ): Texture2D {
    const freeTextures = this._freeTextures;
    for (let i = freeTextures.length - 1; i >= 0; i--) {
      const texture = freeTextures[i];
      if (
        texture.width === width &&
        texture.height === height &&
        texture.format === format &&
        texture.mipmapCount > 1 === mipmap &&
        texture.isSRGBColorSpace === isSRGBColorSpace
      ) {
        freeTextures[i] = freeTextures[freeTextures.length - 1];
        freeTextures.length--;
        texture.wrapModeU = texture.wrapModeV = wrapMode;
        texture.filterMode = filterMode;
        return texture;
      }
    }

    const texture = new Texture2D(this._engine, width, height, format, mipmap, isSRGBColorSpace);
    texture.isGCIgnored = true;
    texture.wrapModeU = texture.wrapModeV = wrapMode;
    texture.filterMode = filterMode;

    return texture;
  }

  freeRenderTarget(renderTarget: RenderTarget): void {
    if (!renderTarget || renderTarget.destroyed) return;
    this._freeRenderTargets.push(renderTarget);
  }

  freeTexture(texture: Texture2D): void {
    if (!texture || texture.destroyed) return;
    this._freeTextures.push(texture);
  }

  gc(): void {
    const freeRenderTargets = this._freeRenderTargets;
    for (let i = 0, n = freeRenderTargets.length; i < n; i++) {
      const renderTarget = freeRenderTargets[i];
      const colorTexture = renderTarget.getColorTexture(0);
      const depthTexture = renderTarget.depthTexture;
      renderTarget.destroy(true);
      colorTexture?.destroy(true);
      if (depthTexture && depthTexture !== colorTexture) {
        depthTexture.destroy(true);
      }
    }
    freeRenderTargets.length = 0;

    const freeTextures = this._freeTextures;
    for (let i = 0, n = freeTextures.length; i < n; i++) {
      freeTextures[i].destroy(true);
    }
    freeTextures.length = 0;
  }

  private static _matchRenderTarget(
    renderTarget: RenderTarget,
    width: number,
    height: number,
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    needDepthTexture: boolean,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    antiAliasing: number
  ): boolean {
    if (renderTarget.width !== width || renderTarget.height !== height || renderTarget.antiAliasing !== antiAliasing) {
      return false;
    }

    const colorTexture = renderTarget.getColorTexture(0) as Texture2D;
    if (colorFormat != null) {
      if (
        !colorTexture ||
        colorTexture.format !== colorFormat ||
        colorTexture.mipmapCount > 1 !== mipmap ||
        colorTexture.isSRGBColorSpace !== isSRGBColorSpace
      ) {
        return false;
      }
    } else if (colorTexture) {
      return false;
    }

    const depthTexture = renderTarget.depthTexture;
    if (needDepthTexture) {
      if (depthFormat) {
        if (!depthTexture || (depthTexture as Texture2D).format !== depthFormat) {
          return false;
        }
      } else if (depthTexture) {
        return false;
      }
    } else {
      if (renderTarget._depthFormat !== depthFormat) {
        return false;
      }
    }

    return true;
  }
}
