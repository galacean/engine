import { Matrix, Vector4 } from "@galacean/engine-math";
import type { EngineObject } from "../../base/EngineObject";
import type { RenderTarget, Texture2D } from "../../texture";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/**
 * @internal
 * Cross-frame history and ping-pong handles owned by `ScreenSpaceReflectionPass`.
 */
export class SSRHistoryState {
  hasColorHistory: boolean = false;
  hasTemporalHistory: boolean = false;
  hasHiZHistory: boolean = false;
  lastFrameCount: number = -1;
  lastTraceWidth: number = 0;
  lastTraceHeight: number = 0;
  lastColorWidth: number = 0;
  lastColorHeight: number = 0;
  lastQuality: ScreenSpaceReflectionQuality = ScreenSpaceReflectionQuality.Medium;
  lastIsOrthographic: boolean = false;
  lastFarClip: number = 0;
  pingPongIndex: 0 | 1 = 0;
  hiZPingPongIndex: 0 | 1 = 0;

  readonly prevVPMat = new Matrix();
  readonly prevInvProjMat = new Matrix();
  readonly prevInvViewMat = new Matrix();
  readonly prevViewZRow = new Vector4();

  prevColorPyramidRT: RenderTarget | null = null;
  prevColorPyramidTex: Texture2D | null = null;

  readonly hiZTex: [Texture2D | null, Texture2D | null] = [null, null];
  readonly hiZDepthMip0RT: [RenderTarget | null, RenderTarget | null] = [null, null];
  readonly hiZColorRT: [RenderTarget | null, RenderTarget | null] = [null, null];

  readonly ssrPingPongRT: [RenderTarget | null, RenderTarget | null] = [null, null];
  readonly ssrPingPongTex: [Texture2D | null, Texture2D | null] = [null, null];
  readonly recvDepthTex: [Texture2D | null, Texture2D | null] = [null, null];
  readonly recvNRTex: [Texture2D | null, Texture2D | null] = [null, null];

  // Track last written pixel bounds [x0, y0, x1, y1] per slot so scissored clears wipe any prior stale region.
  readonly recvSlotDirtyRect: [Int32Array, Int32Array] = [new Int32Array(4), new Int32Array(4)];
  readonly ssrSlotDirtyRect: [Int32Array, Int32Array] = [new Int32Array(4), new Int32Array(4)];

  /** @internal */
  static _destroyResource<T extends EngineObject>(resource: T | null): null {
    if (resource && !resource.destroyed) {
      resource._destroyImmediate();
    }
    return null;
  }

  /**
   * Mark every slot dirty across the full trace resolution so the next scissored clear sweeps stale borders.
   */
  markAllDirty(width: number, height: number): void {
    const w = Math.max(0, width | 0);
    const h = Math.max(0, height | 0);
    for (let i = 0; i < 2; i++) {
      const rr = this.recvSlotDirtyRect[i];
      rr[0] = 0;
      rr[1] = 0;
      rr[2] = w;
      rr[3] = h;
      const sr = this.ssrSlotDirtyRect[i];
      sr[0] = 0;
      sr[1] = 0;
      sr[2] = w;
      sr[3] = h;
    }
  }

  /**
   * Reset all per-slot dirty rectangles to empty `[0, 0, 0, 0]`.
   */
  resetDirtyRects(): void {
    for (let i = 0; i < 2; i++) {
      this.recvSlotDirtyRect[i].fill(0);
      this.ssrSlotDirtyRect[i].fill(0);
    }
  }

  /**
   * Invalidate both color history and temporal reflection history.
   */
  invalidateAll(): void {
    this.hasColorHistory = false;
    this.hasTemporalHistory = false;
    this.hasHiZHistory = false;
    this.lastFrameCount = -1;
    this.markAllDirty(this.lastTraceWidth, this.lastTraceHeight);
  }

  /**
   * Invalidate only temporal reflection history while retaining color history if valid.
   */
  invalidateTemporal(): void {
    this.hasTemporalHistory = false;
  }

  /**
   * Release all temporal ping-pong buffers (used when switching to Low quality or invalidating temporal state).
   */
  releaseTemporalBuffers(): void {
    this.ssrPingPongRT[0] = SSRHistoryState._destroyResource(this.ssrPingPongRT[0]);
    this.ssrPingPongRT[1] = SSRHistoryState._destroyResource(this.ssrPingPongRT[1]);
    this.ssrPingPongTex[0] = SSRHistoryState._destroyResource(this.ssrPingPongTex[0]);
    this.ssrPingPongTex[1] = SSRHistoryState._destroyResource(this.ssrPingPongTex[1]);
    this.hasTemporalHistory = false;
  }

  /**
   * Destroy all cross-frame RenderTarget shells first, then all underlying Texture2Ds.
   */
  releaseResources(): void {
    // Destroy FBO wrappers before owned textures to keep refcount/GL deletion clean.
    this.prevColorPyramidRT = SSRHistoryState._destroyResource(this.prevColorPyramidRT);
    this.hiZDepthMip0RT[0] = SSRHistoryState._destroyResource(this.hiZDepthMip0RT[0]);
    this.hiZDepthMip0RT[1] = SSRHistoryState._destroyResource(this.hiZDepthMip0RT[1]);
    this.hiZColorRT[0] = SSRHistoryState._destroyResource(this.hiZColorRT[0]);
    this.hiZColorRT[1] = SSRHistoryState._destroyResource(this.hiZColorRT[1]);
    this.ssrPingPongRT[0] = SSRHistoryState._destroyResource(this.ssrPingPongRT[0]);
    this.ssrPingPongRT[1] = SSRHistoryState._destroyResource(this.ssrPingPongRT[1]);

    this.prevColorPyramidTex = SSRHistoryState._destroyResource(this.prevColorPyramidTex);
    this.hiZTex[0] = SSRHistoryState._destroyResource(this.hiZTex[0]);
    this.hiZTex[1] = SSRHistoryState._destroyResource(this.hiZTex[1]);
    this.ssrPingPongTex[0] = SSRHistoryState._destroyResource(this.ssrPingPongTex[0]);
    this.ssrPingPongTex[1] = SSRHistoryState._destroyResource(this.ssrPingPongTex[1]);
    this.recvDepthTex[0] = SSRHistoryState._destroyResource(this.recvDepthTex[0]);
    this.recvDepthTex[1] = SSRHistoryState._destroyResource(this.recvDepthTex[1]);
    this.recvNRTex[0] = SSRHistoryState._destroyResource(this.recvNRTex[0]);
    this.recvNRTex[1] = SSRHistoryState._destroyResource(this.recvNRTex[1]);

    this.pingPongIndex = 0;
    this.hiZPingPongIndex = 0;
    this.lastTraceWidth = 0;
    this.lastTraceHeight = 0;
    this.lastColorWidth = 0;
    this.lastColorHeight = 0;
    this.invalidateAll();
    this.resetDirtyRects();
  }

  destroy(): void {
    this.releaseResources();
  }
}
