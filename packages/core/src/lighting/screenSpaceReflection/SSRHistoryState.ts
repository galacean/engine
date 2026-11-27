import { Matrix, Vector4 } from "@galacean/engine-math";
import type { Camera } from "../../Camera";
import type { SSRCapabilities, SSRFrameConfig } from "./SSRConfig";
import type { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";

/**
 * Tracks cross-frame SSR temporal / Hi-Z / color-pyramid history validity,
 * discontinuity invalidation metadata, ping-pong indices, and reprojection matrices.
 * @internal
 */
export class SSRHistoryState {
  // Temporal, Hi-Z, and color-pyramid history readiness flags
  hasTemporalHistory: boolean = false;
  hasHiZHistory: boolean = false;
  hasColorHistory: boolean = false;

  // Frame parameters used to detect cuts, resizes, or quality/packing switches
  lastFrameCount: number = -1;
  lastTraceWidth: number = 0;
  lastTraceHeight: number = 0;
  lastColorWidth: number = 0;
  lastColorHeight: number = 0;
  lastIsOrthographic: boolean = false;
  lastFarClip: number = 0;
  lastQuality: ScreenSpaceReflectionQuality | null = null;
  lastIsHDR: boolean = false;
  lastUsesPackedDepth: boolean = false;
  lastUsesPackedNormal: boolean = false;
  lastUsesPackedHDR: boolean = false;
  lastUseHighVirtual: boolean = false;

  /** Active write slot index (`0 | 1`) for temporal reflection ping-pong buffers. */
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
  maxColorMip: number = 0;

  /**
   * Check whether camera, resolution, projection, or format changes invalidate all cross-frame SSR history.
   */
  isDiscontinuous(
    camera: Camera,
    frame: SSRFrameConfig,
    caps: SSRCapabilities,
    frameCount: number,
    cutRequested: boolean
  ): boolean {
    return (
      cutRequested ||
      (this.lastFrameCount !== -1 && (frameCount < this.lastFrameCount || frameCount - this.lastFrameCount > 30)) ||
      this.lastTraceWidth !== frame.traceWidth ||
      this.lastTraceHeight !== frame.traceHeight ||
      this.lastColorWidth !== frame.colorWidth ||
      this.lastColorHeight !== frame.colorHeight ||
      this.lastIsOrthographic !== camera.isOrthographic ||
      (caps.usesPackedDepthRG8 && this.lastFarClip !== camera.farClipPlane) ||
      this.lastIsHDR !== camera.enableHDR ||
      this.lastUsesPackedDepth !== caps.usesPackedDepthRG8
    );
  }

  /**
   * Check whether quality, virtual-reprojection, or packing changes invalidate only temporal reflection history.
   */
  isTemporalInvalidated(frame: SSRFrameConfig, caps: SSRCapabilities): boolean {
    return (
      this.lastQuality !== frame.settings.quality ||
      this.lastUseHighVirtual !== frame.useHighVirtual ||
      this.lastUsesPackedNormal !== caps.usesPackedNormalOct8 ||
      this.lastUsesPackedHDR !== caps.usesPackedHDRReinhard
    );
  }

  /**
   * Commit current-frame matrices and configuration metadata after color pyramid capture.
   */
  commitFrame(camera: Camera, frame: SSRFrameConfig, caps: SSRCapabilities, frameCount: number): void {
    this.prevVPMat.copyFrom(frame.currentVPMat);
    this.prevInvProjMat.copyFrom(frame.invProjMat);
    this.prevInvViewMat.copyFrom(frame.invViewMat);
    this.prevViewZRow.copyFrom(frame.currentViewZRow);
    this.hasColorHistory = true;
    this.lastFrameCount = frameCount;
    this.lastTraceWidth = frame.traceWidth;
    this.lastTraceHeight = frame.traceHeight;
    this.lastColorWidth = frame.colorWidth;
    this.lastColorHeight = frame.colorHeight;
    this.lastIsOrthographic = camera.isOrthographic;
    this.lastFarClip = camera.farClipPlane;
    this.lastQuality = frame.settings.quality;
    this.lastIsHDR = camera.enableHDR;
    this.lastUsesPackedDepth = caps.usesPackedDepthRG8;
    this.lastUsesPackedNormal = caps.usesPackedNormalOct8;
    this.lastUsesPackedHDR = caps.usesPackedHDRReinhard;
    this.lastUseHighVirtual = frame.useHighVirtual;
  }

  /**
   * Discard frame history and restart both ping-pong sequences at slot zero.
   */
  invalidateAll(): void {
    this.hasColorHistory = false;
    this.maxColorMip = 0;
    this.hasTemporalHistory = false;
    this.hasHiZHistory = false;
    this.temporalPingPongIndex = 0;
    this.hiZPingPongIndex = 0;
    this.lastFrameCount = -1;
  }
}
