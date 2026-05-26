import { Engine } from "../Engine";
import { RenderTarget, Texture, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";

/**
 * Pool of `RenderTarget`s and `Texture2D`s used internally by the render pipeline.
 *
 * Entries returned via `freeRenderTarget`/`freeTexture` stay in the free list and are matched
 * (by shape) for the next `allocate*` request. Three eviction strategies keep the free list bounded:
 *
 * 1. **Frame-age** — entries unused for more than `maxFreeAgeFrames` engine ticks are destroyed by `tick()`.
 * 2. **Size-matched** — `evictBySize(w, h)` removes entries whose dimensions match the given size, called
 *    by the engine on canvas resize to clear out old full-canvas RTs.
 * 3. **Memory cap** — `freeRenderTarget`/`freeTexture` evict the oldest entries (by `lastUsedFrame`) until the
 *    free-list footprint is at or below `maxFreeBytes`. Caps the pool against pathological churn.
 *
 * @internal
 */
export class RenderTargetPool {
  /**
   * Maximum number of engine frames an entry may sit unused in the free list before `tick()` destroys it.
   * Defaults to ~1 second at 60fps so reflection probes / periodic off-frame passes survive a short gap.
   */
  maxFreeAgeFrames: number = 60;

  /**
   * Soft cap on the total bytes pooled in the free list. When `freeRenderTarget`/`freeTexture` push an entry
   * that would exceed this, the oldest entries (by `lastUsedFrame`) are destroyed until the total fits.
   * Tracks only entries currently in the free list — entries actively leased by a pipeline are not counted.
   */
  maxFreeBytes: number = 64 * 1024 * 1024;

  private _engine: Engine;

  private _freeRenderTargets: RenderTarget[] = [];
  private _freeRenderTargetFrames: number[] = [];
  private _freeRenderTargetBytes: number[] = [];
  private _freeRenderTargetByteTotal: number = 0;

  private _freeTextures: Texture2D[] = [];
  private _freeTextureFrames: number[] = [];
  private _freeTextureBytes: number[] = [];
  private _freeTextureByteTotal: number = 0;

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
    const bytes = RenderTargetPool._computeRtBytes(renderTarget);
    this._freeRenderTargets.push(renderTarget);
    this._freeRenderTargetFrames.push(this._engine.time.frameCount);
    this._freeRenderTargetBytes.push(bytes);
    this._freeRenderTargetByteTotal += bytes;
    this._enforceMemoryCap();
  }

  freeTexture(texture: Texture2D): void {
    if (!texture || texture.destroyed) return;
    const bytes = texture._memorySize;
    this._freeTextures.push(texture);
    this._freeTextureFrames.push(this._engine.time.frameCount);
    this._freeTextureBytes.push(bytes);
    this._freeTextureByteTotal += bytes;
    this._enforceMemoryCap();
  }

  /**
   * Destroy entries that have been idle in the free list for longer than `maxFreeAgeFrames`,
   * then re-evaluate the memory cap so a mid-run change to `maxFreeBytes` takes effect within
   * one frame (rather than waiting for the next `free*` call). Called once per engine frame.
   */
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
    this._enforceMemoryCap();
  }

  /**
   * Destroy free-list entries whose dimensions exactly match the given size. Called when the canvas
   * resizes so full-canvas RTs cached at the previous resolution don't linger waiting for `tick()`.
   */
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

  /**
   * Total bytes currently held in the free list (RT entries + standalone Texture2D entries).
   * Active leased entries are not included.
   */
  get freeListByteSize(): number {
    return this._freeRenderTargetByteTotal + this._freeTextureByteTotal;
  }

  gc(): void {
    const freeRenderTargets = this._freeRenderTargets;
    for (let i = 0, n = freeRenderTargets.length; i < n; i++) {
      RenderTargetPool._destroyRenderTargetResource(freeRenderTargets[i]);
    }
    freeRenderTargets.length = 0;
    this._freeRenderTargetFrames.length = 0;
    this._freeRenderTargetBytes.length = 0;
    this._freeRenderTargetByteTotal = 0;

    const freeTextures = this._freeTextures;
    for (let i = 0, n = freeTextures.length; i < n; i++) {
      freeTextures[i].destroy(true);
    }
    freeTextures.length = 0;
    this._freeTextureFrames.length = 0;
    this._freeTextureBytes.length = 0;
    this._freeTextureByteTotal = 0;
  }

  /**
   * Swap-pop helper: remove free RT entry at `index` without destroying the RT (used when handing it out).
   */
  private _removeFreeRenderTargetAt(index: number): void {
    const rts = this._freeRenderTargets;
    const frames = this._freeRenderTargetFrames;
    const bytes = this._freeRenderTargetBytes;
    const last = rts.length - 1;
    this._freeRenderTargetByteTotal -= bytes[index];
    if (index !== last) {
      rts[index] = rts[last];
      frames[index] = frames[last];
      bytes[index] = bytes[last];
    }
    rts.length = last;
    frames.length = last;
    bytes.length = last;
  }

  /**
   * Swap-pop helper for the texture free list.
   */
  private _removeFreeTextureAt(index: number): void {
    const texs = this._freeTextures;
    const frames = this._freeTextureFrames;
    const bytes = this._freeTextureBytes;
    const last = texs.length - 1;
    this._freeTextureByteTotal -= bytes[index];
    if (index !== last) {
      texs[index] = texs[last];
      frames[index] = frames[last];
      bytes[index] = bytes[last];
    }
    texs.length = last;
    frames.length = last;
    bytes.length = last;
  }

  /**
   * Destroy free RT entry at `index` (called when evicting, not when leasing out).
   */
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

  /**
   * Evict the oldest entry across BOTH free lists (by `lastUsedFrame`) until the combined byte
   * total is at or below `maxFreeBytes`. The cap applies to the sum reported by `freeListByteSize`,
   * not to each list independently.
   */
  private _enforceMemoryCap(): void {
    const cap = this.maxFreeBytes;
    while (
      this._freeRenderTargetByteTotal + this._freeTextureByteTotal > cap &&
      (this._freeRenderTargets.length > 0 || this._freeTextures.length > 0)
    ) {
      const rtFrames = this._freeRenderTargetFrames;
      const texFrames = this._freeTextureFrames;
      const rtOldest = rtFrames.length > 0 ? this._findOldestIndex(rtFrames) : -1;
      const texOldest = texFrames.length > 0 ? this._findOldestIndex(texFrames) : -1;

      let evictRt: boolean;
      if (rtOldest < 0) {
        evictRt = false;
      } else if (texOldest < 0) {
        evictRt = true;
      } else {
        // Tie-break toward RT: pool entries dominate the byte budget, so this converges faster.
        evictRt = rtFrames[rtOldest] <= texFrames[texOldest];
      }

      if (evictRt) {
        this._destroyFreeRenderTargetAt(rtOldest);
      } else {
        this._destroyFreeTextureAt(texOldest);
      }
    }
  }

  private _findOldestIndex(frames: number[]): number {
    let oldestIdx = 0;
    let oldestFrame = frames[0];
    for (let i = 1, n = frames.length; i < n; i++) {
      if (frames[i] < oldestFrame) {
        oldestFrame = frames[i];
        oldestIdx = i;
      }
    }
    return oldestIdx;
  }

  /**
   * Sum the bytes "owned" by an RT entry. Mirrors what `_renderingStatistics._textureMemory`
   * would drop if this entry were fully destroyed.
   *
   * Contract relied on here (see `RenderTarget.ts` ctor):
   *   `RenderTarget._memorySize` accounts ONLY for the RT's own renderbuffers —
   *     - MSAA: `(colorRBO + depthRBO) * antiAliasing` (the multisampled side; resolves into the
   *       attached `colorTexture`, which is tracked separately on the Texture itself)
   *     - Non-MSAA: just the depth RBO when depth is given as a format, else 0
   *   It does NOT include the bytes of the attached `colorTexture` / `depthTexture`, which each
   *   carry their own `_memorySize` from the `Texture` ctor.
   * So summing `rt._memorySize + colorTexture._memorySize + depthTexture._memorySize` does not
   * double-count.
   */
  private static _computeRtBytes(rt: RenderTarget): number {
    let bytes = rt._memorySize;
    const color = rt.getColorTexture(0) as Texture | null;
    if (color) {
      bytes += color._memorySize;
    }
    const depth = rt.depthTexture as Texture | null;
    if (depth && depth !== color) {
      bytes += depth._memorySize;
    }
    return bytes;
  }

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
}
