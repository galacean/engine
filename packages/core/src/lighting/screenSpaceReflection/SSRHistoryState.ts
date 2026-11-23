import { Matrix, Vector4 } from "@galacean/engine-math";
import type { RenderTarget, Texture2D } from "../../texture";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/**
 * Cross-frame history metadata, ping-pong GPU handles, and dirty-rect tracking owned by `ScreenSpaceReflectionPass`.
 * GPU resource allocation and destruction are owned exclusively by `ScreenSpaceReflectionPass`.
 * @internal
 */
export class SSRHistoryState {
  // History readiness flags
  hasColorHistory: boolean = false;
  hasTemporalHistory: boolean = false;
  hasHiZHistory: boolean = false;

  // Last-frame camera / resolution / encoding configuration snapshot for discontinuity checks
  lastFrameCount: number = -1;
  lastTraceWidth: number = 0;
  lastTraceHeight: number = 0;
  lastColorWidth: number = 0;
  lastColorHeight: number = 0;
  lastQuality: ScreenSpaceReflectionQuality = ScreenSpaceReflectionQuality.Medium;
  lastIsOrthographic: boolean = false;
  lastFarClip: number = 0;
  lastIsHDR: boolean = false;
  lastAliasRecvNR: boolean = false;
  lastUsesPackedDepth: boolean = false;
  lastUsesPackedNormal: boolean = false;
  lastUsesPackedHDR: boolean = false;
  lastUseHardwareStencil: boolean = true;
  lastUseHighVirtual: boolean = false;
  lastUseLinearTrace: boolean = false;

  /** Active write slot index (`0 | 1`) for temporal reflection and receiver ping-pong buffers. */
  temporalPingPongIndex: 0 | 1 = 0;
  /** Active write slot index (`0 | 1`) for cross-frame Hi-Z depth ping-pong buffers. */
  hiZPingPongIndex: 0 | 1 = 0;

  // Previous-frame reprojection transforms
  readonly prevVPMat = new Matrix();
  readonly prevInvProjMat = new Matrix();
  readonly prevInvViewMat = new Matrix();
  /** Previous-frame view matrix Z row `(m2, m6, m10, m14)` used for fast view-space depth reprojection. */
  readonly prevViewZRow = new Vector4();

  // Previous-frame color pyramid history
  prevColorPyramidRT: RenderTarget | null = null;
  prevColorPyramidTex: Texture2D | null = null;

  // Cross-frame Hi-Z depth ping-pong textures and FBO wrappers
  readonly hiZTex: [Texture2D | null, Texture2D | null] = [null, null];
  /** FBO wrappers pairing `hiZTex` with shared pass depth (`_ssrDepthTex`) for merged downsample + Hi-Z mip 0. */
  readonly hiZDepthMip0RT: [RenderTarget | null, RenderTarget | null] = [null, null];
  /** Color-only FBO wrappers around `hiZTex` for mip-chain generation and standalone mip-0 writes. */
  readonly hiZColorRT: [RenderTarget | null, RenderTarget | null] = [null, null];

  // Cross-frame temporal reflection and receiver ping-pong handles
  readonly ssrPingPongRT: [RenderTarget | null, RenderTarget | null] = [null, null];
  readonly ssrPingPongTex: [Texture2D | null, Texture2D | null] = [null, null];
  readonly recvDepthTex: [Texture2D | null, Texture2D | null] = [null, null];
  /** Receiver normal+roughness textures; `null` when aliased to `ssrPingPongTex` under Medium quality. */
  readonly recvNRTex: [Texture2D | null, Texture2D | null] = [null, null];

  /** Last written pixel bounds `[x0, y0, x1, y1]` per slot so scissored clears wipe any prior stale region. */
  readonly recvSlotDirtyRect: [Int32Array, Int32Array] = [new Int32Array(4), new Int32Array(4)];
  readonly ssrSlotDirtyRect: [Int32Array, Int32Array] = [new Int32Array(4), new Int32Array(4)];

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
   * Invalidate color, temporal reflection, and Hi-Z history flags, reset `lastFrameCount`, and mark all slots dirty.
   */
  invalidateAll(): void {
    this.hasColorHistory = false;
    this.hasTemporalHistory = false;
    this.hasHiZHistory = false;
    this.lastFrameCount = -1;
    this.markAllDirty(this.lastTraceWidth, this.lastTraceHeight);
  }

  /**
   * Reset all history flags, last-frame metadata snapshots, ping-pong indices, and dirty rects.
   */
  resetMetadata(): void {
    this.hasColorHistory = false;
    this.hasTemporalHistory = false;
    this.hasHiZHistory = false;
    this.lastFrameCount = -1;
    this.lastTraceWidth = 0;
    this.lastTraceHeight = 0;
    this.lastColorWidth = 0;
    this.lastColorHeight = 0;
    this.lastQuality = ScreenSpaceReflectionQuality.Medium;
    this.lastIsOrthographic = false;
    this.lastFarClip = 0;
    this.lastIsHDR = false;
    this.lastAliasRecvNR = false;
    this.lastUsesPackedDepth = false;
    this.lastUsesPackedNormal = false;
    this.lastUsesPackedHDR = false;
    this.lastUseHardwareStencil = true;
    this.lastUseHighVirtual = false;
    this.lastUseLinearTrace = false;
    this.temporalPingPongIndex = 0;
    this.hiZPingPongIndex = 0;
    for (let i = 0; i < 2; i++) {
      this.recvSlotDirtyRect[i].fill(0);
      this.ssrSlotDirtyRect[i].fill(0);
    }
  }
}
