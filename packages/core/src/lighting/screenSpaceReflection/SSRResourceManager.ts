import type { ReferResource } from "../../asset/ReferResource";
import type { Engine } from "../../Engine";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import type { SSRHistoryState } from "./SSRHistoryState";
import type { SSRCapabilities, SSRFrameConfig } from "./SSRConfig";

/**
 * Manages all persistent SSR GPU textures and RenderTargets (Hi-Z ping-pong,
 * temporal ping-pong, trace outputs, previous normal-roughness history, and color pyramid history)
 * with zero per-frame reallocation in steady state.
 * @internal
 */
export class SSRResourceManager {
  prevColorPyramidTex: Texture2D | null = null;
  prevColorPyramidRT: RenderTarget | null = null;

  readonly hiZTex: [Texture2D | null, Texture2D | null] = [null, null];
  readonly hiZColorRT: [RenderTarget | null, RenderTarget | null] = [null, null];

  readonly ssrPingPongTex: [Texture2D | null, Texture2D | null] = [null, null];
  readonly ssrPingPongRT: [RenderTarget | null, RenderTarget | null] = [null, null];

  traceRawTex: Texture2D | null = null;
  hitDistTex: Texture2D | null = null;
  traceOutRT: RenderTarget | null = null;

  prevNormalRoughnessTex: Texture2D | null = null;
  prevNormalRoughnessRT: RenderTarget | null = null;

  private _traceWidth: number = 0;
  private _traceHeight: number = 0;
  private _colorWidth: number = 0;
  private _colorHeight: number = 0;
  private _colorFormat: TextureFormat | null = null;
  private _colorSRGB: boolean = false;
  private _depthColorFormat: TextureFormat | null = null;
  private _hiZMipmap: boolean = false;
  private _prevNormalFormat: TextureFormat | null = null;
  private _reflectionFormat: TextureFormat | null = null;
  private _useTemporal: boolean = false;
  private _useHighVirtual: boolean = false;

  private readonly _engine: Engine;
  private readonly _history: SSRHistoryState;
  private readonly _beforeRebuild: () => void;

  constructor(engine: Engine, history: SSRHistoryState, beforeRebuild: () => void) {
    this._engine = engine;
    this._history = history;
    this._beforeRebuild = beforeRebuild;
  }

  /**
   * Ensure all persistent textures and render targets match the resolved camera capabilities and preset.
   */
  ensurePersistentResources(caps: SSRCapabilities, frame: SSRFrameConfig): void {
    const {
      traceWidth: traceW,
      traceHeight: traceH,
      colorWidth: colorW,
      colorHeight: colorH,
      preset: { useTemporal, useLinearTrace },
      useHighVirtual
    } = frame;
    const { depthColorFormat, normalRoughnessFormat, ssrColorFormat, colorPyramidFormat, colorPyramidSRGB } = caps;

    const hiZMipmap = !useLinearTrace && Math.max(traceW, traceH) > 1;
    const prevNormalFormat = useHighVirtual ? normalRoughnessFormat : null;

    const colorChanged =
      this._colorWidth !== colorW ||
      this._colorHeight !== colorH ||
      this._colorFormat !== colorPyramidFormat ||
      this._colorSRGB !== colorPyramidSRGB;
    const resized = this._traceWidth !== traceW || this._traceHeight !== traceH;
    const depthColorChanged = resized || this._depthColorFormat !== depthColorFormat;
    const hiZChanged = depthColorChanged || this._hiZMipmap !== hiZMipmap;
    const reflectionChanged = resized || this._reflectionFormat !== ssrColorFormat;
    const hitDistChanged = this._useHighVirtual !== useHighVirtual || (useHighVirtual && depthColorChanged);
    const temporalChanged = this._useTemporal !== useTemporal;
    const prevNormalChanged = (prevNormalFormat !== null && resized) || this._prevNormalFormat !== prevNormalFormat;
    if (
      !colorChanged &&
      !hiZChanged &&
      !reflectionChanged &&
      !hitDistChanged &&
      !temporalChanged &&
      !prevNormalChanged
    ) {
      return;
    }

    const history = this._history;
    this._beforeRebuild();
    if (hiZChanged) {
      history.hasHiZHistory = false;
      history.hiZPingPongIndex = 0;
    }
    if (reflectionChanged || temporalChanged || depthColorChanged || prevNormalChanged) {
      history.hasTemporalHistory = false;
      history.temporalPingPongIndex = 0;
    }
    if (colorChanged) {
      history.invalidateAll();
      this.prevColorPyramidRT = SSRResourceManager._destroyResource(this.prevColorPyramidRT);
      SSRResourceManager._destroyResource(this.prevColorPyramidTex);
      const texture = (this.prevColorPyramidTex = this._createTexture(
        colorW,
        colorH,
        colorPyramidFormat,
        Math.max(colorW, colorH) > 1,
        colorPyramidSRGB,
        TextureFilterMode.Trilinear
      ));
      this.prevColorPyramidRT = this._createRT(colorW, colorH, [texture]);
    }

    // Destroy FBO wrappers before underlying textures.
    for (let i = 0; i < 2; i++) {
      if (hiZChanged) {
        this.hiZColorRT[i] = SSRResourceManager._destroyResource(this.hiZColorRT[i]);
        this.hiZTex[i] = SSRResourceManager._destroyResource(this.hiZTex[i]);
      }
      if (reflectionChanged || temporalChanged) {
        this.ssrPingPongRT[i] = SSRResourceManager._destroyResource(this.ssrPingPongRT[i]);
        this.ssrPingPongTex[i] = SSRResourceManager._destroyResource(this.ssrPingPongTex[i]);
      }
    }
    if (reflectionChanged || hitDistChanged) {
      this.traceOutRT = SSRResourceManager._destroyResource(this.traceOutRT);
    }
    if (reflectionChanged) {
      SSRResourceManager._destroyResource(this.traceRawTex);
      this.traceRawTex = this._createTexture(traceW, traceH, ssrColorFormat, false, false, TextureFilterMode.Bilinear);
    }
    if (hitDistChanged) {
      SSRResourceManager._destroyResource(this.hitDistTex);
      this.hitDistTex = useHighVirtual ? this._createPointClampTexture(traceW, traceH, depthColorFormat) : null;
    }
    if (prevNormalChanged) {
      this.prevNormalRoughnessRT = SSRResourceManager._destroyResource(this.prevNormalRoughnessRT);
      SSRResourceManager._destroyResource(this.prevNormalRoughnessTex);
      if (prevNormalFormat !== null) {
        const tex = (this.prevNormalRoughnessTex = this._createPointClampTexture(traceW, traceH, prevNormalFormat));
        this.prevNormalRoughnessRT = this._createRT(traceW, traceH, [tex]);
      } else {
        this.prevNormalRoughnessTex = null;
      }
    }

    this.traceOutRT ??= this._createRT(
      traceW,
      traceH,
      useHighVirtual ? [this.traceRawTex!, this.hitDistTex!] : [this.traceRawTex!]
    );
    for (let i = 0; i < 2; i++) {
      const hiZ = (this.hiZTex[i] ??= this._createTexture(
        traceW,
        traceH,
        depthColorFormat,
        hiZMipmap,
        false,
        TextureFilterMode.Point
      ));
      this.hiZColorRT[i] ??= this._createRT(traceW, traceH, [hiZ]);
      if (useTemporal) {
        const temporal = (this.ssrPingPongTex[i] ??= this._createTexture(
          traceW,
          traceH,
          ssrColorFormat,
          false,
          false,
          TextureFilterMode.Bilinear
        ));
        this.ssrPingPongRT[i] ??= this._createRT(traceW, traceH, [temporal]);
      }
    }

    this._traceWidth = traceW;
    this._traceHeight = traceH;
    this._colorWidth = colorW;
    this._colorHeight = colorH;
    this._colorFormat = colorPyramidFormat;
    this._colorSRGB = colorPyramidSRGB;
    this._depthColorFormat = depthColorFormat;
    this._hiZMipmap = hiZMipmap;
    this._prevNormalFormat = prevNormalFormat;
    this._reflectionFormat = ssrColorFormat;
    this._useTemporal = useTemporal;
    this._useHighVirtual = useHighVirtual;
  }

  /**
   * Destroy all persistent FBO wrappers first, then all underlying textures, and reset history metadata.
   */
  destroyPersistentResources(): void {
    this._history.invalidateAll();

    for (let i = 0; i < 2; i++) {
      this.hiZColorRT[i] = SSRResourceManager._destroyResource(this.hiZColorRT[i]);
      this.ssrPingPongRT[i] = SSRResourceManager._destroyResource(this.ssrPingPongRT[i]);
    }
    this.prevNormalRoughnessRT = SSRResourceManager._destroyResource(this.prevNormalRoughnessRT);
    this.prevColorPyramidRT = SSRResourceManager._destroyResource(this.prevColorPyramidRT);
    this.traceOutRT = SSRResourceManager._destroyResource(this.traceOutRT);

    this.prevColorPyramidTex = SSRResourceManager._destroyResource(this.prevColorPyramidTex);
    this.prevNormalRoughnessTex = SSRResourceManager._destroyResource(this.prevNormalRoughnessTex);
    for (let i = 0; i < 2; i++) {
      this.hiZTex[i] = SSRResourceManager._destroyResource(this.hiZTex[i]);
      this.ssrPingPongTex[i] = SSRResourceManager._destroyResource(this.ssrPingPongTex[i]);
    }
    this.traceRawTex = SSRResourceManager._destroyResource(this.traceRawTex);
    this.hitDistTex = SSRResourceManager._destroyResource(this.hitDistTex);

    this._traceWidth = 0;
    this._traceHeight = 0;
    this._colorWidth = 0;
    this._colorHeight = 0;
    this._colorFormat = null;
    this._colorSRGB = false;
    this._depthColorFormat = null;
    this._hiZMipmap = false;
    this._prevNormalFormat = null;
    this._reflectionFormat = null;
    this._useTemporal = false;
    this._useHighVirtual = false;
  }

  private static _destroyResource<T extends ReferResource>(res: T | null): null {
    if (res) {
      res._addReferCount(-1);
      res.destroy(true);
    }
    return null;
  }

  private _createPointClampTexture(width: number, height: number, format: TextureFormat): Texture2D {
    return this._createTexture(width, height, format, false, false, TextureFilterMode.Point);
  }

  private _createTexture(
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGB: boolean,
    filterMode: TextureFilterMode
  ): Texture2D {
    const texture = new Texture2D(this._engine, width, height, format, mipmap, isSRGB);
    texture.wrapModeU = TextureWrapMode.Clamp;
    texture.wrapModeV = TextureWrapMode.Clamp;
    texture.filterMode = filterMode;
    texture._addReferCount(1);
    texture.isGCIgnored = true;
    return texture;
  }

  private _createRT(width: number, height: number, colors: Texture2D[]): RenderTarget {
    const rt = new RenderTarget(this._engine, width, height, colors, null, 1);
    rt.autoGenerateMipmaps = false;
    rt._addReferCount(1);
    rt.isGCIgnored = true;
    return rt;
  }
}
