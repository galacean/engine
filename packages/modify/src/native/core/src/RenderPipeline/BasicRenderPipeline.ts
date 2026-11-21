import type { Renderer } from "../Renderer";
import type { Plane } from "@galacean/engine-math";
import { MathUtil, Vector2, Vector4 } from "@galacean/engine-math";
import { Background } from "../Background";
import { Engine } from "../Engine";
import { Camera } from "../Camera";
import { BackgroundMode } from "../enums/BackgroundMode";
import { BackgroundTextureFillMode } from "../enums/BackgroundTextureFillMode";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { DepthTextureMode } from "../enums/DepthTextureMode";
import { ReplacementFailureStrategy } from "../enums/ReplacementFailureStrategy";
import { ScalableAmbientObscurancePass } from "../lighting/ambientOcclusion/ScalableAmbientObscurancePass";
import { ScreenSpaceReflectionPass, SSRDiagnostics } from "../lighting/screenSpaceReflection";
import { FinalPass } from "../postProcess";
import {
  SunLensFlareCameraState,
  SunLensFlareEffect,
  type SunLensFlareScreenState
} from "../postProcess/effects/SunLensFlareEffect";
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { SubShader } from "../shader/SubShader";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { CascadedShadowCasterPass } from "../shadow/CascadedShadowCasterPass";
import { ShadowType } from "../shadow/enum/ShadowType";
import {
  RenderTarget,
  Texture,
  Texture2D,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "../texture";
import { Blitter } from "./Blitter";
import { CullingResults } from "./CullingResults";
import { DepthOnlyPass } from "./DepthOnlyPass";
import { OpaqueTexturePass } from "./OpaqueTexturePass";
import { PipelinePassStage, type PipelinePass, type PipelinePassRegistration } from "./PipelinePass";
import { PipelineUtils } from "./PipelineUtils";
import { ContextRendererUpdateFlag, RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import {
  RenderViewCullingContextImpl,
  type RenderViewCullingSource,
  type RenderViewCullingSourceRegistration
} from "./RenderViewCulling";
import { PipelineStage } from "./enums/PipelineStage";
/**
 * Basic render pipeline.
 */
export class BasicRenderPipeline {
  /** @internal */
  _cullingResults: CullingResults;

  private _camera: Camera;
  private _lastCanvasSize = new Vector2();

  private _internalColorTarget: RenderTarget | null = null;
  private _cascadedShadowCasterPass: CascadedShadowCasterPass;
  private _depthOnlyPass: DepthOnlyPass;
  private _saoPass: ScalableAmbientObscurancePass;
  private _ssrPass: ScreenSpaceReflectionPass;
  private _opaqueTexturePass: OpaqueTexturePass;
  private _finalPass: FinalPass;
  private _copyBackgroundTexture: Texture2D | null;
  private _afterCullingPasses: RegisteredPipelinePass[] = [];
  private readonly _submittedViewRenderers: Renderer[] = [];
  private readonly _renderViewCullingSources: RegisteredRenderViewCullingSource[] = [];
  private readonly _renderViewCullingContext = new RenderViewCullingContextImpl();
  private _canUseBlitFrameBuffer = false;
  private _shouldCopyBackgroundColor = false;
  private _destroyed = false;
  /** @internal */
  _sunLensFlareDepthTexture: Texture | null = null;
  /** @internal */
  readonly _sunLensFlareDepthRect = new Vector4(1, 1, 0, 0);
  /** @internal */
  _sunLensFlareCameraState: SunLensFlareCameraState | null = null;

  private _sunLensFlareDepthPatchRT: RenderTarget | null = null;
  private readonly _sunLensFlareDepthViewport = new Vector4();
  private readonly _sunLensFlareScreenState: SunLensFlareScreenState = {
    visible: false,
    sunU: 0.5,
    sunV: 0.5,
    effectiveIntensity: 0,
    aspectRatio: 1
  };

  /**
   * Create a basic render pipeline.
   * @param camera - Camera
   */
  constructor(camera: Camera) {
    this._camera = camera;
    const { engine } = camera;
    const shaders = Engine._builtinShaders;
    this._cullingResults = new CullingResults();
    this._cascadedShadowCasterPass = new CascadedShadowCasterPass(camera);
    this._depthOnlyPass = new DepthOnlyPass(engine);
    this._saoPass = new ScalableAmbientObscurancePass(engine, shaders.scalableAmbientOcclusion);
    this._ssrPass = new ScreenSpaceReflectionPass(engine, shaders.screenSpaceReflection);
    this._opaqueTexturePass = new OpaqueTexturePass(engine);
    this._finalPass = new FinalPass(engine, shaders.finalSRGB, shaders.finalAntiAliasing);
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._cullingResults.destroy();
    this._cascadedShadowCasterPass.release();
    this._depthOnlyPass.release();
    this._saoPass.destroy();
    this._ssrPass.destroy();
    this._opaqueTexturePass.release();
    this._finalPass.destroy();
    const afterCullingPasses = this._afterCullingPasses;
    for (let i = 0, n = afterCullingPasses.length; i < n; i++) {
      afterCullingPasses[i].active = false;
    }
    this._afterCullingPasses = [];
    const renderViewCullingSources = this._renderViewCullingSources;
    for (let i = 0, n = renderViewCullingSources.length; i < n; i++) {
      renderViewCullingSources[i].source = null;
    }
    renderViewCullingSources.length = 0;
    this._submittedViewRenderers.length = 0;

    const pool = this._camera.engine._renderTargetPool;

    if (this._internalColorTarget) {
      pool.freeRenderTarget(this._internalColorTarget);
      this._internalColorTarget = null;
    }

    if (this._copyBackgroundTexture) {
      pool.freeTexture(this._copyBackgroundTexture);
      this._copyBackgroundTexture = null;
    }

    if (this._sunLensFlareDepthPatchRT) {
      pool.freeRenderTarget(this._sunLensFlareDepthPatchRT);
      this._sunLensFlareDepthPatchRT = null;
    }
    this._sunLensFlareDepthTexture = null;
    this._sunLensFlareCameraState?.destroy();
    this._sunLensFlareCameraState = null;

    this._camera = null!;
  }

  /** @internal */
  _getScreenSpaceReflectionDiagnostics(): Readonly<SSRDiagnostics> {
    return this._ssrPass.getDiagnostics();
  }

  /** @internal */
  _notifyScreenSpaceReflectionCut(): void {
    this._ssrPass.notifyCut();
  }

  /** @internal */
  _getOrCreateSunLensFlareCameraState(): SunLensFlareCameraState {
    return (this._sunLensFlareCameraState ??= new SunLensFlareCameraState());
  }

  /**
   * Perform scene rendering.
   * @param context - Render context
   * @param cubeFace - Render surface of cube texture
   * @param mipLevel - Set mip level the data want to write
   * @param ignoreClear - Ignore clear flag
   */
  render(context: RenderContext, cubeFace?: TextureCubeFace, mipLevel?: number, ignoreClear?: CameraClearFlags) {
    this._cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.All);

    const camera = this._camera;
    const { engine, renderTarget } = camera;
    const scene = camera.scene!;
    const independentCanvasEnabled = camera._isIndependentCanvasEnabled();
    const rhi = engine._hardwareRenderer;
    const cullingResults = this._cullingResults;
    const sunlight = scene._lightManager._sunlight;
    const depthOnlyPass = this._depthOnlyPass;
    const ambientOcclusionEnabled = scene.ambientOcclusion._isValid();
    const supportDepthTexture = depthOnlyPass.supportDepthTexture;

    const finalClearFlags = camera.clearFlags & ~(ignoreClear ?? CameraClearFlags.None);
    const msaaSamples = Math.min(
      renderTarget ? renderTarget.antiAliasing : camera.msaaSamples,
      rhi.capability.maxAntiAliasing
    );

    const cameraDepthTextureRequested = camera.depthTextureMode === DepthTextureMode.PrePass && supportDepthTexture;
    const sunLensFlareBlend = camera.enablePostProcess
      ? scene.postProcessManager.getBlendEffect(SunLensFlareEffect)
      : undefined;
    const sunLensFlareNeedsOwnDepth =
      Boolean(sunLensFlareBlend?.isValid() && sunLensFlareBlend.depthOcclusion.value) &&
      !cameraDepthTextureRequested &&
      !ambientOcclusionEnabled &&
      rhi.isWebGL2 &&
      supportDepthTexture &&
      independentCanvasEnabled &&
      cubeFace === undefined &&
      (mipLevel ?? 0) === 0 &&
      SunLensFlareEffect._resolveScreenState(camera, scene, sunLensFlareBlend!, this._sunLensFlareScreenState).visible;
    // When SunLensFlare is the sole depth consumer on a non-MSAA target, blit only a 64x64 patch
    // centered on the solar disk (~16 KB VRAM vs ~7.9 MB full-screen depth). MSAA targets fall back
    // to the full MSAA resolve because WebGL2 requires identical bounds when resolving MSAA depth.
    const sunLensFlareDepthPatchEnabled = sunLensFlareNeedsOwnDepth && msaaSamples === 1;
    const sunLensFlareFullDepthResolveEnabled = sunLensFlareNeedsOwnDepth && msaaSamples > 1;
    // WebGL2 can publish the opaque Forward depth already produced for an existing internal color target.
    // AO still requires depth before Forward, and off-screen/cube subresources retain the established prepass.
    const forwardDepthResolveEnabled =
      ((cameraDepthTextureRequested && camera._enableForwardDepthResolve) || sunLensFlareFullDepthResolveEnabled) &&
      !ambientOcclusionEnabled &&
      rhi.isWebGL2 &&
      independentCanvasEnabled &&
      cubeFace === undefined &&
      (mipLevel ?? 0) === 0;
    // Ambient occlusion enable will force enable depth prepass.
    const depthPassEnabled =
      (ambientOcclusionEnabled || (cameraDepthTextureRequested && !forwardDepthResolveEnabled)) && supportDepthTexture;
    camera._depthTextureSource = "none";
    this._sunLensFlareDepthTexture = null;
    this._sunLensFlareDepthRect.set(1, 1, 0, 0);

    // Check whether can use `blitFramebuffer` to blit internal render target, source maybe screen canvas or camera's render target
    // Our screen canvas's anti-aliasing is always disable, so blit source and dest is always same by below rules:
    // 1. Only support blitFramebuffer in webgl2 context
    // 2. Can't blit normal FBO to MSAA FBO
    // 3. Can't blit screen MSAA FBO to normal FBO in mac safari platform and mobile, but mac chrome and firfox is OK
    this._canUseBlitFrameBuffer = rhi.isWebGL2 && msaaSamples === 1;

    // Because internal render target is linear color space, so we should convert srgb background color to linear color space
    const isSRGBBackground = !renderTarget || renderTarget.getColorTexture(0)!.isSRGBColorSpace;
    this._shouldCopyBackgroundColor =
      independentCanvasEnabled &&
      !(finalClearFlags & CameraClearFlags.Color) &&
      (!this._canUseBlitFrameBuffer || isSRGBBackground);

    if (scene.castShadows && sunlight && sunlight.shadowType !== ShadowType.None && sunlight.shadowStrength > 0) {
      this._cascadedShadowCasterPass.onRender(context);
    }

    cullingResults.reset();

    // Depth use camera's view and projection matrix
    this._cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.viewProjectionMatrix);
    context.applyVirtualCamera(camera._virtualCamera, depthPassEnabled);
    this._prepareRender(context);
    this._prepareCameraRenderViewCulling(context);

    const batcherManager = engine._batcherManager;
    cullingResults.sortBatch(batcherManager);
    batcherManager.uploadBuffer();
    this._renderRegisteredPasses(PipelinePassStage.AfterCulling, context, cullingResults);

    this._ssrPass.prepare(context, cullingResults, cubeFace !== undefined || (mipLevel ?? 0) > 0);

    if (depthPassEnabled) {
      depthOnlyPass.onConfig(camera);
      depthOnlyPass.onRender(context, cullingResults);
      camera._depthTextureSource = "prepass";
    } else {
      if (!forwardDepthResolveEnabled) depthOnlyPass.release();
      camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, engine._basicResources.whiteTexture2D);
    }

    const pool = engine._renderTargetPool;

    // Check if need to create internal color texture or grab texture
    if (independentCanvasEnabled) {
      let baseDepthFormat: TextureFormat | null;
      if (camera.renderTarget) {
        baseDepthFormat = camera.renderTarget._depthFormat;
      } else if (rhi._options.depth && rhi._options.stencil) {
        baseDepthFormat = TextureFormat.Depth24Stencil8;
      } else if (rhi._options.depth) {
        baseDepthFormat = TextureFormat.Depth24;
      } else if (rhi._options.stencil) {
        baseDepthFormat = TextureFormat.Stencil;
      } else {
        baseDepthFormat = null;
      }
      const viewport = camera.pixelViewport;

      this._internalColorTarget = this._allocateInternalColorTarget(
        baseDepthFormat,
        forwardDepthResolveEnabled,
        sunLensFlareDepthPatchEnabled,
        msaaSamples
      );

      if (this._shouldCopyBackgroundColor) {
        const colorTexture = camera.renderTarget?.getColorTexture(0);
        this._copyBackgroundTexture = pool.allocateTexture(
          viewport.width,
          viewport.height,
          colorTexture?.format ?? TextureFormat.R8G8B8A8,
          false,
          colorTexture?.isSRGBColorSpace ?? false,
          TextureWrapMode.Clamp,
          TextureFilterMode.Bilinear
        );
      }
    }

    // Scalable ambient obscurance pass
    // Before opaque pass so materials can sample ambient occlusion in BRDF
    const saoPass = this._saoPass;
    if (ambientOcclusionEnabled && supportDepthTexture && saoPass.isSupported) {
      saoPass.onConfig(camera, this._depthOnlyPass.renderTarget!);
      saoPass.onRender(context);
    } else {
      camera.shaderData.setTexture(Camera._cameraAOTextureProperty, null);
      this._saoPass.release();
    }

    this._ssrPass.renderPreForward(context, cullingResults, depthPassEnabled ? depthOnlyPass.renderTarget : null);

    this._drawRenderPass(
      context,
      camera,
      finalClearFlags,
      forwardDepthResolveEnabled,
      sunLensFlareDepthPatchEnabled,
      cubeFace,
      mipLevel
    );
    this._ssrPass.releaseFrameTargets();

    // Return the per-frame leases so the next camera with matching shape can reuse them
    if (this._internalColorTarget) {
      pool.freeRenderTarget(this._internalColorTarget);
      this._internalColorTarget = null;
    }
    if (this._copyBackgroundTexture) {
      pool.freeTexture(this._copyBackgroundTexture);
      this._copyBackgroundTexture = null;
    }

    if (this._sunLensFlareDepthPatchRT) {
      pool.freeRenderTarget(this._sunLensFlareDepthPatchRT);
      this._sunLensFlareDepthPatchRT = null;
    }
    this._sunLensFlareDepthTexture = null;
  }

  /** Registers an optional pass without teaching the basic pipeline about its feature owner. @internal */
  _registerPass(stage: PipelinePassStage, pass: PipelinePass): PipelinePassRegistration {
    if (this._destroyed) throw new Error("Cannot register a pass on a destroyed render pipeline");
    if (pass.engine !== this._camera.engine) {
      throw new Error("Pipeline pass must belong to the Camera Engine");
    }
    const passes = this._passesForStage(stage);
    for (let i = 0, n = passes.length; i < n; i++) {
      if (passes[i].active && passes[i].pass === pass) {
        throw new Error("Pipeline pass is already registered at this stage");
      }
    }
    const entry: RegisteredPipelinePass = { pass, active: true };
    passes.push(entry);
    return {
      unregister: () => {
        entry.active = false;
        // Active renders retain the old list and can skip this deactivated entry.
        this._afterCullingPasses = this._afterCullingPasses.filter((item) => item !== entry);
      }
    };
  }

  /** Registers one externally managed batch source for this Camera's main and shadow views. @internal */
  _registerRenderViewCullingSource(source: RenderViewCullingSource): RenderViewCullingSourceRegistration {
    if (this._destroyed) {
      throw new Error("Cannot register a render-view culling source on a destroyed render pipeline");
    }
    const sources = this._renderViewCullingSources;
    for (let i = 0, n = sources.length; i < n; i++) {
      if (sources[i].source === source) {
        throw new Error("Render-view culling source is already registered");
      }
    }
    let entry: RegisteredRenderViewCullingSource | undefined;
    for (let i = 0, n = sources.length; i < n; i++) {
      if (sources[i].source === null) {
        entry = sources[i];
        break;
      }
    }
    entry ??= { source: null };
    entry.source = source;
    if (sources.indexOf(entry) < 0) sources.push(entry);
    let active = true;
    return {
      unregister: () => {
        if (!active) return;
        active = false;
        if (entry.source === source) entry.source = null;
      }
    };
  }

  /** @internal */
  _recordRenderViewRenderer(renderer: Renderer): void {
    this._submittedViewRenderers.push(renderer);
  }

  /** Borrow the last main-view batches without rebuilding or changing their LOD state. @internal */
  _visitRenderViewRenderers(visitor: (renderer: Renderer) => void): void {
    const renderers = this._submittedViewRenderers;
    for (let i = 0, n = renderers.length; i < n; i++) visitor(renderers[i]);
  }

  /** Runs registered batch sources for the main Camera view. @internal */
  _prepareCameraRenderViewCulling(context: RenderContext): void {
    const cullingContext = this._renderViewCullingContext;
    this._submittedViewRenderers.length = 0;
    cullingContext._setCamera(context);
    this._cullRegisteredRenderViewSources(cullingContext);
  }

  /** Runs registered batch sources for one directional-light shadow cascade. @internal */
  _prepareShadowRenderViewCulling(
    context: RenderContext,
    shadowCascadeIndex: number,
    cullPlanes: readonly Plane[],
    cullPlaneCount: number,
    lightCullingMask: number
  ): void {
    const cullingContext = this._renderViewCullingContext;
    cullingContext._setShadowCascade(context, shadowCascadeIndex, cullPlanes, cullPlaneCount, lightCullingMask);
    this._cullRegisteredRenderViewSources(cullingContext);
  }

  private _cullRegisteredRenderViewSources(context: RenderViewCullingContextImpl): void {
    const sources = this._renderViewCullingSources;
    const count = sources.length;
    for (let i = 0; i < count; i++) {
      sources[i].source?.cull(context);
    }
  }

  private _renderRegisteredPasses(
    stage: PipelinePassStage,
    context: RenderContext,
    cullingResults: CullingResults
  ): void {
    // Appends start at the next invocation. Removals publish a new list and deactivate the old entry.
    const passes = this._passesForStage(stage);
    for (let i = 0, n = passes.length; i < n; i++) {
      const entry = passes[i];
      if (entry.active) entry.pass.onRender(context, cullingResults);
    }
  }

  private _allocateInternalColorTarget(
    baseDepthFormat: TextureFormat | null,
    forwardDepthResolveEnabled: boolean,
    sunLensFlareDepthPatchEnabled: boolean,
    msaaSamples: number
  ): RenderTarget {
    const camera = this._camera;
    const viewport = camera.pixelViewport;
    let depthFormat = baseDepthFormat;
    if (forwardDepthResolveEnabled || sunLensFlareDepthPatchEnabled) {
      if (depthFormat === null || depthFormat === TextureFormat.Stencil) {
        depthFormat = camera.engine._hardwareRenderer._options.stencil
          ? TextureFormat.Depth24Stencil8
          : TextureFormat.Depth24;
      }
    }
    const needDepthTexture = forwardDepthResolveEnabled && msaaSamples > 1;
    return camera.engine._renderTargetPool.allocateRenderTarget(
      viewport.width,
      viewport.height,
      camera._getInternalColorTextureFormat(),
      depthFormat,
      needDepthTexture,
      false,
      !camera._isInternalFormatHDR(),
      msaaSamples,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear,
      forwardDepthResolveEnabled ? TextureFilterMode.Point : TextureFilterMode.Bilinear
    );
  }

  private _passesForStage(stage: PipelinePassStage): RegisteredPipelinePass[] {
    switch (stage) {
      case PipelinePassStage.AfterCulling:
        return this._afterCullingPasses;
      default:
        throw new RangeError("Unsupported pipeline pass stage");
    }
  }

  private _drawRenderPass(
    context: RenderContext,
    camera: Camera,
    finalClearFlags: CameraClearFlags,
    forwardDepthResolveEnabled: boolean,
    sunLensFlareDepthPatchEnabled: boolean,
    cubeFace?: TextureCubeFace,
    mipLevel?: number
  ) {
    const cullingResults = this._cullingResults;
    const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;

    const { engine, renderTarget: cameraRenderTarget } = camera;
    const scene = camera.scene!;
    const { background } = scene;

    const rhi = engine._hardwareRenderer;
    const internalColorTarget = this._internalColorTarget;
    const colorTarget = internalColorTarget || camera.renderTarget;
    const colorViewport = internalColorTarget ? PipelineUtils.defaultViewport : camera.viewport;
    const needFlipProjection = !!internalColorTarget || (camera.renderTarget && cubeFace == undefined);

    // Sky materials may schedule material-owned prepasses, such as a shared
    // volumetric direction-cache update, before the main color target is bound.
    let preparedSky = false;
    if (finalClearFlags & CameraClearFlags.Color && background.mode === BackgroundMode.Sky) {
      const skyMaterial = background.sky.material as typeof background.sky.material & {
        _prepareSkyRender?: (context: RenderContext) => void;
      };
      if (skyMaterial?._prepareSkyRender) {
        skyMaterial._prepareSkyRender(context);
        preparedSky = true;
      }
    }

    if (preparedSky || context.flipProjection !== needFlipProjection) {
      // Just add projection matrix update type is enough
      cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.ProjectionMatrix);
      context.applyVirtualCamera(camera._virtualCamera, needFlipProjection);
    }

    context.setRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);

    // Clear color
    if (finalClearFlags !== CameraClearFlags.None) {
      const premultiplyColor = Background._premultiplySolidColor;
      const { solidColor } = background;
      const { a } = solidColor;
      premultiplyColor.set(solidColor.r * a, solidColor.g * a, solidColor.b * a, a);
      rhi.clearRenderTarget(engine, finalClearFlags, premultiplyColor);
    }

    if (internalColorTarget) {
      // Force clear internal color target depth and stencil buffer, because it already missed due to post process, HDR, sRGB covert, etc.
      const keepDSFlags = ~finalClearFlags & CameraClearFlags.DepthStencil;
      if (keepDSFlags) {
        rhi.clearRenderTarget(engine, keepDSFlags);
      }

      const keepColorFlag = ~finalClearFlags & CameraClearFlags.Color;
      if (keepColorFlag) {
        if (this._shouldCopyBackgroundColor) {
          // Copy RT's color buffer to grab texture
          rhi.copyRenderTargetToSubTexture(camera.renderTarget, this._copyBackgroundTexture!, camera.viewport);
          // Then blit grab texture to internal RT's color buffer
          Blitter.blitTexture(
            engine,
            this._copyBackgroundTexture!,
            internalColorTarget,
            0,
            undefined,
            camera.renderTarget ? undefined : engine._basicResources.blitScreenMaterial
          );
        } else {
          // Only blit color buffer from back buffer
          const ignoreFlags = CameraClearFlags.DepthStencil;
          rhi.blitInternalRTByBlitFrameBuffer(camera.renderTarget, internalColorTarget, ignoreFlags, camera.viewport);
        }
      }
      context.setRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);
    }

    const maskManager = scene._maskManager;
    if (finalClearFlags & CameraClearFlags.Stencil) {
      maskManager.hasStencilWritten = false;
    }

    opaqueQueue.render(context, PipelineStage.Forward);
    alphaTestQueue.render(context, PipelineStage.Forward);
    if (finalClearFlags & CameraClearFlags.Color) {
      if (background.mode === BackgroundMode.Sky) {
        background.sky._render(context);
      } else if (background.mode === BackgroundMode.Texture && background.texture) {
        this._drawBackgroundTexture(camera, background);
      }
    }

    let forwardTargetResolved = false;
    if (forwardDepthResolveEnabled) {
      if (!internalColorTarget || !colorTarget) {
        throw new Error("Forward depth resolve requires an internal color target.");
      }
      if (colorTarget.antiAliasing > 1) {
        colorTarget!._blitRenderTarget();
        forwardTargetResolved = true;
        const depthTexture = colorTarget.depthTexture;
        if (!depthTexture) throw new Error("MSAA forward depth resolve requires a resolved depth texture.");
        camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, depthTexture);
      } else {
        const depthFormat = colorTarget._depthFormat;
        if (depthFormat === null || depthFormat === TextureFormat.Stencil) {
          throw new Error("Forward depth resolve requires a depth-capable source target.");
        }
        const depthOnlyPass = this._depthOnlyPass;
        depthOnlyPass.onConfig(camera, depthFormat);
        depthOnlyPass.onResolveForwardDepth(camera, colorTarget);
      }
      camera._depthTextureSource = "forward-resolve";
      context.setRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);
    } else if (sunLensFlareDepthPatchEnabled && internalColorTarget && colorTarget) {
      const depthFormat = colorTarget._depthFormat;
      if (depthFormat !== null && depthFormat !== TextureFormat.Stencil) {
        const srcW = colorTarget.width;
        const srcH = colorTarget.height;
        const patchW = Math.min(64, srcW);
        const patchH = Math.min(64, srcH);
        const sunState = this._sunLensFlareScreenState;
        const centerX = Math.round(sunState.sunU * srcW);
        const centerY = Math.round(sunState.sunV * srcH);
        const srcX0 = MathUtil.clamp(centerX - (patchW >> 1), 0, srcW - patchW);
        const srcY0 = MathUtil.clamp(centerY - (patchH >> 1), 0, srcH - patchH);

        this._sunLensFlareDepthPatchRT = PipelineUtils.recreateRenderTargetIfNeeded(
          engine,
          this._sunLensFlareDepthPatchRT,
          patchW,
          patchH,
          null,
          depthFormat,
          true,
          false,
          false,
          1,
          TextureWrapMode.Clamp,
          TextureFilterMode.Point
        );
        // Offset by +0.25 px before division so WebGL ToInt32 truncation lands bit-exact on [srcX0, srcX0+patchW].
        this._sunLensFlareDepthViewport.set((srcX0 + 0.25) / srcW, (srcH - patchH - srcY0 - 0.25) / srcH, 0, 0);
        rhi.blitInternalRTByBlitFrameBuffer(
          colorTarget,
          this._sunLensFlareDepthPatchRT,
          CameraClearFlags.ColorStencil,
          this._sunLensFlareDepthViewport
        );
        this._sunLensFlareDepthTexture = this._sunLensFlareDepthPatchRT.depthTexture;
        this._sunLensFlareDepthRect.set(srcW / patchW, srcH / patchH, -srcX0 / patchW, -srcY0 / patchH);
        context.setRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);
      }
    }

    // Copy opaque texture
    if (camera.opaqueTextureEnabled) {
      // Should blit to resolve the MSAA
      if (!forwardTargetResolved) {
        colorTarget!._blitRenderTarget();
      }

      const opaqueTexturePass = this._opaqueTexturePass;
      opaqueTexturePass.onConfig(camera, colorTarget!.getColorTexture(0)!);
      opaqueTexturePass.onRender(context);

      // Should revert to original render target
      context.setRenderTarget(colorTarget, colorViewport, mipLevel, cubeFace);
    } else {
      this._opaqueTexturePass.release();
      camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, null);
    }

    transparentQueue.render(context, PipelineStage.Forward);
    // Revert stencil buffer generated by mask
    maskManager.clearMask(context, PipelineStage.Forward);

    // Resolve the scene color once and share it with SSR history + PostProcessManager
    const colorTargetResolved = !!colorTarget;
    if (colorTarget) {
      if (colorTarget === internalColorTarget) {
        if (colorTarget.antiAliasing > 1) {
          // Final resolve for this camera: discard MSAA color+depth renderbuffers right after resolve to skip TBDR STORE.
          (colorTarget._platformRenderTarget as { blitRenderTarget(discardMSAA?: boolean): void }).blitRenderTarget(
            true
          );
        } else if (!colorTarget.depthTexture && colorTarget._depthFormat !== null) {
          // Non-MSAA internal color target is still bound; discard unused depth/stencil renderbuffer before switching FBO.
          rhi.invalidateRenderTarget?.(colorTarget, CameraClearFlags.DepthStencil);
        }
      } else {
        colorTarget._blitRenderTarget();
      }
    }
    this._ssrPass.captureHistory(context, colorTarget, colorViewport);

    // Output render target of each stage
    let outputTarget: RenderTarget | null = null;

    // Post process
    const needFinalPass = camera._needFinalPass();
    const { postProcessManager } = scene;
    const hasPostProcess = camera.enablePostProcess && postProcessManager._isValid();
    if (hasPostProcess) {
      outputTarget = needFinalPass ? postProcessManager._getOutputRenderTarget(camera) : camera.renderTarget;
      postProcessManager._render(camera, internalColorTarget!, outputTarget, colorTargetResolved);
      camera.shaderData.setTexture(
        Camera._cameraPostProcessTextureProperty,
        <Texture2D>outputTarget!.getColorTexture(0)
      );
    } else {
      camera.shaderData.setTexture(Camera._cameraPostProcessTextureProperty, null);
      // Maybe internalColorTarget or camera.renderTarget or null
      outputTarget = colorTarget;
      postProcessManager._releaseSwapRenderTarget();
      postProcessManager._releaseOutputRenderTarget();
    }

    // Final pass
    const finalPass = this._finalPass;
    if (needFinalPass) {
      finalPass.onConfig(camera, outputTarget!);
      finalPass.onRender(context);
      outputTarget = cameraRenderTarget;
    } else {
      finalPass.release();
    }

    // If output target is not camera's render target(only enable HDR or opaqueTexture), we should blit it to camera's render target
    if (outputTarget !== cameraRenderTarget) {
      Blitter.blitTexture(engine, <Texture2D>outputTarget!.getColorTexture(0), cameraRenderTarget, 0, camera.viewport);
    }

    const cameraTargetAlreadyResolved =
      colorTargetResolved &&
      colorTarget === cameraRenderTarget &&
      outputTarget === cameraRenderTarget &&
      !hasPostProcess &&
      !needFinalPass;
    if (!cameraTargetAlreadyResolved) {
      cameraRenderTarget?._blitRenderTarget();
    }
    cameraRenderTarget?.generateMipmaps();
  }

  /**
   * Push render data to render queue.
   * @param context - Render context
   * @param renderElement - Render element
   */
  pushRenderElement(context: RenderContext, renderElement: RenderElement): void {
    const { material } = renderElement;
    const materialSubShader = material.shader.subShaders[0];
    const replacementShader = context.replacementShader;
    if (replacementShader) {
      const replacementSubShaders = replacementShader.subShaders;
      const { replacementTag } = context;
      if (replacementTag) {
        let replacementSuccess = false;
        for (let j = 0, m = replacementSubShaders.length; j < m; j++) {
          const subShader = replacementSubShaders[j];
          if (subShader.getTagValue(replacementTag) === materialSubShader.getTagValue(replacementTag)) {
            this._pushRenderElementByType(renderElement, subShader);
            replacementSuccess = true;
          }
        }

        if (
          !replacementSuccess &&
          context.replacementFailureStrategy === ReplacementFailureStrategy.KeepOriginalShader
        ) {
          this._pushRenderElementByType(renderElement, materialSubShader);
        }
      } else {
        this._pushRenderElementByType(renderElement, replacementSubShaders[0]);
      }
    } else {
      this._pushRenderElementByType(renderElement, materialSubShader);
    }
  }

  private _pushRenderElementByType(renderElement: RenderElement, subShader: SubShader): void {
    const shaderPasses = subShader.passes;
    const cullingResults = this._cullingResults;
    renderElement.subShader = subShader;
    let pushedQueueFlags = RenderQueueFlags.None;
    for (let i = 0, n = shaderPasses.length; i < n; i++) {
      const shaderPass = shaderPasses[i];
      const renderState = shaderPass._renderState;
      const renderQueueType = renderState._getRenderQueueByShaderData(
        shaderPass._renderStateDataMap,
        renderElement.material.shaderData
      );

      const flag = 1 << renderQueueType;
      if (pushedQueueFlags & flag) {
        continue;
      }

      // First queue keeps the original element; subsequent queues each get an isolated
      // clone so per-queue batch state (`_isBatched`, `instancedRenderers`) doesn't
      // leak across queues for multi-pass materials (e.g. Opaque + Transparent)
      let elementForQueue: RenderElement;
      if (pushedQueueFlags === RenderQueueFlags.None) {
        elementForQueue = renderElement;
      } else {
        elementForQueue = renderElement.component.engine._renderElementPool.get();
        elementForQueue._cloneFrom(renderElement);
      }

      switch (renderQueueType) {
        case RenderQueueType.Opaque:
          cullingResults.opaqueQueue.pushRenderElement(elementForQueue);
          break;
        case RenderQueueType.AlphaTest:
          cullingResults.alphaTestQueue.pushRenderElement(elementForQueue);
          break;
        case RenderQueueType.Transparent:
          cullingResults.transparentQueue.pushRenderElement(elementForQueue);
          break;
      }
      pushedQueueFlags |= flag;
    }
  }

  private _drawBackgroundTexture(camera: Camera, background: Background) {
    const engine = camera.engine;
    const rhi = engine._hardwareRenderer;
    const { canvas } = engine;
    const { _material: material, _mesh: mesh } = background;

    if (
      (this._lastCanvasSize.x !== canvas.width || this._lastCanvasSize.y !== canvas.height) &&
      background._textureFillMode !== BackgroundTextureFillMode.Fill
    ) {
      this._lastCanvasSize.set(canvas.width, canvas.height);
      background._resizeBackgroundTexture();
    }

    const pass = material.shader.subShaders[0].passes[0];
    const compileMacros = Shader._compileMacros;
    ShaderMacroCollection.unionCollection(compileMacros, engine._macroCollection, compileMacros);
    const program = pass._getShaderProgram(engine, compileMacros);
    program.bind();
    program.uploadAll(program.materialUniformBlock, material.shaderData);
    program.uploadAll(program.cameraUniformBlock, camera.shaderData);
    program.uploadUnGroupTextures();

    const renderState = pass._renderState;
    renderState._applyStates(engine, false, pass._renderStateDataMap, material.shaderData);
    rhi.drawPrimitive(mesh._primitive, mesh.subMesh, program);
  }

  private _prepareRender(context: RenderContext): void {
    const camera = context.camera;
    const { engine, enableFrustumCulling, cullingMask, _frustum: frustum } = camera;
    const { _renderers: renderers, _canvases: canvases } = camera.scene!._componentsManager;

    const rendererElements = renderers._elements;
    for (let i = renderers.length - 1; i >= 0; --i) {
      const renderer = rendererElements[i];
      // Filter by camera culling mask
      if (!(cullingMask & renderer._entity.layer)) {
        continue;
      }

      // Filter by camera frustum
      if (enableFrustumCulling) {
        if (!frustum.intersectsBox(renderer.bounds)) {
          continue;
        }
      }
      if (camera.renderFilter && !camera.renderFilter(renderer)) continue;
      renderer._prepareRender(context);
      if (camera.updateRendererVisibility) renderer._renderFrameCount = engine.time.frameCount;
    }

    const canvasesElements = canvases._elements;
    for (let i = canvases.length - 1; i >= 0; i--) {
      const canvas = canvasesElements[i];
      // Filter by camera culling mask
      if (!(cullingMask & canvas.entity.layer)) {
        continue;
      }
      if (!canvas._canRender(camera)) {
        continue;
      }
      if (camera.renderFilter && !camera.renderFilter(canvas)) continue;
      canvas._prepareRender(context);
      const canvasElements = canvas._batchedRenderElements;
      for (let j = 0, m = canvasElements.length; j < m; j++) {
        this.pushRenderElement(context, canvasElements[j]);
      }
    }
  }
}

interface RegisteredPipelinePass {
  readonly pass: PipelinePass;
  active: boolean;
}

interface RegisteredRenderViewCullingSource {
  source: RenderViewCullingSource | null;
}

export enum RenderQueueFlags {
  None = 0x0,
  Opaque = 0x1,
  AlphaTest = 0x2,
  Transparent = 0x4,
  All = 0x7
}
