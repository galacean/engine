import type { Vector4 } from "@galacean/engine-math";
import type { Camera } from "../Camera";
import type { Engine } from "../Engine";
import type { CullingResults } from "../RenderPipeline/CullingResults";
import type { RenderContext } from "../RenderPipeline/RenderContext";
import type { RenderTarget } from "../texture";

/**
 * Resource requirements declared by an internal pass before `BasicRenderPipeline` decides
 * whether to run full-resolution prepasses for the active frame.
 * @internal
 */
export enum PipelineResourceRequirements {
  None = 0,
  /** Strictly requires the full-resolution DepthOnly prepass for this frame. */
  FullDepth = 1 << 0,
  /** Reuses the full-resolution DepthOnly target when another source enables it, without forcing it. */
  OptionalFullDepth = 1 << 1
}

/**
 * Reusable pre-allocated per-frame pipeline targets and view flags passed into multi-stage pass hooks.
 * @internal
 */
export interface PipelineFrameResources {
  /** Whether rendering into a sub-view (e.g. cube-map face or non-zero mip level). */
  isSubView: boolean;
  /** Full-resolution DepthOnly target when enabled by the camera or a pass requiring `FullDepth`; otherwise `null`. */
  fullDepthTarget: RenderTarget | null;
  /** Resolved scene color target after Forward transparent rendering. */
  resolvedColorTarget: RenderTarget | null;
  /** Normalized source viewport within `resolvedColorTarget`. */
  resolvedColorViewport: Vector4;
}

/**
 * Base class for internal render pipeline passes.
 * Single-purpose structural passes expose their own dedicated `onRender`, while cross-stage passes
 * declare `getResourceRequirements` and implement the stage lifecycle hooks they participate in.
 * @internal
 */
export abstract class PipelinePass {
  constructor(public readonly engine: Engine) {}

  /**
   * Declare frame resource requirements before `BasicRenderPipeline` decides which shared prepasses to run.
   */
  getResourceRequirements?(camera: Camera): PipelineResourceRequirements;

  /**
   * Stage 1: Prepare pass state and evaluate active status after scene culling & batch upload.
   */
  onPrepare?(context: RenderContext, cullingResults: CullingResults, resources: PipelineFrameResources): void;

  /**
   * Stage 2: Execute pre-forward rendering before Forward queues draw (receives `fullDepthTarget` if active).
   */
  onPreForward?(context: RenderContext, cullingResults: CullingResults, resources: PipelineFrameResources): void;

  /**
   * Stage 3: Execute post-transparent work after scene color resolve and before PostProcess.
   */
  onPostTransparent?(context: RenderContext, resources: PipelineFrameResources): void;

  /**
   * Called when the pass is disabled for the current frame so it can unbind resources or release idle buffers.
   */
  onDisable?(camera: Camera, context: RenderContext): void;

  /**
   * Notify cross-frame passes of a camera cut or discontinuity requiring history invalidation.
   */
  onHistoryInvalidated?(): void;

  /**
   * Destroy owned GPU resources and listeners when the owning render pipeline is destroyed.
   */
  onDestroy?(): void;
}
