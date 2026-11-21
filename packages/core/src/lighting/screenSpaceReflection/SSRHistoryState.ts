import { Matrix, Vector4 } from "@galacean/engine-math";
import type { RenderTarget, Texture2D } from "../../texture";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/**
 * @internal
 * Cross-frame history and ping-pong handles owned by `ScreenSpaceReflectionPass`.
 */
export class SSRHistoryState {
  hasColorHistory: boolean = false;
  hasTemporalHistory: boolean = false;
  lastFrameCount: number = -1;
  lastTraceWidth: number = 0;
  lastTraceHeight: number = 0;
  lastColorWidth: number = 0;
  lastColorHeight: number = 0;
  lastQuality: ScreenSpaceReflectionQuality = ScreenSpaceReflectionQuality.Medium;
  lastIsOrthographic: boolean = false;
  pingPongIndex: 0 | 1 = 0;

  readonly prevVPMat = new Matrix();
  readonly prevViewZRow = new Vector4();

  prevColorPyramidRT: RenderTarget | null = null;
  prevColorPyramidTex: Texture2D | null = null;
  prevTraceDepthRT: RenderTarget | null = null;
  prevTraceDepthTex: Texture2D | null = null;

  readonly ssrPingPongRT: [RenderTarget | null, RenderTarget | null] = [null, null];
  readonly ssrPingPongTex: [Texture2D | null, Texture2D | null] = [null, null];
  readonly recvDepthTex: [Texture2D | null, Texture2D | null] = [null, null];
  readonly recvNRTex: [Texture2D | null, Texture2D | null] = [null, null];

  private static _destroyRT(rt: RenderTarget | null): null {
    if (rt && !rt.destroyed) {
      rt.destroy(true);
    }
    return null;
  }

  private static _destroyTex(tex: Texture2D | null): null {
    if (tex && !tex.destroyed) {
      tex.destroy(true);
    }
    return null;
  }

  /**
   * Invalidate both color history and temporal reflection history.
   */
  invalidateAll(): void {
    this.hasColorHistory = false;
    this.hasTemporalHistory = false;
    this.lastFrameCount = -1;
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
    this.ssrPingPongRT[0] = SSRHistoryState._destroyRT(this.ssrPingPongRT[0]);
    this.ssrPingPongRT[1] = SSRHistoryState._destroyRT(this.ssrPingPongRT[1]);
    this.ssrPingPongTex[0] = SSRHistoryState._destroyTex(this.ssrPingPongTex[0]);
    this.ssrPingPongTex[1] = SSRHistoryState._destroyTex(this.ssrPingPongTex[1]);
    this.hasTemporalHistory = false;
  }

  /**
   * Destroy all cross-frame RenderTarget shells first, then all underlying Texture2Ds.
   */
  releaseResources(): void {
    // Destroy FBO wrappers before owned textures to keep refcount/GL deletion clean.
    this.prevColorPyramidRT = SSRHistoryState._destroyRT(this.prevColorPyramidRT);
    this.prevTraceDepthRT = SSRHistoryState._destroyRT(this.prevTraceDepthRT);
    this.ssrPingPongRT[0] = SSRHistoryState._destroyRT(this.ssrPingPongRT[0]);
    this.ssrPingPongRT[1] = SSRHistoryState._destroyRT(this.ssrPingPongRT[1]);

    this.prevColorPyramidTex = SSRHistoryState._destroyTex(this.prevColorPyramidTex);
    this.prevTraceDepthTex = SSRHistoryState._destroyTex(this.prevTraceDepthTex);
    this.ssrPingPongTex[0] = SSRHistoryState._destroyTex(this.ssrPingPongTex[0]);
    this.ssrPingPongTex[1] = SSRHistoryState._destroyTex(this.ssrPingPongTex[1]);
    this.recvDepthTex[0] = SSRHistoryState._destroyTex(this.recvDepthTex[0]);
    this.recvDepthTex[1] = SSRHistoryState._destroyTex(this.recvDepthTex[1]);
    this.recvNRTex[0] = SSRHistoryState._destroyTex(this.recvNRTex[0]);
    this.recvNRTex[1] = SSRHistoryState._destroyTex(this.recvNRTex[1]);

    this.pingPongIndex = 0;
    this.lastTraceWidth = 0;
    this.lastTraceHeight = 0;
    this.lastColorWidth = 0;
    this.lastColorHeight = 0;
    this.invalidateAll();
  }

  destroy(): void {
    this.releaseResources();
  }
}
