import { type BoundingBox, Color, Matrix, Vector4 } from "@galacean/engine-math";
import { RenderStateElementMap } from "../../BasicResources";
import { Camera } from "../../Camera";
import type { EngineObject } from "../../base/EngineObject";
import { Logger } from "../../base/Logger";
import { Engine } from "../../Engine";
import { EngineEventType } from "../../EngineEventType";
import { Blitter } from "../../RenderPipeline/Blitter";
import { CullingResults } from "../../RenderPipeline/CullingResults";
import { PipelinePass } from "../../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { ContextRendererUpdateFlag, RenderContext } from "../../RenderPipeline/RenderContext";
import { RenderElement } from "../../RenderPipeline/RenderElement";
import { PipelineStage } from "../../RenderPipeline/enums/PipelineStage";
import { type IIdleResourceSweeper } from "../../RenderPipeline/RenderTargetPool";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { Material } from "../../material/Material";
import { IHardwareRenderer } from "../../renderingHardwareInterface";
import { CompareFunction, Shader, ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import { RenderStateElementKey } from "../../shader/enums/RenderStateElementKey";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import { SSRDepthOccluderCuller } from "./SSRDepthOccluderCuller";
import { DISABLED_SSR_DIAGNOSTICS, SSRDiagnostics, SSRRuntimeState } from "./SSRDiagnostics";
import { SSRForwardProgramResolver } from "./SSRForwardProgramResolver";
import { SSRHistoryState } from "./SSRHistoryState";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";
import { ScreenSpaceReflectionSettings } from "./ScreenSpaceReflectionSettings";

const PASS_BUILD_HIZ_MIP0 = 0;
const PASS_BUILD_HIZ_MIPN = 1;
const PASS_COPY_TEXTURE = 2;
const PASS_HIZ_TRACE = 3;
const PASS_TEMPORAL_RESOLVE = 4;
const PASS_COLOR_PYRAMID_PREFILTER = 5;
const PASS_COLOR_PYRAMID_DOWNSAMPLE = 6;
const PASS_DOWNSAMPLE_AND_BUILD_HIZ_MIP0 = 7;

const MAX_HIZ_MIP = 6;
const MAX_COLOR_PYRAMID_MIP = 5;
const MAX_COLOR_PYRAMID_MIP_FULL = 6;
const MAX_NON_VERY_HIGH_TRACE_LONG_EDGE = 960;
const SKIPPED_RELEASE_IDLE_FRAMES = 10;

/**
 * @internal
 * Mobile-first Screen-Space Reflection render pass orchestrating dual-stream depth/Hi-Z,
 * non-MSAA MRT receiver generation, Hi-Z tracing, temporal resolve, and linear color pyramid history.
 */
export class ScreenSpaceReflectionPass extends PipelinePass implements IIdleResourceSweeper {
  /** @internal Shared disabled diagnostics snapshot for cameras without an instantiated SSR pass. */
  static readonly _disabledDiagnostics: Readonly<SSRDiagnostics> = DISABLED_SSR_DIAGNOSTICS;

  /** @internal Whether SSR is currently enabled and valid for `camera`. */
  static _isEnabled(camera: Camera): boolean {
    if (!camera.enableScreenSpaceReflection) {
      return false;
    }
    const settings = camera.screenSpaceReflectionOverride ?? camera.scene!.screenSpaceReflection;
    return settings._isValid();
  }

  private static _destroyResource<T extends EngineObject>(resource: T | null): null {
    if (resource && !resource.destroyed) {
      resource._destroyImmediate();
    }
    return null;
  }

  // Camera shader properties
  private static readonly _cameraSSRTextureProp = ShaderProperty.getByName("camera_SSRTexture");
  private static readonly _cameraSSRParamsProp = ShaderProperty.getByName("camera_SSRParams");
  private static readonly _cameraSSRTraceTexelSizeProp = ShaderProperty.getByName("camera_SSRTraceTexelSize");
  private static readonly _cameraSSRRecvDepthProp = ShaderProperty.getByName("camera_SSRReceiverDepthTexture");
  private static readonly _cameraSSRRecvNRProp = ShaderProperty.getByName("camera_SSRReceiverNormalRoughnessTexture");
  private static readonly _cameraSSRInvProjMatProp = ShaderProperty.getByName("camera_SSRInvProjMat");
  private static readonly _cameraSSRInvViewMatProp = ShaderProperty.getByName("camera_SSRInvViewMat");
  private static readonly _cameraSSRPrevVPMatProp = ShaderProperty.getByName("camera_SSRPrevVPMat");
  private static readonly _cameraSSRPrevInvProjMatProp = ShaderProperty.getByName("camera_SSRPrevInvProjMat");
  private static readonly _cameraSSRPrevInvViewMatProp = ShaderProperty.getByName("camera_SSRPrevInvViewMat");
  private static readonly _cameraSSRPrevViewZRowProp = ShaderProperty.getByName("camera_SSRPrevViewZRow");

  // Material shader properties
  private static readonly _matContribDepthProp = ShaderProperty.getByName("material_SSRContribDepthTexture");
  private static readonly _matUseHWStencilProp = ShaderProperty.getByName("material_SSRUseHardwareStencil");
  private static readonly _matHiZTextureProp = ShaderProperty.getByName("material_SSRHiZTexture");
  private static readonly _matNormalRoughnessProp = ShaderProperty.getByName("material_SSRNormalRoughnessTexture");
  private static readonly _matReceiverDepthProp = ShaderProperty.getByName("material_SSRReceiverDepthTexture");
  private static readonly _matPrevColorPyramidProp = ShaderProperty.getByName("material_SSRPrevColorPyramidTexture");
  private static readonly _matPrevTraceDepthProp = ShaderProperty.getByName("material_SSRPrevTraceDepthTexture");
  private static readonly _matTraceRawProp = ShaderProperty.getByName("material_SSRTraceRawTexture");
  private static readonly _matPrevSSRProp = ShaderProperty.getByName("material_SSRPrevSSRTexture");
  private static readonly _matPrevRecvDepthProp = ShaderProperty.getByName("material_SSRPrevReceiverDepthTexture");
  private static readonly _matHitDistProp = ShaderProperty.getByName("material_SSRHitDistTexture");
  private static readonly _matPrevNormalRoughnessProp = ShaderProperty.getByName(
    "material_SSRPrevNormalRoughnessTexture"
  );
  private static readonly _matSourceTexelSizeProp = ShaderProperty.getByName("material_SSRSourceTexelSize");
  private static readonly _matDestTexelSizeProp = ShaderProperty.getByName("material_SSRDestTexelSize");
  private static readonly _matTraceTexelSizeProp = ShaderProperty.getByName("material_SSRTraceTexelSize");
  private static readonly _matColorPyramidInfoProp = ShaderProperty.getByName("material_SSRColorPyramidInfo");
  private static readonly _matTraceSettingsProp = ShaderProperty.getByName("material_SSRTraceSettings");
  private static readonly _matMaxStepsProp = ShaderProperty.getByName("material_SSRMaxSteps");
  private static readonly _matHiZMaxMipProp = ShaderProperty.getByName("material_SSRHiZMaxMip");
  private static readonly _matTemporalBlendProp = ShaderProperty.getByName("material_SSRTemporalBlend");

  private static readonly _AABB_EDGES = new Uint8Array([
    0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7
  ]);

  // Pass macros
  private static readonly _packedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static readonly _packedNormalMacro = ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8");
  private static readonly _packedHDRMacro = ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD");
  private static readonly _downsampleFullDepthMacro = ShaderMacro.getByName("SSR_DOWNSAMPLE_FROM_FULL_DEPTH");
  private static readonly _hasContribDepthMacro = ShaderMacro.getByName("SSR_HAS_CONTRIB_DEPTH");
  private static readonly _outputHitDistMacro = ShaderMacro.getByName("SSR_OUTPUT_HIT_DIST");
  private static readonly _highVirtualReprojMacro = ShaderMacro.getByName("SSR_HIGH_VIRTUAL_REPROJECTION");
  private static readonly _colorPyramidFullResMacro = ShaderMacro.getByName("SSR_COLOR_PYRAMID_FULL_RES");
  private static readonly _colorPyramidKarisDownsampleMacro = ShaderMacro.getByName(
    "SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE"
  );
  private static readonly _linearTraceMacro = ShaderMacro.getByName("SSR_LINEAR_TRACE");
  private static readonly _temporal5TapMacro = ShaderMacro.getByName("SSR_TEMPORAL_5TAP_CLAMP");

  private readonly _material: Material;
  private readonly _history = new SSRHistoryState();
  private readonly _occluderCuller = new SSRDepthOccluderCuller();
  private readonly _programResolver = new SSRForwardProgramResolver();

  // Pre-allocated scratch math & state objects (zero per-frame heap allocation)
  private readonly _invProjMat = new Matrix();
  private readonly _invViewMat = new Matrix();
  private readonly _currentVPMat = new Matrix();
  private readonly _currentViewZRow = new Vector4();
  private readonly _ssrParams = new Vector4();
  private readonly _traceTexelSize = new Vector4();
  private readonly _sourceTexelSize = new Vector4();
  private readonly _destTexelSize = new Vector4();
  private readonly _colorPyramidInfo = new Vector4();
  private readonly _traceSettings = new Vector4();
  private readonly _sourceScaleOffset = new Vector4(1, 1, 0, 0);
  private readonly _subViewport = new Vector4(0, 0, 1, 1);
  private readonly _copyScaleOffset = new Vector4(1, 1, 0, 0);
  private readonly _receiverScissor = new Vector4(0, 0, 0, 0);
  private readonly _clipCorners = new Float32Array(32);
  private readonly _traceDirtyRect = new Int32Array(4);
  private readonly _clearZero = new Color(0, 0, 0, 0);
  private _scissorMinX: number = 0;
  private _scissorMaxX: number = 0;
  private _scissorMinY: number = 0;
  private _scissorMaxY: number = 0;
  private _scissorHasProjected: boolean = false;

  private readonly _receiverStates: RenderStateElementMap = <RenderStateElementMap>{
    [RenderStateElementKey.DepthStateEnabled]: true,
    [RenderStateElementKey.DepthStateWriteEnabled]: true,
    [RenderStateElementKey.DepthStateCompareFunction]: CompareFunction.LessEqual
  };
  private readonly _receiverElements: RenderElement[] = [];

  private readonly _isReceiverElement: (element: RenderElement) => boolean;
  private readonly _isDepthContributorElement: (element: RenderElement) => boolean;
  private readonly _onDeviceLostHandler: () => void;
  private readonly _onDeviceRestoredHandler: () => void;

  // Test/A-B switches (internal)
  _useHardwareStencil: boolean = true;
  _forcePackedFormats: boolean = false;
  _forceHiZScratch: boolean = false;
  _forceSoftwareColorPyramidMipmaps: boolean = false;

  // Format & capability state
  private _unsupportedReason: string | null = null;
  private _depthColorFormat: TextureFormat = TextureFormat.R16_SFloat;
  private _normalRoughnessFormat: TextureFormat = TextureFormat.R16G16B16A16_SFloat;
  private _ssrColorFormat: TextureFormat = TextureFormat.R16G16B16A16_SFloat;
  private _colorPyramidFormat: TextureFormat = TextureFormat.R11G11B10_UFloat;
  private _colorPyramidSRGB: boolean = false;
  private _usesPackedDepthRG8: boolean = false;
  private _usesPackedNormalOct8: boolean = false;
  private _usesPackedHDRReinhard: boolean = false;

  // Active per-frame settings
  private _boundCamera: Camera | null = null;
  private _state: SSRRuntimeState = SSRRuntimeState.Disabled;
  private _effectiveSettings = new ScreenSpaceReflectionSettings();
  private _activeMaxRoughness: number = 0.6;
  private _traceWidth: number = 0;
  private _traceHeight: number = 0;
  private _colorWidth: number = 0;
  private _colorHeight: number = 0;
  private _traceSteps: number = 28;
  private _useTemporal: boolean = true;
  private _useBilateral: boolean = false;
  private _useHighVirtual: boolean = false;
  private _useLinearTrace: boolean = false;
  private _aliasRecvNRToPingPong: boolean = false;
  private _maxColorPyramidMipCap: number = MAX_COLOR_PYRAMID_MIP;
  private _isFullResColorPyramid: boolean = false;
  private _opaqueReceiverCount: number = 0;
  private _transparentReceiverCount: number = 0;
  private _contribDepthCount: number = 0;
  private _skippedFrames: number = 0;
  private _lastActiveFrameCount: number = -1;
  private _hasPersistentResources: boolean = false;
  private _isDisabledClean: boolean = false;
  private _destroyed: boolean = false;
  private _cutRequested: boolean = false;
  private _lastHiZScratchBytes: number = 0;
  private _lastColorScratchBytes: number = 0;
  private _lastContribDepthBytes: number = 0;
  private _lastMaxColorMip: number = 0;

  // Retained render targets/textures shared across stages or frames
  private _ssrDepthTex: Texture2D | null = null;
  private _ssrDepthRT: RenderTarget | null = null;
  private _receiverRTs: [RenderTarget | null, RenderTarget | null] = [null, null];
  private _traceRawTex: Texture2D | null = null;
  private _hitDistTex: Texture2D | null = null;
  private _traceOutRT: RenderTarget | null = null;

  // Per-frame pooled transient targets freed in releaseFrameTargets()
  private readonly _hiZScratchRTs: RenderTarget[] = [];
  private readonly _colorScratchRTs: RenderTarget[] = [];

  private readonly _diagnostics: { -readonly [K in keyof SSRDiagnostics]: SSRDiagnostics[K] } = {
    ...DISABLED_SSR_DIAGNOSTICS
  };

  constructor(engine: Engine, shader: Shader) {
    super(engine);

    const material = new Material(engine, shader);
    material._addReferCount(1);
    this._material = material;

    this._isReceiverElement = (element: RenderElement): boolean => {
      return SSRForwardProgramResolver.isReceiverEligible(element.material, this._activeMaxRoughness);
    };

    this._isDepthContributorElement = (element: RenderElement): boolean => {
      return element.material.contributeScreenSpaceReflectionDepth;
    };

    this._onDeviceLostHandler = (): void => {
      this._state = SSRRuntimeState.ContextLost;
      this.releaseFrameTargets();
      if (this._boundCamera?.shaderData) {
        this._clearCameraSSREnable(this._boundCamera);
      }
      this._resetTemporaryBindings();
      this._releasePersistentResources();
      this._history.invalidateAll();
      this._cutRequested = true;
      this._updateDiagnostics(false);
    };

    this._onDeviceRestoredHandler = (): void => {
      this.releaseFrameTargets();
      if (this._boundCamera?.shaderData) {
        this._clearCameraSSREnable(this._boundCamera);
      }
      this._resetTemporaryBindings();
      this._releasePersistentResources();
      this._detectCapabilities(this.engine._hardwareRenderer);
      this._cutRequested = true;
    };

    engine.on(EngineEventType.DeviceLost, this._onDeviceLostHandler);
    engine.on(EngineEventType.DeviceRestored, this._onDeviceRestoredHandler);
    this._detectCapabilities(engine._hardwareRenderer);
  }

  /** @internal Last computed receiver scissor rect `(x, y, width, height)` in trace pixels. */
  get _lastReceiverScissor(): Readonly<Vector4> {
    return this._receiverScissor;
  }

  /**
   * Prepare state machine and evaluate whether SSR runs this frame.
   * @param context - Active render context
   * @param cullingResults - Sorted render queues for this camera
   * @param isSubView - Whether rendering into a cube-map face or non-zero mip level (skips SSR without wiping main history)
   */
  prepare(context: RenderContext, cullingResults: CullingResults, isSubView: boolean): void {
    const { camera } = context;
    const { engine } = this;
    const scene = camera.scene!;
    const sourceSettings = camera.screenSpaceReflectionOverride ?? scene.screenSpaceReflection;
    this._useLinearTrace = sourceSettings.useLinearTrace;
    this._boundCamera = camera;

    if (engine._isDeviceLost) {
      this._state = SSRRuntimeState.ContextLost;
      this._isDisabledClean = false;
      this._clearCameraSSREnable(camera, context);
      this._history.invalidateAll();
      this._updateDiagnostics(false);
      return;
    }

    if (isSubView) {
      // Sub-views (CubeProbe faces / non-zero mipLevel) skip SSR without destroying
      // or overwriting the camera's main-view history, persistent targets, or diagnostics.
      this._state = SSRRuntimeState.Skipped;
      this._clearCameraSSREnable(camera, context);
      this._resetTemporaryBindings();
      return;
    }

    if (!ScreenSpaceReflectionPass._isEnabled(camera)) {
      if (this._state === SSRRuntimeState.Disabled && this._isDisabledClean) {
        this._programResolver.reset();
        if (context.programResolver === this._programResolver) {
          context.programResolver = null;
        }
        return;
      }
      this._state = SSRRuntimeState.Disabled;
      this._opaqueReceiverCount = 0;
      this._transparentReceiverCount = 0;
      this._contribDepthCount = 0;
      this._skippedFrames = 0;
      this._clearCameraSSREnable(camera, context);
      this._resetTemporaryBindings();
      this._releasePersistentResources();
      this._updateDiagnostics(false);
      this._isDisabledClean = true;
      return;
    }

    // MRT (< 2 draw buffers) is required for Receiver normal+depth generation.
    const rhi = engine._hardwareRenderer;
    if (rhi.capability.maxDrawBuffers < 2) {
      this._unsupportedReason = "MRT (< 2 draw buffers) unsupported";
      this._usesPackedDepthRG8 = true;
      this._usesPackedNormalOct8 = true;
      this._usesPackedHDRReinhard = false;
      this._state = SSRRuntimeState.Disabled;
      this._opaqueReceiverCount = 0;
      this._transparentReceiverCount = 0;
      this._contribDepthCount = 0;
      this._skippedFrames = 0;
      this._clearCameraSSREnable(camera, context);
      this._resetTemporaryBindings();
      this._releasePersistentResources();
      this._updateDiagnostics(false);
      this._isDisabledClean = false;
      return;
    }
    this._unsupportedReason = null;

    if (context.replacementShader) {
      this._state = SSRRuntimeState.Skipped;
      this._isDisabledClean = false;
      this._opaqueReceiverCount = 0;
      this._transparentReceiverCount = 0;
      this._contribDepthCount = 0;
      this._clearCameraSSREnable(camera, context);
      this._resetTemporaryBindings();
      this._skippedFrames++;
      if (this._skippedFrames >= SKIPPED_RELEASE_IDLE_FRAMES) {
        this._history.invalidateAll();
        this._releasePersistentResources();
      }
      this._updateDiagnostics(false);
      return;
    }

    this._isDisabledClean = false;

    sourceSettings.cloneTo(this._effectiveSettings);
    this._useLinearTrace = this._effectiveSettings.useLinearTrace;
    this._activeMaxRoughness = this._effectiveSettings.maxRoughness;

    this._receiverElements.length = 0;
    const opaqueCount =
      cullingResults.opaqueQueue.countElementsForStage(
        PipelineStage.SSRReceiver,
        this._isReceiverElement,
        this._receiverElements
      ) +
      cullingResults.alphaTestQueue.countElementsForStage(
        PipelineStage.SSRReceiver,
        this._isReceiverElement,
        this._receiverElements
      );
    const transparentCount = cullingResults.transparentQueue.countElementsForStage(
      PipelineStage.SSRReceiver,
      this._isReceiverElement,
      this._receiverElements
    );
    const contribCount = cullingResults.transparentQueue.countElementsForStage(
      PipelineStage.SSRContributionDepth,
      this._isDepthContributorElement
    );

    this._opaqueReceiverCount = opaqueCount;
    this._transparentReceiverCount = transparentCount;
    this._contribDepthCount = contribCount;

    if (opaqueCount + transparentCount === 0) {
      this._state = SSRRuntimeState.Skipped;
      this._clearCameraSSREnable(camera, context);
      this._history.invalidateAll();
      this._skippedFrames++;
      if (this._skippedFrames >= SKIPPED_RELEASE_IDLE_FRAMES) {
        this._resetTemporaryBindings();
        this._releasePersistentResources();
      }
      this._lastHiZScratchBytes = 0;
      this._lastColorScratchBytes = 0;
      this._lastContribDepthBytes = 0;
      this._updateDiagnostics(false);
      return;
    }

    this._skippedFrames = 0;

    const { width: vpW, height: vpH } = camera.pixelViewport;
    let scale = 0.5;
    let colorScale = 0.5;
    let maxSteps = 28;
    let useTemporal = true;
    let useBilateral = false;
    let useHighVirtual = false;
    let maxColorMipCap = MAX_COLOR_PYRAMID_MIP;

    switch (this._effectiveSettings.quality) {
      case ScreenSpaceReflectionQuality.Low:
        scale = 0.25;
        maxSteps = 12;
        useTemporal = false;
        break;
      case ScreenSpaceReflectionQuality.Medium:
        scale = 0.5;
        maxSteps = 28;
        useTemporal = true;
        break;
      case ScreenSpaceReflectionQuality.High:
        scale = 0.5;
        maxSteps = 28;
        useTemporal = true;
        useBilateral = true;
        useHighVirtual = true;
        break;
      case ScreenSpaceReflectionQuality.VeryHigh:
        scale = 1.0;
        colorScale = 1.0;
        maxSteps = 64;
        useTemporal = true;
        useBilateral = false;
        useHighVirtual = true;
        maxColorMipCap = MAX_COLOR_PYRAMID_MIP_FULL;
        break;
    }

    if (this._effectiveSettings.quality !== ScreenSpaceReflectionQuality.VeryHigh) {
      const maxVpDim = Math.max(vpW, vpH);
      if (maxVpDim > 0) {
        const maxCappedScale = MAX_NON_VERY_HIGH_TRACE_LONG_EDGE / maxVpDim;
        scale = Math.max(0.25, Math.min(scale, maxCappedScale));
        colorScale = Math.max(0.25, Math.min(colorScale, maxCappedScale));
      }
    }

    const isHDR = camera.enableHDR;
    // Detect precision formats once with effective HDR + high-precision normal flag.
    this._detectCapabilities(rhi, isHDR, useBilateral || useHighVirtual);

    const traceW = Math.max(1, Math.floor(vpW * scale));
    const traceH = Math.max(1, Math.floor(vpH * scale));
    const colorW = Math.max(1, Math.floor(vpW * colorScale));
    const colorH = Math.max(1, Math.floor(vpH * colorScale));
    const aliasRecvNR =
      useTemporal && !useHighVirtual && !useBilateral && this._normalRoughnessFormat === this._ssrColorFormat;

    this._traceWidth = traceW;
    this._traceHeight = traceH;
    this._colorWidth = colorW;
    this._colorHeight = colorH;
    this._traceSteps = maxSteps;
    this._useTemporal = useTemporal;
    this._useBilateral = useBilateral;
    this._useHighVirtual = useHighVirtual;
    this._aliasRecvNRToPingPong = aliasRecvNR;
    this._maxColorPyramidMipCap = maxColorMipCap;
    this._isFullResColorPyramid = colorScale >= 1.0;

    const history = this._history;
    const frameCount = engine.time.frameCount;
    this._lastActiveFrameCount = frameCount;
    const isDiscontinuous =
      this._cutRequested ||
      (history.lastFrameCount !== -1 &&
        (frameCount < history.lastFrameCount || frameCount - history.lastFrameCount > 30)) ||
      history.lastTraceWidth !== traceW ||
      history.lastTraceHeight !== traceH ||
      history.lastColorWidth !== colorW ||
      history.lastColorHeight !== colorH ||
      history.lastIsOrthographic !== camera.isOrthographic ||
      (this._usesPackedDepthRG8 && history.lastFarClip !== camera.farClipPlane) ||
      history.lastIsHDR !== isHDR ||
      history.lastUsesPackedDepth !== this._usesPackedDepthRG8 ||
      history.lastUseHardwareStencil !== this._useHardwareStencil;

    this._cutRequested = false;

    if (isDiscontinuous) {
      history.invalidateAll();
      this._traceDirtyRect[0] = 0;
      this._traceDirtyRect[1] = 0;
      this._traceDirtyRect[2] = traceW;
      this._traceDirtyRect[3] = traceH;
    } else if (
      history.lastQuality !== this._effectiveSettings.quality ||
      history.lastUseHighVirtual !== useHighVirtual ||
      history.lastUseLinearTrace !== this._useLinearTrace ||
      history.lastAliasRecvNR !== aliasRecvNR ||
      history.lastUsesPackedNormal !== this._usesPackedNormalOct8 ||
      history.lastUsesPackedHDR !== this._usesPackedHDRReinhard
    ) {
      history.hasTemporalHistory = false;
    }

    try {
      this._ensurePersistentResources(
        camera,
        traceW,
        traceH,
        colorW,
        colorH,
        useTemporal,
        useHighVirtual,
        this._useHardwareStencil,
        aliasRecvNR
      );
      this._registerActiveResources();
    } catch (error) {
      this._handleFailure(camera, "prepare", error, context);
      this.releaseFrameTargets();
      this._releasePersistentResources();
      this._updateDiagnostics(false);
      return;
    }

    if (!useTemporal) {
      if (this._receiverRTs[1] && !this._receiverRTs[1].destroyed) {
        this._clearCameraSSREnable(camera, context);
      }
      this._destroyReceiverSlot(1);
      this._releaseTemporalBuffers();
    }

    if (!history.hasColorHistory || !history.hasHiZHistory) {
      this._state = SSRRuntimeState.WarmupColor;
      this._clearCameraSSREnable(camera, context);
    } else if (!useTemporal || !history.hasTemporalHistory) {
      this._state = SSRRuntimeState.FirstTrace;
    } else {
      this._state = SSRRuntimeState.ActiveSteady;
    }
  }

  /**
   * Execute pre-forward depth downsample / Hi-Z build / receiver MRT / Hi-Z trace / temporal resolve.
   */
  renderPreForward(context: RenderContext, cullingResults: CullingResults, fullDepthRT: RenderTarget | null): void {
    const state = this._state;
    if (
      state === SSRRuntimeState.Disabled ||
      state === SSRRuntimeState.Skipped ||
      state === SSRRuntimeState.ContextLost
    ) {
      return;
    }

    const { engine } = this;
    const { camera } = context;
    const rhi = engine._hardwareRenderer;
    const history = this._history;
    const material = this._material;
    const materialData = material.shaderData;
    const cameraData = camera.shaderData;

    try {
      // Ensure offscreen projection convention matches DepthOnly/SSRReceiver/Forward-to-RT.
      if (!context.flipProjection) {
        cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.ProjectionMatrix);
        context.applyVirtualCamera(camera._virtualCamera, true);
      }

      this._currentVPMat.copyFrom(context.viewProjectionMatrix);
      const viewE = context.viewMatrix.elements;
      this._currentViewZRow.set(viewE[2], viewE[6], viewE[10], viewE[14]);
      Matrix.invert(context.projectionMatrix, this._invProjMat);
      Matrix.invert(context.viewMatrix, this._invViewMat);

      // Sync encoding macros on internal SSR material.
      this._syncEncodingMacros(materialData);

      const traceW = this._traceWidth;
      const traceH = this._traceHeight;
      const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;

      const isWarmup = state === SSRRuntimeState.WarmupColor;
      const hasVisibleReceiver = isWarmup ? false : this._computeReceiverScissorRect(context, traceW, traceH);

      // Step A: Build trace-resolution Depth24Stencil8 via DepthOnly when no full-res depth target is available.
      // When fullDepthTex exists with visible receivers, Step D merges full-depth max-downsample into Pass 7 (DownsampleAndBuildHiZMip0).
      const fullDepthTex = (fullDepthRT?.depthTexture as Texture2D | null) ?? null;
      const useMergedFullDepthPass = Boolean(fullDepthTex) && hasVisibleReceiver;
      if (!fullDepthTex) {
        const ssrDepthRT = this._ssrDepthRT!;
        context.setRenderTarget(ssrDepthRT, PipelineUtils.defaultViewport, 0);
        rhi.clearRenderTarget(engine, CameraClearFlags.DepthStencil, null);
        this._occluderCuller.prepare(context.camera, ssrDepthRT.height, context.viewMatrix, context.projectionMatrix);
        opaqueQueue.render(
          context,
          PipelineStage.DepthOnly,
          undefined,
          undefined,
          this._occluderCuller.isOccluderElement
        );
        alphaTestQueue.render(
          context,
          PipelineStage.DepthOnly,
          undefined,
          undefined,
          this._occluderCuller.isOccluderElement
        );
      }

      // Step B: Optional nearest nonzero-alpha transparent depth contributors (pooled per frame)
      const pool = engine._renderTargetPool;
      let contribRT: RenderTarget | null = null;
      let contribDepthTex: Texture2D | null = null;
      if (this._contribDepthCount > 0) {
        contribRT = pool.allocateRenderTarget(
          traceW,
          traceH,
          null,
          TextureFormat.Depth24,
          true,
          false,
          false,
          1,
          TextureWrapMode.Clamp,
          TextureFilterMode.Point
        );
        contribRT.autoGenerateMipmaps = false;
        this._hiZScratchRTs.push(contribRT);
        context.setRenderTarget(contribRT, PipelineUtils.defaultViewport, 0);
        rhi.clearRenderTarget(engine, CameraClearFlags.Depth, null);
        transparentQueue.render(
          context,
          PipelineStage.SSRContributionDepth,
          undefined,
          undefined,
          this._isDepthContributorElement
        );
        contribDepthTex = contribRT.depthTexture as Texture2D;
        this._lastContribDepthBytes = contribDepthTex._memorySize;
      } else {
        this._lastContribDepthBytes = 0;
      }

      // Step C: WarmupColor / offscreen-receiver fast path - capture min depth directly into ping-pong hiZTex mip 0 and skip Hi-Z mip 1..N.
      const currHiZIdx = history.hiZPingPongIndex;
      const prevHiZIdx: 0 | 1 = currHiZIdx === 0 ? 1 : 0;
      const currHiZTex = history.hiZTex[currHiZIdx]!;
      const currHiZColorRT = history.hiZColorRT[currHiZIdx]!;
      const currIdx = this._useTemporal ? history.temporalPingPongIndex : 0;
      const aliasRecv = this._aliasRecvNRToPingPong;

      if (isWarmup || !hasVisibleReceiver) {
        this._runBuildHiZMip0(fullDepthTex, contribDepthTex, currHiZColorRT);
        if (contribRT) {
          this._popAndFreeScratch(this._hiZScratchRTs, contribRT);
        }
        if (!isWarmup) {
          const receiverRT = this._receiverRTs[currIdx];
          if (receiverRT) {
            this._clearDirtyUnion(
              context,
              receiverRT,
              history.recvSlotDirtyRect[currIdx],
              aliasRecv ? history.ssrSlotDirtyRect[currIdx] : null,
              0,
              0,
              0,
              0,
              0,
              traceW,
              traceH
            );
          }
          if (this._traceOutRT) {
            this._clearDirtyUnion(context, this._traceOutRT, this._traceDirtyRect, null, 0, 0, 0, 0, 0, traceW, traceH);
          }
          if (this._useTemporal) {
            const dstSSRRT = history.ssrPingPongRT[currIdx];
            if (dstSSRRT) {
              this._clearDirtyUnion(
                context,
                dstSSRRT,
                history.ssrSlotDirtyRect[currIdx],
                null,
                0,
                0,
                0,
                0,
                0,
                traceW,
                traceH
              );
            }
            history.hasTemporalHistory = false;
          }
        }
        history.hasHiZHistory = true;
        history.hiZPingPongIndex = prevHiZIdx;
        this._lastHiZScratchBytes = 0;
        this._clearCameraSSREnable(camera, context);
        this._updateDiagnostics(false);
        return;
      }

      // Step D: Build persistent Hi-Z Pyramid (Mip 0 only when Linear trace A/B mode is active)
      const useLinearTrace = this._useLinearTrace;
      const maxHiZMip = useLinearTrace
        ? 0
        : Math.min(MAX_HIZ_MIP, Math.floor(Math.log2(Math.max(1, Math.min(traceW, traceH)))));
      if (useMergedFullDepthPass) {
        this._runDownsampleAndBuildHiZMip0(context, fullDepthTex!, contribDepthTex, currHiZIdx, currHiZTex);
      } else {
        this._runBuildHiZMip0(fullDepthTex, contribDepthTex, currHiZColorRT);
      }
      if (contribRT) {
        this._popAndFreeScratch(this._hiZScratchRTs, contribRT);
        contribRT = null;
        contribDepthTex = null;
      }

      if (maxHiZMip >= 1) {
        if (this._canUseInPlaceHiZ(currHiZTex)) {
          this._lastHiZScratchBytes = 0;
          try {
            for (let m = 1; m <= maxHiZMip; m++) {
              const srcW = Math.max(1, traceW >> (m - 1));
              const srcH = Math.max(1, traceH >> (m - 1));
              const dstW = Math.max(1, traceW >> m);
              const dstH = Math.max(1, traceH >> m);
              // WebGL2 prohibits sampling a mip level attached to the active FBO;
              // pin sampler range to [m - 1, m - 1] so destMipLevel = m sits outside it.
              currHiZTex._setMipLevelRange(m - 1, m - 1);
              this._sourceTexelSize.set(1 / srcW, 1 / srcH, srcW, srcH);
              this._destTexelSize.set(1 / dstW, 1 / dstH, dstW, dstH);
              materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
              materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
              Blitter.blitTexture(
                engine,
                currHiZTex,
                currHiZColorRT,
                0,
                PipelineUtils.defaultViewport,
                material,
                PASS_BUILD_HIZ_MIPN,
                undefined,
                m,
                true
              );
            }
          } finally {
            currHiZTex._setMipLevelRange(0, 1000);
          }
        } else {
          const mip1W = Math.max(1, traceW >> 1);
          const mip1H = Math.max(1, traceH >> 1);
          const hiZScratchRT = pool.allocateRenderTarget(
            mip1W,
            mip1H,
            this._depthColorFormat,
            null,
            false,
            false,
            false,
            1,
            TextureWrapMode.Clamp,
            TextureFilterMode.Point
          );
          hiZScratchRT.autoGenerateMipmaps = false;
          this._hiZScratchRTs.push(hiZScratchRT);
          const hiZScratchTex = hiZScratchRT.getColorTexture(0) as Texture2D;
          this._lastHiZScratchBytes = hiZScratchTex._memorySize;

          for (let m = 1; m <= maxHiZMip; m++) {
            const srcW = Math.max(1, traceW >> (m - 1));
            const srcH = Math.max(1, traceH >> (m - 1));
            const dstW = Math.max(1, traceW >> m);
            const dstH = Math.max(1, traceH >> m);
            const vpW = dstW === mip1W ? 1 : Math.min(1, (dstW + 0.001) / mip1W);
            const vpH = dstH === mip1H ? 1 : Math.min(1, (dstH + 0.001) / mip1H);
            this._subViewport.set(0, 0, vpW, vpH);

            this._sourceTexelSize.set(1 / srcW, 1 / srcH, srcW, srcH);
            this._destTexelSize.set(1 / dstW, 1 / dstH, dstW, dstH);
            materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
            materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
            Blitter.blitTexture(
              engine,
              currHiZTex,
              hiZScratchRT,
              m - 1,
              this._subViewport,
              material,
              PASS_BUILD_HIZ_MIPN,
              undefined,
              0,
              true
            );

            this._copyScaleOffset.set(dstW / mip1W, dstH / mip1H, 0, 0);
            this._copyTextureToRT(hiZScratchTex, currHiZColorRT, m, 0, this._copyScaleOffset, undefined, true);
          }

          this._popAndFreeScratch(this._hiZScratchRTs, hiZScratchRT);
        }
      } else {
        this._lastHiZScratchBytes = 0;
      }

      // Step E: Non-MSAA MRT Receiver Pass (closest layer wins: Opaque & Transparent DepthWrite=true)
      const prevIdx: 0 | 1 = currIdx === 0 ? 1 : 0;
      const settings = this._effectiveSettings;
      const traceScale = Math.min(1, traceW / Math.max(1, camera.pixelViewport.width));

      const sx0 = this._receiverScissor.x;
      const sy0 = this._receiverScissor.y;
      const sw = this._receiverScissor.z;
      const sh = this._receiverScissor.w;
      const sx1 = sx0 + sw;
      const sy1 = sy0 + sh;
      const isFullScreenScissor = sx0 === 0 && sy0 === 0 && sw === traceW && sh === traceH;
      const scissorArg = isFullScreenScissor ? undefined : this._receiverScissor;

      this._ssrParams.set(settings.intensity, settings.maxRoughness, traceScale, camera.farClipPlane);
      cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRParamsProp, this._ssrParams);

      const receiverRT = this._receiverRTs[currIdx]!;
      this._clearDirtyUnion(
        context,
        receiverRT,
        history.recvSlotDirtyRect[currIdx],
        aliasRecv ? history.ssrSlotDirtyRect[currIdx] : null,
        sx0,
        sy0,
        sx1,
        sy1,
        0,
        traceW,
        traceH
      );
      if (!isFullScreenScissor) {
        rhi.scissor(sx0, sy0, sw, sh);
      }

      this._programResolver.configureReceiverEncoding(
        this._usesPackedDepthRG8,
        this._usesPackedNormalOct8,
        this._usesPackedHDRReinhard
      );
      context.programResolver = this._programResolver;

      if (this._opaqueReceiverCount > 0) {
        opaqueQueue.render(
          context,
          PipelineStage.SSRReceiver,
          undefined,
          this._receiverStates,
          this._isReceiverElement
        );
        alphaTestQueue.render(
          context,
          PipelineStage.SSRReceiver,
          undefined,
          this._receiverStates,
          this._isReceiverElement
        );
      }
      if (this._transparentReceiverCount > 0) {
        transparentQueue.render(
          context,
          PipelineStage.SSRReceiver,
          undefined,
          this._receiverStates,
          this._isReceiverElement
        );
      }

      // Step F: Hi-Z / Linear Ray Trace Pass
      const currRecvNR = aliasRecv ? history.ssrPingPongTex[currIdx]! : history.recvNRTex[currIdx]!;
      const currRecvDepth = history.recvDepthTex[currIdx]!;
      if (aliasRecv) {
        currRecvNR.filterMode = TextureFilterMode.Point;
      }
      try {
        this._traceTexelSize.set(1 / traceW, 1 / traceH, traceW, traceH);
        this._colorPyramidInfo.set(
          this._lastMaxColorMip,
          this._colorWidth,
          this._colorHeight,
          engine.time.frameCount & 63
        );
        this._traceSettings.set(settings.maxDistance, settings.thickness, settings.maxRoughness, settings.edgeFade);

        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRInvProjMatProp, this._invProjMat);
        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRInvViewMatProp, this._invViewMat);
        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRPrevVPMatProp, history.prevVPMat);
        if (this._useHighVirtual) {
          cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRPrevInvProjMatProp, history.prevInvProjMat);
          cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRPrevInvViewMatProp, history.prevInvViewMat);
        }
        cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRPrevViewZRowProp, history.prevViewZRow);

        const prevHiZTex = history.hasHiZHistory ? history.hiZTex[prevHiZIdx]! : currHiZTex;
        materialData.setInt(ScreenSpaceReflectionPass._matUseHWStencilProp, this._useHardwareStencil ? 1 : 0);
        materialData.setTexture(ScreenSpaceReflectionPass._matHiZTextureProp, currHiZTex);
        materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, currRecvNR);
        materialData.setTexture(ScreenSpaceReflectionPass._matReceiverDepthProp, currRecvDepth);
        materialData.setTexture(ScreenSpaceReflectionPass._matPrevColorPyramidProp, history.prevColorPyramidTex!);
        materialData.setTexture(ScreenSpaceReflectionPass._matPrevTraceDepthProp, prevHiZTex);
        materialData.setVector4(ScreenSpaceReflectionPass._matTraceTexelSizeProp, this._traceTexelSize);
        materialData.setVector4(ScreenSpaceReflectionPass._matColorPyramidInfoProp, this._colorPyramidInfo);
        materialData.setVector4(ScreenSpaceReflectionPass._matTraceSettingsProp, this._traceSettings);
        materialData.setFloat(ScreenSpaceReflectionPass._matMaxStepsProp, this._traceSteps);
        materialData.setFloat(ScreenSpaceReflectionPass._matHiZMaxMipProp, maxHiZMip);
        ScreenSpaceReflectionPass._setMacro(
          materialData._macroCollection,
          ScreenSpaceReflectionPass._outputHitDistMacro,
          this._useHighVirtual
        );
        ScreenSpaceReflectionPass._setMacro(
          materialData._macroCollection,
          ScreenSpaceReflectionPass._linearTraceMacro,
          useLinearTrace
        );

        const traceOutRT = this._traceOutRT!;
        // Expand clear pad by 2px on traceOutRT so TemporalResolve neighbor taps outside scissor read zero.
        this._clearDirtyUnion(context, traceOutRT, this._traceDirtyRect, null, sx0, sy0, sx1, sy1, 2, traceW, traceH);
        Blitter.blitTexture(
          engine,
          currRecvNR,
          traceOutRT,
          0,
          PipelineUtils.defaultViewport,
          material,
          PASS_HIZ_TRACE,
          undefined,
          0,
          false,
          scissorArg
        );
        if (!this._useTemporal && this._useHardwareStencil) {
          rhi.invalidateRenderTarget?.(traceOutRT, CameraClearFlags.DepthStencil);
        }
      } finally {
        if (aliasRecv) {
          currRecvNR.filterMode = TextureFilterMode.Bilinear;
        }
        ScreenSpaceReflectionPass._setMacro(
          materialData._macroCollection,
          ScreenSpaceReflectionPass._outputHitDistMacro,
          false
        );
        ScreenSpaceReflectionPass._setMacro(
          materialData._macroCollection,
          ScreenSpaceReflectionPass._linearTraceMacro,
          false
        );
      }
      materialData.setTexture(ScreenSpaceReflectionPass._matHiZTextureProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, null);

      // Step H: Temporal Resolve (Medium / High, with hardware Stencil culling) or direct output (Low)
      const traceRawTex = this._traceRawTex!;
      let finalSSRTex: Texture2D = traceRawTex;
      if (this._useTemporal) {
        const dstSSRRT = history.ssrPingPongRT[currIdx]!;
        const dstSSRTex = history.ssrPingPongTex[currIdx]!;
        this._clearDirtyUnion(
          context,
          dstSSRRT,
          history.ssrSlotDirtyRect[currIdx],
          null,
          sx0,
          sy0,
          sx1,
          sy1,
          0,
          traceW,
          traceH
        );
        if (state === SSRRuntimeState.FirstTrace) {
          this._copyTextureToRT(traceRawTex, dstSSRRT, 0, 0, undefined, scissorArg, false);
          if (this._useHardwareStencil) {
            rhi.invalidateRenderTarget?.(dstSSRRT, CameraClearFlags.DepthStencil);
          }
          history.hasTemporalHistory = true;
        } else {
          const useHighVirtual = this._useHighVirtual;
          try {
            ScreenSpaceReflectionPass._setMacro(
              materialData._macroCollection,
              ScreenSpaceReflectionPass._highVirtualReprojMacro,
              useHighVirtual
            );
            ScreenSpaceReflectionPass._setMacro(
              materialData._macroCollection,
              ScreenSpaceReflectionPass._temporal5TapMacro,
              !useHighVirtual
            );
            materialData.setTexture(ScreenSpaceReflectionPass._matTraceRawProp, traceRawTex);
            materialData.setTexture(ScreenSpaceReflectionPass._matPrevSSRProp, history.ssrPingPongTex[prevIdx]!);
            materialData.setTexture(ScreenSpaceReflectionPass._matPrevRecvDepthProp, history.recvDepthTex[prevIdx]!);
            materialData.setFloat(ScreenSpaceReflectionPass._matTemporalBlendProp, settings.temporalBlend);

            if (useHighVirtual) {
              materialData.setTexture(ScreenSpaceReflectionPass._matHitDistProp, this._hitDistTex!);
              materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, currRecvNR);
              materialData.setTexture(
                ScreenSpaceReflectionPass._matPrevNormalRoughnessProp,
                history.recvNRTex[prevIdx]!
              );
            }

            Blitter.blitTexture(
              engine,
              traceRawTex,
              dstSSRRT,
              0,
              PipelineUtils.defaultViewport,
              material,
              PASS_TEMPORAL_RESOLVE,
              undefined,
              0,
              false,
              scissorArg
            );
            if (this._useHardwareStencil) {
              rhi.invalidateRenderTarget?.(dstSSRRT, CameraClearFlags.DepthStencil);
            }
          } finally {
            materialData.setTexture(ScreenSpaceReflectionPass._matTraceRawProp, null);
            materialData.setTexture(ScreenSpaceReflectionPass._matPrevSSRProp, null);
            materialData.setTexture(ScreenSpaceReflectionPass._matPrevRecvDepthProp, null);
            materialData.setTexture(ScreenSpaceReflectionPass._matHitDistProp, null);
            materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, null);
            materialData.setTexture(ScreenSpaceReflectionPass._matPrevNormalRoughnessProp, null);
            ScreenSpaceReflectionPass._setMacro(
              materialData._macroCollection,
              ScreenSpaceReflectionPass._highVirtualReprojMacro,
              false
            );
            ScreenSpaceReflectionPass._setMacro(
              materialData._macroCollection,
              ScreenSpaceReflectionPass._temporal5TapMacro,
              false
            );
          }
        }
        finalSSRTex = dstSSRTex;
      }

      if (!isFullScreenScissor) {
        rhi.scissor(0, 0, traceW, traceH);
      }

      materialData.setTexture(ScreenSpaceReflectionPass._matReceiverDepthProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matPrevColorPyramidProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matPrevTraceDepthProp, null);

      // Step I: Bind Forward sampling inputs & activate SSR shader program resolver
      const needsRecvDepthInForward = this._useBilateral || this._transparentReceiverCount > 0;
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRTextureProp, finalSSRTex);
      cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRTraceTexelSizeProp, this._traceTexelSize);
      cameraData.setTexture(
        ScreenSpaceReflectionPass._cameraSSRRecvDepthProp,
        needsRecvDepthInForward ? currRecvDepth : null
      );
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRRecvNRProp, this._useBilateral ? currRecvNR : null);

      this._programResolver.configureForward(
        this._activeMaxRoughness,
        this._useBilateral,
        this._transparentReceiverCount > 0,
        this._usesPackedDepthRG8,
        this._usesPackedNormalOct8,
        this._usesPackedHDRReinhard
      );
      context.programResolver = this._programResolver;

      history.hasHiZHistory = true;
      history.hiZPingPongIndex = prevHiZIdx;

      this._updateDiagnostics(true);
    } catch (error) {
      this._handleFailure(camera, "renderPreForward", error, context);
    } finally {
      this.releaseFrameTargets();
    }
  }

  /**
   * Capture prefiltered & blurred linear color pyramid after the single post-transparent resolve.
   */
  captureHistory(
    context: RenderContext,
    resolvedColorTarget: RenderTarget | null,
    sourceViewport: Vector4 = PipelineUtils.defaultViewport
  ): void {
    const state = this._state;
    if (
      state === SSRRuntimeState.Disabled ||
      state === SSRRuntimeState.Skipped ||
      state === SSRRuntimeState.ContextLost
    ) {
      return;
    }

    const srcColorTex = resolvedColorTarget?.getColorTexture(0) as Texture2D | null;
    if (!srcColorTex) {
      this._history.invalidateAll();
      return;
    }

    const { engine } = this;
    const { camera } = context;
    const pool = engine._renderTargetPool;
    const history = this._history;
    const colorW = this._colorWidth;
    const colorH = this._colorHeight;
    const colorFormat = this._colorPyramidFormat;
    const colorSRGB = this._colorPyramidSRGB;
    const prevColorPyramidRT = history.prevColorPyramidRT!;
    const prevColorPyramidTex = history.prevColorPyramidTex!;

    try {
      const materialData = this._material.shaderData;
      const maxColorMip = Math.min(
        this._maxColorPyramidMipCap,
        Math.floor(Math.log2(Math.max(1, Math.min(colorW, colorH))))
      );
      this._lastMaxColorMip = maxColorMip;

      // Render mip 0 directly into prevColorPyramidRT mip 0 (zero scratch0 allocation or mip 0 copy)
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._colorPyramidFullResMacro,
        this._isFullResColorPyramid
      );
      this._destTexelSize.set(1 / colorW, 1 / colorH, colorW, colorH);
      materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
      this._sourceScaleOffset.set(sourceViewport.z, sourceViewport.w, sourceViewport.x, sourceViewport.y);
      Blitter.blitTexture(
        engine,
        srcColorTex,
        prevColorPyramidRT,
        0,
        PipelineUtils.defaultViewport,
        this._material,
        PASS_COLOR_PYRAMID_PREFILTER,
        this._sourceScaleOffset,
        0,
        true
      );
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._colorPyramidFullResMacro,
        false
      );

      if (maxColorMip >= 1) {
        if (this._canUseHardwareColorPyramidMipmaps(prevColorPyramidTex)) {
          prevColorPyramidTex.generateMipmaps();
          this._lastColorScratchBytes = 0;
        } else {
          const mip1W = Math.max(1, colorW >> 1);
          const mip1H = Math.max(1, colorH >> 1);
          const colorScratchRT = pool.allocateRenderTarget(
            mip1W,
            mip1H,
            colorFormat,
            null,
            false,
            false,
            colorSRGB,
            1,
            TextureWrapMode.Clamp,
            TextureFilterMode.Bilinear
          );
          colorScratchRT.autoGenerateMipmaps = false;
          this._colorScratchRTs.push(colorScratchRT);
          const colorScratchTex = colorScratchRT.getColorTexture(0) as Texture2D;
          this._lastColorScratchBytes = colorScratchTex._memorySize;

          for (let m = 1; m <= maxColorMip; m++) {
            const srcW = Math.max(1, colorW >> (m - 1));
            const srcH = Math.max(1, colorH >> (m - 1));
            const dstW = Math.max(1, colorW >> m);
            const dstH = Math.max(1, colorH >> m);
            const vpW = dstW === mip1W ? 1 : Math.min(1, (dstW + 0.001) / mip1W);
            const vpH = dstH === mip1H ? 1 : Math.min(1, (dstH + 0.001) / mip1H);
            this._subViewport.set(0, 0, vpW, vpH);

            this._sourceTexelSize.set(1 / srcW, 1 / srcH, srcW, srcH);
            materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
            ScreenSpaceReflectionPass._setMacro(
              materialData._macroCollection,
              ScreenSpaceReflectionPass._colorPyramidKarisDownsampleMacro,
              this._isFullResColorPyramid && m === 1
            );
            Blitter.blitTexture(
              engine,
              prevColorPyramidTex,
              colorScratchRT,
              m - 1,
              this._subViewport,
              this._material,
              PASS_COLOR_PYRAMID_DOWNSAMPLE,
              undefined,
              0,
              true
            );

            this._copyScaleOffset.set(dstW / mip1W, dstH / mip1H, 0, 0);
            this._copyTextureToRT(colorScratchTex, prevColorPyramidRT, m, 0, this._copyScaleOffset, undefined, true);
          }

          ScreenSpaceReflectionPass._setMacro(
            materialData._macroCollection,
            ScreenSpaceReflectionPass._colorPyramidKarisDownsampleMacro,
            false
          );
          this._popAndFreeScratch(this._colorScratchRTs, colorScratchRT);
        }
      } else {
        this._lastColorScratchBytes = 0;
      }

      history.prevVPMat.copyFrom(this._currentVPMat);
      history.prevInvProjMat.copyFrom(this._invProjMat);
      history.prevInvViewMat.copyFrom(this._invViewMat);
      history.prevViewZRow.copyFrom(this._currentViewZRow);
      history.hasColorHistory = true;
      history.lastFrameCount = engine.time.frameCount;
      history.lastTraceWidth = this._traceWidth;
      history.lastTraceHeight = this._traceHeight;
      history.lastColorWidth = colorW;
      history.lastColorHeight = colorH;
      history.lastIsOrthographic = camera.isOrthographic;
      history.lastFarClip = camera.farClipPlane;
      history.lastQuality = this._effectiveSettings.quality;
      history.lastIsHDR = camera.enableHDR;
      history.lastAliasRecvNR = this._aliasRecvNRToPingPong;
      history.lastUsesPackedDepth = this._usesPackedDepthRG8;
      history.lastUsesPackedNormal = this._usesPackedNormalOct8;
      history.lastUsesPackedHDR = this._usesPackedHDRReinhard;
      history.lastUseHardwareStencil = this._useHardwareStencil;
      history.lastUseHighVirtual = this._useHighVirtual;
      history.lastUseLinearTrace = this._useLinearTrace;

      if (this._useTemporal && (state === SSRRuntimeState.FirstTrace || state === SSRRuntimeState.ActiveSteady)) {
        history.temporalPingPongIndex = history.temporalPingPongIndex === 0 ? 1 : 0;
      }
    } catch (error) {
      this._handleFailure(camera, "captureHistory", error, context);
    } finally {
      this.releaseFrameTargets();
    }
  }

  /**
   * Release any per-frame transient RenderTargets back to `RenderTargetPool`.
   */
  releaseFrameTargets(): void {
    this._receiverElements.length = 0;
    const pool = this.engine._renderTargetPool;
    for (let i = this._hiZScratchRTs.length - 1; i >= 0; i--) {
      pool.freeRenderTarget(this._hiZScratchRTs[i]);
    }
    this._hiZScratchRTs.length = 0;

    for (let i = this._colorScratchRTs.length - 1; i >= 0; i--) {
      pool.freeRenderTarget(this._colorScratchRTs[i]);
    }
    this._colorScratchRTs.length = 0;
  }

  notifyCut(): void {
    this._cutRequested = true;
    this._history.invalidateAll();
  }

  getDiagnostics(): Readonly<SSRDiagnostics> {
    return this._diagnostics;
  }

  /**
   * Required abstract override (execution uses `renderPreForward` and `captureHistory`).
   */
  override onRender(): void {}

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this.engine.off(EngineEventType.DeviceLost, this._onDeviceLostHandler);
    this.engine.off(EngineEventType.DeviceRestored, this._onDeviceRestoredHandler);
    this.releaseFrameTargets();
    if (this._boundCamera?.shaderData) {
      this._clearCameraSSREnable(this._boundCamera);
    }
    this._boundCamera = null;
    this._resetTemporaryBindings();
    this._releasePersistentResources();
    this._state = SSRRuntimeState.Disabled;
    this._opaqueReceiverCount = 0;
    this._transparentReceiverCount = 0;
    this._contribDepthCount = 0;
    this._updateDiagnostics(false);
    if (!this._material.destroyed) {
      this._material._addReferCount(-1);
      this._material.destroy();
    }
  }

  private _detectCapabilities(
    rhi: IHardwareRenderer,
    isHDR: boolean = false,
    highPrecisionNormals: boolean = false
  ): void {
    const cap = rhi.capability;
    if (cap.maxDrawBuffers < 2) {
      this._unsupportedReason = "MRT (< 2 draw buffers) unsupported";
      this._usesPackedDepthRG8 = true;
      this._usesPackedNormalOct8 = true;
      this._usesPackedHDRReinhard = false;
      return;
    }

    this._unsupportedReason = null;

    if (!this._forcePackedFormats && rhi.supportsRenderTargetColorFormat(TextureFormat.R16_SFloat)) {
      this._depthColorFormat = TextureFormat.R16_SFloat;
      this._usesPackedDepthRG8 = false;
    } else if (rhi.supportsRenderTargetColorFormat(TextureFormat.R8G8_UNorm)) {
      this._depthColorFormat = TextureFormat.R8G8_UNorm;
      this._usesPackedDepthRG8 = true;
    } else {
      this._depthColorFormat = TextureFormat.R8G8B8A8_UNorm;
      this._usesPackedDepthRG8 = true;
    }

    // Low / Medium keep compact 4B/px RGBA8 + Oct8 + reversible Reinhard HDR (halving bandwidth while keeping aliasing),
    // while High / VeryHigh retain full RGBA16F precision unless forced to packed fallback.
    if (
      highPrecisionNormals &&
      !this._forcePackedFormats &&
      rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16_SFloat)
    ) {
      this._normalRoughnessFormat = TextureFormat.R16G16B16A16_SFloat;
      this._usesPackedNormalOct8 = false;
    } else {
      this._normalRoughnessFormat = TextureFormat.R8G8B8A8_UNorm;
      this._usesPackedNormalOct8 = true;
    }

    if (
      isHDR &&
      highPrecisionNormals &&
      !this._forcePackedFormats &&
      rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16_SFloat)
    ) {
      this._ssrColorFormat = TextureFormat.R16G16B16A16_SFloat;
      this._usesPackedHDRReinhard = false;
    } else {
      this._ssrColorFormat = TextureFormat.R8G8B8A8_UNorm;
      this._usesPackedHDRReinhard = isHDR;
    }

    if (rhi.supportsRenderTargetColorFormat(TextureFormat.R11G11B10_UFloat)) {
      this._colorPyramidFormat = TextureFormat.R11G11B10_UFloat;
      this._colorPyramidSRGB = false;
    } else if (rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16_SFloat)) {
      this._colorPyramidFormat = TextureFormat.R16G16B16A16_SFloat;
      this._colorPyramidSRGB = false;
    } else {
      this._colorPyramidFormat = TextureFormat.R8G8B8A8_UNorm;
      this._colorPyramidSRGB = true;
    }
  }

  private _canUseInPlaceHiZ(hiZTex: Texture2D): boolean {
    if (this._forceHiZScratch) {
      return false;
    }
    return hiZTex._supportsMipLevelRange();
  }

  private _canUseHardwareColorPyramidMipmaps(texture: Texture2D): boolean {
    if (this._forceSoftwareColorPyramidMipmaps || this._isFullResColorPyramid) {
      return false;
    }
    if (!texture._mipmap || (texture.width === 1 && texture.height === 1)) {
      return false;
    }
    return this.engine._hardwareRenderer.supportsGenerateMipmaps(texture.format, texture.isSRGBColorSpace);
  }

  private _ensurePersistentResources(
    camera: Camera,
    traceW: number,
    traceH: number,
    colorW: number,
    colorH: number,
    useTemporal: boolean,
    useHighVirtual: boolean,
    useHardwareStencil: boolean,
    aliasRecvNR: boolean
  ): void {
    const { engine, _history: history } = this;

    // On resolution resize (e.g. mobile rotation), synchronously release all old trace-res resources
    // before allocating new ones so peak VRAM stays at 1x instead of transiently doubling to 2x.
    if (this._ssrDepthTex && (this._ssrDepthTex.width !== traceW || this._ssrDepthTex.height !== traceH)) {
      this._clearCameraSSREnable(camera);
      this._resetTemporaryBindings();
      this._destroyHiZDepthMip0RTs();
      history.hiZColorRT[0] = ScreenSpaceReflectionPass._destroyResource(history.hiZColorRT[0]);
      history.hiZColorRT[1] = ScreenSpaceReflectionPass._destroyResource(history.hiZColorRT[1]);
      history.hiZTex[0] = ScreenSpaceReflectionPass._destroyResource(history.hiZTex[0]);
      history.hiZTex[1] = ScreenSpaceReflectionPass._destroyResource(history.hiZTex[1]);
      this._destroyReceiverSlot(0);
      this._destroyReceiverSlot(1);
      this._traceOutRT = ScreenSpaceReflectionPass._destroyResource(this._traceOutRT);
      this._traceRawTex = ScreenSpaceReflectionPass._destroyResource(this._traceRawTex);
      this._hitDistTex = ScreenSpaceReflectionPass._destroyResource(this._hitDistTex);
      this._releaseTemporalBuffers();
      this._ssrDepthRT = ScreenSpaceReflectionPass._destroyResource(this._ssrDepthRT);
      this._ssrDepthTex = ScreenSpaceReflectionPass._destroyResource(this._ssrDepthTex);
      history.markAllDirty(traceW, traceH);
      this._traceDirtyRect[0] = 0;
      this._traceDirtyRect[1] = 0;
      this._traceDirtyRect[2] = traceW;
      this._traceDirtyRect[3] = traceH;
    }

    // 1. Cross-frame prevColorPyramid (half-res)
    if (
      !history.prevColorPyramidRT ||
      !history.prevColorPyramidTex ||
      history.prevColorPyramidTex.width !== colorW ||
      history.prevColorPyramidTex.height !== colorH ||
      history.prevColorPyramidTex.format !== this._colorPyramidFormat ||
      history.prevColorPyramidTex.isSRGBColorSpace !== this._colorPyramidSRGB
    ) {
      history.prevColorPyramidRT = ScreenSpaceReflectionPass._destroyResource(history.prevColorPyramidRT);
      history.prevColorPyramidTex = ScreenSpaceReflectionPass._destroyResource(history.prevColorPyramidTex);

      const needMipmap = Math.max(colorW, colorH) > 1;
      const tex = new Texture2D(engine, colorW, colorH, this._colorPyramidFormat, needMipmap, this._colorPyramidSRGB);
      tex.filterMode = TextureFilterMode.Trilinear;
      tex.wrapModeU = TextureWrapMode.Clamp;
      tex.wrapModeV = TextureWrapMode.Clamp;
      tex.isGCIgnored = true;
      let rt: RenderTarget;
      try {
        rt = new RenderTarget(engine, colorW, colorH, tex, null, 1);
      } catch (error) {
        ScreenSpaceReflectionPass._destroyResource(tex);
        throw error;
      }
      rt.autoGenerateMipmaps = false;
      rt.isGCIgnored = true;
      history.prevColorPyramidTex = tex;
      history.prevColorPyramidRT = rt;
      history.invalidateAll();
    }

    // 2. Shared Depth24Stencil8 at trace resolution
    if (
      !this._ssrDepthRT ||
      !this._ssrDepthTex ||
      this._ssrDepthTex.width !== traceW ||
      this._ssrDepthTex.height !== traceH
    ) {
      // Unbind camera references and destroy FBO wrappers before destroying _ssrDepthTex.
      this._clearCameraSSREnable(camera);
      this._destroyHiZDepthMip0RTs();
      this._destroyReceiverSlot(0);
      this._destroyReceiverSlot(1);
      this._traceOutRT = ScreenSpaceReflectionPass._destroyResource(this._traceOutRT);
      history.ssrPingPongRT[0] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongRT[0]);
      history.ssrPingPongRT[1] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongRT[1]);
      this._ssrDepthRT = ScreenSpaceReflectionPass._destroyResource(this._ssrDepthRT);
      this._ssrDepthTex = ScreenSpaceReflectionPass._destroyResource(this._ssrDepthTex);

      const depthTex = new Texture2D(engine, traceW, traceH, TextureFormat.Depth24Stencil8, false, false);
      depthTex.filterMode = TextureFilterMode.Point;
      depthTex.wrapModeU = TextureWrapMode.Clamp;
      depthTex.wrapModeV = TextureWrapMode.Clamp;
      depthTex.isGCIgnored = true;
      let depthRT: RenderTarget;
      try {
        depthRT = new RenderTarget(engine, traceW, traceH, null, depthTex, 1);
      } catch (error) {
        ScreenSpaceReflectionPass._destroyResource(depthTex);
        throw error;
      }
      depthRT.autoGenerateMipmaps = false;
      depthRT.isGCIgnored = true;
      this._ssrDepthTex = depthTex;
      this._ssrDepthRT = depthRT;
    }

    // 3. Persistent ping-pong Hi-Z pyramid textures & color-only FBO wrappers
    const needHiZMipmap = !this._useLinearTrace && Math.max(traceW, traceH) > 1;
    for (let i = 0; i < 2; i++) {
      const curTex = history.hiZTex[i];
      const curColorRT = history.hiZColorRT[i];
      const curMip0RT = history.hiZDepthMip0RT[i];
      const texMismatch =
        !curTex ||
        curTex.destroyed ||
        curTex.width !== traceW ||
        curTex.height !== traceH ||
        curTex.format !== this._depthColorFormat ||
        curTex.mipmapCount > 1 !== needHiZMipmap;
      const colorRTMismatch = !curColorRT || curColorRT.destroyed || curColorRT.getColorTexture(0) !== curTex;
      const mip0RTMismatch =
        !!curMip0RT &&
        (curMip0RT.destroyed ||
          curMip0RT.getColorTexture(0) !== curTex ||
          curMip0RT.depthTexture !== this._ssrDepthTex);

      if (mip0RTMismatch) {
        history.hiZDepthMip0RT[i] = ScreenSpaceReflectionPass._destroyResource(history.hiZDepthMip0RT[i]);
      }

      if (texMismatch || colorRTMismatch) {
        // Destroy paired FBO wrappers before destroying or replacing hiZTex[i].
        history.hiZDepthMip0RT[i] = ScreenSpaceReflectionPass._destroyResource(history.hiZDepthMip0RT[i]);
        history.hiZColorRT[i] = ScreenSpaceReflectionPass._destroyResource(history.hiZColorRT[i]);
        let nextTex: Texture2D;
        let allocatedTex = false;
        if (texMismatch) {
          history.hiZTex[i] = ScreenSpaceReflectionPass._destroyResource(history.hiZTex[i]);
          nextTex = new Texture2D(engine, traceW, traceH, this._depthColorFormat, needHiZMipmap, false);
          nextTex.filterMode = TextureFilterMode.Point;
          nextTex.wrapModeU = TextureWrapMode.Clamp;
          nextTex.wrapModeV = TextureWrapMode.Clamp;
          nextTex.isGCIgnored = true;
          allocatedTex = true;
        } else {
          nextTex = history.hiZTex[i]!;
        }

        let colorRT: RenderTarget;
        try {
          colorRT = new RenderTarget(engine, traceW, traceH, nextTex, null, 1);
        } catch (error) {
          if (allocatedTex) {
            ScreenSpaceReflectionPass._destroyResource(nextTex);
          }
          throw error;
        }
        colorRT.autoGenerateMipmaps = false;
        colorRT.isGCIgnored = true;
        history.hiZTex[i] = nextTex;
        history.hiZColorRT[i] = colorRT;
        history.hasHiZHistory = false;
      }
    }

    // 4. Temporal Ping-Pong RTs (Medium/High only; created before Receiver slots when aliasing recvNR)
    if (useTemporal) {
      for (let i = 0; i < 2; i++) {
        const curTex = history.ssrPingPongTex[i];
        const curRT = history.ssrPingPongRT[i];
        const texMismatch =
          !curTex || curTex.width !== traceW || curTex.height !== traceH || curTex.format !== this._ssrColorFormat;
        const stencilMismatch =
          !curRT || (useHardwareStencil ? curRT.depthTexture !== this._ssrDepthTex : curRT.depthTexture !== null);

        if (texMismatch || stencilMismatch) {
          this._clearCameraSSREnable(camera);
          if (this._receiverRTs[i]?.colorTextures.includes(curTex!)) {
            this._receiverRTs[i] = ScreenSpaceReflectionPass._destroyResource(this._receiverRTs[i]);
          }
          history.ssrPingPongRT[i] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongRT[i]);
          let nextTex: Texture2D;
          let allocatedTex = false;
          if (texMismatch) {
            history.ssrPingPongTex[i] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongTex[i]);
            nextTex = new Texture2D(engine, traceW, traceH, this._ssrColorFormat, false, false);
            nextTex.filterMode = TextureFilterMode.Bilinear;
            nextTex.wrapModeU = TextureWrapMode.Clamp;
            nextTex.wrapModeV = TextureWrapMode.Clamp;
            nextTex.isGCIgnored = true;
            allocatedTex = true;
          } else {
            nextTex = history.ssrPingPongTex[i]!;
          }

          let rt: RenderTarget;
          try {
            rt = new RenderTarget(engine, traceW, traceH, nextTex, useHardwareStencil ? this._ssrDepthTex : null, 1);
          } catch (error) {
            if (allocatedTex) {
              ScreenSpaceReflectionPass._destroyResource(nextTex);
            }
            throw error;
          }
          rt.autoGenerateMipmaps = false;
          rt.isGCIgnored = true;
          history.ssrPingPongTex[i] = nextTex;
          if (allocatedTex) {
            history.hasTemporalHistory = false;
          }
          history.ssrPingPongRT[i] = rt;
          const sr = history.ssrSlotDirtyRect[i];
          sr[0] = 0;
          sr[1] = 0;
          sr[2] = traceW;
          sr[3] = traceH;
        }
      }
    }

    // 5. Receiver MRTs (slot 0 always active; slot 1 only when temporal enabled)
    this._ensureReceiverSlot(camera, 0, traceW, traceH, aliasRecvNR);
    if (useTemporal) {
      this._ensureReceiverSlot(camera, 1, traceW, traceH, aliasRecvNR);
    }

    // 6. Trace raw output & optional High hitDist MRT
    const traceSizeMismatch =
      !this._traceRawTex ||
      this._traceRawTex.width !== traceW ||
      this._traceRawTex.height !== traceH ||
      this._traceRawTex.format !== this._ssrColorFormat;
    const hitDistNeededMismatch = useHighVirtual
      ? !this._hitDistTex || this._hitDistTex.format !== this._depthColorFormat || traceSizeMismatch
      : !!this._hitDistTex;
    const stencilAttachMismatch =
      !!this._traceOutRT &&
      (useHardwareStencil
        ? this._traceOutRT.depthTexture !== this._ssrDepthTex
        : this._traceOutRT.depthTexture !== null);

    if (traceSizeMismatch || hitDistNeededMismatch || stencilAttachMismatch || !this._traceOutRT) {
      this._clearCameraSSREnable(camera);
      this._traceOutRT = ScreenSpaceReflectionPass._destroyResource(this._traceOutRT);
      let nextTraceTex = this._traceRawTex;
      let allocatedTraceTex = false;
      let nextHitDistTex = this._hitDistTex;
      let allocatedHitDistTex = false;

      try {
        if (traceSizeMismatch) {
          this._traceRawTex = ScreenSpaceReflectionPass._destroyResource(this._traceRawTex);
          nextTraceTex = new Texture2D(engine, traceW, traceH, this._ssrColorFormat, false, false);
          nextTraceTex.filterMode = TextureFilterMode.Bilinear;
          nextTraceTex.wrapModeU = TextureWrapMode.Clamp;
          nextTraceTex.wrapModeV = TextureWrapMode.Clamp;
          nextTraceTex.isGCIgnored = true;
          allocatedTraceTex = true;
        }

        if (useHighVirtual) {
          if (hitDistNeededMismatch) {
            this._hitDistTex = ScreenSpaceReflectionPass._destroyResource(this._hitDistTex);
            nextHitDistTex = this._createPointClampTex(traceW, traceH, this._depthColorFormat);
            allocatedHitDistTex = true;
          }
        } else {
          this._hitDistTex = ScreenSpaceReflectionPass._destroyResource(this._hitDistTex);
          nextHitDistTex = null;
        }

        const colorAttachments = useHighVirtual ? [nextTraceTex!, nextHitDistTex!] : [nextTraceTex!];
        const traceOutRT = new RenderTarget(
          engine,
          traceW,
          traceH,
          colorAttachments,
          useHardwareStencil ? this._ssrDepthTex : null,
          1
        );
        traceOutRT.autoGenerateMipmaps = false;
        traceOutRT.isGCIgnored = true;
        this._traceRawTex = nextTraceTex;
        this._hitDistTex = nextHitDistTex;
        this._traceOutRT = traceOutRT;
        this._traceDirtyRect[0] = 0;
        this._traceDirtyRect[1] = 0;
        this._traceDirtyRect[2] = traceW;
        this._traceDirtyRect[3] = traceH;
      } catch (error) {
        if (allocatedTraceTex) ScreenSpaceReflectionPass._destroyResource(nextTraceTex);
        if (allocatedHitDistTex) ScreenSpaceReflectionPass._destroyResource(nextHitDistTex);
        throw error;
      }
    }
  }

  private _ensureReceiverSlot(camera: Camera, slot: 0 | 1, traceW: number, traceH: number, aliasRecvNR: boolean): void {
    const history = this._history;
    const dTex = history.recvDepthTex[slot];
    const rt = this._receiverRTs[slot];
    const targetNRTex = aliasRecvNR ? history.ssrPingPongTex[slot] : history.recvNRTex[slot];

    const nrChanged = aliasRecvNR
      ? !!history.recvNRTex[slot] || rt?.getColorTexture(0) !== targetNRTex
      : !targetNRTex ||
        targetNRTex.width !== traceW ||
        targetNRTex.height !== traceH ||
        targetNRTex.format !== this._normalRoughnessFormat;
    const dChanged = !dTex || dTex.width !== traceW || dTex.height !== traceH || dTex.format !== this._depthColorFormat;
    const rtInvalid = !rt || rt.depthTexture !== this._ssrDepthTex || rt.getColorTexture(0) !== targetNRTex;

    if (!nrChanged && !dChanged && !rtInvalid) {
      return;
    }

    this._clearCameraSSREnable(camera);
    this._receiverRTs[slot] = ScreenSpaceReflectionPass._destroyResource(this._receiverRTs[slot]);

    let nextNRTex = history.recvNRTex[slot];
    let allocatedNR = false;
    let nextDepthTex = history.recvDepthTex[slot];
    let allocatedDepth = false;

    try {
      if (aliasRecvNR) {
        history.recvNRTex[slot] = ScreenSpaceReflectionPass._destroyResource(history.recvNRTex[slot]);
        nextNRTex = null;
      } else if (nrChanged) {
        history.recvNRTex[slot] = ScreenSpaceReflectionPass._destroyResource(history.recvNRTex[slot]);
        nextNRTex = this._createPointClampTex(traceW, traceH, this._normalRoughnessFormat);
        allocatedNR = true;
      }

      if (dChanged) {
        history.recvDepthTex[slot] = ScreenSpaceReflectionPass._destroyResource(history.recvDepthTex[slot]);
        nextDepthTex = this._createPointClampTex(traceW, traceH, this._depthColorFormat);
        allocatedDepth = true;
      }

      const nrAttachment = aliasRecvNR ? history.ssrPingPongTex[slot]! : nextNRTex!;
      const newRT = new RenderTarget(this.engine, traceW, traceH, [nrAttachment, nextDepthTex!], this._ssrDepthTex, 1);
      newRT.autoGenerateMipmaps = false;
      newRT.isGCIgnored = true;
      history.recvNRTex[slot] = nextNRTex;
      history.recvDepthTex[slot] = nextDepthTex;
      this._receiverRTs[slot] = newRT;
      const rr = history.recvSlotDirtyRect[slot];
      rr[0] = 0;
      rr[1] = 0;
      rr[2] = traceW;
      rr[3] = traceH;
    } catch (error) {
      if (allocatedNR) ScreenSpaceReflectionPass._destroyResource(nextNRTex);
      if (allocatedDepth) ScreenSpaceReflectionPass._destroyResource(nextDepthTex);
      throw error;
    }
  }

  private _destroyReceiverSlot(slot: 0 | 1): void {
    this._receiverRTs[slot] = ScreenSpaceReflectionPass._destroyResource(this._receiverRTs[slot]);
    this._history.recvNRTex[slot] = ScreenSpaceReflectionPass._destroyResource(this._history.recvNRTex[slot]);
    this._history.recvDepthTex[slot] = ScreenSpaceReflectionPass._destroyResource(this._history.recvDepthTex[slot]);
    this._history.recvSlotDirtyRect[slot].fill(0);
  }

  private _destroyHiZDepthMip0RTs(): void {
    this._history.hiZDepthMip0RT[0] = ScreenSpaceReflectionPass._destroyResource(this._history.hiZDepthMip0RT[0]);
    this._history.hiZDepthMip0RT[1] = ScreenSpaceReflectionPass._destroyResource(this._history.hiZDepthMip0RT[1]);
  }

  private _ensureHiZDepthMip0RT(slot: 0 | 1, hiZTex: Texture2D, depthTex: Texture2D): RenderTarget {
    const history = this._history;
    const existing = history.hiZDepthMip0RT[slot];
    if (
      existing &&
      !existing.destroyed &&
      existing.getColorTexture(0) === hiZTex &&
      existing.depthTexture === depthTex &&
      !hiZTex.destroyed &&
      !depthTex.destroyed
    ) {
      return existing;
    }
    history.hiZDepthMip0RT[slot] = ScreenSpaceReflectionPass._destroyResource(existing);
    const rt = new RenderTarget(this.engine, hiZTex.width, hiZTex.height, hiZTex, depthTex, 1);
    rt.autoGenerateMipmaps = false;
    rt.isGCIgnored = true;
    history.hiZDepthMip0RT[slot] = rt;
    return rt;
  }

  private _runDownsampleAndBuildHiZMip0(
    context: RenderContext,
    fullDepthTex: Texture2D,
    contribDepthTex: Texture2D | null,
    hiZSlot: 0 | 1,
    hiZTex: Texture2D
  ): void {
    const engine = this.engine;
    const rhi = engine._hardwareRenderer;
    const material = this._material;
    const materialData = material.shaderData;
    const hiZDepthMip0RT = this._ensureHiZDepthMip0RT(hiZSlot, hiZTex, this._ssrDepthTex!);
    const downsampleFull = fullDepthTex.width !== hiZTex.width || fullDepthTex.height !== hiZTex.height;

    try {
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._downsampleFullDepthMacro,
        downsampleFull
      );
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._hasContribDepthMacro,
        !!contribDepthTex
      );

      if (downsampleFull) {
        this._sourceTexelSize.set(
          1 / fullDepthTex.width,
          1 / fullDepthTex.height,
          fullDepthTex.width,
          fullDepthTex.height
        );
        this._destTexelSize.set(1 / hiZTex.width, 1 / hiZTex.height, hiZTex.width, hiZTex.height);
        materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
        materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
      }
      if (contribDepthTex) {
        materialData.setTexture(ScreenSpaceReflectionPass._matContribDepthProp, contribDepthTex);
      }

      context.setRenderTarget(hiZDepthMip0RT, PipelineUtils.defaultViewport, 0);
      // Full-RT non-scissored clear maps to TBDR MTLLoadActionClear (avoids ANGLE-Metal Color invalidate replaceRegion).
      rhi.clearRenderTarget(engine, CameraClearFlags.All, this._clearZero);
      Blitter.blitTexture(
        engine,
        fullDepthTex,
        hiZDepthMip0RT,
        0,
        PipelineUtils.defaultViewport,
        material,
        PASS_DOWNSAMPLE_AND_BUILD_HIZ_MIP0,
        undefined,
        0,
        false
      );
    } finally {
      materialData.setTexture(ScreenSpaceReflectionPass._matContribDepthProp, null);
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._downsampleFullDepthMacro,
        false
      );
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._hasContribDepthMacro,
        false
      );
    }
  }

  private _runBuildHiZMip0(
    fullDepthTex: Texture2D | null,
    contribDepthTex: Texture2D | null,
    destRT: RenderTarget
  ): void {
    const material = this._material;
    const materialData = material.shaderData;
    const opaqueTex = fullDepthTex ?? this._ssrDepthTex!;
    const downsampleFull =
      !!fullDepthTex && (fullDepthTex.width !== destRT.width || fullDepthTex.height !== destRT.height);

    try {
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._downsampleFullDepthMacro,
        downsampleFull
      );
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._hasContribDepthMacro,
        !!contribDepthTex
      );

      if (downsampleFull && fullDepthTex) {
        this._sourceTexelSize.set(
          1 / fullDepthTex.width,
          1 / fullDepthTex.height,
          fullDepthTex.width,
          fullDepthTex.height
        );
        this._destTexelSize.set(1 / destRT.width, 1 / destRT.height, destRT.width, destRT.height);
        materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
        materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
      }
      if (contribDepthTex) {
        materialData.setTexture(ScreenSpaceReflectionPass._matContribDepthProp, contribDepthTex);
      }

      Blitter.blitTexture(
        this.engine,
        opaqueTex,
        destRT,
        0,
        PipelineUtils.defaultViewport,
        material,
        PASS_BUILD_HIZ_MIP0,
        undefined,
        0,
        true
      );
    } finally {
      materialData.setTexture(ScreenSpaceReflectionPass._matContribDepthProp, null);
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._downsampleFullDepthMacro,
        false
      );
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._hasContribDepthMacro,
        false
      );
    }
  }

  private _clearDirtyUnion(
    context: RenderContext,
    targetRT: RenderTarget,
    prevDirty: Int32Array,
    extraPrevDirty: Int32Array | null,
    sx0: number,
    sy0: number,
    sx1: number,
    sy1: number,
    pad: number,
    traceW: number,
    traceH: number
  ): boolean {
    const hasNew = sx1 > sx0 && sy1 > sy0;
    const nx0 = hasNew ? Math.max(0, sx0 - pad) : 0;
    const ny0 = hasNew ? Math.max(0, sy0 - pad) : 0;
    const nx1 = hasNew ? Math.min(traceW, sx1 + pad) : 0;
    const ny1 = hasNew ? Math.min(traceH, sy1 + pad) : 0;

    let ux0 = hasNew ? nx0 : traceW;
    let uy0 = hasNew ? ny0 : traceH;
    let ux1 = hasNew ? nx1 : 0;
    let uy1 = hasNew ? ny1 : 0;

    if (prevDirty[2] > prevDirty[0] && prevDirty[3] > prevDirty[1]) {
      if (prevDirty[0] < ux0) ux0 = prevDirty[0];
      if (prevDirty[1] < uy0) uy0 = prevDirty[1];
      if (prevDirty[2] > ux1) ux1 = prevDirty[2];
      if (prevDirty[3] > uy1) uy1 = prevDirty[3];
    }

    if (extraPrevDirty && extraPrevDirty[2] > extraPrevDirty[0] && extraPrevDirty[3] > extraPrevDirty[1]) {
      if (extraPrevDirty[0] < ux0) ux0 = extraPrevDirty[0];
      if (extraPrevDirty[1] < uy0) uy0 = extraPrevDirty[1];
      if (extraPrevDirty[2] > ux1) ux1 = extraPrevDirty[2];
      if (extraPrevDirty[3] > uy1) uy1 = extraPrevDirty[3];
    }

    if (ux0 < 0) ux0 = 0;
    if (uy0 < 0) uy0 = 0;
    if (ux1 > traceW) ux1 = traceW;
    if (uy1 > traceH) uy1 = traceH;

    const didClear = ux1 > ux0 && uy1 > uy0;
    if (didClear) {
      const rhi = this.engine._hardwareRenderer;
      context.setRenderTarget(targetRT, PipelineUtils.defaultViewport, 0);
      const isFull = ux0 === 0 && uy0 === 0 && ux1 === traceW && uy1 === traceH;
      if (!isFull) {
        rhi.scissor(ux0, uy0, ux1 - ux0, uy1 - uy0);
      }
      // Clear Color only: receiverRT, traceOutRT, and ssrPingPongRT share _ssrDepthTex (opaque depth + receiver stencil).
      rhi.clearRenderTarget(this.engine, CameraClearFlags.Color, this._clearZero);
      if (!isFull) {
        rhi.scissor(0, 0, traceW, traceH);
      }
    }

    if (hasNew) {
      prevDirty[0] = Math.max(0, sx0);
      prevDirty[1] = Math.max(0, sy0);
      prevDirty[2] = Math.min(traceW, sx1);
      prevDirty[3] = Math.min(traceH, sy1);
    } else {
      prevDirty[0] = 0;
      prevDirty[1] = 0;
      prevDirty[2] = 0;
      prevDirty[3] = 0;
    }

    if (extraPrevDirty) {
      extraPrevDirty[0] = 0;
      extraPrevDirty[1] = 0;
      extraPrevDirty[2] = 0;
      extraPrevDirty[3] = 0;
    }

    return didClear;
  }

  private _computeReceiverScissorRect(context: RenderContext, traceW: number, traceH: number): boolean {
    this._scissorMinX = Infinity;
    this._scissorMaxX = -Infinity;
    this._scissorMinY = Infinity;
    this._scissorMaxY = -Infinity;
    this._scissorHasProjected = false;

    const elements = this._receiverElements;
    const length = elements.length;
    if (length === 0) {
      this._receiverScissor.set(0, 0, 0, 0);
      return false;
    }

    const camPos = context.camera.entity.transform.worldPosition;
    const camX = camPos.x;
    const camY = camPos.y;
    const camZ = camPos.z;
    const nearPad = Math.max(0.25, context.camera.nearClipPlane * 2);
    const vp = context.viewProjectionMatrix.elements;

    for (let i = 0; i < length; i++) {
      const element = elements[i];
      const instancedRenderers = element.instancedRenderers;
      const instanceCount = instancedRenderers.length;
      if (instanceCount > 0) {
        for (let k = 0; k < instanceCount; k++) {
          if (this._accumulateBoundsToNdc(instancedRenderers[k].bounds, vp, camX, camY, camZ, nearPad)) {
            this._receiverScissor.set(0, 0, traceW, traceH);
            return true;
          }
        }
      } else if (this._accumulateBoundsToNdc(element.component.bounds, vp, camX, camY, camZ, nearPad)) {
        this._receiverScissor.set(0, 0, traceW, traceH);
        return true;
      }
    }

    const minNdcX = this._scissorMinX;
    const maxNdcX = this._scissorMaxX;
    const minNdcY = this._scissorMinY;
    const maxNdcY = this._scissorMaxY;
    if (!this._scissorHasProjected || maxNdcX < -1 || minNdcX > 1 || maxNdcY < -1 || minNdcY > 1) {
      this._receiverScissor.set(0, 0, 0, 0);
      return false;
    }

    const x0 = Math.max(0, Math.floor((minNdcX * 0.5 + 0.5) * traceW) - 2);
    const y0 = Math.max(0, Math.floor((minNdcY * 0.5 + 0.5) * traceH) - 2);
    const x1 = Math.min(traceW, Math.ceil((maxNdcX * 0.5 + 0.5) * traceW) + 2);
    const y1 = Math.min(traceH, Math.ceil((maxNdcY * 0.5 + 0.5) * traceH) + 2);
    if (x1 <= x0 || y1 <= y0) {
      this._receiverScissor.set(0, 0, 0, 0);
      return false;
    }

    this._receiverScissor.set(x0, y0, x1 - x0, y1 - y0);
    return true;
  }

  private _accumulateBoundsToNdc(
    bounds: BoundingBox,
    vp: Float32Array,
    camX: number,
    camY: number,
    camZ: number,
    nearPad: number
  ): boolean {
    const min = bounds.min;
    const max = bounds.max;
    const minX = min.x;
    const minY = min.y;
    const minZ = min.z;
    const maxX = max.x;
    const maxY = max.y;
    const maxZ = max.z;
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(minZ) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY) ||
      !Number.isFinite(maxZ) ||
      minX > maxX ||
      minY > maxY ||
      minZ > maxZ ||
      (minX === maxX && minY === maxY && minZ === maxZ)
    ) {
      return true;
    }

    if (
      camX >= minX - nearPad &&
      camX <= maxX + nearPad &&
      camY >= minY - nearPad &&
      camY <= maxY + nearPad &&
      camZ >= minZ - nearPad &&
      camZ <= maxZ + nearPad
    ) {
      return true;
    }

    const m0 = vp[0],
      m1 = vp[1],
      m2 = vp[2],
      m3 = vp[3];
    const m4 = vp[4],
      m5 = vp[5],
      m6 = vp[6],
      m7 = vp[7];
    const m8 = vp[8],
      m9 = vp[9],
      m10 = vp[10],
      m11 = vp[11];
    const m12 = vp[12],
      m13 = vp[13],
      m14 = vp[14],
      m15 = vp[15];

    const clip = this._clipCorners;
    let insideCount = 0;

    for (let c = 0; c < 8; c++) {
      const x = (c & 1) !== 0 ? maxX : minX;
      const y = (c & 2) !== 0 ? maxY : minY;
      const z = (c & 4) !== 0 ? maxZ : minZ;

      const cx = m0 * x + m4 * y + m8 * z + m12;
      const cy = m1 * x + m5 * y + m9 * z + m13;
      const cz = m2 * x + m6 * y + m10 * z + m14;
      const cw = m3 * x + m7 * y + m11 * z + m15;

      const base = c << 2;
      clip[base] = cx;
      clip[base + 1] = cy;
      clip[base + 2] = cz;
      clip[base + 3] = cw;

      if (cz + cw >= 0) {
        insideCount++;
        if (cw <= 1e-6) {
          return true;
        }
        const invW = 1 / cw;
        const ndcX = cx * invW;
        const ndcY = cy * invW;
        if (ndcX < this._scissorMinX) this._scissorMinX = ndcX;
        if (ndcX > this._scissorMaxX) this._scissorMaxX = ndcX;
        if (ndcY < this._scissorMinY) this._scissorMinY = ndcY;
        if (ndcY > this._scissorMaxY) this._scissorMaxY = ndcY;
        this._scissorHasProjected = true;
      }
    }

    if (insideCount === 0) {
      return false;
    }

    if (insideCount < 8) {
      const edges = ScreenSpaceReflectionPass._AABB_EDGES;
      for (let e = 0; e < 24; e += 2) {
        const aBase = edges[e] << 2;
        const bBase = edges[e + 1] << 2;
        const da = clip[aBase + 2] + clip[aBase + 3];
        const db = clip[bBase + 2] + clip[bBase + 3];
        if (da >= 0 === db >= 0) {
          continue;
        }
        const denom = da - db;
        if (Math.abs(denom) <= 1e-8) {
          continue;
        }
        const t = da / denom;
        const ix = clip[aBase] + (clip[bBase] - clip[aBase]) * t;
        const iy = clip[aBase + 1] + (clip[bBase + 1] - clip[aBase + 1]) * t;
        const iw = clip[aBase + 3] + (clip[bBase + 3] - clip[aBase + 3]) * t;
        if (iw <= 1e-6) {
          return true;
        }
        const invW = 1 / iw;
        const ndcX = ix * invW;
        const ndcY = iy * invW;
        if (ndcX < this._scissorMinX) this._scissorMinX = ndcX;
        if (ndcX > this._scissorMaxX) this._scissorMaxX = ndcX;
        if (ndcY < this._scissorMinY) this._scissorMinY = ndcY;
        if (ndcY > this._scissorMaxY) this._scissorMaxY = ndcY;
        this._scissorHasProjected = true;
      }
    }

    return false;
  }

  private _copyTextureToRT(
    source: Texture2D,
    destRT: RenderTarget,
    destMipLevel: number,
    srcMipLevel: number = 0,
    scaleOffset?: Vector4,
    scissorRect?: Vector4,
    clearColor: boolean = false
  ): void {
    Blitter.blitTexture(
      this.engine,
      source,
      destRT,
      srcMipLevel,
      PipelineUtils.defaultViewport,
      this._material,
      PASS_COPY_TEXTURE,
      scaleOffset,
      destMipLevel,
      clearColor && !scissorRect,
      scissorRect
    );
  }

  private _popAndFreeScratch(list: RenderTarget[], target: RenderTarget): void {
    const idx = list.indexOf(target);
    if (idx !== -1) {
      const lastIdx = list.length - 1;
      if (idx !== lastIdx) {
        list[idx] = list[lastIdx];
      }
      list.length = lastIdx;
    }
    this.engine._renderTargetPool.freeRenderTarget(target);
  }

  private _createPointClampTex(width: number, height: number, format: TextureFormat): Texture2D {
    const tex = new Texture2D(this.engine, width, height, format, false, false);
    tex.filterMode = TextureFilterMode.Point;
    tex.wrapModeU = TextureWrapMode.Clamp;
    tex.wrapModeV = TextureWrapMode.Clamp;
    tex.isGCIgnored = true;
    return tex;
  }

  /** @internal Called by RenderTargetPool at Engine end-of-frame to reclaim private SSR textures of idle/disabled cameras. */
  _sweepIfIdle(frameCount: number): void {
    if (!this._hasPersistentResources || this._lastActiveFrameCount === -1) {
      return;
    }
    if (frameCount - this._lastActiveFrameCount < SKIPPED_RELEASE_IDLE_FRAMES) {
      return;
    }
    this.releaseFrameTargets();
    if (this._boundCamera?.shaderData) {
      this._clearCameraSSREnable(this._boundCamera);
    }
    this._resetTemporaryBindings();
    this._releasePersistentResources();
    this._state = SSRRuntimeState.Skipped;
    this._opaqueReceiverCount = 0;
    this._transparentReceiverCount = 0;
    this._contribDepthCount = 0;
    this._skippedFrames = 0;
    this._updateDiagnostics(false);
  }

  private _registerActiveResources(): void {
    if (this._hasPersistentResources) {
      return;
    }
    this._hasPersistentResources = true;
    this.engine._renderTargetPool._registerIdleSweeper(this);
  }

  private _unregisterActiveResources(): void {
    if (!this._hasPersistentResources) {
      return;
    }
    this._hasPersistentResources = false;
    this.engine._renderTargetPool._unregisterIdleSweeper(this);
  }

  private _releaseTemporalBuffers(): void {
    const history = this._history;
    // Detach any receiver FBOs aliasing ssrPingPongTex before destroying the underlying textures.
    for (let i = 0; i < 2; i++) {
      const tex = history.ssrPingPongTex[i];
      if (tex && this._receiverRTs[i]?.colorTextures.includes(tex)) {
        this._receiverRTs[i] = ScreenSpaceReflectionPass._destroyResource(this._receiverRTs[i]);
      }
    }
    history.ssrPingPongRT[0] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongRT[0]);
    history.ssrPingPongRT[1] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongRT[1]);
    history.ssrPingPongTex[0] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongTex[0]);
    history.ssrPingPongTex[1] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongTex[1]);
    history.hasTemporalHistory = false;
    history.temporalPingPongIndex = 0;
    history.ssrSlotDirtyRect[0].fill(0);
    history.ssrSlotDirtyRect[1].fill(0);
  }

  private _releasePersistentResources(): void {
    this._unregisterActiveResources();
    this._lastActiveFrameCount = -1;
    const history = this._history;

    // Destroy all FBO wrappers first, then all underlying textures, to keep refcount/GL deletion cleanly ordered.
    this._destroyHiZDepthMip0RTs();
    history.hiZColorRT[0] = ScreenSpaceReflectionPass._destroyResource(history.hiZColorRT[0]);
    history.hiZColorRT[1] = ScreenSpaceReflectionPass._destroyResource(history.hiZColorRT[1]);
    this._receiverRTs[0] = ScreenSpaceReflectionPass._destroyResource(this._receiverRTs[0]);
    this._receiverRTs[1] = ScreenSpaceReflectionPass._destroyResource(this._receiverRTs[1]);
    history.ssrPingPongRT[0] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongRT[0]);
    history.ssrPingPongRT[1] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongRT[1]);
    history.prevColorPyramidRT = ScreenSpaceReflectionPass._destroyResource(history.prevColorPyramidRT);
    this._traceOutRT = ScreenSpaceReflectionPass._destroyResource(this._traceOutRT);
    this._ssrDepthRT = ScreenSpaceReflectionPass._destroyResource(this._ssrDepthRT);

    history.prevColorPyramidTex = ScreenSpaceReflectionPass._destroyResource(history.prevColorPyramidTex);
    history.hiZTex[0] = ScreenSpaceReflectionPass._destroyResource(history.hiZTex[0]);
    history.hiZTex[1] = ScreenSpaceReflectionPass._destroyResource(history.hiZTex[1]);
    history.ssrPingPongTex[0] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongTex[0]);
    history.ssrPingPongTex[1] = ScreenSpaceReflectionPass._destroyResource(history.ssrPingPongTex[1]);
    history.recvDepthTex[0] = ScreenSpaceReflectionPass._destroyResource(history.recvDepthTex[0]);
    history.recvDepthTex[1] = ScreenSpaceReflectionPass._destroyResource(history.recvDepthTex[1]);
    history.recvNRTex[0] = ScreenSpaceReflectionPass._destroyResource(history.recvNRTex[0]);
    history.recvNRTex[1] = ScreenSpaceReflectionPass._destroyResource(history.recvNRTex[1]);
    this._traceRawTex = ScreenSpaceReflectionPass._destroyResource(this._traceRawTex);
    this._hitDistTex = ScreenSpaceReflectionPass._destroyResource(this._hitDistTex);
    this._ssrDepthTex = ScreenSpaceReflectionPass._destroyResource(this._ssrDepthTex);

    history.resetMetadata();
    this._traceDirtyRect.fill(0);
    this._lastHiZScratchBytes = 0;
    this._lastColorScratchBytes = 0;
    this._lastContribDepthBytes = 0;
  }

  private _syncEncodingMacros(materialData: ShaderData): void {
    const packedDepth = this._usesPackedDepthRG8;
    const packedNormal = this._usesPackedNormalOct8;
    const packedHDR = this._usesPackedHDRReinhard;
    ScreenSpaceReflectionPass._setMacro(
      materialData._macroCollection,
      ScreenSpaceReflectionPass._packedDepthMacro,
      packedDepth
    );
    ScreenSpaceReflectionPass._setMacro(
      materialData._macroCollection,
      ScreenSpaceReflectionPass._packedNormalMacro,
      packedNormal
    );
    ScreenSpaceReflectionPass._setMacro(
      materialData._macroCollection,
      ScreenSpaceReflectionPass._packedHDRMacro,
      packedHDR
    );
  }

  private _resetTemporaryBindings(): void {
    const materialData = this._material?.shaderData;
    if (!materialData) {
      return;
    }
    const macros = materialData._macroCollection;
    materialData.setTexture(ScreenSpaceReflectionPass._matContribDepthProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matHiZTextureProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matReceiverDepthProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matPrevColorPyramidProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matPrevTraceDepthProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matTraceRawProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matPrevSSRProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matPrevRecvDepthProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matHitDistProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matPrevNormalRoughnessProp, null);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._downsampleFullDepthMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._hasContribDepthMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._outputHitDistMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._linearTraceMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._temporal5TapMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._packedHDRMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._highVirtualReprojMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._colorPyramidFullResMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._colorPyramidKarisDownsampleMacro, false);
  }

  private _handleFailure(camera: Camera, stage: string, error: unknown, context?: RenderContext): void {
    Logger.warn(`ScreenSpaceReflectionPass failed during ${stage}; falling back to IBL.`, error);
    this._resetTemporaryBindings();
    this._clearCameraSSREnable(camera, context);
    this._history.invalidateAll();
    this._state = SSRRuntimeState.Skipped;
    this._updateDiagnostics(false);
  }

  private _clearCameraSSREnable(camera: Camera, context?: RenderContext): void {
    this._programResolver.reset();
    const cameraData = camera.shaderData;
    const renderContext =
      context ??
      (this.engine._renderContext.camera === camera || this.engine._renderContext.camera === null
        ? this.engine._renderContext
        : null);
    if (renderContext && renderContext.programResolver === this._programResolver) {
      renderContext.programResolver = null;
    }
    if (cameraData) {
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRTextureProp, null);
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRRecvDepthProp, null);
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRRecvNRProp, null);
    }
  }

  private _computeEstimatedBytes(): number {
    const history = this._history;
    let total = 0;
    if (this._ssrDepthTex) total += this._ssrDepthTex._memorySize;
    if (this._traceRawTex) total += this._traceRawTex._memorySize;
    if (this._hitDistTex) total += this._hitDistTex._memorySize;
    if (history.prevColorPyramidTex) total += history.prevColorPyramidTex._memorySize;
    if (history.hiZTex[0]) total += history.hiZTex[0]._memorySize;
    if (history.hiZTex[1]) total += history.hiZTex[1]._memorySize;
    if (history.recvNRTex[0]) total += history.recvNRTex[0]._memorySize;
    if (history.recvNRTex[1]) total += history.recvNRTex[1]._memorySize;
    if (history.recvDepthTex[0]) total += history.recvDepthTex[0]._memorySize;
    if (history.recvDepthTex[1]) total += history.recvDepthTex[1]._memorySize;
    if (history.ssrPingPongTex[0]) total += history.ssrPingPongTex[0]._memorySize;
    if (history.ssrPingPongTex[1]) total += history.ssrPingPongTex[1]._memorySize;
    total += this._lastHiZScratchBytes + this._lastColorScratchBytes + this._lastContribDepthBytes;
    return total;
  }

  private _updateDiagnostics(active: boolean): void {
    const isInactiveState =
      this._state === SSRRuntimeState.Disabled ||
      this._state === SSRRuntimeState.Skipped ||
      this._state === SSRRuntimeState.ContextLost;
    const d = this._diagnostics;
    d.active = active;
    d.state = this._state;
    d.traceWidth = isInactiveState ? 0 : this._traceWidth;
    d.traceHeight = isInactiveState ? 0 : this._traceHeight;
    d.estimatedBytes = this._computeEstimatedBytes();
    d.unsupportedReason = this._unsupportedReason;
    d.opaqueReceiverCount = this._opaqueReceiverCount;
    d.transparentReceiverCount = this._transparentReceiverCount;
    d.useHardwareStencil = this._useHardwareStencil;
    d.usesPackedDepthRG8 = this._usesPackedDepthRG8;
    d.usesPackedNormalOct8 = this._usesPackedNormalOct8;
    d.useLinearTrace = this._useLinearTrace;
  }

  private static _setMacro(collection: ShaderMacroCollection, macro: ShaderMacro, enabled: boolean): void {
    if (enabled) {
      collection.enable(macro);
    } else {
      collection.disable(macro);
    }
  }
}
