import type { Vector4 } from "@galacean/engine-math";
import { Matrix } from "@galacean/engine-math";
import type { Camera } from "../../Camera";
import type { Engine } from "../../Engine";
import { EngineEventType } from "../../EngineEventType";
import type { RenderContext } from "../../RenderPipeline/RenderContext";
import { Material } from "../../material/Material";
import type { Shader } from "../../shader";
import type { RenderTarget } from "../../texture";
import { Texture2D } from "../../texture";
import { SSRCapabilities, SSRConfig, SSRFrameConfig, SSRRuntimeState } from "./SSRConfig";
import { SSRHistoryState } from "./SSRHistoryState";
import { SSRPyramidBuilder } from "./SSRPyramidBuilder";
import { SSRResourceManager } from "./SSRResourceManager";
import { SSRTraceExecutor } from "./SSRTraceExecutor";

/**
 * @internal
 * Screen-space reflection pass driven by the shared `DepthNormals` prepass.
 */
export class ScreenSpaceReflectionPass {
  readonly engine: Engine;

  private readonly _material: Material;
  private readonly _history = new SSRHistoryState();
  private readonly _caps = new SSRCapabilities();
  private readonly _frame = new SSRFrameConfig();
  private readonly _resources: SSRResourceManager;
  private readonly _pyramidBuilder: SSRPyramidBuilder;
  private readonly _traceExecutor: SSRTraceExecutor;

  private _boundCamera: Camera | null = null;
  private _state: SSRRuntimeState = SSRRuntimeState.Disabled;
  private _cutRequested: boolean = false;

  private readonly _onDeviceLost = (): void => {
    this._enterContextLostState(this._boundCamera);
  };

  constructor(engine: Engine, shader: Shader) {
    this.engine = engine;

    const material = new Material(engine, shader);
    material._addReferCount(1);
    material.isGCIgnored = true;
    this._material = material;

    this._resources = new SSRResourceManager(engine, this._history, () =>
      SSRTraceExecutor.clearCameraBindings(this._boundCamera)
    );
    this._pyramidBuilder = new SSRPyramidBuilder(engine, material, this._history, this._resources);
    this._traceExecutor = new SSRTraceExecutor(engine, material, this._history, this._resources);

    engine.on(EngineEventType.DeviceLost, this._onDeviceLost);
  }

  /**
   * Whether the configured SSR quality preset prefers high-precision normal/roughness storage.
   */
  get prefersHighPrecisionNormals(): boolean {
    return this._frame.preset.useHighPrecisionFormats;
  }

  /**
   * Prepare state machine and return whether the shared `DepthNormals` prepass is needed this frame.
   */
  onPrepare(context: RenderContext, isSubView: boolean): boolean {
    const { camera } = context;
    const { engine } = this;

    if (engine._isDeviceLost) {
      if (this._state !== SSRRuntimeState.ContextLost) {
        this._enterContextLostState(camera);
      }
      return false;
    }

    if (isSubView) {
      // Sub-views (CubeProbe faces / non-zero mipLevel) skip SSR without wiping main-view history.
      return this._skipFrame(camera);
    }

    const customRT = camera.renderTarget;
    if (customRT && !(customRT.getColorTexture(0) instanceof Texture2D)) {
      return this._skipFrame(camera);
    }

    if (context.replacementShader) {
      return this._skipFrame(camera);
    }

    this._boundCamera = camera;
    const frame = this._frame;
    frame.settings = camera.scene!.screenSpaceReflection;
    const { width, height } = camera.pixelViewport;
    if (width <= 0 || height <= 0) {
      this._history.invalidateAll();
      return this._skipFrame(camera);
    }

    const rhi = engine._hardwareRenderer;
    SSRConfig.applyQualityPreset(width, height, rhi.capability.maxDrawBuffers, frame);

    const caps = this._caps;
    const history = this._history;
    const preset = frame.preset;
    SSRConfig.detectCapabilities(rhi, camera.enableHDR, preset.useHighPrecisionFormats, caps);

    const frameCount = engine.time.frameCount;
    const isDiscontinuous = history.isDiscontinuous(camera, frame, caps, frameCount, this._cutRequested);
    this._cutRequested = false;

    if (isDiscontinuous) {
      history.invalidateAll();
    } else if (history.isTemporalInvalidated(frame, caps)) {
      history.hasTemporalHistory = false;
    }

    this._resources.ensurePersistentResources(caps, frame);
    if (!history.hasColorHistory || !history.hasHiZHistory) {
      this._state = SSRRuntimeState.WarmupColor;
      SSRTraceExecutor.clearCameraBindings(camera);
    } else if (!preset.useTemporal || !history.hasTemporalHistory) {
      this._state = SSRRuntimeState.FirstTrace;
    } else {
      this._state = SSRRuntimeState.ActiveSteady;
    }

    return true;
  }

  /**
   * Build Hi-Z depth pyramid and execute SSR ray trace before Forward shading.
   */
  onPreForward(context: RenderContext, fullDepthTarget: RenderTarget | null): void {
    const state = this._state;
    if (
      state === SSRRuntimeState.Disabled ||
      state === SSRRuntimeState.Skipped ||
      state === SSRRuntimeState.ContextLost
    ) {
      return;
    }

    const frame = this._frame;
    const history = this._history;
    frame.currentVPMat.copyFrom(context.viewProjectionMatrix);
    const e = context.viewMatrix.elements;
    frame.currentViewZRow.set(e[2], e[6], e[10], e[14]);
    Matrix.invert(context.projectionMatrix, frame.invProjMat);
    Matrix.invert(context.viewMatrix, frame.invViewMat);
    this._traceExecutor.syncDepthEncodingMacro(this._caps);

    const fullDepthTex = fullDepthTarget!.depthTexture as Texture2D;
    const fullNormalRoughnessTex = fullDepthTarget!.getColorTexture(0) as Texture2D;
    const isWarmup = state === SSRRuntimeState.WarmupColor;

    this._pyramidBuilder.prepareDepthAndHiZ(fullDepthTex, frame, this._caps, !isWarmup);
    if (isWarmup) {
      this._traceExecutor.clearMaterialEncodingMacros();
    } else {
      this._traceExecutor.executeFrame(context, state, fullDepthTex, fullNormalRoughnessTex, this._caps, frame);
    }
    history.hasHiZHistory = true;
    history.hiZPingPongIndex = history.hiZPingPongIndex === 0 ? 1 : 0;
  }

  /**
   * Enable Forward SSR sampling macros strictly for opaque and alpha-test draw queues.
   */
  beginForwardSampling(): void {
    const state = this._state;
    if (state === SSRRuntimeState.FirstTrace || state === SSRRuntimeState.ActiveSteady) {
      this._traceExecutor.enableForwardMacros(this._caps, this._frame);
    }
  }

  /**
   * Disable Forward SSR sampling macros immediately after opaque and alpha-test draw queues.
   */
  endForwardSampling(): void {
    const state = this._state;
    if (state === SSRRuntimeState.FirstTrace || state === SSRRuntimeState.ActiveSteady) {
      this._traceExecutor.disableForwardMacros();
    }
  }

  /**
   * Capture prefiltered color pyramid after transparent rendering.
   */
  onPostTransparent(
    context: RenderContext,
    resolvedColorTarget: RenderTarget | null,
    colorViewport: Vector4,
    mipLevel: number = 0,
    flipY: boolean = true
  ): void {
    const state = this._state;
    if (
      state === SSRRuntimeState.Disabled ||
      state === SSRRuntimeState.Skipped ||
      state === SSRRuntimeState.ContextLost
    ) {
      return;
    }

    const { camera } = context;
    const history = this._history;
    const frame = this._frame;

    const srcColorTex = resolvedColorTarget!.getColorTexture(0) as Texture2D;
    this._pyramidBuilder.buildColorPyramid(srcColorTex, this._caps, frame, colorViewport, mipLevel, flipY);

    history.commitFrame(camera, frame, this._caps, this.engine.time.frameCount);

    if (frame.preset.useTemporal && (state === SSRRuntimeState.FirstTrace || state === SSRRuntimeState.ActiveSteady)) {
      history.temporalPingPongIndex = history.temporalPingPongIndex === 0 ? 1 : 0;
    }
  }

  /**
   * Unbind SSR camera textures at the end of the frame.
   */
  onFrameEnd(context: RenderContext): void {
    const state = this._state;
    if (state === SSRRuntimeState.FirstTrace || state === SSRRuntimeState.ActiveSteady) {
      SSRTraceExecutor.clearCameraBindings(context.camera);
    }
  }

  onDisable(camera: Camera): void {
    if (this._state === SSRRuntimeState.Disabled) {
      return;
    }
    this._deactivate(SSRRuntimeState.Disabled, camera);
  }

  onHistoryInvalidated(): void {
    this._cutRequested = true;
    this._history.invalidateAll();
  }

  onDestroy(camera: Camera): void {
    this.engine.off(EngineEventType.DeviceLost, this._onDeviceLost);
    this._deactivate(SSRRuntimeState.Disabled, camera);
    this._boundCamera = null;
    this._material._addReferCount(-1);
    this._material.destroy(true);
  }

  private _skipFrame(camera: Camera): false {
    this._state = SSRRuntimeState.Skipped;
    SSRTraceExecutor.clearCameraBindings(camera);
    return false;
  }

  private _deactivate(state: SSRRuntimeState, camera: Camera | null): void {
    this._state = state;
    SSRTraceExecutor.clearCameraBindings(camera);
    this._resources.destroyPersistentResources();
  }

  private _enterContextLostState(camera: Camera | null): void {
    this._history.invalidateAll();
    this._deactivate(SSRRuntimeState.ContextLost, camera);
  }
}
