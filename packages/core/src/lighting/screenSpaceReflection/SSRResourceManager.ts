import type { Camera } from "../../Camera";
import type { Engine } from "../../Engine";
import type { RenderContext } from "../../RenderPipeline/RenderContext";
import type { Material } from "../../material/Material";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import type { SSRForwardProgramResolver } from "./SSRForwardProgramResolver";
import type { SSRHistoryState } from "./SSRHistoryState";
import { SSRPyramidBuilder } from "./SSRPyramidBuilder";
import { SSRTraceExecutor } from "./SSRTraceExecutor";
import type { SSRCapabilities, SSRFrameConfig } from "./SSRConfig";
import { SSRUtils } from "./SSRUtils";

interface SSRTextureRTPair {
  tex: Texture2D | null;
  rt: RenderTarget | null;
  allocatedTex: boolean;
}

/**
 * Manages all persistent SSR GPU textures and RenderTargets (shared depth, Hi-Z ping-pong,
 * temporal ping-pong, receiver MRTs, trace outputs, and color pyramid history) with atomic rollback on allocation failure.
 * @internal
 */
export class SSRResourceManager {
  // Retained render targets/textures shared across stages or frames
  ssrDepthTex: Texture2D | null = null;
  ssrDepthRT: RenderTarget | null = null;
  readonly receiverRTs: [RenderTarget | null, RenderTarget | null] = [null, null];
  traceRawTex: Texture2D | null = null;
  hitDistTex: Texture2D | null = null;
  traceOutRT: RenderTarget | null = null;
  readonly traceDirtyRect = new Int32Array(4);

  // Reusable scratch container for texture+RT creation (zero per-frame heap allocation)
  private readonly _allocPair: SSRTextureRTPair = { tex: null, rt: null, allocatedTex: false };
  private readonly _engine: Engine;
  private readonly _material: Material;
  private readonly _history: SSRHistoryState;
  private readonly _programResolver: SSRForwardProgramResolver;

  constructor(
    engine: Engine,
    material: Material,
    history: SSRHistoryState,
    programResolver: SSRForwardProgramResolver
  ) {
    this._engine = engine;
    this._material = material;
    this._history = history;
    this._programResolver = programResolver;
  }

  /**
   * Create a persistent Point-filtered, Clamp-wrapped internal Texture2D excluded from GC.
   */
  createPointClampTex(width: number, height: number, format: TextureFormat): Texture2D {
    return this._createTexture(width, height, format, false, false, TextureFilterMode.Point);
  }

  /**
   * Ensure all persistent GPU resources match the active resolution, quality, and format configuration.
   */
  ensurePersistentResources(camera: Camera, caps: SSRCapabilities, frame: SSRFrameConfig): void {
    const {
      preset: { useTemporal, useHighVirtual, useLinearTrace },
      traceWidth: traceW,
      traceHeight: traceH,
      colorWidth: colorW,
      colorHeight: colorH,
      useHardwareStencil,
      aliasRecvNR
    } = frame;
    const history = this._history;

    // On resolution resize (e.g. mobile rotation), synchronously release all old trace-res resources
    // before allocating new ones so peak VRAM stays at 1x instead of transiently doubling to 2x.
    if (this.ssrDepthTex && (this.ssrDepthTex.width !== traceW || this.ssrDepthTex.height !== traceH)) {
      this._clearCameraBindings(camera);
      this._resetTemporaryBindings();
      this.destroyHiZDepthMip0RTs();
      history.hiZColorRT[0] = SSRUtils.destroyResource(history.hiZColorRT[0]);
      history.hiZColorRT[1] = SSRUtils.destroyResource(history.hiZColorRT[1]);
      history.hiZTex[0] = SSRUtils.destroyResource(history.hiZTex[0]);
      history.hiZTex[1] = SSRUtils.destroyResource(history.hiZTex[1]);
      this.destroyReceiverSlot(0);
      this.destroyReceiverSlot(1);
      this.traceOutRT = SSRUtils.destroyResource(this.traceOutRT);
      this.traceRawTex = SSRUtils.destroyResource(this.traceRawTex);
      this.hitDistTex = SSRUtils.destroyResource(this.hitDistTex);
      this.releaseTemporalBuffers();
      this.ssrDepthRT = SSRUtils.destroyResource(this.ssrDepthRT);
      this.ssrDepthTex = SSRUtils.destroyResource(this.ssrDepthTex);
      history.markAllDirty(traceW, traceH);
      SSRUtils.setDirtyRect(this.traceDirtyRect, 0, 0, traceW, traceH);
    }

    // 1. Cross-frame prevColorPyramid
    const prevPyrTex = history.prevColorPyramidTex;
    if (
      !SSRUtils.matchesTextureSpec(prevPyrTex, colorW, colorH, caps.colorPyramidFormat) ||
      prevPyrTex.isSRGBColorSpace !== caps.colorPyramidSRGB ||
      !SSRUtils.matchesRenderTarget(history.prevColorPyramidRT, prevPyrTex)
    ) {
      history.prevColorPyramidRT = SSRUtils.destroyResource(history.prevColorPyramidRT);
      history.prevColorPyramidTex = SSRUtils.destroyResource(history.prevColorPyramidTex);

      this._allocateColorTextureAndRT(
        colorW,
        colorH,
        caps.colorPyramidFormat,
        Math.max(colorW, colorH) > 1,
        caps.colorPyramidSRGB,
        TextureFilterMode.Trilinear,
        null,
        null
      );
      history.prevColorPyramidTex = this._allocPair.tex;
      history.prevColorPyramidRT = this._allocPair.rt;
      this._allocPair.tex = null;
      this._allocPair.rt = null;
      history.invalidateAll();
    }

    // 2. Shared Depth24Stencil8 at trace resolution
    if (
      !SSRUtils.matchesTextureSpec(this.ssrDepthTex, traceW, traceH, TextureFormat.Depth24Stencil8) ||
      !SSRUtils.matchesRenderTarget(this.ssrDepthRT, null, this.ssrDepthTex)
    ) {
      // Unbind camera references and destroy FBO wrappers before destroying ssrDepthTex.
      this._clearCameraBindings(camera);
      this.destroyHiZDepthMip0RTs();
      this.destroyReceiverSlot(0);
      this.destroyReceiverSlot(1);
      this.traceOutRT = SSRUtils.destroyResource(this.traceOutRT);
      history.ssrPingPongRT[0] = SSRUtils.destroyResource(history.ssrPingPongRT[0]);
      history.ssrPingPongRT[1] = SSRUtils.destroyResource(history.ssrPingPongRT[1]);
      this.ssrDepthRT = SSRUtils.destroyResource(this.ssrDepthRT);
      this.ssrDepthTex = SSRUtils.destroyResource(this.ssrDepthTex);

      const depthTex = this._createTexture(
        traceW,
        traceH,
        TextureFormat.Depth24Stencil8,
        false,
        false,
        TextureFilterMode.Point
      );
      let depthRT: RenderTarget;
      try {
        depthRT = this._createRT(traceW, traceH, null, depthTex);
      } catch (error) {
        SSRUtils.destroyResource(depthTex);
        throw error;
      }
      this.ssrDepthTex = depthTex;
      this.ssrDepthRT = depthRT;
    }

    // 3. Persistent ping-pong Hi-Z pyramid textures & color-only FBO wrappers
    const needHiZMipmap = !useLinearTrace && Math.max(traceW, traceH) > 1;
    for (let i = 0; i < 2; i++) {
      const curTex = history.hiZTex[i];
      const curColorRT = history.hiZColorRT[i];
      const curMip0RT = history.hiZDepthMip0RT[i];
      const texMismatch =
        !SSRUtils.matchesTextureSpec(curTex, traceW, traceH, caps.depthColorFormat) ||
        curTex.mipmapCount > 1 !== needHiZMipmap;
      const colorRTMismatch = !SSRUtils.matchesRenderTarget(curColorRT, curTex);
      const mip0RTMismatch = !!curMip0RT && !SSRUtils.matchesRenderTarget(curMip0RT, curTex, this.ssrDepthTex);

      if (mip0RTMismatch) {
        history.hiZDepthMip0RT[i] = SSRUtils.destroyResource(history.hiZDepthMip0RT[i]);
      }

      if (texMismatch || colorRTMismatch) {
        // Destroy paired FBO wrappers before destroying or replacing hiZTex[i].
        history.hiZDepthMip0RT[i] = SSRUtils.destroyResource(history.hiZDepthMip0RT[i]);
        history.hiZColorRT[i] = SSRUtils.destroyResource(history.hiZColorRT[i]);
        if (texMismatch) {
          history.hiZTex[i] = SSRUtils.destroyResource(history.hiZTex[i]);
        }

        this._allocateColorTextureAndRT(
          traceW,
          traceH,
          caps.depthColorFormat,
          needHiZMipmap,
          false,
          TextureFilterMode.Point,
          null,
          texMismatch ? null : history.hiZTex[i]
        );
        history.hiZTex[i] = this._allocPair.tex;
        history.hiZColorRT[i] = this._allocPair.rt;
        this._allocPair.tex = null;
        this._allocPair.rt = null;
        history.hasHiZHistory = false;
      }
    }

    // 4. Temporal Ping-Pong RTs (created before Receiver slots when aliasing recvNR)
    if (useTemporal) {
      const depthAttach = useHardwareStencil ? this.ssrDepthTex : null;
      for (let i = 0; i < 2; i++) {
        const curTex = history.ssrPingPongTex[i];
        const texMismatch = !SSRUtils.matchesTextureSpec(curTex, traceW, traceH, caps.ssrColorFormat);
        const stencilMismatch = !SSRUtils.matchesRenderTarget(history.ssrPingPongRT[i], curTex, depthAttach);

        if (texMismatch || stencilMismatch) {
          this._clearCameraBindings(camera);
          if (this.receiverRTs[i]?.colorTextures.includes(curTex!)) {
            this.receiverRTs[i] = SSRUtils.destroyResource(this.receiverRTs[i]);
          }
          history.ssrPingPongRT[i] = SSRUtils.destroyResource(history.ssrPingPongRT[i]);
          if (texMismatch) {
            history.ssrPingPongTex[i] = SSRUtils.destroyResource(history.ssrPingPongTex[i]);
          }

          this._allocateColorTextureAndRT(
            traceW,
            traceH,
            caps.ssrColorFormat,
            false,
            false,
            TextureFilterMode.Bilinear,
            useHardwareStencil ? this.ssrDepthTex : null,
            texMismatch ? null : history.ssrPingPongTex[i]
          );
          history.ssrPingPongTex[i] = this._allocPair.tex;
          history.ssrPingPongRT[i] = this._allocPair.rt;
          if (this._allocPair.allocatedTex) {
            history.hasTemporalHistory = false;
          }
          this._allocPair.tex = null;
          this._allocPair.rt = null;

          SSRUtils.setDirtyRect(history.ssrSlotDirtyRect[i], 0, 0, traceW, traceH);
        }
      }
    }

    // 5. Receiver MRTs (slot 0 always active; slot 1 only when temporal enabled)
    this._ensureReceiverSlot(camera, caps, 0, traceW, traceH, aliasRecvNR);
    if (useTemporal) {
      this._ensureReceiverSlot(camera, caps, 1, traceW, traceH, aliasRecvNR);
    }

    // 6. Trace raw output & optional High hitDist MRT
    this._ensureTraceOutputRT(camera, caps, traceW, traceH, useHighVirtual, useHardwareStencil);
  }

  /**
   * Mark the trace output dirty rect across the entire trace resolution.
   */
  resetTraceDirtyRect(traceWidth: number, traceHeight: number): void {
    SSRUtils.setDirtyRect(this.traceDirtyRect, 0, 0, traceWidth, traceHeight);
  }

  /**
   * Release slot-1 receiver and temporal buffers when temporal accumulation is disabled.
   */
  releaseUnusedTemporal(camera: Camera, context: RenderContext): void {
    const receiverSlot1 = this.receiverRTs[1];
    if (receiverSlot1 && !receiverSlot1.destroyed) {
      SSRTraceExecutor.clearCameraBindings(this._engine, this._programResolver, camera, context);
    }
    this.destroyReceiverSlot(1);
    this.releaseTemporalBuffers();
  }

  /**
   * Ensure the merged `hiZDepthMip0RT` pairing `hiZTex` with shared pass depth exists and matches attachments.
   */
  ensureHiZDepthMip0RT(slot: 0 | 1, hiZTex: Texture2D, depthTex: Texture2D): RenderTarget {
    const history = this._history;
    const existing = history.hiZDepthMip0RT[slot];
    if (!hiZTex.destroyed && !depthTex.destroyed && SSRUtils.matchesRenderTarget(existing, hiZTex, depthTex)) {
      return existing;
    }
    history.hiZDepthMip0RT[slot] = SSRUtils.destroyResource(existing);
    const rt = this._createRT(hiZTex.width, hiZTex.height, hiZTex, depthTex);
    history.hiZDepthMip0RT[slot] = rt;
    return rt;
  }

  destroyReceiverSlot(slot: 0 | 1): void {
    this.receiverRTs[slot] = SSRUtils.destroyResource(this.receiverRTs[slot]);
    this._history.recvNRTex[slot] = SSRUtils.destroyResource(this._history.recvNRTex[slot]);
    this._history.recvDepthTex[slot] = SSRUtils.destroyResource(this._history.recvDepthTex[slot]);
    this._history.recvSlotDirtyRect[slot].fill(0);
  }

  destroyHiZDepthMip0RTs(): void {
    this._history.hiZDepthMip0RT[0] = SSRUtils.destroyResource(this._history.hiZDepthMip0RT[0]);
    this._history.hiZDepthMip0RT[1] = SSRUtils.destroyResource(this._history.hiZDepthMip0RT[1]);
  }

  /**
   * Release temporal ping-pong buffers and detach any receiver FBOs aliasing `ssrPingPongTex`.
   */
  releaseTemporalBuffers(): void {
    const history = this._history;
    for (let i = 0; i < 2; i++) {
      const tex = history.ssrPingPongTex[i];
      if (tex && this.receiverRTs[i]?.colorTextures.includes(tex)) {
        this.receiverRTs[i] = SSRUtils.destroyResource(this.receiverRTs[i]);
      }
    }
    history.ssrPingPongRT[0] = SSRUtils.destroyResource(history.ssrPingPongRT[0]);
    history.ssrPingPongRT[1] = SSRUtils.destroyResource(history.ssrPingPongRT[1]);
    history.ssrPingPongTex[0] = SSRUtils.destroyResource(history.ssrPingPongTex[0]);
    history.ssrPingPongTex[1] = SSRUtils.destroyResource(history.ssrPingPongTex[1]);
    history.hasTemporalHistory = false;
    history.temporalPingPongIndex = 0;
    history.ssrSlotDirtyRect[0].fill(0);
    history.ssrSlotDirtyRect[1].fill(0);
  }

  /**
   * Destroy all persistent FBO wrappers first, then all underlying textures, and reset history metadata.
   */
  destroyPersistentResources(): void {
    const history = this._history;

    // Destroy all FBO wrappers first, then all underlying textures, to keep refcount/GL deletion cleanly ordered.
    this.destroyHiZDepthMip0RTs();
    history.hiZColorRT[0] = SSRUtils.destroyResource(history.hiZColorRT[0]);
    history.hiZColorRT[1] = SSRUtils.destroyResource(history.hiZColorRT[1]);
    this.receiverRTs[0] = SSRUtils.destroyResource(this.receiverRTs[0]);
    this.receiverRTs[1] = SSRUtils.destroyResource(this.receiverRTs[1]);
    history.ssrPingPongRT[0] = SSRUtils.destroyResource(history.ssrPingPongRT[0]);
    history.ssrPingPongRT[1] = SSRUtils.destroyResource(history.ssrPingPongRT[1]);
    history.prevColorPyramidRT = SSRUtils.destroyResource(history.prevColorPyramidRT);
    this.traceOutRT = SSRUtils.destroyResource(this.traceOutRT);
    this.ssrDepthRT = SSRUtils.destroyResource(this.ssrDepthRT);

    history.prevColorPyramidTex = SSRUtils.destroyResource(history.prevColorPyramidTex);
    history.hiZTex[0] = SSRUtils.destroyResource(history.hiZTex[0]);
    history.hiZTex[1] = SSRUtils.destroyResource(history.hiZTex[1]);
    history.ssrPingPongTex[0] = SSRUtils.destroyResource(history.ssrPingPongTex[0]);
    history.ssrPingPongTex[1] = SSRUtils.destroyResource(history.ssrPingPongTex[1]);
    history.recvDepthTex[0] = SSRUtils.destroyResource(history.recvDepthTex[0]);
    history.recvDepthTex[1] = SSRUtils.destroyResource(history.recvDepthTex[1]);
    history.recvNRTex[0] = SSRUtils.destroyResource(history.recvNRTex[0]);
    history.recvNRTex[1] = SSRUtils.destroyResource(history.recvNRTex[1]);
    this.traceRawTex = SSRUtils.destroyResource(this.traceRawTex);
    this.hitDistTex = SSRUtils.destroyResource(this.hitDistTex);
    this.ssrDepthTex = SSRUtils.destroyResource(this.ssrDepthTex);

    history.resetMetadata();
    this.traceDirtyRect.fill(0);
  }

  private _ensureReceiverSlot(
    camera: Camera,
    caps: SSRCapabilities,
    slot: 0 | 1,
    traceW: number,
    traceH: number,
    aliasRecvNR: boolean
  ): void {
    const history = this._history;
    const dTex = history.recvDepthTex[slot];
    const rt = this.receiverRTs[slot];
    const targetNRTex = aliasRecvNR ? history.ssrPingPongTex[slot] : history.recvNRTex[slot];

    const nrChanged = aliasRecvNR
      ? !!history.recvNRTex[slot] || rt?.getColorTexture(0) !== targetNRTex
      : !SSRUtils.matchesTextureSpec(targetNRTex, traceW, traceH, caps.normalRoughnessFormat);
    const dChanged = !SSRUtils.matchesTextureSpec(dTex, traceW, traceH, caps.depthColorFormat);
    const rtInvalid = !SSRUtils.matchesRenderTarget(rt, targetNRTex ?? null, this.ssrDepthTex);

    if (!nrChanged && !dChanged && !rtInvalid) {
      return;
    }

    this._clearCameraBindings(camera);
    this.receiverRTs[slot] = SSRUtils.destroyResource(this.receiverRTs[slot]);

    let nextNRTex = history.recvNRTex[slot];
    let allocatedNR = false;
    let nextDepthTex = history.recvDepthTex[slot];
    let allocatedDepth = false;

    try {
      if (aliasRecvNR) {
        history.recvNRTex[slot] = SSRUtils.destroyResource(history.recvNRTex[slot]);
        nextNRTex = null;
      } else if (nrChanged) {
        history.recvNRTex[slot] = SSRUtils.destroyResource(history.recvNRTex[slot]);
        nextNRTex = this.createPointClampTex(traceW, traceH, caps.normalRoughnessFormat);
        allocatedNR = true;
      }

      if (dChanged) {
        history.recvDepthTex[slot] = SSRUtils.destroyResource(history.recvDepthTex[slot]);
        nextDepthTex = this.createPointClampTex(traceW, traceH, caps.depthColorFormat);
        allocatedDepth = true;
      }

      const nrAttachment = aliasRecvNR ? history.ssrPingPongTex[slot]! : nextNRTex!;
      const newRT = this._createRT(traceW, traceH, [nrAttachment, nextDepthTex!], this.ssrDepthTex);
      history.recvNRTex[slot] = nextNRTex;
      history.recvDepthTex[slot] = nextDepthTex;
      this.receiverRTs[slot] = newRT;
      SSRUtils.setDirtyRect(history.recvSlotDirtyRect[slot], 0, 0, traceW, traceH);
    } catch (error) {
      if (allocatedNR) SSRUtils.destroyResource(nextNRTex);
      if (allocatedDepth) SSRUtils.destroyResource(nextDepthTex);
      throw error;
    }
  }

  private _ensureTraceOutputRT(
    camera: Camera,
    caps: SSRCapabilities,
    traceW: number,
    traceH: number,
    useHighVirtual: boolean,
    useHardwareStencil: boolean
  ): void {
    const depthAttach = useHardwareStencil ? this.ssrDepthTex : null;
    const traceSizeMismatch = !SSRUtils.matchesTextureSpec(this.traceRawTex, traceW, traceH, caps.ssrColorFormat);
    const hitDistNeededMismatch = useHighVirtual
      ? !SSRUtils.matchesTextureSpec(this.hitDistTex, traceW, traceH, caps.depthColorFormat)
      : !!this.hitDistTex;
    const rtMismatch = !SSRUtils.matchesRenderTarget(this.traceOutRT, this.traceRawTex, depthAttach);

    if (!traceSizeMismatch && !hitDistNeededMismatch && !rtMismatch) {
      return;
    }

    this._clearCameraBindings(camera);
    this.traceOutRT = SSRUtils.destroyResource(this.traceOutRT);
    let nextTraceTex = this.traceRawTex;
    let allocatedTraceTex = false;
    let nextHitDistTex = this.hitDistTex;
    let allocatedHitDistTex = false;

    try {
      if (traceSizeMismatch) {
        this.traceRawTex = SSRUtils.destroyResource(this.traceRawTex);
        nextTraceTex = this._createTexture(
          traceW,
          traceH,
          caps.ssrColorFormat,
          false,
          false,
          TextureFilterMode.Bilinear
        );
        allocatedTraceTex = true;
      }

      if (useHighVirtual) {
        if (hitDistNeededMismatch) {
          this.hitDistTex = SSRUtils.destroyResource(this.hitDistTex);
          nextHitDistTex = this.createPointClampTex(traceW, traceH, caps.depthColorFormat);
          allocatedHitDistTex = true;
        }
      } else {
        this.hitDistTex = SSRUtils.destroyResource(this.hitDistTex);
        nextHitDistTex = null;
      }

      const colorAttachments = useHighVirtual ? [nextTraceTex!, nextHitDistTex!] : [nextTraceTex!];
      const traceOutRT = this._createRT(traceW, traceH, colorAttachments, useHardwareStencil ? this.ssrDepthTex : null);
      this.traceRawTex = nextTraceTex;
      this.hitDistTex = nextHitDistTex;
      this.traceOutRT = traceOutRT;
      SSRUtils.setDirtyRect(this.traceDirtyRect, 0, 0, traceW, traceH);
    } catch (error) {
      if (allocatedTraceTex) SSRUtils.destroyResource(nextTraceTex);
      if (allocatedHitDistTex) SSRUtils.destroyResource(nextHitDistTex);
      throw error;
    }
  }

  private _allocateColorTextureAndRT(
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGB: boolean,
    filterMode: TextureFilterMode,
    depthTexture: Texture2D | null,
    reuseTex: Texture2D | null
  ): void {
    const allocatedTex = !reuseTex;
    const tex = reuseTex ?? this._createTexture(width, height, format, mipmap, isSRGB, filterMode);
    let rt: RenderTarget;
    try {
      rt = this._createRT(width, height, tex, depthTexture);
    } catch (error) {
      if (allocatedTex) {
        SSRUtils.destroyResource(tex);
      }
      throw error;
    }
    this._allocPair.tex = tex;
    this._allocPair.rt = rt;
    this._allocPair.allocatedTex = allocatedTex;
  }

  private _createTexture(
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGB: boolean,
    filterMode: TextureFilterMode
  ): Texture2D {
    const tex = new Texture2D(this._engine, width, height, format, mipmap, isSRGB);
    tex.filterMode = filterMode;
    tex.wrapModeU = TextureWrapMode.Clamp;
    tex.wrapModeV = TextureWrapMode.Clamp;
    tex.isGCIgnored = true;
    return tex;
  }

  private _createRT(
    width: number,
    height: number,
    colorAttachments: Texture2D | Texture2D[] | null,
    depthTexture: Texture2D | null
  ): RenderTarget {
    const rt = Array.isArray(colorAttachments)
      ? new RenderTarget(this._engine, width, height, colorAttachments, depthTexture, 1)
      : new RenderTarget(this._engine, width, height, colorAttachments, depthTexture, 1);
    rt.autoGenerateMipmaps = false;
    rt.isGCIgnored = true;
    return rt;
  }

  private _clearCameraBindings(camera: Camera): void {
    SSRTraceExecutor.clearCameraBindings(this._engine, this._programResolver, camera);
  }

  private _resetTemporaryBindings(): void {
    SSRPyramidBuilder.resetTemporaryBindings(this._material);
    SSRTraceExecutor.resetTemporaryBindings(this._material);
  }
}
