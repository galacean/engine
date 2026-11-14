import { Engine } from "../Engine";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";

/**
 * @internal
 */
export class RenderTargetPool {
  private static readonly _maxIdleFrames = 10;

  private _freeRenderTargets: RenderTarget[] = [];
  private _freeTextures: Texture2D[] = [];
  private _lastReleaseFrame = new WeakMap<RenderTarget | Texture2D, number>();
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
    filterMode: TextureFilterMode,
    depthFilterMode: TextureFilterMode = filterMode,
    additionalColorFormats: readonly TextureFormat[] = [],
    depthMipmap: boolean = mipmap
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
          antiAliasing,
          additionalColorFormats,
          depthMipmap
        )
      ) {
        freeRenderTargets[i] = freeRenderTargets[freeRenderTargets.length - 1];
        freeRenderTargets.length--;
        const colorTextures = renderTarget.colorTextures;
        for (let j = 0, m = colorTextures.length; j < m; j++) {
          const colorTexture = colorTextures[j] as Texture2D;
          colorTexture.wrapModeU = colorTexture.wrapModeV = wrapMode;
          colorTexture.filterMode = filterMode;
        }
        const depthTexture = renderTarget.depthTexture as Texture2D;
        if (depthTexture) {
          depthTexture.wrapModeU = depthTexture.wrapModeV = wrapMode;
          depthTexture.filterMode = depthFilterMode;
        }
        return renderTarget;
      }
    }

    const engine = this._engine;
    const colorTextures: Texture2D[] = [];
    let depthTexture: Texture2D | null = null;
    try {
      if (colorFormat != null) {
        const colorFormats = [colorFormat, ...additionalColorFormats];
        for (let i = 0, n = colorFormats.length; i < n; i++) {
          const colorTexture = new Texture2D(engine, width, height, colorFormats[i], mipmap, isSRGBColorSpace);
          colorTexture.isGCIgnored = true;
          colorTexture.wrapModeU = colorTexture.wrapModeV = wrapMode;
          colorTexture.filterMode = filterMode;
          colorTextures.push(colorTexture);
        }
      }

      let renderTarget: RenderTarget;
      if (needDepthTexture) {
        if (depthFormat) {
          depthTexture = new Texture2D(engine, width, height, depthFormat, depthMipmap, isSRGBColorSpace);
          depthTexture.isGCIgnored = true;
          depthTexture.wrapModeU = depthTexture.wrapModeV = wrapMode;
          depthTexture.filterMode = depthFilterMode;
        }
        renderTarget =
          colorTextures.length > 1
            ? new RenderTarget(engine, width, height, colorTextures, depthTexture, antiAliasing)
            : new RenderTarget(engine, width, height, colorTextures[0] ?? null, depthTexture, antiAliasing);
      } else {
        renderTarget =
          colorTextures.length > 1
            ? new RenderTarget(engine, width, height, colorTextures, depthFormat, antiAliasing)
            : new RenderTarget(engine, width, height, colorTextures[0] ?? null, depthFormat, antiAliasing);
      }
      renderTarget.isGCIgnored = true;
      return renderTarget;
    } catch (error) {
      for (let i = 0, n = colorTextures.length; i < n; i++) colorTextures[i].destroy(true);
      depthTexture?.destroy(true);
      throw error;
    }
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
    if (this._freeRenderTargets.includes(renderTarget)) return;
    this._lastReleaseFrame.set(renderTarget, this._engine.time.frameCount);
    this._freeRenderTargets.push(renderTarget);
  }

  freeTexture(texture: Texture2D): void {
    if (!texture || texture.destroyed) return;
    if (this._freeTextures.includes(texture)) return;
    this._lastReleaseFrame.set(texture, this._engine.time.frameCount);
    this._freeTextures.push(texture);
  }

  /** Reclaim expired free entries after rendering. Borrowed resources are not in the free lists. */
  trim(): void {
    const frame = this._engine.time.frameCount;
    this._trimResources(this._freeRenderTargets, frame);
    this._trimResources(this._freeTextures, frame);
  }

  gc(): void {
    const freeRenderTargets = this._freeRenderTargets;
    for (let i = 0, n = freeRenderTargets.length; i < n; i++) {
      RenderTargetPool._destroyResource(freeRenderTargets[i]);
    }
    freeRenderTargets.length = 0;

    const freeTextures = this._freeTextures;
    for (let i = 0, n = freeTextures.length; i < n; i++) {
      freeTextures[i].destroy(true);
    }
    freeTextures.length = 0;
  }

  private _trimResources(resources: (RenderTarget | Texture2D)[], frame: number): void {
    for (let i = resources.length - 1; i >= 0; i--) {
      const resource = resources[i];
      if (resource.destroyed || frame - this._lastReleaseFrame.get(resource)! >= RenderTargetPool._maxIdleFrames) {
        resources[i] = resources[resources.length - 1];
        resources.length--;
        RenderTargetPool._destroyResource(resource);
      }
    }
  }

  private static _destroyResource(resource: RenderTarget | Texture2D): void {
    if (resource instanceof RenderTarget) {
      const colors = resource.colorTextures.slice();
      const depth = resource.depthTexture;
      resource.destroy(true);
      for (let i = 0, n = colors.length; i < n; i++) colors[i].destroy(true);
      if (depth && !colors.includes(depth)) depth.destroy(true);
    } else {
      resource.destroy(true);
    }
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
    antiAliasing: number,
    additionalColorFormats: readonly TextureFormat[],
    depthMipmap: boolean
  ): boolean {
    if (renderTarget.width !== width || renderTarget.height !== height || renderTarget.antiAliasing !== antiAliasing) {
      return false;
    }

    const expectedColorFormats = colorFormat == null ? [] : [colorFormat, ...additionalColorFormats];
    if (renderTarget.colorTextureCount !== expectedColorFormats.length) return false;
    for (let i = 0, n = expectedColorFormats.length; i < n; i++) {
      const colorTexture = renderTarget.getColorTexture(i) as Texture2D;
      if (
        !colorTexture ||
        colorTexture.format !== expectedColorFormats[i] ||
        colorTexture.mipmapCount > 1 !== mipmap ||
        colorTexture.isSRGBColorSpace !== isSRGBColorSpace
      ) {
        return false;
      }
    }

    const depthTexture = renderTarget.depthTexture;
    if (needDepthTexture) {
      if (depthFormat) {
        const depthTexture2D = depthTexture as Texture2D;
        if (
          !depthTexture2D ||
          depthTexture2D.format !== depthFormat ||
          depthTexture2D.mipmapCount > 1 !== depthMipmap
        ) {
          return false;
        }
      } else if (depthTexture || renderTarget._depthFormat !== null) {
        return false;
      }
    } else {
      if (depthTexture || renderTarget._depthFormat !== depthFormat) {
        return false;
      }
    }

    return true;
  }
}
