import { Color, Vector2, Vector4 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Blitter } from "../../RenderPipeline/Blitter";
import { PipelineStage } from "../../RenderPipeline/enums/PipelineStage";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { GLCapabilityType } from "../../base";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { CameraType } from "../../enums/CameraType";
import { Material } from "../../material";
import { Shader, ShaderProperty } from "../../shader";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import { TextureUtils } from "../../texture/TextureUtils";
import type { ScreenSpaceReflectionConsumerReceiverMode } from "./ScreenSpaceReflection";
import type { ScreenSpaceReflectionProfiler, ScreenSpaceReflectionStage } from "./ScreenSpaceReflectionProfiler";
import { ScreenSpaceReflection } from "./ScreenSpaceReflection";
import { ScreenSpaceReflectionUpsamplingMode } from "./enums/ScreenSpaceReflectionUpsamplingMode";
import { ScreenSpaceReflectionReceiverMode } from "./enums/ScreenSpaceReflectionReceiverMode";

/** @internal */
export class ScreenSpaceReflectionPass {
  static readonly SHADER_NAME = "Lighting/ScreenSpaceReflection";

  private static readonly _sceneColorProperty = ShaderProperty.getByName("material_SSRSceneColorTexture");
  private static readonly _opaqueDepthProperty = ShaderProperty.getByName("material_SSROpaqueDepthTexture");
  private static readonly _sceneDepthProperty = ShaderProperty.getByName("material_SSRSceneDepthTexture");
  private static readonly _surfaceProperty = ShaderProperty.getByName("material_SSRSurfaceTexture");
  private static readonly _responseProperty = ShaderProperty.getByName("material_SSRResponseTexture");
  private static readonly _receiverDepthProperty = ShaderProperty.getByName("material_SSRReceiverDepthTexture");
  private static readonly _traceProperty = ShaderProperty.getByName("material_SSRTraceTexture");
  private static readonly _traceOriginProperty = ShaderProperty.getByName("material_SSRTraceOriginTexture");
  private static readonly _filterDirectionProperty = ShaderProperty.getByName("material_SSRFilterDirection");
  private static readonly _surfaceTexelSizeProperty = ShaderProperty.getByName("material_SSRSurfaceTexelSize");
  private static readonly _traceTexelSizeProperty = ShaderProperty.getByName("material_SSRTraceTexelSize");
  private static readonly _maxDistanceProperty = ShaderProperty.getByName("material_SSRMaxDistance");
  private static readonly _rayLengthFadeProperty = ShaderProperty.getByName("material_SSRRayLengthFade");
  private static readonly _thicknessProperty = ShaderProperty.getByName("material_SSRThickness");
  private static readonly _maxRoughnessProperty = ShaderProperty.getByName("material_SSRMaxRoughness");
  private static readonly _edgeFadeProperty = ShaderProperty.getByName("material_SSREdgeFade");
  private static readonly _maxStepsProperty = ShaderProperty.getByName("material_SSRMaxSteps");
  private static readonly _binaryStepsProperty = ShaderProperty.getByName("material_SSRBinarySteps");
  private static readonly _debugModeProperty = ShaderProperty.getByName("material_SSRDebugMode");
  private static readonly _clearColor = new Color(0, 0, 0, 0);
  private static readonly _horizontalFilterDirection = new Vector2(1, 0);
  private static readonly _verticalFilterDirection = new Vector2(0, 1);

  private _material: Material | null = null;
  private _contributionTarget: RenderTarget | null = null;
  private _contributionColorDrawCount = 0;
  private _contributionDepthDrawCount = 0;
  private _sceneColorTarget: RenderTarget | null = null;
  private _surfaceTarget: RenderTarget | null = null;
  private _traceTarget: RenderTarget | null = null;
  private _traceBlurTarget: RenderTarget | null = null;
  private _filteredTraceTarget: RenderTarget | null = null;
  private _resolvedTraceTarget: RenderTarget | null = null;
  private readonly _surfaceTexelSize = new Vector4();
  private readonly _traceTexelSize = new Vector4();
  private _fullWidth = 0;
  private _fullHeight = 0;
  private _traceFormat = TextureFormat.R8G8B8A8;
  private _peakTraceWidth = 0;
  private _peakTraceHeight = 0;
  private _peakRenderTargetCount = 0;
  private _peakRenderTextureCount = 0;
  private _receiverMode: ScreenSpaceReflectionConsumerReceiverMode | null = null;
  private _surfaceProfiler: ScreenSpaceReflectionProfiler | null = null;
  private _sceneCopyPassCount = 0;
  private _filterPassCount = 0;
  private _upsamplePassCount = 0;
  private _fullscreenPassCount = 0;
  private _peakEstimatedBytes = 0;
  private _opaqueReceiverElementCount = 0;
  private _transparentReceiverElementCount = 0;
  private _opaqueSurfacePassDrawCount = 0;
  private _transparentSurfacePassDrawCount = 0;
  private _tracePassCount = 0;
  private _compositePassCount = 0;
  private _estimatedBytes = 0;
  private _pipelineRenderTargetCount = 0;
  private _pipelineRenderTextureCount = 0;
  private _pipelineRenderBufferCount = 0;
  private _pipelineEstimatedTextureBytes = 0;
  private _pipelineEstimatedRenderBufferBytes = 0;
  private _destroyed = false;

  get hasOpaqueReceivers(): boolean {
    return this._opaqueReceiverElementCount > 0;
  }

  get hasTransparentReceivers(): boolean {
    return this._transparentReceiverElementCount > 0;
  }

  constructor(
    private readonly _engine: Engine,
    private readonly _camera: Camera
  ) {}

  /** Evaluate the frozen V1 platform contract and begin a frame. */
  prepare(cubeFaceDefined: boolean, mipLevel: number): boolean {
    const camera = this._camera;
    const rhi = this._engine._hardwareRenderer;
    let reason: string | null = null;
    this._contributionColorDrawCount = 0;
    this._contributionDepthDrawCount = 0;
    this._opaqueReceiverElementCount = 0;
    this._transparentReceiverElementCount = 0;
    this._opaqueSurfacePassDrawCount = 0;
    this._transparentSurfacePassDrawCount = 0;
    this._tracePassCount = 0;
    this._compositePassCount = 0;
    this._sceneCopyPassCount = 0;
    this._filterPassCount = 0;
    this._upsamplePassCount = 0;
    this._fullscreenPassCount = 0;
    this._receiverMode = null;
    this._estimatedBytes = 0;
    this._peakTraceWidth = 0;
    this._peakTraceHeight = 0;
    this._peakRenderTargetCount = 0;
    this._peakRenderTextureCount = 0;
    this._peakEstimatedBytes = 0;
    this._resetPipelineResourceStats();

    const screenSpaceReflection = camera.screenSpaceReflection;
    screenSpaceReflection._prepareSettings();
    if (!screenSpaceReflection.metrics.requested) {
      screenSpaceReflection._skipFrame(screenSpaceReflection.metrics.inactiveReason ?? "not-requested");
      this.release();
      return false;
    }

    const cameraMatrixState = camera as unknown as {
      _isCustomProjectionMatrix: boolean;
      _isCustomViewMatrix: boolean;
    };

    if (!rhi.isWebGL2) {
      reason = "unsupported-webgl1";
    } else if (!rhi.capability.isFragmentHighPrecision) {
      reason = "unsupported-fragment-highp";
    } else if (!rhi.canIUse(GLCapabilityType.depthTexture)) {
      reason = "unsupported-depth-texture";
    } else if (!rhi.canIUse(GLCapabilityType.drawBuffers) || rhi.capability.maxDrawBuffers < 2) {
      reason = "unsupported-multiple-render-targets";
    } else if (camera._cameraType !== CameraType.Normal) {
      reason = "unsupported-xr-camera";
    } else if (camera.isOrthographic) {
      reason = "unsupported-orthographic";
    } else if (cameraMatrixState._isCustomProjectionMatrix) {
      reason = "unsupported-custom-projection";
    } else if (cameraMatrixState._isCustomViewMatrix) {
      reason = "unsupported-custom-view";
    } else if (cubeFaceDefined) {
      reason = "unsupported-cube-face";
    } else if (mipLevel !== 0) {
      reason = "unsupported-mip-level";
    } else if (
      camera.enableHDR &&
      (!rhi.canIUse(GLCapabilityType.colorBufferHalfFloat) || !rhi.canIUse(GLCapabilityType.textureHalfFloat))
    ) {
      reason = "unsupported-hdr-color-buffer";
    } else if (!this._getMaterial()) {
      reason = "screen-space-reflection-shader-unavailable";
    }

    const effective = screenSpaceReflection._beginFrame(reason === null, reason);
    if (!effective) this.release();
    return effective;
  }

  /** Freeze explicit receiver phases after culling and before allocating SSR resources. */
  configureReceiverPhases(opaqueCount: number, transparentCount: number, maskedCount: number = 0): boolean {
    this._opaqueReceiverElementCount = opaqueCount;
    this._transparentReceiverElementCount = transparentCount;
    if (opaqueCount + transparentCount === 0) {
      const screenSpaceReflection = this._camera.screenSpaceReflection;
      screenSpaceReflection._skipFrame(maskedCount > 0 ? "masked-receivers-unsupported" : "no-compatible-receivers");
      screenSpaceReflection._setReceiverElementCounts(opaqueCount, transparentCount, maskedCount);
      this.release();
      return false;
    }
    this._camera.screenSpaceReflection._setReceiverElementCounts(opaqueCount, transparentCount, maskedCount);
    return true;
  }

  /** Attribute only the BasicRenderPipeline resources introduced or upgraded by SSR. */
  configurePipelineResources(
    internalColorTarget: RenderTarget,
    baseIndependentCanvasEnabled: boolean,
    ssrBackgroundCopy: Texture2D | null
  ): void {
    this._resetPipelineResourceStats();

    if (baseIndependentCanvasEnabled) {
      // The camera already owns the target and color attachment; SSR upgrades its
      // depth attachment from an RBO contract to a sampleable texture contract.
      const depthTexture = internalColorTarget.depthTexture as Texture2D;
      if (depthTexture) {
        this._pipelineRenderTextureCount = 1;
        this._pipelineEstimatedTextureBytes = this._getTextureBytes(depthTexture);
      }
    } else {
      this._pipelineRenderTargetCount = 1;
      this._pipelineRenderTextureCount =
        internalColorTarget.colorTextureCount + (internalColorTarget.depthTexture ? 1 : 0);
      this._pipelineEstimatedTextureBytes = this._getRenderTargetTextureBytes(internalColorTarget);

      const samples = internalColorTarget.antiAliasing;
      if (samples > 1) {
        const colorTextures = internalColorTarget.colorTextures;
        for (let i = 0, n = colorTextures.length; i < n; i++) {
          const texture = colorTextures[i] as Texture2D;
          this._pipelineRenderBufferCount++;
          this._pipelineEstimatedRenderBufferBytes +=
            TextureUtils.getMipLevelByteCount(texture.format, internalColorTarget.width, internalColorTarget.height) *
            samples;
        }
        if (internalColorTarget._depthFormat !== null) {
          this._pipelineRenderBufferCount++;
          this._pipelineEstimatedRenderBufferBytes +=
            TextureUtils.getMipLevelByteCount(
              internalColorTarget._depthFormat,
              internalColorTarget.width,
              internalColorTarget.height
            ) * samples;
        }
      }
    }

    if (ssrBackgroundCopy) {
      this._pipelineRenderTextureCount++;
      this._pipelineEstimatedTextureBytes += this._getTextureBytes(ssrBackgroundCopy);
    }
  }

  /** Fail this frame closed without throwing through the camera's Forward render. */
  failClose(reason: string): void {
    this._camera.screenSpaceReflection._failFrame(reason);
    if (this._fullscreenPassCount > 0) this._publishRenderStats();
    this.release();
  }

  /** Capture immutable Opaque Scene Color and bind the resolved Forward depth privately. */
  captureScene(context: RenderContext, colorTarget: RenderTarget): boolean {
    const camera = this._camera;
    const material = this._getMaterial();
    if (!material) return false;

    try {
      this._configureTargets(colorTarget);

      const sceneColorTarget = this._sceneColorTarget!;
      const surfaceTarget = this._surfaceTarget!;
      const sceneDepth = colorTarget.depthTexture as Texture2D;
      sceneDepth.filterMode = TextureFilterMode.Point;

      this._blit(colorTarget.getColorTexture(0) as Texture2D, sceneColorTarget, "scene-copy");
      this._sceneCopyPassCount++;
      const profiler = camera.screenSpaceReflection.profiler;
      profiler?.beginSample("scene-mipmap", null);
      try {
        sceneColorTarget.generateMipmaps();
      } finally {
        profiler?.endSample();
      }

      const shaderData = material.shaderData;
      shaderData.setTexture(ScreenSpaceReflectionPass._sceneColorProperty, sceneColorTarget.getColorTexture(0));
      shaderData.setTexture(ScreenSpaceReflectionPass._sceneDepthProperty, sceneDepth);
      shaderData.setTexture(ScreenSpaceReflectionPass._opaqueDepthProperty, sceneDepth);
      shaderData.setTexture(ScreenSpaceReflectionPass._surfaceProperty, surfaceTarget.getColorTexture(0));
      shaderData.setTexture(ScreenSpaceReflectionPass._responseProperty, surfaceTarget.getColorTexture(1));
      shaderData.setTexture(ScreenSpaceReflectionPass._receiverDepthProperty, surfaceTarget.depthTexture);
      shaderData.setTexture(ScreenSpaceReflectionPass._traceProperty, this._traceTarget!.getColorTexture(0));
      shaderData.setTexture(
        ScreenSpaceReflectionPass._traceOriginProperty,
        this._traceTarget!.colorTextureCount > 1 ? this._traceTarget!.getColorTexture(1) : null
      );
      shaderData.setVector4(ScreenSpaceReflectionPass._surfaceTexelSizeProperty, this._surfaceTexelSize);
      shaderData.setVector4(ScreenSpaceReflectionPass._traceTexelSizeProperty, this._traceTexelSize);
      return true;
    } catch {
      this.failClose("screen-space-reflection-render-target-unavailable");
      return false;
    }
  }

  /** Capture transparent hit content without changing the immutable opaque composite base. */
  captureContributions(
    context: RenderContext,
    colorTarget: RenderTarget,
    draw: (stage: PipelineStage) => number
  ): void {
    const camera = this._camera;
    const cameraData = camera.shaderData;
    const materialData = this._material!.shaderData;
    const opaqueColor = this._sceneColorTarget!.getColorTexture(0) as Texture2D;
    const opaqueDepth = colorTarget.depthTexture as Texture2D;
    const previousColor = cameraData.getTexture(Camera._cameraOpaqueTextureProperty);
    const previousDepth = cameraData.getTexture(Camera._cameraDepthTextureProperty);
    const previousIntensity = cameraData.getFloat(ScreenSpaceReflection._cameraIntensityProperty);
    const profiler = camera.screenSpaceReflection.profiler;
    try {
      // Reflection color needs roughness mips; depth must remain a single nearest-sampled level.
      this._contributionTarget = this._engine._renderTargetPool.allocateRenderTarget(
        this._fullWidth,
        this._fullHeight,
        opaqueColor.format,
        colorTarget._depthFormat,
        true,
        true,
        opaqueColor.isSRGBColorSpace,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear,
        TextureFilterMode.Point,
        [],
        false
      );
      this._updateResourcePeaks();
      this._blit(opaqueColor, this._contributionTarget, "contribution-copy");
      this._sceneCopyPassCount++;
      profiler?.beginSample("contribution-depth-copy", null);
      try {
        this._engine._hardwareRenderer.blitInternalRTByBlitFrameBuffer(
          colorTarget,
          this._contributionTarget,
          CameraClearFlags.Color | CameraClearFlags.Stencil,
          PipelineUtils.defaultViewport
        );
      } finally {
        profiler?.endSample();
      }
      // Refraction/depth consumers use this frame's opaque inputs. SSR must not feed itself.
      cameraData.setTexture(Camera._cameraOpaqueTextureProperty, opaqueColor);
      cameraData.setTexture(Camera._cameraDepthTextureProperty, opaqueDepth);
      cameraData.setFloat(ScreenSpaceReflection._cameraIntensityProperty, 0);
      context.setRenderTarget(this._contributionTarget, PipelineUtils.defaultViewport, 0);
      profiler?.beginSample("contribution-color", null);
      try {
        this._contributionColorDrawCount = draw(PipelineStage.ScreenSpaceReflectionContributionColor);
      } finally {
        profiler?.endSample();
      }
      profiler?.beginSample("contribution-depth", null);
      try {
        this._contributionDepthDrawCount = draw(PipelineStage.ScreenSpaceReflectionContributionDepth);
      } finally {
        profiler?.endSample();
      }
      profiler?.beginSample("contribution-mipmap", null);
      try {
        this._contributionTarget.generateMipmaps();
      } finally {
        profiler?.endSample();
      }
      materialData.setTexture(
        ScreenSpaceReflectionPass._sceneColorProperty,
        this._contributionTarget.getColorTexture(0)
      );
      materialData.setTexture(ScreenSpaceReflectionPass._sceneDepthProperty, this._contributionTarget.depthTexture);
    } catch {
      // The opaque capture remains usable if contribution allocation/drawing fails.
      camera.screenSpaceReflection._failContribution("screen-space-reflection-contribution-unavailable");
      materialData.setTexture(ScreenSpaceReflectionPass._sceneColorProperty, opaqueColor);
      materialData.setTexture(ScreenSpaceReflectionPass._sceneDepthProperty, opaqueDepth);
      if (this._contributionTarget) this._engine._renderTargetPool.freeRenderTarget(this._contributionTarget);
      this._contributionTarget = null;
    } finally {
      cameraData.setTexture(Camera._cameraOpaqueTextureProperty, previousColor);
      cameraData.setTexture(Camera._cameraDepthTextureProperty, previousDepth);
      cameraData.setFloat(ScreenSpaceReflection._cameraIntensityProperty, previousIntensity);
    }
  }

  /** Prepare either logical phase, failing closed if its resources are unavailable. */
  beginSurface(
    context: RenderContext,
    receiverMode:
      | ScreenSpaceReflectionReceiverMode.OpaqueComposite
      | ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
    opaqueTarget: RenderTarget
  ): boolean {
    const profiler = this._camera.screenSpaceReflection.profiler;
    try {
      this._receiverMode = receiverMode;
      this._configurePhaseTraceTarget(receiverMode);
      const shaderData = this._material!.shaderData;
      this._bindTraceTextures(
        shaderData,
        this._traceTarget!.getColorTexture(0) as Texture2D,
        (this._traceTarget!.colorTextureCount > 1 ? this._traceTarget!.getColorTexture(1) : null) as Texture2D
      );
      this._uploadSettings(shaderData, receiverMode);
      profiler?.beginSample("surface", receiverMode);
      this._surfaceProfiler = profiler;
      // Copy resolved opaque depth for both phases, never the transparent contribution depth.
      // Surface uses its own attachment so tracing/compositing cannot feed back into Forward depth.
      this._engine._hardwareRenderer.blitInternalRTByBlitFrameBuffer(
        opaqueTarget,
        this._surfaceTarget!,
        CameraClearFlags.Color | CameraClearFlags.Stencil,
        PipelineUtils.defaultViewport
      );
      context.setRenderTarget(this._surfaceTarget, PipelineUtils.defaultViewport, 0);
      this._engine._hardwareRenderer.clearRenderTarget(
        this._engine,
        CameraClearFlags.Color,
        ScreenSpaceReflectionPass._clearColor
      );
    } catch {
      this.endSurface();
      this.failClose("screen-space-reflection-render-target-unavailable");
      return false;
    }
    return true;
  }

  /** Close the Surface scope even when queue submission throws. */
  endSurface(): void {
    const profiler = this._surfaceProfiler;
    this._surfaceProfiler = null;
    profiler?.endSample();
  }

  /** Record queue submissions for stable per-camera diagnostics. */
  recordSurfaceDraws(drawCount: number, transparent: boolean = false): void {
    if (transparent) this._transparentSurfacePassDrawCount += drawCount;
    else this._opaqueSurfacePassDrawCount += drawCount;
  }

  /** Trace at the phase's physical scale, reconstructing only when its budget requests it. */
  trace(): void {
    const shaderData = this._material!.shaderData;
    this._blit(this._sceneColorTarget!.getColorTexture(0) as Texture2D, this._traceTarget!, "trace", 0);
    this._tracePassCount++;
    let filteredTraceTexture = this._traceTarget!.getColorTexture(0) as Texture2D;
    if (this._traceBlurTarget && this._filteredTraceTarget) {
      shaderData.setVector2(
        ScreenSpaceReflectionPass._filterDirectionProperty,
        ScreenSpaceReflectionPass._horizontalFilterDirection
      );
      this._blit(filteredTraceTexture, this._traceBlurTarget, "filter-horizontal", 1);
      shaderData.setVector2(
        ScreenSpaceReflectionPass._filterDirectionProperty,
        ScreenSpaceReflectionPass._verticalFilterDirection
      );
      this._blit(
        this._traceBlurTarget.getColorTexture(0) as Texture2D,
        this._filteredTraceTarget,
        "filter-vertical",
        1
      );
      this._filterPassCount += 2;
      filteredTraceTexture = this._filteredTraceTarget.getColorTexture(0) as Texture2D;
    }

    if (this._resolvedTraceTarget) {
      this._bindTraceTextures(shaderData, filteredTraceTexture, this._traceTarget!.getColorTexture(1) as Texture2D);
      this._blit(filteredTraceTexture, this._resolvedTraceTarget, "upsample", 2);
      this._upsamplePassCount++;
    }
    this._bindTraceTextures(shaderData, this._getOutputTexture(), null);
  }

  /** Composite the Opaque logical layer as a full-output BRDF-unit delta. */
  composite(colorTarget: RenderTarget): void {
    const shaderData = this._material!.shaderData;
    const hitColor = shaderData.getTexture(ScreenSpaceReflectionPass._sceneColorProperty);
    shaderData.setTexture(ScreenSpaceReflectionPass._sceneColorProperty, this._sceneColorTarget!.getColorTexture(0));
    try {
      this._blit(this._sceneColorTarget!.getColorTexture(0) as Texture2D, colorTarget, "composite", 3);
    } finally {
      shaderData.setTexture(ScreenSpaceReflectionPass._sceneColorProperty, hitColor);
    }
    this._compositePassCount++;
  }

  /** Publish confidence-premultiplied RGB and confidence alpha for transparent consumers. */
  publish(): void {
    this._camera.shaderData.setFloat(
      ScreenSpaceReflection._cameraMaxRoughnessProperty,
      this._material!.shaderData.getFloat(ScreenSpaceReflectionPass._maxRoughnessProperty)!
    );
    this._camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, this._getOutputTexture());
  }

  private _getOutputTexture(): Texture2D {
    return (this._resolvedTraceTarget ?? this._traceTarget)!.getColorTexture(0) as Texture2D;
  }

  private _blit(source: Texture2D, target: RenderTarget, stage: ScreenSpaceReflectionStage, passIndex?: number): void {
    const profiler = this._camera.screenSpaceReflection.profiler;
    profiler?.beginSample(stage, this._receiverMode);
    try {
      Blitter.blitTexture(
        this._engine,
        source,
        target,
        0,
        PipelineUtils.defaultViewport,
        passIndex === undefined ? undefined : this._material!,
        passIndex
      );
      this._fullscreenPassCount++;
    } finally {
      profiler?.endSample();
    }
  }

  /** Stop borrowing the internal Forward depth once Transparent consumers have rendered. */
  endFrame(): void {
    this._material?.shaderData.setTexture(ScreenSpaceReflectionPass._sceneDepthProperty, null);
    this._material?.shaderData.setTexture(ScreenSpaceReflectionPass._opaqueDepthProperty, null);
    if (this._sceneColorTarget && this._surfaceTarget && this._traceTarget) {
      this._publishRenderStats();
    }
    this.release();
  }

  private _publishRenderStats(): void {
    const estimatedTextureBytes = this._peakEstimatedBytes + this._pipelineEstimatedTextureBytes;
    const estimatedRenderBufferBytes = this._pipelineEstimatedRenderBufferBytes;
    this._camera.screenSpaceReflection._setRenderStats({
      width: this._peakTraceWidth,
      height: this._peakTraceHeight,
      contributionColorDrawCount: this._contributionColorDrawCount,
      contributionDepthDrawCount: this._contributionDepthDrawCount,
      opaqueSurfacePassDrawCount: this._opaqueSurfacePassDrawCount,
      transparentSurfacePassDrawCount: this._transparentSurfacePassDrawCount,
      tracePassCount: this._tracePassCount,
      compositePassCount: this._compositePassCount,
      sceneCopyPassCount: this._sceneCopyPassCount,
      filterPassCount: this._filterPassCount,
      upsamplePassCount: this._upsamplePassCount,
      fullscreenPassCount: this._fullscreenPassCount,
      renderTargetCount: this._peakRenderTargetCount + this._pipelineRenderTargetCount,
      renderTextureCount: this._peakRenderTextureCount + this._pipelineRenderTextureCount,
      renderBufferCount: this._pipelineRenderBufferCount,
      retainedRenderTargetCount: 0,
      estimatedTextureBytes,
      estimatedRenderBufferBytes,
      estimatedBytes: estimatedTextureBytes + estimatedRenderBufferBytes
    });
  }

  release(): void {
    const pool = this._engine._renderTargetPool;
    const materialData = this._material?.shaderData;
    materialData?.setTexture(ScreenSpaceReflectionPass._sceneColorProperty, null);
    materialData?.setTexture(ScreenSpaceReflectionPass._sceneDepthProperty, null);
    materialData?.setTexture(ScreenSpaceReflectionPass._opaqueDepthProperty, null);
    materialData?.setTexture(ScreenSpaceReflectionPass._surfaceProperty, null);
    materialData?.setTexture(ScreenSpaceReflectionPass._responseProperty, null);
    materialData?.setTexture(ScreenSpaceReflectionPass._receiverDepthProperty, null);
    materialData?.setTexture(ScreenSpaceReflectionPass._traceProperty, null);
    materialData?.setTexture(ScreenSpaceReflectionPass._traceOriginProperty, null);
    this._camera.screenSpaceReflection._unpublish();

    if (this._contributionTarget) {
      pool.freeRenderTarget(this._contributionTarget);
      this._contributionTarget = null;
    }
    if (this._sceneColorTarget) {
      pool.freeRenderTarget(this._sceneColorTarget);
      this._sceneColorTarget = null;
    }
    if (this._surfaceTarget) {
      pool.freeRenderTarget(this._surfaceTarget);
      this._surfaceTarget = null;
    }
    if (this._traceTarget) {
      pool.freeRenderTarget(this._traceTarget);
      this._traceTarget = null;
    }
    if (this._traceBlurTarget) {
      pool.freeRenderTarget(this._traceBlurTarget);
      this._traceBlurTarget = null;
    }
    if (this._filteredTraceTarget) {
      pool.freeRenderTarget(this._filteredTraceTarget);
      this._filteredTraceTarget = null;
    }
    if (this._resolvedTraceTarget) {
      pool.freeRenderTarget(this._resolvedTraceTarget);
      this._resolvedTraceTarget = null;
    }
    this._estimatedBytes = 0;
    this._peakEstimatedBytes = 0;
    this._peakTraceWidth = 0;
    this._peakTraceHeight = 0;
    this._peakRenderTargetCount = 0;
    this._peakRenderTextureCount = 0;
    this._fullWidth = 0;
    this._fullHeight = 0;
    this._resetPipelineResourceStats();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.release();
    if (this._material) {
      this._material._addReferCount(-1);
      this._material.destroy();
      this._material = null;
    }
  }

  private _getMaterial(): Material | null {
    if (!this._material) {
      const shader = Shader.find(ScreenSpaceReflectionPass.SHADER_NAME);
      if (!shader) return null;
      const material = new Material(this._engine, shader);
      material._addReferCount(1);
      this._material = material;
    }
    return this._material;
  }

  private _configureTargets(colorTarget: RenderTarget): void {
    // The RenderTarget fields can retain a fractional camera pixelViewport even
    // though WebGL storage is GLsizei. Mirror the actual integer storage rather
    // than deriving a second, phase-shifted grid from camera.pixelViewport.
    const fullWidth = (this._fullWidth = Math.max(1, Math.floor(colorTarget.width)));
    const fullHeight = (this._fullHeight = Math.max(1, Math.floor(colorTarget.height)));
    const firstReceiverMode = this.hasOpaqueReceivers
      ? ScreenSpaceReflectionReceiverMode.OpaqueComposite
      : ScreenSpaceReflectionReceiverMode.TransparentSampleOnly;
    const sceneColor = colorTarget.getColorTexture(0) as Texture2D;
    const sceneFormat = sceneColor.format;
    this._traceFormat = this._resolveTraceFormat();

    // Preserve full-resolution scene color and receiver coverage for compositing.
    // Trace, optional blur and reconstruction follow the phase-local budget.
    this._sceneColorTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this._engine,
      this._sceneColorTarget,
      fullWidth,
      fullHeight,
      sceneFormat,
      null,
      false,
      true,
      sceneColor.isSRGBColorSpace,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );
    if (this._surfaceTarget) {
      this._engine._renderTargetPool.freeRenderTarget(this._surfaceTarget);
    }
    this._surfaceTarget = this._engine._renderTargetPool.allocateRenderTarget(
      fullWidth,
      fullHeight,
      TextureFormat.R8G8B8A8,
      colorTarget._depthFormat,
      true,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Point,
      TextureFilterMode.Point,
      [TextureFormat.R8G8B8A8]
    );
    this._configurePhaseTraceTarget(firstReceiverMode);
    (this._surfaceTarget.depthTexture as Texture2D).filterMode = TextureFilterMode.Point;
    this._surfaceTexelSize.set(1 / fullWidth, 1 / fullHeight, fullWidth, fullHeight);
    this._updateResourcePeaks();
  }

  /**
   * Trace stores linear, confidence-premultiplied radiance, so an 8-bit buffer quantizes dark reflections
   * regardless of the camera's output range. Use half float wherever it is renderable and filterable.
   */
  private _resolveTraceFormat(): TextureFormat {
    const rhi = this._engine._hardwareRenderer;
    return rhi.canIUse(GLCapabilityType.colorBufferHalfFloat) &&
      rhi.canIUse(GLCapabilityType.textureHalfFloat) &&
      rhi.canIUse(GLCapabilityType.textureHalfFloatLinear)
      ? TextureFormat.R16G16B16A16
      : TextureFormat.R8G8B8A8;
  }

  private _configurePhaseTraceTarget(
    receiverMode:
      | ScreenSpaceReflectionReceiverMode.OpaqueComposite
      | ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
  ): void {
    const settings = this._camera.screenSpaceReflection.getResolvedSettings(receiverMode);
    const width = Math.max(1, Math.ceil(this._fullWidth * settings.resolutionScale));
    const height = Math.max(1, Math.ceil(this._fullHeight * settings.resolutionScale));
    const reduced = width < this._fullWidth || height < this._fullHeight;
    const reconstruct = reduced && settings.upsamplingMode !== ScreenSpaceReflectionUpsamplingMode.Bilinear;
    const shaderData = this._material!.shaderData;
    if (reconstruct) shaderData.enableMacro("SSR_STORE_TRACE_ORIGIN");
    else shaderData.disableMacro("SSR_STORE_TRACE_ORIGIN");
    this._recreateTraceTarget(width, height, reconstruct);
    this._recreateFilterTargets(
      width,
      height,
      reduced && settings.upsamplingMode === ScreenSpaceReflectionUpsamplingMode.GaussianBilateral
    );
    if (reconstruct) {
      this._resolvedTraceTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        this._engine,
        this._resolvedTraceTarget,
        this._fullWidth,
        this._fullHeight,
        this._traceFormat,
        null,
        false,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
    } else if (this._resolvedTraceTarget) {
      shaderData.setTexture(ScreenSpaceReflectionPass._traceProperty, null);
      this._engine._renderTargetPool.freeRenderTarget(this._resolvedTraceTarget);
      this._resolvedTraceTarget = null;
    }
    this._updateResourcePeaks();
  }

  private _recreateTraceTarget(width: number, height: number, storeOrigin: boolean): void {
    const current = this._traceTarget;
    const currentColor = current?.getColorTexture(0) as Texture2D | undefined;
    const currentOrigin =
      current && current.colorTextureCount > 1 ? (current.getColorTexture(1) as Texture2D) : undefined;
    if (
      current &&
      current.width === width &&
      current.height === height &&
      currentColor?.format === this._traceFormat &&
      current.colorTextureCount === (storeOrigin ? 2 : 1) &&
      (!storeOrigin || currentOrigin?.format === TextureFormat.R8G8B8A8)
    ) {
      currentColor.filterMode = TextureFilterMode.Bilinear;
      if (currentOrigin) currentOrigin.filterMode = TextureFilterMode.Point;
    } else {
      const shaderData = this._material?.shaderData;
      shaderData?.setTexture(ScreenSpaceReflectionPass._traceProperty, null);
      shaderData?.setTexture(ScreenSpaceReflectionPass._traceOriginProperty, null);
      if (current) this._engine._renderTargetPool.freeRenderTarget(current);
      this._traceTarget = this._engine._renderTargetPool.allocateRenderTarget(
        width,
        height,
        this._traceFormat,
        null,
        false,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear,
        TextureFilterMode.Point,
        storeOrigin ? [TextureFormat.R8G8B8A8] : []
      );
      if (storeOrigin) (this._traceTarget.getColorTexture(1) as Texture2D).filterMode = TextureFilterMode.Point;
    }
    this._traceTexelSize.set(1 / width, 1 / height, width, height);
    this._material?.shaderData.setVector4(ScreenSpaceReflectionPass._traceTexelSizeProperty, this._traceTexelSize);
  }

  private _recreateFilterTargets(width: number, height: number, enabled: boolean): void {
    if (!enabled) {
      const pool = this._engine._renderTargetPool;
      if (this._traceBlurTarget) {
        pool.freeRenderTarget(this._traceBlurTarget);
        this._traceBlurTarget = null;
      }
      if (this._filteredTraceTarget) {
        pool.freeRenderTarget(this._filteredTraceTarget);
        this._filteredTraceTarget = null;
      }
      return;
    }

    this._traceBlurTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this._engine,
      this._traceBlurTarget,
      width,
      height,
      this._traceFormat,
      null,
      false,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );
    this._filteredTraceTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this._engine,
      this._filteredTraceTarget,
      width,
      height,
      this._traceFormat,
      null,
      false,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );
  }

  private _bindTraceTextures(
    shaderData: Material["shaderData"],
    traceTexture: Texture2D,
    originTexture: Texture2D | null
  ): void {
    shaderData.setTexture(ScreenSpaceReflectionPass._traceProperty, traceTexture);
    shaderData.setTexture(ScreenSpaceReflectionPass._traceOriginProperty, originTexture);
    shaderData.setVector4(ScreenSpaceReflectionPass._traceTexelSizeProperty, this._traceTexelSize);
  }

  private _updateResourcePeaks(): void {
    this._estimatedBytes =
      this._getRenderTargetTextureBytes(this._contributionTarget) +
      this._getRenderTargetTextureBytes(this._sceneColorTarget!) +
      this._getRenderTargetTextureBytes(this._surfaceTarget!) +
      this._getRenderTargetTextureBytes(this._traceTarget!) +
      (this._traceBlurTarget ? this._getRenderTargetTextureBytes(this._traceBlurTarget) : 0) +
      (this._filteredTraceTarget ? this._getRenderTargetTextureBytes(this._filteredTraceTarget) : 0) +
      this._getRenderTargetTextureBytes(this._resolvedTraceTarget);
    this._peakEstimatedBytes = Math.max(this._peakEstimatedBytes, this._estimatedBytes);
    this._peakTraceWidth = Math.max(this._peakTraceWidth, this._traceTarget!.width);
    this._peakTraceHeight = Math.max(this._peakTraceHeight, this._traceTarget!.height);
    const optionalTargets =
      Number(this._traceBlurTarget !== null) +
      Number(this._filteredTraceTarget !== null) +
      Number(this._resolvedTraceTarget !== null);
    this._peakRenderTargetCount = Math.max(
      this._peakRenderTargetCount,
      3 + optionalTargets + Number(this._contributionTarget !== null)
    );
    this._peakRenderTextureCount = Math.max(
      this._peakRenderTextureCount,
      4 + this._traceTarget!.colorTextureCount + optionalTargets + 2 * Number(this._contributionTarget !== null)
    );
  }

  private _getRenderTargetTextureBytes(renderTarget: RenderTarget | null): number {
    if (!renderTarget) return 0;
    let bytes = 0;
    const colorTextures = renderTarget.colorTextures;
    for (let i = 0, n = colorTextures.length; i < n; i++) {
      bytes += this._getTextureBytes(colorTextures[i] as Texture2D);
    }
    if (renderTarget.depthTexture) bytes += this._getTextureBytes(renderTarget.depthTexture as Texture2D);
    return bytes;
  }

  private _getTextureBytes(texture: Texture2D): number {
    return TextureUtils.getTextureByteCount(texture.format, texture.width, texture.height, texture.mipmapCount, 1);
  }

  private _resetPipelineResourceStats(): void {
    this._pipelineRenderTargetCount = 0;
    this._pipelineRenderTextureCount = 0;
    this._pipelineRenderBufferCount = 0;
    this._pipelineEstimatedTextureBytes = 0;
    this._pipelineEstimatedRenderBufferBytes = 0;
  }

  private _uploadSettings(
    shaderData: Material["shaderData"],
    receiverMode:
      | ScreenSpaceReflectionReceiverMode.OpaqueComposite
      | ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
  ): void {
    const screenSpaceReflection = this._camera.screenSpaceReflection;
    const settings = screenSpaceReflection.getResolvedSettings(receiverMode);

    shaderData.setFloat(ScreenSpaceReflectionPass._maxDistanceProperty, settings.maxRayDistance);
    shaderData.setFloat(ScreenSpaceReflectionPass._rayLengthFadeProperty, settings.rayLengthFade);
    shaderData.setFloat(ScreenSpaceReflectionPass._thicknessProperty, settings.thickness);
    shaderData.setFloat(ScreenSpaceReflectionPass._maxRoughnessProperty, settings.maxRoughness);
    shaderData.setFloat(ScreenSpaceReflectionPass._edgeFadeProperty, settings.edgeFade);
    shaderData.setFloat(ScreenSpaceReflectionPass._maxStepsProperty, settings.maxRaySteps);
    shaderData.setFloat(ScreenSpaceReflectionPass._binaryStepsProperty, settings.hitRefinementSteps);
    shaderData.setFloat(ScreenSpaceReflectionPass._debugModeProperty, screenSpaceReflection.debugMode);
  }
}
