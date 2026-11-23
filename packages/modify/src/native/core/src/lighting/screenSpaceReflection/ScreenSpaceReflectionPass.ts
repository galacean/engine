import { type BoundingBox, Color, Matrix, Vector4 } from "@galacean/engine-math";
import { RenderStateElementMap } from "../../BasicResources";
import { Camera } from "../../Camera";
import { GLCapabilityType } from "../../base/Constant";
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
import type { RenderQueue } from "../../RenderPipeline/RenderQueue";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { Material } from "../../material/Material";
import { IHardwareRenderer } from "../../renderingHardwareInterface";
import { CompareFunction, Shader, ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import { RenderStateElementKey } from "../../shader/enums/RenderStateElementKey";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import { TextureUtils } from "../../texture/TextureUtils";
import { SSRDiagnostics, SSRRuntimeState } from "./SSRDiagnostics";
import { destroyResourceImmediate, SSRHistoryState } from "./SSRHistoryState";
import { ScreenSpaceReflectionQuality } from "./ScreenSpaceReflectionQuality";
import { ScreenSpaceReflectionSettings } from "./ScreenSpaceReflectionSettings";

const PASS_DOWNSAMPLE_DEPTH = 0;
const PASS_BUILD_HIZ_MIP0 = 1;
const PASS_BUILD_HIZ_MIPN = 2;
const PASS_COPY_TEXTURE = 3;
const PASS_HIZ_TRACE = 4;
const PASS_TEMPORAL_RESOLVE = 5;
const PASS_COLOR_PYRAMID_PREFILTER = 6;
const PASS_COLOR_PYRAMID_DOWNSAMPLE = 7;
const PASS_DOWNSAMPLE_AND_BUILD_HIZ_MIP0 = 8;

const MAX_HIZ_MIP = 6;
const MAX_HIZ_MIP_FULL = 6;
const MAX_COLOR_PYRAMID_MIP = 5;
const MAX_COLOR_PYRAMID_MIP_FULL = 6;
const MAX_NON_XHIGH_TRACE_LONG_EDGE = 960;
const SKIPPED_RELEASE_IDLE_FRAMES = 10;

/**
 * @internal
 * Mobile-first Screen-Space Reflection render pass orchestrating dual-stream depth/Hi-Z,
 * non-MSAA MRT receiver generation, Hi-Z tracing, temporal resolve, and linear color pyramid history.
 */
export class ScreenSpaceReflectionPass extends PipelinePass {
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
  private static readonly _matFullDepthProp = ShaderProperty.getByName("material_SSRFullDepthTexture");
  private static readonly _matOpaqueDepthProp = ShaderProperty.getByName("material_SSROpaqueDepthTexture");
  private static readonly _matContribDepthProp = ShaderProperty.getByName("material_SSRContribDepthTexture");
  private static readonly _matHiZInputProp = ShaderProperty.getByName("material_SSRHiZInputTexture");
  private static readonly _matCopyTextureProp = ShaderProperty.getByName("material_SSRCopyTexture");
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

  /** Minimum bounding-sphere screen height fraction on the trace depth RT for fallback DepthOnly occluders. */
  private static readonly _MIN_OCCLUDER_HEIGHT_FRACTION = 0.04;
  private static readonly _AABB_EDGES = new Uint8Array([
    0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7
  ]);

  // Pass macros
  private static readonly _packedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static readonly _packedNormalMacro = ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8");
  private static readonly _packedHDRMacro = ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD");
  private static readonly _currentFrameColorMacro = ShaderMacro.getByName("SSR_CURRENT_FRAME_COLOR");
  private static readonly _linearTraceMacro = ShaderMacro.getByName("SSR_LINEAR_TRACE");
  private static readonly _temporal5TapMacro = ShaderMacro.getByName("SSR_TEMPORAL_5TAP_CLAMP");
  private static readonly _downsampleFullDepthMacro = ShaderMacro.getByName("SSR_DOWNSAMPLE_FROM_FULL_DEPTH");
  private static readonly _hasContribDepthMacro = ShaderMacro.getByName("SSR_HAS_CONTRIB_DEPTH");
  private static readonly _outputHitDistMacro = ShaderMacro.getByName("SSR_OUTPUT_HIT_DIST");
  private static readonly _highVirtualReprojMacro = ShaderMacro.getByName("SSR_HIGH_VIRTUAL_REPROJECTION");
  private static readonly _colorPyramidFullResMacro = ShaderMacro.getByName("SSR_COLOR_PYRAMID_FULL_RES");
  private static readonly _colorPyramidKarisDownsampleMacro = ShaderMacro.getByName(
    "SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE"
  );

  private readonly _material: Material;
  private readonly _history = new SSRHistoryState();

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

  private readonly _opaqueReceiverStates: RenderStateElementMap = <RenderStateElementMap>{
    [RenderStateElementKey.DepthStateEnabled]: true,
    [RenderStateElementKey.DepthStateWriteEnabled]: true,
    [RenderStateElementKey.DepthStateCompareFunction]: CompareFunction.LessEqual
  };

  private readonly _transparentReceiverStates: RenderStateElementMap = <RenderStateElementMap>{
    [RenderStateElementKey.DepthStateEnabled]: true,
    [RenderStateElementKey.DepthStateWriteEnabled]: true,
    [RenderStateElementKey.DepthStateCompareFunction]: CompareFunction.LessEqual
  };

  private readonly _isReceiverElement: (element: RenderElement) => boolean;
  private readonly _isDepthContributorElement: (element: RenderElement) => boolean;
  private readonly _isDepthOccluderElement: (element: RenderElement) => boolean;
  private _occluderCamX = 0;
  private _occluderCamY = 0;
  private _occluderCamZ = 0;
  private _occluderNear = 0.1;
  private _occluderProjScale = 0;
  private _occluderMinPixels = 0;
  private _occluderIsOrtho = false;
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
  private _configUsesPackedDepth: boolean = false;
  private _configUsesPackedNormal: boolean = false;
  private _configUsesPackedHDR: boolean = false;
  private _configUseHardwareStencil: boolean = true;
  private _configUseHighVirtual: boolean = false;
  private _configUseLinearTrace: boolean = false;
  private _configIsHDR: boolean = false;
  private _configAliasRecvNR: boolean = false;
  private _usingCurrentFrameColor: boolean = false;

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
  private _maxHiZMipCap: number = MAX_HIZ_MIP;
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
    active: false,
    state: SSRRuntimeState.Disabled,
    traceWidth: 0,
    traceHeight: 0,
    estimatedBytes: 0,
    unsupportedReason: null,
    opaqueReceiverCount: 0,
    transparentReceiverCount: 0,
    useHardwareStencil: true,
    usesPackedDepthRG8: false,
    usesPackedNormalOct8: false,
    useLinearTrace: false
  };

  constructor(engine: Engine, shader: Shader) {
    super(engine);

    const material = new Material(engine, shader);
    material._addReferCount(1);
    this._material = material;

    this._isReceiverElement = (element: RenderElement): boolean => {
      return element.material._canReceiveScreenSpaceReflection(this._activeMaxRoughness);
    };

    this._isDepthContributorElement = (element: RenderElement): boolean => {
      return element.material.contributeScreenSpaceReflectionDepth;
    };

    this._isDepthOccluderElement = (element: RenderElement): boolean => {
      if (!element.material.screenSpaceReflectionOccluder) {
        return false;
      }
      if (this._isBoundsLargeEnoughForDepth(element.component.bounds)) {
        return true;
      }
      const instanced = element.instancedRenderers;
      if (instanced) {
        for (let i = 0, n = instanced.length; i < n; i++) {
          if (this._isBoundsLargeEnoughForDepth(instanced[i].bounds)) {
            return true;
          }
        }
      }
      return false;
    };

    this._onDeviceLostHandler = (): void => {
      this._state = SSRRuntimeState.ContextLost;
      this.releaseFrameTargets();
      if (this._boundCamera && !this._boundCamera.destroyed) {
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
      if (this._boundCamera && !this._boundCamera.destroyed) {
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

  /**
   * Temporary dual-path bridge allowing `BasicRenderPipeline` to defer SSR from pre-forward to
   * post-opaque when only transparent receivers exist and `forwardDepthResolve` is enabled.
   *
   * Architectural note: Dual-path scheduling inside `BasicRenderPipeline` is architecturally
   * undesirable and strictly temporary until unified depth-producer / render-graph pass scheduling
   * eliminates pre-forward vs. post-opaque branching.
   */
  get canDeferToPostOpaque(): boolean {
    const state = this._state;
    return (
      (state === SSRRuntimeState.WarmupColor ||
        state === SSRRuntimeState.FirstTrace ||
        state === SSRRuntimeState.ActiveSteady) &&
      this._opaqueReceiverCount === 0 &&
      this._transparentReceiverCount > 0
    );
  }

  /**
   * True when transparent-only post-opaque SSR can reuse the current frame's mipmapped
   * `OpaqueTexture` color pyramid directly and skip end-of-frame `captureHistory`.
   */
  get canReuseOpaqueColorPyramid(): boolean {
    return (
      this.canDeferToPostOpaque &&
      this._effectiveSettings.quality !== ScreenSpaceReflectionQuality.XHigh &&
      !this._forceSoftwareColorPyramidMipmaps &&
      this._contribDepthCount === 0
    );
  }

  /** @internal Last computed receiver scissor rect `(x, y, width, height)` in trace pixels. */
  get _lastReceiverScissor(): Readonly<Vector4> {
    return this._receiverScissor;
  }

  /**
   * Prepare state machine and evaluate whether SSR runs this frame.
   */
  prepare(
    context: RenderContext,
    cullingResults: CullingResults,
    isCubeFace: boolean,
    canReuseOpaqueColorOnPostOpaque: boolean = false
  ): void {
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

    if (isCubeFace) {
      // Sub-views (CubeProbe faces / non-zero mipLevel) skip SSR without destroying
      // or overwriting the camera's main-view history, persistent targets, or diagnostics.
      this._state = SSRRuntimeState.Skipped;
      this._clearCameraSSREnable(camera, context);
      this._resetTemporaryBindings();
      return;
    }

    if (!camera.enableScreenSpaceReflection || !sourceSettings._isValid()) {
      if (this._state === SSRRuntimeState.Disabled && this._isDisabledClean) {
        context._ssrState.reset();
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

    // Re-evaluate hardware capability support cleanly.
    const isHDR = camera.enableHDR;
    this._detectCapabilities(engine._hardwareRenderer, isHDR, false);

    if (this._unsupportedReason) {
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
    context._ssrState.maxRoughness = this._activeMaxRoughness;

    const opaqueCount =
      cullingResults.opaqueQueue.countElementsForStage(PipelineStage.SSRReceiver, this._isReceiverElement) +
      cullingResults.alphaTestQueue.countElementsForStage(PipelineStage.SSRReceiver, this._isReceiverElement);
    const transparentCount = cullingResults.transparentQueue.countElementsForStage(
      PipelineStage.SSRReceiver,
      this._isReceiverElement
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
    let maxHiZMipCap = MAX_HIZ_MIP;
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
      case ScreenSpaceReflectionQuality.XHigh:
        scale = 1.0;
        colorScale = 1.0;
        maxSteps = 64;
        useTemporal = true;
        useBilateral = false;
        useHighVirtual = true;
        maxHiZMipCap = MAX_HIZ_MIP_FULL;
        maxColorMipCap = MAX_COLOR_PYRAMID_MIP_FULL;
        break;
    }

    if (this._effectiveSettings.quality !== ScreenSpaceReflectionQuality.XHigh) {
      const maxVpDim = Math.max(vpW, vpH);
      if (maxVpDim > 0) {
        const maxCappedScale = MAX_NON_XHIGH_TRACE_LONG_EDGE / maxVpDim;
        scale = Math.max(0.25, Math.min(scale, maxCappedScale));
        colorScale = Math.max(0.25, Math.min(colorScale, maxCappedScale));
      }
    }

    // Re-detect precision formats with effective HDR + high-precision normal flag.
    this._detectCapabilities(engine._hardwareRenderer, isHDR, useBilateral || useHighVirtual);

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
    this._maxHiZMipCap = maxHiZMipCap;
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
      this._configIsHDR !== isHDR ||
      this._configUsesPackedDepth !== this._usesPackedDepthRG8 ||
      this._configUseHardwareStencil !== this._useHardwareStencil;

    this._cutRequested = false;

    if (isDiscontinuous) {
      history.invalidateAll();
      this._traceDirtyRect[0] = 0;
      this._traceDirtyRect[1] = 0;
      this._traceDirtyRect[2] = traceW;
      this._traceDirtyRect[3] = traceH;
    } else if (
      history.lastQuality !== this._effectiveSettings.quality ||
      this._configUseHighVirtual !== useHighVirtual ||
      this._configUseLinearTrace !== this._useLinearTrace ||
      this._configAliasRecvNR !== aliasRecvNR ||
      this._configUsesPackedNormal !== this._usesPackedNormalOct8 ||
      this._configUsesPackedHDR !== this._usesPackedHDRReinhard
    ) {
      history.invalidateTemporal();
    }

    const expectCurrentFrameColor =
      canReuseOpaqueColorOnPostOpaque &&
      opaqueCount === 0 &&
      transparentCount > 0 &&
      contribCount === 0 &&
      this._effectiveSettings.quality !== ScreenSpaceReflectionQuality.XHigh &&
      !this._forceSoftwareColorPyramidMipmaps;

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
        aliasRecvNR,
        expectCurrentFrameColor
      );
      this._registerActiveResources();
    } catch (error) {
      this._handleFailure(camera, "prepare", error, context);
      this.releaseFrameTargets();
      return;
    }

    if (!useTemporal) {
      if (this._receiverRTs[1] && !this._receiverRTs[1].destroyed) {
        this._clearCameraSSREnable(camera, context);
      }
      this._destroyReceiverSlot(1);
      history.releaseTemporalBuffers();
      history.pingPongIndex = 0;
    }

    if (!history.hasColorHistory && !expectCurrentFrameColor) {
      this._state = SSRRuntimeState.WarmupColor;
      this._clearCameraSSREnable(camera, context);
    } else if (!useTemporal || !history.hasTemporalHistory) {
      this._state = SSRRuntimeState.FirstTrace;
    } else {
      this._state = SSRRuntimeState.ActiveSteady;
    }
  }

  private _prepareDepthOccluderCulling(camera: Camera, traceHeight: number): void {
    const camPos = camera.entity.transform.worldPosition;
    this._occluderCamX = camPos.x;
    this._occluderCamY = camPos.y;
    this._occluderCamZ = camPos.z;
    this._occluderNear = Math.max(1e-4, camera.nearClipPlane);
    this._occluderIsOrtho = camera.isOrthographic;
    const m5 = camera.projectionMatrix.elements[5];
    this._occluderProjScale = Number.isFinite(m5) && m5 !== 0 ? Math.abs(m5) * traceHeight : 0;
    this._occluderMinPixels = Math.max(1.5, traceHeight * ScreenSpaceReflectionPass._MIN_OCCLUDER_HEIGHT_FRACTION);
  }

  private _isBoundsLargeEnoughForDepth(bounds: BoundingBox): boolean {
    const minPixels = this._occluderMinPixels;
    const projScale = this._occluderProjScale;
    if (!(minPixels > 0 && projScale > 0)) {
      return true;
    }
    const min = bounds.min;
    const max = bounds.max;
    const dx = max.x - min.x;
    const dy = max.y - min.y;
    const dz = max.z - min.z;
    const diagSq = dx * dx + dy * dy + dz * dz;
    if (!(diagSq > 0) || !Number.isFinite(diagSq)) {
      return true;
    }
    const halfDiag = 0.5 * Math.sqrt(diagSq);
    if (this._occluderIsOrtho) {
      return halfDiag * projScale >= minPixels;
    }
    const cx = (min.x + max.x) * 0.5 - this._occluderCamX;
    const cy = (min.y + max.y) * 0.5 - this._occluderCamY;
    const cz = (min.z + max.z) * 0.5 - this._occluderCamZ;
    const centerDist = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const effDist = centerDist - halfDiag;
    if (effDist <= this._occluderNear) {
      return true;
    }
    return (halfDiag * projScale) / effDist >= minPixels;
  }

  /**
   * Prefilter and hardware-mipmap the scene color into an external mipmapped `OpaqueTexture` RT
   * so post-opaque transparent water SSR can sample the current frame without an extra history copy.
   */
  renderOpaqueColorPyramid(
    context: RenderContext,
    srcColorTex: Texture2D,
    destRT: RenderTarget,
    sourceViewport: Vector4 = PipelineUtils.defaultViewport
  ): boolean {
    const destTex = destRT.getColorTexture(0) as Texture2D | null;
    if (!destTex || !destTex._supportsMipLevelRange()) {
      return false;
    }
    if (Math.max(destTex.width, destTex.height) > 1 && destTex.mipmapCount <= 1) {
      return false;
    }

    const { engine } = this;
    const materialData = this._material.shaderData;
    const fullRes = destTex.width === srcColorTex.width && destTex.height === srcColorTex.height;
    destTex._setMipLevelRange(0, 1000);

    try {
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._colorPyramidFullResMacro,
        fullRes
      );
      this._destTexelSize.set(1 / destTex.width, 1 / destTex.height, destTex.width, destTex.height);
      materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
      this._sourceScaleOffset.set(sourceViewport.z, sourceViewport.w, sourceViewport.x, sourceViewport.y);
      Blitter.blitTexture(
        engine,
        srcColorTex,
        destRT,
        0,
        PipelineUtils.defaultViewport,
        this._material,
        PASS_COLOR_PYRAMID_PREFILTER,
        this._sourceScaleOffset,
        0
      );
    } finally {
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._colorPyramidFullResMacro,
        false
      );
    }

    if (destTex.mipmapCount > 1) {
      destTex.generateMipmaps();
    }
    context.camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, destTex);
    return true;
  }

  /**
   * Execute pre-forward depth downsample / Hi-Z build / receiver MRT / Hi-Z trace / temporal resolve.
   */
  renderPreForward(
    context: RenderContext,
    cullingResults: CullingResults,
    fullDepthRT: RenderTarget | null,
    currentFrameColorTex: Texture2D | null = null
  ): void {
    let state = this._state;
    if (
      state === SSRRuntimeState.Disabled ||
      state === SSRRuntimeState.Skipped ||
      state === SSRRuntimeState.ContextLost
    ) {
      return;
    }

    const usingCurrentFrameColor = !!currentFrameColorTex && this.canReuseOpaqueColorPyramid;
    this._usingCurrentFrameColor = usingCurrentFrameColor;
    if (usingCurrentFrameColor && state === SSRRuntimeState.WarmupColor) {
      state =
        this._useTemporal && !this._history.hasTemporalHistory
          ? SSRRuntimeState.FirstTrace
          : SSRRuntimeState.ActiveSteady;
      this._state = state;
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
      const flipOffscreen = rhi.backend === "webgl2";
      cullingResults.setRenderUpdateFlagTrue(ContextRendererUpdateFlag.ProjectionMatrix);
      context.applyVirtualCamera(camera._virtualCamera, flipOffscreen);

      this._currentVPMat.copyFrom(context.viewProjectionMatrix);
      const viewE = context.viewMatrix.elements;
      this._currentViewZRow.set(viewE[2], viewE[6], viewE[10], viewE[14]);
      Matrix.invert(context.projectionMatrix, this._invProjMat);
      Matrix.invert(context.viewMatrix, this._invViewMat);

      // Sync encoding macros on internal SSR material and store flags on RenderContext for RenderQueue.
      this._syncEncodingMacros(context, materialData);

      const traceW = this._traceWidth;
      const traceH = this._traceHeight;
      const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;

      if (state !== SSRRuntimeState.WarmupColor && !usingCurrentFrameColor && !history.prevColorPyramidTex) {
        // Fallback safety if prepare skipped prevColorPyramid allocation expecting current-frame color,
        // but OpaqueTexture reuse failed downstream: cleanly treat this frame as unready without crashing.
        this._clearCameraSSREnable(camera, context);
        this._updateDiagnostics(false);
        return;
      }

      // Step A: Build trace-resolution Depth24Stencil8 (either downsample full depth with conservative max, or DepthOnly).
      // On WebGL2 non-warmup frames with fullDepthTex, merge Step A max-downsample with Step D Hi-Z mip 0 build.
      const fullDepthTex = (fullDepthRT?.depthTexture as Texture2D | null) ?? null;
      const useMergedFullDepthPass = Boolean(fullDepthTex) && state !== SSRRuntimeState.WarmupColor;
      if (!useMergedFullDepthPass && (state !== SSRRuntimeState.WarmupColor || !fullDepthTex)) {
        const ssrDepthRT = this._ssrDepthRT!;
        context.setRenderTarget(ssrDepthRT, PipelineUtils.defaultViewport, 0);
        rhi.clearRenderTarget(engine, CameraClearFlags.DepthStencil, null);

        if (fullDepthTex) {
          this._sourceTexelSize.set(
            1 / fullDepthTex.width,
            1 / fullDepthTex.height,
            fullDepthTex.width,
            fullDepthTex.height
          );
          this._destTexelSize.set(1 / traceW, 1 / traceH, traceW, traceH);
          materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
          materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
          materialData.setTexture(ScreenSpaceReflectionPass._matFullDepthProp, fullDepthTex);
          Blitter.blitTexture(
            engine,
            fullDepthTex,
            ssrDepthRT,
            0,
            PipelineUtils.defaultViewport,
            material,
            PASS_DOWNSAMPLE_DEPTH,
            undefined,
            0
          );
          materialData.setTexture(ScreenSpaceReflectionPass._matFullDepthProp, null);
        } else {
          this._prepareDepthOccluderCulling(context.camera, ssrDepthRT.height);
          opaqueQueue.render(context, PipelineStage.DepthOnly, undefined, undefined, this._isDepthOccluderElement);
          alphaTestQueue.render(context, PipelineStage.DepthOnly, undefined, undefined, this._isDepthOccluderElement);
        }
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

      // Step C: WarmupColor fast path - capture Frame 0 min depth directly into persistent ping-pong hiZTex mip 0
      const currHiZIdx = history.hiZPingPongIndex;
      const prevHiZIdx: 0 | 1 = currHiZIdx === 0 ? 1 : 0;
      const currHiZTex = history.hiZTex[currHiZIdx]!;
      const currHiZColorRT = history.hiZColorRT[currHiZIdx]!;

      if (state === SSRRuntimeState.WarmupColor) {
        this._runBuildHiZMip0(fullDepthTex, contribDepthTex, currHiZColorRT);
        if (contribRT) {
          this._popAndFreeScratch(this._hiZScratchRTs, contribRT);
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
        : Math.min(this._maxHiZMipCap, Math.floor(Math.log2(Math.max(1, Math.min(traceW, traceH)))));
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
              materialData.setTexture(ScreenSpaceReflectionPass._matHiZInputProp, currHiZTex);
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
                m
              );
            }
          } finally {
            currHiZTex._setMipLevelRange(0, 1000);
            materialData.setTexture(ScreenSpaceReflectionPass._matHiZInputProp, null);
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
            materialData.setTexture(ScreenSpaceReflectionPass._matHiZInputProp, currHiZTex);
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
              0
            );
            materialData.setTexture(ScreenSpaceReflectionPass._matHiZInputProp, null);

            this._copyScaleOffset.set(dstW / mip1W, dstH / mip1H, 0, 0);
            this._copyTextureToRT(hiZScratchTex, currHiZColorRT, m, 0, this._copyScaleOffset);
          }

          this._popAndFreeScratch(this._hiZScratchRTs, hiZScratchRT);
        }
      } else {
        this._lastHiZScratchBytes = 0;
      }

      // Step E: Non-MSAA MRT Receiver Pass (closest layer wins: Opaque & Transparent DepthWrite=true)
      const currIdx = this._useTemporal ? history.pingPongIndex : 0;
      const prevIdx: 0 | 1 = currIdx === 0 ? 1 : 0;
      const settings = this._effectiveSettings;
      const traceScale = Math.min(1, traceW / Math.max(1, camera.pixelViewport.width));

      const hasVisibleReceiver = this._computeReceiverScissorRect(context, cullingResults, traceW, traceH);
      const sx0 = this._receiverScissor.x;
      const sy0 = this._receiverScissor.y;
      const sw = this._receiverScissor.z;
      const sh = this._receiverScissor.w;
      const sx1 = sx0 + sw;
      const sy1 = sy0 + sh;
      const isFullScreenScissor = sx0 === 0 && sy0 === 0 && sw === traceW && sh === traceH;
      const scissorArg = isFullScreenScissor ? undefined : this._receiverScissor;
      const aliasRecv = this._aliasRecvNRToPingPong;

      if (!hasVisibleReceiver) {
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
          history.invalidateTemporal();
        }
        rhi.scissor(0, 0, traceW, traceH);
        history.hasHiZHistory = !usingCurrentFrameColor;
        if (!usingCurrentFrameColor) {
          history.hiZPingPongIndex = prevHiZIdx;
        }
        this._clearCameraSSREnable(camera, context);
        this._updateDiagnostics(false);
        return;
      }

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

      if (this._opaqueReceiverCount > 0) {
        opaqueQueue.render(
          context,
          PipelineStage.SSRReceiver,
          undefined,
          this._opaqueReceiverStates,
          this._isReceiverElement
        );
        alphaTestQueue.render(
          context,
          PipelineStage.SSRReceiver,
          undefined,
          this._opaqueReceiverStates,
          this._isReceiverElement
        );
      }
      if (this._transparentReceiverCount > 0) {
        transparentQueue.render(
          context,
          PipelineStage.SSRReceiver,
          undefined,
          this._transparentReceiverStates,
          this._isReceiverElement
        );
      }

      // Step F: Hi-Z Ray Trace Pass
      const currRecvNR = aliasRecv ? history.ssrPingPongTex[currIdx]! : history.recvNRTex[currIdx]!;
      const currRecvDepth = history.recvDepthTex[currIdx]!;
      if (aliasRecv) {
        currRecvNR.filterMode = TextureFilterMode.Point;
      }
      try {
        const traceColorTex = usingCurrentFrameColor ? currentFrameColorTex! : history.prevColorPyramidTex!;
        const traceColorMaxMip = usingCurrentFrameColor
          ? Math.max(0, traceColorTex.mipmapCount - 1)
          : this._lastMaxColorMip;
        this._traceTexelSize.set(1 / traceW, 1 / traceH, traceW, traceH);
        this._colorPyramidInfo.set(
          traceColorMaxMip,
          traceColorTex.width,
          traceColorTex.height,
          engine.time.frameCount & 63
        );
        this._traceSettings.set(settings.maxDistance, settings.thickness, settings.maxRoughness, settings.edgeFade);

        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRInvProjMatProp, this._invProjMat);
        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRInvViewMatProp, this._invViewMat);
        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRPrevVPMatProp, history.prevVPMat);
        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRPrevInvProjMatProp, history.prevInvProjMat);
        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRPrevInvViewMatProp, history.prevInvViewMat);
        cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRPrevViewZRowProp, history.prevViewZRow);

        const prevHiZTex = !usingCurrentFrameColor && history.hasHiZHistory ? history.hiZTex[prevHiZIdx]! : currHiZTex;
        materialData.setInt(ScreenSpaceReflectionPass._matUseHWStencilProp, this._useHardwareStencil ? 1 : 0);
        materialData.setTexture(ScreenSpaceReflectionPass._matHiZTextureProp, currHiZTex);
        materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, currRecvNR);
        materialData.setTexture(ScreenSpaceReflectionPass._matReceiverDepthProp, currRecvDepth);
        materialData.setTexture(ScreenSpaceReflectionPass._matPrevColorPyramidProp, traceColorTex);
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
          ScreenSpaceReflectionPass._currentFrameColorMacro,
          usingCurrentFrameColor
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
          true,
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
          ScreenSpaceReflectionPass._currentFrameColorMacro,
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
          this._copyTextureToRT(traceRawTex, dstSSRRT, 0, 0, undefined, scissorArg);
          if (this._useHardwareStencil) {
            rhi.invalidateRenderTarget?.(dstSSRRT, CameraClearFlags.DepthStencil);
          }
          history.hasTemporalHistory = true;
        } else {
          const useHighVirtual = this._useHighVirtual;
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
          materialData.setInt(ScreenSpaceReflectionPass._matUseHWStencilProp, this._useHardwareStencil ? 1 : 0);
          materialData.setTexture(ScreenSpaceReflectionPass._matTraceRawProp, traceRawTex);
          materialData.setTexture(ScreenSpaceReflectionPass._matPrevSSRProp, history.ssrPingPongTex[prevIdx]!);
          materialData.setTexture(ScreenSpaceReflectionPass._matReceiverDepthProp, currRecvDepth);
          materialData.setTexture(ScreenSpaceReflectionPass._matPrevRecvDepthProp, history.recvDepthTex[prevIdx]!);
          materialData.setVector4(ScreenSpaceReflectionPass._matTraceTexelSizeProp, this._traceTexelSize);
          materialData.setFloat(ScreenSpaceReflectionPass._matTemporalBlendProp, settings.temporalBlend);

          if (useHighVirtual) {
            materialData.setTexture(ScreenSpaceReflectionPass._matHitDistProp, this._hitDistTex!);
            materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, currRecvNR);
            materialData.setTexture(ScreenSpaceReflectionPass._matPrevNormalRoughnessProp, history.recvNRTex[prevIdx]!);
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
            true,
            scissorArg
          );
          if (this._useHardwareStencil) {
            rhi.invalidateRenderTarget?.(dstSSRRT, CameraClearFlags.DepthStencil);
          }

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
        finalSSRTex = dstSSRTex;
      }

      if (!isFullScreenScissor) {
        rhi.scissor(0, 0, traceW, traceH);
      }

      materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matReceiverDepthProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matPrevColorPyramidProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matPrevTraceDepthProp, null);

      // Step I: Bind Forward sampling inputs & SSR flags on RenderContext
      const needsRecvDepthInForward = this._useBilateral || this._transparentReceiverCount > 0;
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRTextureProp, finalSSRTex);
      cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRParamsProp, this._ssrParams);
      cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRTraceTexelSizeProp, this._traceTexelSize);
      cameraData.setTexture(
        ScreenSpaceReflectionPass._cameraSSRRecvDepthProp,
        needsRecvDepthInForward ? currRecvDepth : null
      );
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRRecvNRProp, this._useBilateral ? currRecvNR : null);

      const ssrState = context._ssrState;
      ssrState.enabled = true;
      ssrState.bilateralSample = this._useBilateral;
      ssrState.verifyReceiverDepth = this._transparentReceiverCount > 0;
      ssrState.packedDepthRG8 = this._usesPackedDepthRG8;
      ssrState.packedNormalOct8 = this._usesPackedNormalOct8;
      ssrState.packedHDRReinhard = this._usesPackedHDRReinhard;
      ssrState.maxRoughness = this._activeMaxRoughness;

      if (!usingCurrentFrameColor) {
        history.hasHiZHistory = true;
        history.hiZPingPongIndex = prevHiZIdx;
      } else {
        history.hasHiZHistory = false;
        history.hiZPingPongIndex = 0;
      }

      this._updateDiagnostics(true);
    } catch (error) {
      this._handleFailure(camera, "renderPreForward", error, context);
    } finally {
      this.releaseFrameTargets();
    }
  }

  /**
   * Commit cross-frame matrices and temporal ping-pong state when current-frame `OpaqueTexture`
   * satisfied the color pyramid and end-of-frame `captureHistory` was skipped.
   */
  commitCurrentFrameHistory(context: RenderContext): void {
    const state = this._state;
    if (
      state === SSRRuntimeState.Disabled ||
      state === SSRRuntimeState.Skipped ||
      state === SSRRuntimeState.ContextLost
    ) {
      return;
    }
    this._recordHistorySnapshot(context.camera);
  }

  private _recordHistorySnapshot(camera: Camera): void {
    const history = this._history;
    const state = this._state;
    history.prevVPMat.copyFrom(this._currentVPMat);
    history.prevInvProjMat.copyFrom(this._invProjMat);
    history.prevInvViewMat.copyFrom(this._invViewMat);
    history.prevViewZRow.copyFrom(this._currentViewZRow);
    history.lastFrameCount = this.engine.time.frameCount;
    history.lastTraceWidth = this._traceWidth;
    history.lastTraceHeight = this._traceHeight;
    history.lastColorWidth = this._colorWidth;
    history.lastColorHeight = this._colorHeight;
    history.lastIsOrthographic = camera.isOrthographic;
    history.lastFarClip = camera.farClipPlane;
    history.lastQuality = this._effectiveSettings.quality;
    this._configIsHDR = camera.enableHDR;
    this._configAliasRecvNR = this._aliasRecvNRToPingPong;
    this._configUsesPackedDepth = this._usesPackedDepthRG8;
    this._configUsesPackedNormal = this._usesPackedNormalOct8;
    this._configUsesPackedHDR = this._usesPackedHDRReinhard;
    this._configUseHardwareStencil = this._useHardwareStencil;
    this._configUseHighVirtual = this._useHighVirtual;
    this._configUseLinearTrace = this._useLinearTrace;

    if (this._useTemporal && (state === SSRRuntimeState.FirstTrace || state === SSRRuntimeState.ActiveSteady)) {
      history.pingPongIndex = history.pingPongIndex === 0 ? 1 : 0;
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
    const prevColorPyramidRT = history.prevColorPyramidRT;
    const prevColorPyramidTex = history.prevColorPyramidTex;
    if (!prevColorPyramidRT || !prevColorPyramidTex) {
      return;
    }

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
        0
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
              0
            );

            this._copyScaleOffset.set(dstW / mip1W, dstH / mip1H, 0, 0);
            this._copyTextureToRT(colorScratchTex, prevColorPyramidRT, m, 0, this._copyScaleOffset);
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

      history.hasColorHistory = true;
      this._recordHistorySnapshot(camera);
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
    if (this._boundCamera && !this._boundCamera.destroyed) {
      this._clearCameraSSREnable(this._boundCamera);
    }
    this._boundCamera = null;
    this._resetTemporaryBindings();
    this._releasePersistentResources();
    if (!this._material.destroyed) {
      this._material._addReferCount(-1);
      this._material.destroy();
    }
    this._history.destroy();
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
    // while High / XHigh retain full RGBA16F precision unless forced to packed fallback.
    const wantHDRFormats = !this._forcePackedFormats && (isHDR || highPrecisionNormals);
    if (
      highPrecisionNormals &&
      wantHDRFormats &&
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
    const rhi = this.engine._hardwareRenderer;
    if (!texture._mipmap || (texture.width === 1 && texture.height === 1)) {
      return false;
    }
    return rhi.supportsGenerateMipmaps(texture.format, texture.isSRGBColorSpace);
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
    aliasRecvNR: boolean,
    skipPrevColorPyramid: boolean = false
  ): void {
    const { engine, _history: history } = this;

    // On resolution resize (e.g. mobile rotation), synchronously release all old trace-res resources
    // before allocating new ones so peak VRAM stays at 1x instead of transiently doubling to 2x.
    if (this._ssrDepthTex && (this._ssrDepthTex.width !== traceW || this._ssrDepthTex.height !== traceH)) {
      this._clearCameraSSREnable(camera);
      this._resetTemporaryBindings();
      this._destroyHiZDepthMip0RTs();
      history.hiZColorRT[0] = destroyResourceImmediate(history.hiZColorRT[0]);
      history.hiZColorRT[1] = destroyResourceImmediate(history.hiZColorRT[1]);
      history.hiZTex[0] = destroyResourceImmediate(history.hiZTex[0]);
      history.hiZTex[1] = destroyResourceImmediate(history.hiZTex[1]);
      this._destroyReceiverSlot(0);
      this._destroyReceiverSlot(1);
      this._traceOutRT = destroyResourceImmediate(this._traceOutRT);
      this._traceRawTex = destroyResourceImmediate(this._traceRawTex);
      this._hitDistTex = destroyResourceImmediate(this._hitDistTex);
      history.releaseTemporalBuffers();
      this._ssrDepthRT = destroyResourceImmediate(this._ssrDepthRT);
      this._ssrDepthTex = destroyResourceImmediate(this._ssrDepthTex);
      history.markAllDirty(traceW, traceH);
      this._traceDirtyRect[0] = 0;
      this._traceDirtyRect[1] = 0;
      this._traceDirtyRect[2] = traceW;
      this._traceDirtyRect[3] = traceH;
    }

    // 1. Cross-frame prevColorPyramid (half-res; skipped when reusing current-frame OpaqueTexture)
    if (skipPrevColorPyramid) {
      if (history.prevColorPyramidRT || history.prevColorPyramidTex) {
        history.prevColorPyramidRT = destroyResourceImmediate(history.prevColorPyramidRT);
        history.prevColorPyramidTex = destroyResourceImmediate(history.prevColorPyramidTex);
        history.hasColorHistory = false;
      }
    } else if (
      !history.prevColorPyramidRT ||
      !history.prevColorPyramidTex ||
      history.prevColorPyramidTex.width !== colorW ||
      history.prevColorPyramidTex.height !== colorH ||
      history.prevColorPyramidTex.format !== this._colorPyramidFormat ||
      history.prevColorPyramidTex.isSRGBColorSpace !== this._colorPyramidSRGB
    ) {
      history.prevColorPyramidRT = destroyResourceImmediate(history.prevColorPyramidRT);
      history.prevColorPyramidTex = destroyResourceImmediate(history.prevColorPyramidTex);

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
        destroyResourceImmediate(tex);
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
      this._traceOutRT = destroyResourceImmediate(this._traceOutRT);
      history.ssrPingPongRT[0] = destroyResourceImmediate(history.ssrPingPongRT[0]);
      history.ssrPingPongRT[1] = destroyResourceImmediate(history.ssrPingPongRT[1]);
      this._ssrDepthRT = destroyResourceImmediate(this._ssrDepthRT);
      this._ssrDepthTex = destroyResourceImmediate(this._ssrDepthTex);

      const depthTex = new Texture2D(engine, traceW, traceH, TextureFormat.Depth24Stencil8, false, false);
      depthTex.filterMode = TextureFilterMode.Point;
      depthTex.wrapModeU = TextureWrapMode.Clamp;
      depthTex.wrapModeV = TextureWrapMode.Clamp;
      depthTex.isGCIgnored = true;
      let depthRT: RenderTarget;
      try {
        depthRT = new RenderTarget(engine, traceW, traceH, null, depthTex, 1);
      } catch (error) {
        destroyResourceImmediate(depthTex);
        throw error;
      }
      depthRT.autoGenerateMipmaps = false;
      depthRT.isGCIgnored = true;
      this._ssrDepthTex = depthTex;
      this._ssrDepthRT = depthRT;
    }

    // 3. Persistent Hi-Z pyramid textures & color-only FBO wrappers (single slot when using current-frame color)
    const needHiZMipmap = !this._useLinearTrace && Math.max(traceW, traceH) > 1;
    const hiZSlotCount = skipPrevColorPyramid ? 1 : 2;
    if (skipPrevColorPyramid) {
      history.hiZDepthMip0RT[1] = destroyResourceImmediate(history.hiZDepthMip0RT[1]);
      history.hiZColorRT[1] = destroyResourceImmediate(history.hiZColorRT[1]);
      history.hiZTex[1] = destroyResourceImmediate(history.hiZTex[1]);
      history.hasHiZHistory = false;
      history.hiZPingPongIndex = 0;
    }
    for (let i = 0; i < hiZSlotCount; i++) {
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
        history.hiZDepthMip0RT[i] = destroyResourceImmediate(history.hiZDepthMip0RT[i]);
      }

      if (texMismatch || colorRTMismatch) {
        // Destroy paired FBO wrappers before destroying or replacing hiZTex[i].
        history.hiZDepthMip0RT[i] = destroyResourceImmediate(history.hiZDepthMip0RT[i]);
        history.hiZColorRT[i] = destroyResourceImmediate(history.hiZColorRT[i]);
        let nextTex: Texture2D;
        let allocatedTex = false;
        if (texMismatch) {
          history.hiZTex[i] = destroyResourceImmediate(history.hiZTex[i]);
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
            destroyResourceImmediate(nextTex);
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
            this._receiverRTs[i] = destroyResourceImmediate(this._receiverRTs[i]);
          }
          history.ssrPingPongRT[i] = destroyResourceImmediate(history.ssrPingPongRT[i]);
          let nextTex: Texture2D;
          let allocatedTex = false;
          if (texMismatch) {
            history.ssrPingPongTex[i] = destroyResourceImmediate(history.ssrPingPongTex[i]);
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
              destroyResourceImmediate(nextTex);
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
      this._traceOutRT = destroyResourceImmediate(this._traceOutRT);
      let nextTraceTex = this._traceRawTex;
      let allocatedTraceTex = false;
      let nextHitDistTex = this._hitDistTex;
      let allocatedHitDistTex = false;

      try {
        if (traceSizeMismatch) {
          this._traceRawTex = destroyResourceImmediate(this._traceRawTex);
          nextTraceTex = new Texture2D(engine, traceW, traceH, this._ssrColorFormat, false, false);
          nextTraceTex.filterMode = TextureFilterMode.Bilinear;
          nextTraceTex.wrapModeU = TextureWrapMode.Clamp;
          nextTraceTex.wrapModeV = TextureWrapMode.Clamp;
          nextTraceTex.isGCIgnored = true;
          allocatedTraceTex = true;
        }

        if (useHighVirtual) {
          if (hitDistNeededMismatch) {
            this._hitDistTex = destroyResourceImmediate(this._hitDistTex);
            nextHitDistTex = this._createPointClampTex(traceW, traceH, this._depthColorFormat);
            allocatedHitDistTex = true;
          }
        } else {
          this._hitDistTex = destroyResourceImmediate(this._hitDistTex);
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
        if (allocatedTraceTex) destroyResourceImmediate(nextTraceTex);
        if (allocatedHitDistTex) destroyResourceImmediate(nextHitDistTex);
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
    this._receiverRTs[slot] = destroyResourceImmediate(this._receiverRTs[slot]);

    let nextNRTex = history.recvNRTex[slot];
    let allocatedNR = false;
    let nextDepthTex = history.recvDepthTex[slot];
    let allocatedDepth = false;

    try {
      if (aliasRecvNR) {
        history.recvNRTex[slot] = destroyResourceImmediate(history.recvNRTex[slot]);
        nextNRTex = null;
      } else if (nrChanged) {
        history.recvNRTex[slot] = destroyResourceImmediate(history.recvNRTex[slot]);
        nextNRTex = this._createPointClampTex(traceW, traceH, this._normalRoughnessFormat);
        allocatedNR = true;
      }

      if (dChanged) {
        history.recvDepthTex[slot] = destroyResourceImmediate(history.recvDepthTex[slot]);
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
      if (allocatedNR) destroyResourceImmediate(nextNRTex);
      if (allocatedDepth) destroyResourceImmediate(nextDepthTex);
      throw error;
    }
  }

  private _destroyReceiverSlot(slot: 0 | 1): void {
    this._receiverRTs[slot] = destroyResourceImmediate(this._receiverRTs[slot]);
    this._history.recvNRTex[slot] = destroyResourceImmediate(this._history.recvNRTex[slot]);
    this._history.recvDepthTex[slot] = destroyResourceImmediate(this._history.recvDepthTex[slot]);
    this._history.recvSlotDirtyRect[slot].fill(0);
  }

  private _destroyHiZDepthMip0RTs(): void {
    this._history.hiZDepthMip0RT[0] = destroyResourceImmediate(this._history.hiZDepthMip0RT[0]);
    this._history.hiZDepthMip0RT[1] = destroyResourceImmediate(this._history.hiZDepthMip0RT[1]);
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
    history.hiZDepthMip0RT[slot] = destroyResourceImmediate(existing);
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

      this._sourceTexelSize.set(
        1 / fullDepthTex.width,
        1 / fullDepthTex.height,
        fullDepthTex.width,
        fullDepthTex.height
      );
      this._destTexelSize.set(1 / hiZTex.width, 1 / hiZTex.height, hiZTex.width, hiZTex.height);
      materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
      materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
      materialData.setTexture(ScreenSpaceReflectionPass._matFullDepthProp, fullDepthTex);
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
      materialData.setTexture(ScreenSpaceReflectionPass._matFullDepthProp, null);
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
      } else {
        this._sourceTexelSize.set(1 / opaqueTex.width, 1 / opaqueTex.height, opaqueTex.width, opaqueTex.height);
      }
      this._destTexelSize.set(1 / destRT.width, 1 / destRT.height, destRT.width, destRT.height);

      materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
      materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
      materialData.setTexture(ScreenSpaceReflectionPass._matOpaqueDepthProp, opaqueTex);
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
        0
      );
    } finally {
      materialData.setTexture(ScreenSpaceReflectionPass._matOpaqueDepthProp, null);
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

  private _computeReceiverScissorRect(
    context: RenderContext,
    cullingResults: CullingResults,
    traceW: number,
    traceH: number
  ): boolean {
    this._scissorMinX = Infinity;
    this._scissorMaxX = -Infinity;
    this._scissorMinY = Infinity;
    this._scissorMaxY = -Infinity;
    this._scissorHasProjected = false;

    const camPos = context.camera.entity.transform.worldPosition;
    const camX = camPos.x;
    const camY = camPos.y;
    const camZ = camPos.z;
    const nearPad = Math.max(0.25, context.camera.nearClipPlane * 2);
    const vp = context.viewProjectionMatrix.elements;

    if (this._opaqueReceiverCount > 0) {
      if (this._accumulateQueueReceiverScissor(cullingResults.opaqueQueue, vp, camX, camY, camZ, nearPad)) {
        this._receiverScissor.set(0, 0, traceW, traceH);
        return true;
      }
      if (this._accumulateQueueReceiverScissor(cullingResults.alphaTestQueue, vp, camX, camY, camZ, nearPad)) {
        this._receiverScissor.set(0, 0, traceW, traceH);
        return true;
      }
    }
    if (this._transparentReceiverCount > 0) {
      if (this._accumulateQueueReceiverScissor(cullingResults.transparentQueue, vp, camX, camY, camZ, nearPad)) {
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

    // WebGPU scissors index rows from the top of the render target.
    const scissorY = this.engine._hardwareRenderer.backend === "webgpu" ? traceH - y1 : y0;
    this._receiverScissor.set(x0, scissorY, x1 - x0, y1 - y0);
    return true;
  }

  private _accumulateQueueReceiverScissor(
    queue: RenderQueue,
    vp: Float32Array,
    camX: number,
    camY: number,
    camZ: number,
    nearPad: number
  ): boolean {
    const elements = queue.elements.length > 0 ? queue.elements : queue.batchedElements;
    const length = elements.length;
    const targetQueueType = queue.renderQueueType;

    for (let i = 0; i < length; i++) {
      const element = elements[i];
      if (!this._isReceiverElement(element)) {
        continue;
      }
      const shaderPasses = element.subShader.passes;
      const materialData = element.material.shaderData;
      let hasMatchingPass = false;
      for (let j = 0, m = shaderPasses.length; j < m; j++) {
        const shaderPass = shaderPasses[j];
        if (shaderPass._pipelineStage !== PipelineStage.SSRReceiver) {
          continue;
        }
        const passQueueType = shaderPass._renderState._getRenderQueueByShaderData(
          shaderPass._renderStateDataMap,
          materialData
        );
        if (passQueueType === targetQueueType) {
          hasMatchingPass = true;
          break;
        }
      }
      if (!hasMatchingPass) {
        continue;
      }

      const instancedRenderers = element.instancedRenderers;
      const instanceCount = instancedRenderers.length;
      if (instanceCount > 0) {
        for (let k = 0; k < instanceCount; k++) {
          if (this._accumulateBoundsToNdc(instancedRenderers[k].bounds, vp, camX, camY, camZ, nearPad)) {
            return true;
          }
        }
      } else if (this._accumulateBoundsToNdc(element.component.bounds, vp, camX, camY, camZ, nearPad)) {
        return true;
      }
    }

    return false;
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
      !Number.isFinite(maxZ)
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
    scissorRect?: Vector4
  ): void {
    const materialData = this._material.shaderData;
    materialData.setTexture(ScreenSpaceReflectionPass._matCopyTextureProp, source);
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
      !scissorRect,
      scissorRect
    );
    materialData.setTexture(ScreenSpaceReflectionPass._matCopyTextureProp, null);
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

  /** @internal Called at Engine end-of-frame to reclaim private SSR textures of idle/disabled cameras. */
  _sweepIfIdle(frameCount: number): void {
    if (!this._hasPersistentResources || this._lastActiveFrameCount === -1) {
      return;
    }
    if (frameCount - this._lastActiveFrameCount < SKIPPED_RELEASE_IDLE_FRAMES) {
      return;
    }
    this.releaseFrameTargets();
    if (this._boundCamera && !this._boundCamera.destroyed) {
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
    this.engine._renderTargetPool.registerIdleReclaimer(this);
  }

  private _unregisterActiveResources(): void {
    if (!this._hasPersistentResources) {
      return;
    }
    this._hasPersistentResources = false;
    this.engine._renderTargetPool.unregisterIdleReclaimer(this);
  }

  private _releasePersistentResources(): void {
    this._unregisterActiveResources();
    this._lastActiveFrameCount = -1;
    // Destroy FBO wrappers before owned textures to keep GL deletion cleanly ordered.
    this._destroyHiZDepthMip0RTs();
    this._destroyReceiverSlot(0);
    this._destroyReceiverSlot(1);
    this._traceOutRT = destroyResourceImmediate(this._traceOutRT);
    this._ssrDepthRT = destroyResourceImmediate(this._ssrDepthRT);

    this._history.releaseResources();
    this._traceDirtyRect.fill(0);
    this._traceRawTex = destroyResourceImmediate(this._traceRawTex);
    this._hitDistTex = destroyResourceImmediate(this._hitDistTex);
    this._ssrDepthTex = destroyResourceImmediate(this._ssrDepthTex);

    this._lastHiZScratchBytes = 0;
    this._lastColorScratchBytes = 0;
    this._lastContribDepthBytes = 0;
  }

  private _syncEncodingMacros(context: RenderContext, materialData: ShaderData): void {
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
    context._ssrState.packedDepthRG8 = packedDepth;
    context._ssrState.packedNormalOct8 = packedNormal;
    context._ssrState.packedHDRReinhard = packedHDR;
  }

  private _resetTemporaryBindings(): void {
    const materialData = this._material?.shaderData;
    if (!materialData) {
      return;
    }
    const macros = materialData._macroCollection;
    materialData.setTexture(ScreenSpaceReflectionPass._matFullDepthProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matOpaqueDepthProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matContribDepthProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matHiZInputProp, null);
    materialData.setTexture(ScreenSpaceReflectionPass._matCopyTextureProp, null);
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
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._currentFrameColorMacro, false);
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
    const cameraData = camera.shaderData;
    const activeContext = context ?? (this.engine._renderContext.camera === camera ? this.engine._renderContext : null);
    activeContext?._ssrState.reset();
    cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRTextureProp, null);
    cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRRecvDepthProp, null);
    cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRRecvNRProp, null);
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
