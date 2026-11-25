import { Matrix, Vector4 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Logger } from "../../base/Logger";
import { Engine } from "../../Engine";
import { CullingResults } from "../../RenderPipeline/CullingResults";
import {
  type PipelineFrameResources,
  PipelinePass,
  PipelineResourceRequirements
} from "../../RenderPipeline/PipelinePass";
import { ContextRendererUpdateFlag, RenderContext } from "../../RenderPipeline/RenderContext";
import { RenderElement } from "../../RenderPipeline/RenderElement";
import { PipelineStage } from "../../RenderPipeline/enums/PipelineStage";
import { type IIdleResourceSweeper } from "../../RenderPipeline/RenderTargetPool";
import { Material } from "../../material/Material";
import { Shader } from "../../shader";
import { Texture2D } from "../../texture";
import { SSRDepthOccluderCuller } from "./SSRDepthOccluderCuller";
import { SSRForwardProgramResolver } from "./SSRForwardProgramResolver";
import { SSRHistoryState } from "./SSRHistoryState";
import { SSRPyramidBuilder } from "./SSRPyramidBuilder";
import { SSRResourceManager } from "./SSRResourceManager";
import { SSRTraceExecutor } from "./SSRTraceExecutor";
import { SSR_SKIPPED_RELEASE_IDLE_FRAMES, SSRConfig, type SSRQualityPreset, SSRRuntimeState } from "./SSRConfig";
import { SSRUtils } from "./SSRUtils";

/**
 * @internal
 * Mobile-first Screen-Space Reflection render pass orchestrating dual-stream depth/Hi-Z,
 * non-MSAA MRT receiver generation, Hi-Z / linear tracing, temporal resolve, and linear color pyramid history.
 */
export class ScreenSpaceReflectionPass extends PipelinePass implements IIdleResourceSweeper {
  /** @internal Whether SSR is currently enabled and valid for `camera`. */
  static _isEnabled(camera: Camera): boolean {
    if (!camera.enableScreenSpaceReflection) {
      return false;
    }
    const settings = camera.screenSpaceReflectionOverride ?? camera.scene!.screenSpaceReflection;
    return settings._isValid();
  }

  // Collaborators & reusable frame containers (zero per-frame heap allocation)
  private readonly _material: Material;
  private readonly _history = new SSRHistoryState();
  private readonly _occluderCuller = new SSRDepthOccluderCuller();
  private readonly _programResolver = new SSRForwardProgramResolver();
  private readonly _caps = SSRConfig.createDefaultCapabilities();
  private readonly _frame = SSRConfig.createDefaultFrameConfig();
  private readonly _resources: SSRResourceManager;
  private readonly _pyramidBuilder: SSRPyramidBuilder;
  private readonly _traceExecutor: SSRTraceExecutor;
  private readonly _receiverElements: RenderElement[] = [];

  // Internal test/A-B switches
  _useHardwareStencil: boolean = true;
  _forcePackedFormats: boolean = false;
  _forceHiZScratch: boolean = false;
  _forceSoftwareColorPyramidMipmaps: boolean = false;

  // Lifecycle state
  private _boundCamera: Camera | null = null;
  private _state: SSRRuntimeState = SSRRuntimeState.Disabled;
  private _lastActiveFrameCount: number = -1;
  private _hasPersistentResources: boolean = false;
  private _isDisabledClean: boolean = false;
  private _destroyed: boolean = false;
  private _cutRequested: boolean = false;

  // Pre-bound callbacks
  private readonly _isReceiverElement = (element: RenderElement): boolean =>
    SSRForwardProgramResolver.isReceiverEligible(element.material, this._frame.settings.maxRoughness);

  constructor(engine: Engine, shader: Shader) {
    super(engine);

    const material = new Material(engine, shader);
    material._addReferCount(1);
    this._material = material;

    this._resources = new SSRResourceManager(engine, material, this._history, this._programResolver);
    this._pyramidBuilder = new SSRPyramidBuilder(engine, material, this._history, this._resources);
    this._traceExecutor = new SSRTraceExecutor(
      engine,
      material,
      this._history,
      this._resources,
      this._pyramidBuilder,
      this._programResolver
    );

    SSRConfig.checkMRTSupport(engine._hardwareRenderer, this._caps);
  }

  /** @internal Last computed receiver scissor rect `(x, y, width, height)` in trace pixels. */
  get _lastReceiverScissor(): Readonly<Vector4> {
    return this._frame.receiverScissor;
  }

  override getResourceRequirements(): PipelineResourceRequirements {
    return PipelineResourceRequirements.OptionalFullDepth;
  }

  /**
   * Prepare state machine and evaluate whether SSR runs this frame.
   * @param context - Active render context
   * @param cullingResults - Sorted render queues for this camera
   * @param resources - Frame resources including `isSubView` (skips SSR without wiping main history)
   */
  override onPrepare(context: RenderContext, cullingResults: CullingResults, resources: PipelineFrameResources): void {
    if (this._destroyed) {
      return;
    }

    const { camera } = context;
    if (this._trySkipPrepare(camera, context, resources.isSubView)) {
      return;
    }

    this._boundCamera = camera;
    this._isDisabledClean = false;

    const sourceSettings = camera.screenSpaceReflectionOverride ?? camera.scene!.screenSpaceReflection;
    sourceSettings.cloneTo(this._frame.settings);

    if (!this._collectReceivers(cullingResults, camera, context)) {
      return;
    }

    const preset = SSRConfig.getQualityPreset(this._frame.settings.quality);
    if (!this._prepareFrameResources(camera, context, preset)) {
      return;
    }

    this._resolveNextRuntimeState(camera, context);
  }

  /**
   * Execute pre-forward depth downsample / Hi-Z build / receiver MRT / ray trace / temporal resolve.
   */
  override onPreForward(
    context: RenderContext,
    cullingResults: CullingResults,
    resources: PipelineFrameResources
  ): void {
    const state = this._state;
    if (
      this._destroyed ||
      state === SSRRuntimeState.Disabled ||
      state === SSRRuntimeState.Skipped ||
      state === SSRRuntimeState.ContextLost
    ) {
      return;
    }

    const { camera } = context;
    const frame = this._frame;

    try {
      this._syncFrameTransforms(context, cullingResults);
      this._traceExecutor.syncEncodingMacros(this._caps);

      const isWarmup = state === SSRRuntimeState.WarmupColor;
      frame.isWarmup = isWarmup;
      frame.forceHiZScratch = this._forceHiZScratch;
      if (isWarmup) {
        frame.receiverScissor.set(0, 0, 0, 0);
        frame.hasVisibleReceiver = false;
      } else {
        frame.hasVisibleReceiver = SSRUtils.computeReceiverScissorRect(
          context,
          this._receiverElements,
          frame.traceWidth,
          frame.traceHeight,
          frame.receiverScissor
        );
      }

      // Step A–D: Depth / Hi-Z pyramid (returns false on WarmupColor or offscreen receivers)
      if (
        !this._pyramidBuilder.prepareDepthAndHiZ(
          context,
          cullingResults,
          resources.fullDepthTarget,
          frame,
          this._caps,
          this._occluderCuller
        )
      ) {
        if (!isWarmup) {
          this._traceExecutor.clearOffscreenDirtyRects(context, frame);
        }
        SSRTraceExecutor.clearCameraBindings(this.engine, this._programResolver, camera, context);
        return;
      }

      // Step E–I: Receiver MRT -> Ray Trace -> Temporal Resolve -> Forward bindings
      this._traceExecutor.executeFrame(context, cullingResults, state, this._caps, frame, this._isReceiverElement);
    } catch (error) {
      this._handleFailure(camera, "onPreForward", error, context);
    } finally {
      this._releaseFrameTargets();
    }
  }

  /**
   * Capture prefiltered & blurred linear color pyramid after the single post-transparent resolve.
   */
  override onPostTransparent(context: RenderContext, resources: PipelineFrameResources): void {
    const state = this._state;
    if (
      this._destroyed ||
      state === SSRRuntimeState.Disabled ||
      state === SSRRuntimeState.Skipped ||
      state === SSRRuntimeState.ContextLost
    ) {
      return;
    }

    const srcColorTex = resources.resolvedColorTarget?.getColorTexture(0) as Texture2D | null;
    if (!srcColorTex) {
      this._history.invalidateAll();
      return;
    }

    const { camera } = context;
    const history = this._history;
    const frame = this._frame;

    try {
      frame.forceSoftwareColorPyramidMipmaps = this._forceSoftwareColorPyramidMipmaps;
      this._pyramidBuilder.buildColorPyramid(srcColorTex, this._caps, frame, resources.resolvedColorViewport);

      history.commitFrame(camera, frame, this._caps, this.engine.time.frameCount);

      if (
        frame.preset.useTemporal &&
        (state === SSRRuntimeState.FirstTrace || state === SSRRuntimeState.ActiveSteady)
      ) {
        history.temporalPingPongIndex = history.temporalPingPongIndex === 0 ? 1 : 0;
      }
    } catch (error) {
      this._handleFailure(camera, "onPostTransparent", error, context);
    } finally {
      this._releaseFrameTargets();
    }
  }

  override onDisable(camera: Camera, context: RenderContext): void {
    if (this._destroyed) {
      return;
    }
    if (this._state === SSRRuntimeState.Disabled && this._isDisabledClean) {
      this._programResolver.reset();
      if (context.programResolver === this._programResolver) {
        context.programResolver = null;
      }
      return;
    }
    this._enterDisabledState(camera, context, true);
  }

  override onHistoryInvalidated(): void {
    if (this._destroyed) {
      return;
    }
    this._cutRequested = true;
    this._history.invalidateAll();
  }

  override onDestroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    SSRConfig.resetFrameCounts(this._frame);
    this._deactivate(SSRRuntimeState.Disabled, this._boundCamera);
    this._boundCamera = null;
    if (!this._material.destroyed) {
      this._material._addReferCount(-1);
      this._material.destroy();
    }
  }

  /** @internal Called by RenderTargetPool on GPU context loss to drop persistent buffers and invalidate history. */
  _onDeviceLost(): void {
    if (this._destroyed) {
      return;
    }
    this._enterContextLostState(this._boundCamera);
  }

  /** @internal Called by RenderTargetPool at Engine end-of-frame to reclaim private SSR textures of idle/disabled cameras. */
  _sweepIfIdle(frameCount: number): void {
    if (this._destroyed || !this._isIdleExpired(frameCount)) {
      return;
    }
    SSRConfig.resetFrameCounts(this._frame);
    this._deactivate(SSRRuntimeState.Skipped, this._boundCamera);
  }

  private _trySkipPrepare(camera: Camera, context: RenderContext, isSubView: boolean): boolean {
    const { engine } = this;

    if (engine._isDeviceLost) {
      this._enterContextLostState(camera, context, this._hasPersistentResources);
      return true;
    }

    if (isSubView) {
      // Sub-views (CubeProbe faces / non-zero mipLevel) skip SSR without wiping main-view history.
      this._state = SSRRuntimeState.Skipped;
      this._clearBindings(camera, context);
      return true;
    }

    if (!ScreenSpaceReflectionPass._isEnabled(camera)) {
      this.onDisable(camera, context);
      return true;
    }

    if (!SSRConfig.checkMRTSupport(engine._hardwareRenderer, this._caps)) {
      this._enterDisabledState(camera, context, false);
      return true;
    }

    if (context.replacementShader) {
      this._enterIdleSkippedState(camera, context, false);
      return true;
    }

    return false;
  }

  private _collectReceivers(cullingResults: CullingResults, camera: Camera, context: RenderContext): boolean {
    const frame = this._frame;
    const elements = this._receiverElements;
    const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;
    elements.length = 0;

    const opaqueCount =
      opaqueQueue.countElementsForStage(PipelineStage.SSRReceiver, this._isReceiverElement, elements) +
      alphaTestQueue.countElementsForStage(PipelineStage.SSRReceiver, this._isReceiverElement, elements);
    const transparentCount = transparentQueue.countElementsForStage(
      PipelineStage.SSRReceiver,
      this._isReceiverElement,
      elements
    );
    frame.opaqueReceiverCount = opaqueCount;
    frame.transparentReceiverCount = transparentCount;
    frame.contribDepthCount = transparentQueue.countElementsForStage(
      PipelineStage.SSRContributionDepth,
      SSRPyramidBuilder.isDepthContributorElement
    );

    if (opaqueCount + transparentCount === 0) {
      this._enterIdleSkippedState(camera, context, true);
      return false;
    }

    return true;
  }

  private _prepareFrameResources(camera: Camera, context: RenderContext, preset: SSRQualityPreset): boolean {
    const { engine } = this;
    const frame = this._frame;
    const caps = this._caps;
    const history = this._history;
    const { width: vpW, height: vpH } = camera.pixelViewport;

    frame.useHardwareStencil = this._useHardwareStencil;
    SSRConfig.detectCapabilities(
      engine._hardwareRenderer,
      camera.enableHDR,
      preset.useHighPrecisionFormats,
      this._forcePackedFormats,
      caps
    );
    SSRConfig.applyQualityPreset(vpW, vpH, preset, caps, frame);

    const frameCount = engine.time.frameCount;
    this._lastActiveFrameCount = frameCount;
    const isDiscontinuous = history.isDiscontinuous(camera, frame, caps, frameCount, this._cutRequested);
    this._cutRequested = false;

    if (isDiscontinuous) {
      history.invalidateAll();
      this._resources.resetTraceDirtyRect(frame.traceWidth, frame.traceHeight);
    } else if (history.isTemporalInvalidated(frame, caps)) {
      history.hasTemporalHistory = false;
    }

    try {
      this._resources.ensurePersistentResources(camera, caps, frame);
      this._setPoolSweeperRegistered(true);
    } catch (error) {
      this._handleFailure(camera, "onPrepare", error, context, true);
      return false;
    }

    if (!frame.preset.useTemporal) {
      this._resources.releaseUnusedTemporal(camera, context);
    }
    return true;
  }

  private _resolveNextRuntimeState(camera: Camera, context: RenderContext): void {
    const history = this._history;
    if (!history.hasColorHistory || !history.hasHiZHistory) {
      this._state = SSRRuntimeState.WarmupColor;
      SSRTraceExecutor.clearCameraBindings(this.engine, this._programResolver, camera, context);
    } else if (!this._frame.preset.useTemporal || !history.hasTemporalHistory) {
      this._state = SSRRuntimeState.FirstTrace;
    } else {
      this._state = SSRRuntimeState.ActiveSteady;
    }
  }

  private _syncFrameTransforms(context: RenderContext, cullingResults: CullingResults): void {
    // Ensure offscreen projection convention matches DepthOnly/SSRReceiver/Forward-to-RT.
    if (!context.flipProjection) {
      cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.ProjectionMatrix);
      context.applyVirtualCamera(context.camera._virtualCamera, true);
    }
    const frame = this._frame;
    frame.currentVPMat.copyFrom(context.viewProjectionMatrix);
    SSRUtils.extractViewZRow(context.viewMatrix, frame.currentViewZRow);
    Matrix.invert(context.projectionMatrix, frame.invProjMat);
    Matrix.invert(context.viewMatrix, frame.invViewMat);
  }

  private _releaseFrameTargets(): void {
    this._receiverElements.length = 0;
    this._pyramidBuilder.releaseFrameTargets();
  }

  private _isIdleExpired(frameCount: number): boolean {
    return (
      this._hasPersistentResources &&
      this._lastActiveFrameCount !== -1 &&
      frameCount - this._lastActiveFrameCount >= SSR_SKIPPED_RELEASE_IDLE_FRAMES
    );
  }

  private _clearBindings(camera: Camera | null, context?: RenderContext): void {
    if (camera?.shaderData) {
      SSRTraceExecutor.clearCameraBindings(this.engine, this._programResolver, camera, context);
    }
    SSRPyramidBuilder.resetTemporaryBindings(this._material);
    SSRTraceExecutor.resetTemporaryBindings(this._material);
  }

  private _deactivate(
    state: SSRRuntimeState,
    camera: Camera | null,
    context?: RenderContext,
    releasePersistent: boolean = true
  ): void {
    this._state = state;
    this._isDisabledClean = false;
    if (releasePersistent) {
      this._releaseFrameTargets();
      this._clearBindings(camera, context);
      this._setPoolSweeperRegistered(false);
      this._lastActiveFrameCount = -1;
      this._resources.destroyPersistentResources();
    } else {
      this._clearBindings(camera, context);
    }
  }

  private _enterContextLostState(
    camera: Camera | null,
    context?: RenderContext,
    releasePersistent: boolean = true
  ): void {
    this._cutRequested = true;
    this._history.invalidateAll();
    this._deactivate(SSRRuntimeState.ContextLost, camera, context, releasePersistent);
  }

  private _enterDisabledState(camera: Camera, context: RenderContext, clean: boolean): void {
    SSRConfig.resetFrameCounts(this._frame);
    this._deactivate(SSRRuntimeState.Disabled, camera, context);
    this._isDisabledClean = clean;
  }

  private _enterIdleSkippedState(camera: Camera, context: RenderContext, invalidateImmediately: boolean): void {
    if (invalidateImmediately) {
      this._history.invalidateAll();
    } else {
      SSRConfig.resetFrameCounts(this._frame);
    }
    const releaseNow = this._isIdleExpired(this.engine.time.frameCount);
    if (releaseNow) {
      SSRConfig.resetFrameCounts(this._frame);
    }
    this._deactivate(SSRRuntimeState.Skipped, camera, context, releaseNow);
  }

  private _setPoolSweeperRegistered(registered: boolean): void {
    if (this._hasPersistentResources === registered) {
      return;
    }
    this._hasPersistentResources = registered;
    const pool = this.engine._renderTargetPool;
    if (registered) {
      pool._registerIdleSweeper(this);
    } else {
      pool._unregisterIdleSweeper(this);
    }
  }

  private _handleFailure(
    camera: Camera,
    stage: string,
    error: unknown,
    context?: RenderContext,
    releasePersistent: boolean = false
  ): void {
    Logger.warn(`ScreenSpaceReflectionPass failed during ${stage}; falling back to IBL.`, error);
    this._history.invalidateAll();
    this._deactivate(SSRRuntimeState.Skipped, camera, context, releasePersistent);
  }
}
