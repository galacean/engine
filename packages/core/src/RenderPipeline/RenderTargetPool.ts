import { Engine } from "../Engine";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";

/**
 * @internal
 */
export class RenderTargetPool {
  private static _destroyRenderTargetResource(rt: RenderTarget): void {
    const colorTexture = rt.getColorTexture(0);
    const depthTexture = rt.depthTexture;
    rt.destroy(true);
    colorTexture?.destroy(true);
    if (depthTexture && depthTexture !== colorTexture) {
      depthTexture.destroy(true);
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

  /** Frames an entry may sit idle before `tick()` destroys it. */
  maxFreeAgeFrames: number = 60;

  private _engine: Engine;

  private _freeRenderTargets: RenderTarget[] = [];
  private _freeRenderTargetFrames: number[] = [];

  private _freeTextures: Texture2D[] = [];
  private _freeTextureFrames: number[] = [];

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
        this._removeFreeRenderTargetAt(i);
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
        this._removeFreeTextureAt(i);
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
    this._freeRenderTargetFrames.push(this._engine.time.frameCount);
  }

  freeTexture(texture: Texture2D): void {
    if (!texture || texture.destroyed) return;
    this._freeTextures.push(texture);
    this._freeTextureFrames.push(this._engine.time.frameCount);
  }

  tick(currentFrame: number): void {
    const maxAge = this.maxFreeAgeFrames;
    const rtFrames = this._freeRenderTargetFrames;
    for (let i = rtFrames.length - 1; i >= 0; i--) {
      if (currentFrame - rtFrames[i] > maxAge) {
        this._destroyFreeRenderTargetAt(i);
      }
    }
    const texFrames = this._freeTextureFrames;
    for (let i = texFrames.length - 1; i >= 0; i--) {
      if (currentFrame - texFrames[i] > maxAge) {
        this._destroyFreeTextureAt(i);
      }
    }
  }

  evictBySize(width: number, height: number): void {
    const freeRenderTargets = this._freeRenderTargets;
    for (let i = freeRenderTargets.length - 1; i >= 0; i--) {
      const rt = freeRenderTargets[i];
      if (rt.width === width && rt.height === height) {
        this._destroyFreeRenderTargetAt(i);
      }
    }
    const freeTextures = this._freeTextures;
    for (let i = freeTextures.length - 1; i >= 0; i--) {
      const tex = freeTextures[i];
      if (tex.width === width && tex.height === height) {
        this._destroyFreeTextureAt(i);
      }
    }
  }

  gc(): void {
    const freeRenderTargets = this._freeRenderTargets;
    for (let i = 0, n = freeRenderTargets.length; i < n; i++) {
      RenderTargetPool._destroyRenderTargetResource(freeRenderTargets[i]);
    }
    freeRenderTargets.length = 0;
    this._freeRenderTargetFrames.length = 0;

    const freeTextures = this._freeTextures;
    for (let i = 0, n = freeTextures.length; i < n; i++) {
      freeTextures[i].destroy(true);
    }
    freeTextures.length = 0;
    this._freeTextureFrames.length = 0;
  }

  private _removeFreeRenderTargetAt(index: number): void {
    const rts = this._freeRenderTargets;
    const frames = this._freeRenderTargetFrames;
    const last = rts.length - 1;
    if (index !== last) {
      rts[index] = rts[last];
      frames[index] = frames[last];
    }
    rts.length = last;
    frames.length = last;
  }

  private _removeFreeTextureAt(index: number): void {
    const texs = this._freeTextures;
    const frames = this._freeTextureFrames;
    const last = texs.length - 1;
    if (index !== last) {
      texs[index] = texs[last];
      frames[index] = frames[last];
    }
    texs.length = last;
    frames.length = last;
  }

  private _destroyFreeRenderTargetAt(index: number): void {
    const rt = this._freeRenderTargets[index];
    this._removeFreeRenderTargetAt(index);
    RenderTargetPool._destroyRenderTargetResource(rt);
  }

  private _destroyFreeTextureAt(index: number): void {
    const tex = this._freeTextures[index];
    this._removeFreeTextureAt(index);
    tex.destroy(true);
  }
}
