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
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { Material } from "../../material/Material";
import { IHardwareRenderer, IPlatformTexture2D } from "../../renderingHardwareInterface";
import { CompareFunction, Shader, ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import { RenderStateElementKey } from "../../shader/enums/RenderStateElementKey";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import { TextureUtils } from "../../texture/TextureUtils";
import { SSRDiagnostics, SSRRuntimeState } from "./SSRDiagnostics";
import { SSRHistoryState } from "./SSRHistoryState";
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

  // Element filter properties / macros
  private static readonly _roughnessProp = ShaderProperty.getByName("material_Roughness");
  private static readonly _hasRoughnessTexMacro = ShaderMacro.getByName("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE");
  private static readonly _enableClearCoatMacro = ShaderMacro.getByName("MATERIAL_ENABLE_CLEAR_COAT");
  /** Minimum bounding-sphere screen height fraction on the trace depth RT for fallback DepthOnly occluders. */
  private static readonly _MIN_OCCLUDER_HEIGHT_FRACTION = 0.04;

  // Pass macros
  private static readonly _packedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static readonly _packedNormalMacro = ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8");
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
  private readonly _clearZero = new Color(0, 0, 0, 0);

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
  private _normalRoughnessFormat: TextureFormat = TextureFormat.R16G16B16A16;
  private _ssrColorFormat: TextureFormat = TextureFormat.R16G16B16A16;
  private _colorPyramidFormat: TextureFormat = TextureFormat.R11G11B10_UFloat;
  private _colorPyramidSRGB: boolean = false;
  private _usesPackedDepthRG8: boolean = false;
  private _usesPackedNormalOct8: boolean = false;
  private _configUsesPackedDepth: boolean = false;
  private _configUsesPackedNormal: boolean = false;
  private _configUseHardwareStencil: boolean = true;
  private _configUseHighVirtual: boolean = false;
  private _configIsHDR: boolean = false;
  private _configAliasRecvNR: boolean = false;

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
  private _cutRequested: boolean = false;
  private _lastHiZBytes: number = 0;
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
    usesPackedNormalOct8: false
  };

  constructor(engine: Engine, shader: Shader) {
    super(engine);

    const material = new Material(engine, shader);
    material._addReferCount(1);
    this._material = material;

    this._isReceiverElement = (element: RenderElement): boolean => {
      const material = element.material;
      if (material.screenSpaceReflectionIntensity <= 0) {
        return false;
      }
      const shaderData = material.shaderData;
      const macros = shaderData._macroCollection;
      if (
        !macros.isEnable(ScreenSpaceReflectionPass._hasRoughnessTexMacro) &&
        !macros.isEnable(ScreenSpaceReflectionPass._enableClearCoatMacro)
      ) {
        const roughness = shaderData.getFloat(ScreenSpaceReflectionPass._roughnessProp);
        if (roughness !== undefined && roughness >= this._activeMaxRoughness) {
          return false;
        }
      }
      return true;
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
   * Prepare state machine and evaluate whether SSR runs this frame.
   */
  prepare(context: RenderContext, cullingResults: CullingResults, isCubeFace: boolean): void {
    const { camera } = context;
    const { engine } = this;
    const scene = camera.scene!;
    const sourceSettings = camera.screenSpaceReflectionOverride ?? scene.screenSpaceReflection;
    this._boundCamera = camera;

    if (engine._isDeviceLost) {
      this._state = SSRRuntimeState.ContextLost;
      this._isDisabledClean = false;
      this._clearCameraSSREnable(camera);
      this._history.invalidateAll();
      this._updateDiagnostics(false);
      return;
    }

    if (isCubeFace) {
      // Sub-views (CubeProbe faces / non-zero mipLevel) skip SSR without destroying
      // or overwriting the camera's main-view history, persistent targets, or diagnostics.
      this._state = SSRRuntimeState.Skipped;
      this._clearCameraSSREnable(camera);
      this._resetTemporaryBindings();
      return;
    }

    if (!camera.enableScreenSpaceReflection || !sourceSettings._isValid()) {
      if (this._state === SSRRuntimeState.Disabled && this._isDisabledClean) {
        camera._ssrForwardEnabled = false;
        return;
      }
      this._state = SSRRuntimeState.Disabled;
      this._opaqueReceiverCount = 0;
      this._transparentReceiverCount = 0;
      this._contribDepthCount = 0;
      this._skippedFrames = 0;
      this._clearCameraSSREnable(camera);
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
      this._clearCameraSSREnable(camera);
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
      this._clearCameraSSREnable(camera);
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
    this._activeMaxRoughness = this._effectiveSettings.maxRoughness;
    camera._ssrMaxRoughness = this._activeMaxRoughness;

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
      this._clearCameraSSREnable(camera);
      this._history.invalidateAll();
      this._skippedFrames++;
      if (this._skippedFrames >= SKIPPED_RELEASE_IDLE_FRAMES) {
        this._resetTemporaryBindings();
        this._releasePersistentResources();
      }
      this._lastHiZBytes = 0;
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
    } else if (
      history.lastQuality !== this._effectiveSettings.quality ||
      this._configUseHighVirtual !== useHighVirtual ||
      this._configAliasRecvNR !== aliasRecvNR ||
      this._configUsesPackedNormal !== this._usesPackedNormalOct8
    ) {
      history.invalidateTemporal();
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
      this._handleFailure(camera, "prepare", error);
      this.releaseFrameTargets();
      return;
    }

    if (!useTemporal) {
      if (this._receiverRTs[1] && !this._receiverRTs[1].destroyed) {
        this._clearCameraSSREnable(camera);
      }
      this._destroyReceiverSlot(1);
      history.releaseTemporalBuffers();
      history.pingPongIndex = 0;
    }

    if (!history.hasColorHistory) {
      this._state = SSRRuntimeState.WarmupColor;
      this._clearCameraSSREnable(camera);
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

      // Sync encoding macros on internal SSR material and store flags on camera for RenderQueue.
      this._syncEncodingMacros(camera, materialData);

      const traceW = this._traceWidth;
      const traceH = this._traceHeight;
      const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;

      // Step A: Build trace-resolution Depth24Stencil8 (either downsample full depth with conservative max, or DepthOnly)
      const fullDepthTex = fullDepthRT?.depthTexture as Texture2D | null;
      if (state !== SSRRuntimeState.WarmupColor || !fullDepthTex) {
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

      // Step C: WarmupColor fast path - capture Frame 0 min depth directly into prevTraceDepthRT
      if (state === SSRRuntimeState.WarmupColor) {
        this._runBuildHiZMip0(fullDepthTex, contribDepthTex, history.prevTraceDepthRT!);
        if (contribRT) {
          this._popAndFreeScratch(this._hiZScratchRTs, contribRT);
        }
        this._lastHiZBytes = 0;
        this._lastHiZScratchBytes = 0;
        this._clearCameraSSREnable(camera);
        this._updateDiagnostics(false);
        return;
      }

      // Step D: Build Hi-Z Pyramid (Mip 0..maxHiZMip) into pooled hiZRT using a single mip-1 scratch
      const maxHiZMip = Math.min(this._maxHiZMipCap, Math.floor(Math.log2(Math.max(1, Math.min(traceW, traceH)))));
      const needHiZMipmap = Math.max(traceW, traceH) > 1;
      const hiZRT = pool.allocateRenderTarget(
        traceW,
        traceH,
        this._depthColorFormat,
        null,
        false,
        needHiZMipmap,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Point
      );
      hiZRT.autoGenerateMipmaps = false;
      this._hiZScratchRTs.push(hiZRT);
      const hiZTex = hiZRT.getColorTexture(0) as Texture2D;
      this._lastHiZBytes = hiZTex._memorySize;

      this._runBuildHiZMip0(fullDepthTex, contribDepthTex, hiZRT);
      if (contribRT) {
        this._popAndFreeScratch(this._hiZScratchRTs, contribRT);
        contribRT = null;
        contribDepthTex = null;
      }

      if (maxHiZMip >= 1) {
        if (this._canUseInPlaceHiZ(hiZTex)) {
          this._lastHiZScratchBytes = 0;
          try {
            for (let m = 1; m <= maxHiZMip; m++) {
              const srcW = Math.max(1, traceW >> (m - 1));
              const srcH = Math.max(1, traceH >> (m - 1));
              const dstW = Math.max(1, traceW >> m);
              const dstH = Math.max(1, traceH >> m);
              // WebGL2 prohibits sampling a mip level attached to the active FBO;
              // pin sampler range to [m - 1, m - 1] so destMipLevel = m sits outside it.
              hiZTex._setMipLevelRange(m - 1, m - 1);
              this._sourceTexelSize.set(1 / srcW, 1 / srcH, srcW, srcH);
              this._destTexelSize.set(1 / dstW, 1 / dstH, dstW, dstH);
              materialData.setTexture(ScreenSpaceReflectionPass._matHiZInputProp, hiZTex);
              materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
              materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
              Blitter.blitTexture(
                engine,
                hiZTex,
                hiZRT,
                0,
                PipelineUtils.defaultViewport,
                material,
                PASS_BUILD_HIZ_MIPN,
                undefined,
                m
              );
            }
          } finally {
            hiZTex._setMipLevelRange(0, 1000);
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
            materialData.setTexture(ScreenSpaceReflectionPass._matHiZInputProp, hiZTex);
            materialData.setVector4(ScreenSpaceReflectionPass._matSourceTexelSizeProp, this._sourceTexelSize);
            materialData.setVector4(ScreenSpaceReflectionPass._matDestTexelSizeProp, this._destTexelSize);
            Blitter.blitTexture(
              engine,
              hiZTex,
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
            this._copyTextureToRT(hiZScratchTex, hiZRT, m, 0, this._copyScaleOffset);
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

      this._ssrParams.set(settings.intensity, settings.maxRoughness, traceScale, camera.farClipPlane);
      cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRParamsProp, this._ssrParams);

      const receiverRT = this._receiverRTs[currIdx]!;
      context.setRenderTarget(receiverRT, PipelineUtils.defaultViewport, 0);
      rhi.clearRenderTarget(engine, CameraClearFlags.Color, this._clearZero);

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
      const currRecvNR = this._aliasRecvNRToPingPong ? history.ssrPingPongTex[currIdx]! : history.recvNRTex[currIdx]!;
      const currRecvDepth = history.recvDepthTex[currIdx]!;
      if (this._aliasRecvNRToPingPong) {
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
        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRPrevInvProjMatProp, history.prevInvProjMat);
        cameraData.setMatrix(ScreenSpaceReflectionPass._cameraSSRPrevInvViewMatProp, history.prevInvViewMat);
        cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRPrevViewZRowProp, history.prevViewZRow);

        materialData.setInt(ScreenSpaceReflectionPass._matUseHWStencilProp, this._useHardwareStencil ? 1 : 0);
        materialData.setTexture(ScreenSpaceReflectionPass._matHiZTextureProp, hiZTex);
        materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, currRecvNR);
        materialData.setTexture(ScreenSpaceReflectionPass._matReceiverDepthProp, currRecvDepth);
        materialData.setTexture(ScreenSpaceReflectionPass._matPrevColorPyramidProp, history.prevColorPyramidTex!);
        materialData.setTexture(ScreenSpaceReflectionPass._matPrevTraceDepthProp, history.prevTraceDepthTex!);
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

        const traceOutRT = this._traceOutRT!;
        context.setRenderTarget(traceOutRT, PipelineUtils.defaultViewport, 0);
        rhi.clearRenderTarget(engine, CameraClearFlags.Color, this._clearZero);
        Blitter.blitTexture(
          engine,
          currRecvNR,
          traceOutRT,
          0,
          PipelineUtils.defaultViewport,
          material,
          PASS_HIZ_TRACE,
          undefined,
          0
        );
        if (!this._useTemporal && this._useHardwareStencil) {
          rhi.invalidateRenderTarget?.(traceOutRT, CameraClearFlags.DepthStencil);
        }
      } finally {
        if (this._aliasRecvNRToPingPong) {
          currRecvNR.filterMode = TextureFilterMode.Bilinear;
        }
      }
      materialData.setTexture(ScreenSpaceReflectionPass._matHiZTextureProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, null);
      ScreenSpaceReflectionPass._setMacro(
        materialData._macroCollection,
        ScreenSpaceReflectionPass._outputHitDistMacro,
        false
      );

      // Step G: Persist Frame N Hi-Z mip 0 for next frame's disocclusion check, then free pooled hiZRT
      this._copyTextureToRT(hiZTex, history.prevTraceDepthRT!, 0, 0);
      this._popAndFreeScratch(this._hiZScratchRTs, hiZRT);

      // Step H: Temporal Resolve (Medium / High, with hardware Stencil culling) or direct output (Low)
      const traceRawTex = this._traceRawTex!;
      let finalSSRTex: Texture2D = traceRawTex;
      if (this._useTemporal) {
        const dstSSRRT = history.ssrPingPongRT[currIdx]!;
        const dstSSRTex = history.ssrPingPongTex[currIdx]!;
        if (state === SSRRuntimeState.FirstTrace) {
          this._copyTextureToRT(traceRawTex, dstSSRRT, 0, 0);
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

          context.setRenderTarget(dstSSRRT, PipelineUtils.defaultViewport, 0);
          rhi.clearRenderTarget(engine, CameraClearFlags.Color, this._clearZero);
          Blitter.blitTexture(
            engine,
            traceRawTex,
            dstSSRRT,
            0,
            PipelineUtils.defaultViewport,
            material,
            PASS_TEMPORAL_RESOLVE,
            undefined,
            0
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
        }
        finalSSRTex = dstSSRTex;
      }

      materialData.setTexture(ScreenSpaceReflectionPass._matNormalRoughnessProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matReceiverDepthProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matPrevColorPyramidProp, null);
      materialData.setTexture(ScreenSpaceReflectionPass._matPrevTraceDepthProp, null);

      // Step I: Bind Forward sampling inputs & SSR flags on camera
      const needsRecvDepthInForward = this._useBilateral || this._transparentReceiverCount > 0;
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRTextureProp, finalSSRTex);
      cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRParamsProp, this._ssrParams);
      cameraData.setVector4(ScreenSpaceReflectionPass._cameraSSRTraceTexelSizeProp, this._traceTexelSize);
      cameraData.setTexture(
        ScreenSpaceReflectionPass._cameraSSRRecvDepthProp,
        needsRecvDepthInForward ? currRecvDepth : null
      );
      cameraData.setTexture(ScreenSpaceReflectionPass._cameraSSRRecvNRProp, this._useBilateral ? currRecvNR : null);

      camera._ssrForwardEnabled = true;
      camera._ssrBilateralSample = this._useBilateral;
      camera._ssrVerifyReceiverDepth = this._transparentReceiverCount > 0;
      camera._ssrPackedDepthRG8 = this._usesPackedDepthRG8;
      camera._ssrPackedNormalOct8 = this._usesPackedNormalOct8;
      camera._ssrMaxRoughness = this._activeMaxRoughness;

      this._updateDiagnostics(true);
    } catch (error) {
      this._handleFailure(camera, "renderPreForward", error);
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
      this._configIsHDR = camera.enableHDR;
      this._configAliasRecvNR = this._aliasRecvNRToPingPong;
      this._configUsesPackedDepth = this._usesPackedDepthRG8;
      this._configUsesPackedNormal = this._usesPackedNormalOct8;
      this._configUseHardwareStencil = this._useHardwareStencil;
      this._configUseHighVirtual = this._useHighVirtual;

      if (this._useTemporal && (state === SSRRuntimeState.FirstTrace || state === SSRRuntimeState.ActiveSteady)) {
        history.pingPongIndex = history.pingPongIndex === 0 ? 1 : 0;
      }
    } catch (error) {
      this._handleFailure(camera, "captureHistory", error);
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
    this.engine.off(EngineEventType.DeviceLost, this._onDeviceLostHandler);
    this.engine.off(EngineEventType.DeviceRestored, this._onDeviceRestoredHandler);
    this.releaseFrameTargets();
    if (this._boundCamera && !this._boundCamera.destroyed) {
      this._clearCameraSSREnable(this._boundCamera);
    }
    this._boundCamera = null;
    this._resetTemporaryBindings();
    this._releasePersistentResources();
    this._material._addReferCount(-1);
    this._history.destroy();
  }

  private _detectCapabilities(
    rhi: IHardwareRenderer,
    isHDR: boolean = false,
    highPrecisionNormals: boolean = false
  ): void {
    if (!rhi.isWebGL2) {
      this._unsupportedReason = "WebGL2 unsupported";
      this._usesPackedDepthRG8 = true;
      this._usesPackedNormalOct8 = true;
      return;
    }
    const cap = rhi.capability;
    if (cap.maxDrawBuffers < 2) {
      this._unsupportedReason = "MRT (< 2 draw buffers) unsupported";
      this._usesPackedDepthRG8 = true;
      this._usesPackedNormalOct8 = true;
      return;
    }

    this._unsupportedReason = null;

    if (!this._forcePackedFormats && rhi.supportsRenderTargetColorFormat(TextureFormat.R16_SFloat)) {
      this._depthColorFormat = TextureFormat.R16_SFloat;
      this._usesPackedDepthRG8 = false;
    } else if (rhi.supportsRenderTargetColorFormat(TextureFormat.R8G8)) {
      this._depthColorFormat = TextureFormat.R8G8;
      this._usesPackedDepthRG8 = true;
    } else {
      this._depthColorFormat = TextureFormat.R8G8B8A8;
      this._usesPackedDepthRG8 = true;
    }

    const wantHDRFormats = !this._forcePackedFormats && (isHDR || highPrecisionNormals);
    if (wantHDRFormats && rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16)) {
      this._normalRoughnessFormat = TextureFormat.R16G16B16A16;
      this._usesPackedNormalOct8 = false;
    } else {
      this._normalRoughnessFormat = TextureFormat.R8G8B8A8;
      this._usesPackedNormalOct8 = true;
    }

    if (isHDR && !this._forcePackedFormats && rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16)) {
      this._ssrColorFormat = TextureFormat.R16G16B16A16;
    } else {
      this._ssrColorFormat = TextureFormat.R8G8B8A8;
    }

    if (rhi.supportsRenderTargetColorFormat(TextureFormat.R11G11B10_UFloat)) {
      this._colorPyramidFormat = TextureFormat.R11G11B10_UFloat;
      this._colorPyramidSRGB = false;
    } else if (rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16)) {
      this._colorPyramidFormat = TextureFormat.R16G16B16A16;
      this._colorPyramidSRGB = false;
    } else {
      this._colorPyramidFormat = TextureFormat.R8G8B8A8;
      this._colorPyramidSRGB = true;
    }
  }

  private _canUseInPlaceHiZ(hiZTex: Texture2D): boolean {
    if (this._forceHiZScratch || !this.engine._hardwareRenderer.isWebGL2) {
      return false;
    }
    return typeof (hiZTex._platformTexture as IPlatformTexture2D)?.setMipLevelRange === "function";
  }

  private _canUseHardwareColorPyramidMipmaps(texture: Texture2D): boolean {
    if (this._forceSoftwareColorPyramidMipmaps || this._isFullResColorPyramid) {
      return false;
    }
    const rhi = this.engine._hardwareRenderer;
    if (!rhi.isWebGL2 || !texture._mipmap || (texture.width === 1 && texture.height === 1)) {
      return false;
    }
    return (
      TextureUtils.supportGenerateMipmaps(texture.format, texture._mipmap, texture.isSRGBColorSpace, rhi.isWebGL2) &&
      rhi.supportsRenderTargetColorFormat(texture.format) &&
      (texture.format !== TextureFormat.R32G32B32A32 || rhi.canIUse(GLCapabilityType.textureFloatLinear))
    );
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
      this._destroyReceiverSlot(0);
      this._destroyReceiverSlot(1);
      this._traceOutRT = ScreenSpaceReflectionPass._destroyRT(this._traceOutRT);
      this._traceRawTex = ScreenSpaceReflectionPass._destroyTex(this._traceRawTex);
      this._hitDistTex = ScreenSpaceReflectionPass._destroyTex(this._hitDistTex);
      history.releaseTemporalBuffers();
      history.prevTraceDepthRT = ScreenSpaceReflectionPass._destroyRT(history.prevTraceDepthRT);
      history.prevTraceDepthTex = ScreenSpaceReflectionPass._destroyTex(history.prevTraceDepthTex);
      this._ssrDepthRT = ScreenSpaceReflectionPass._destroyRT(this._ssrDepthRT);
      this._ssrDepthTex = ScreenSpaceReflectionPass._destroyTex(this._ssrDepthTex);
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
      history.prevColorPyramidRT = ScreenSpaceReflectionPass._destroyRT(history.prevColorPyramidRT);
      history.prevColorPyramidTex = ScreenSpaceReflectionPass._destroyTex(history.prevColorPyramidTex);

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
        ScreenSpaceReflectionPass._destroyTex(tex);
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
      this._destroyReceiverSlot(0);
      this._destroyReceiverSlot(1);
      this._traceOutRT = ScreenSpaceReflectionPass._destroyRT(this._traceOutRT);
      history.ssrPingPongRT[0] = ScreenSpaceReflectionPass._destroyRT(history.ssrPingPongRT[0]);
      history.ssrPingPongRT[1] = ScreenSpaceReflectionPass._destroyRT(history.ssrPingPongRT[1]);
      this._ssrDepthRT = ScreenSpaceReflectionPass._destroyRT(this._ssrDepthRT);
      this._ssrDepthTex = ScreenSpaceReflectionPass._destroyTex(this._ssrDepthTex);

      const depthTex = new Texture2D(engine, traceW, traceH, TextureFormat.Depth24Stencil8, false, false);
      depthTex.filterMode = TextureFilterMode.Point;
      depthTex.wrapModeU = TextureWrapMode.Clamp;
      depthTex.wrapModeV = TextureWrapMode.Clamp;
      depthTex.isGCIgnored = true;
      let depthRT: RenderTarget;
      try {
        depthRT = new RenderTarget(engine, traceW, traceH, null, depthTex, 1);
      } catch (error) {
        ScreenSpaceReflectionPass._destroyTex(depthTex);
        throw error;
      }
      depthRT.autoGenerateMipmaps = false;
      depthRT.isGCIgnored = true;
      this._ssrDepthTex = depthTex;
      this._ssrDepthRT = depthRT;
    }

    // 3. Cross-frame prevTraceDepth (trace resolution)
    if (
      !history.prevTraceDepthRT ||
      !history.prevTraceDepthTex ||
      history.prevTraceDepthTex.width !== traceW ||
      history.prevTraceDepthTex.height !== traceH ||
      history.prevTraceDepthTex.format !== this._depthColorFormat
    ) {
      history.prevTraceDepthRT = ScreenSpaceReflectionPass._destroyRT(history.prevTraceDepthRT);
      history.prevTraceDepthTex = ScreenSpaceReflectionPass._destroyTex(history.prevTraceDepthTex);

      const tex = this._createPointClampTex(traceW, traceH, this._depthColorFormat);
      let rt: RenderTarget;
      try {
        rt = new RenderTarget(engine, traceW, traceH, tex, null, 1);
      } catch (error) {
        ScreenSpaceReflectionPass._destroyTex(tex);
        throw error;
      }
      rt.autoGenerateMipmaps = false;
      rt.isGCIgnored = true;
      history.prevTraceDepthTex = tex;
      history.prevTraceDepthRT = rt;
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
            this._receiverRTs[i] = ScreenSpaceReflectionPass._destroyRT(this._receiverRTs[i]);
          }
          history.ssrPingPongRT[i] = ScreenSpaceReflectionPass._destroyRT(history.ssrPingPongRT[i]);
          let nextTex: Texture2D;
          let allocatedTex = false;
          if (texMismatch) {
            history.ssrPingPongTex[i] = ScreenSpaceReflectionPass._destroyTex(history.ssrPingPongTex[i]);
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
              ScreenSpaceReflectionPass._destroyTex(nextTex);
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
      this._traceOutRT = ScreenSpaceReflectionPass._destroyRT(this._traceOutRT);
      let nextTraceTex = this._traceRawTex;
      let allocatedTraceTex = false;
      let nextHitDistTex = this._hitDistTex;
      let allocatedHitDistTex = false;

      try {
        if (traceSizeMismatch) {
          this._traceRawTex = ScreenSpaceReflectionPass._destroyTex(this._traceRawTex);
          nextTraceTex = new Texture2D(engine, traceW, traceH, this._ssrColorFormat, false, false);
          nextTraceTex.filterMode = TextureFilterMode.Bilinear;
          nextTraceTex.wrapModeU = TextureWrapMode.Clamp;
          nextTraceTex.wrapModeV = TextureWrapMode.Clamp;
          nextTraceTex.isGCIgnored = true;
          allocatedTraceTex = true;
        }

        if (useHighVirtual) {
          if (hitDistNeededMismatch) {
            this._hitDistTex = ScreenSpaceReflectionPass._destroyTex(this._hitDistTex);
            nextHitDistTex = this._createPointClampTex(traceW, traceH, this._depthColorFormat);
            allocatedHitDistTex = true;
          }
        } else {
          this._hitDistTex = ScreenSpaceReflectionPass._destroyTex(this._hitDistTex);
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
      } catch (error) {
        if (allocatedTraceTex) ScreenSpaceReflectionPass._destroyTex(nextTraceTex);
        if (allocatedHitDistTex) ScreenSpaceReflectionPass._destroyTex(nextHitDistTex);
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
    this._receiverRTs[slot] = ScreenSpaceReflectionPass._destroyRT(this._receiverRTs[slot]);

    let nextNRTex = history.recvNRTex[slot];
    let allocatedNR = false;
    let nextDepthTex = history.recvDepthTex[slot];
    let allocatedDepth = false;

    try {
      if (aliasRecvNR) {
        history.recvNRTex[slot] = ScreenSpaceReflectionPass._destroyTex(history.recvNRTex[slot]);
        nextNRTex = null;
      } else if (nrChanged) {
        history.recvNRTex[slot] = ScreenSpaceReflectionPass._destroyTex(history.recvNRTex[slot]);
        nextNRTex = this._createPointClampTex(traceW, traceH, this._normalRoughnessFormat);
        allocatedNR = true;
      }

      if (dChanged) {
        history.recvDepthTex[slot] = ScreenSpaceReflectionPass._destroyTex(history.recvDepthTex[slot]);
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
    } catch (error) {
      if (allocatedNR) ScreenSpaceReflectionPass._destroyTex(nextNRTex);
      if (allocatedDepth) ScreenSpaceReflectionPass._destroyTex(nextDepthTex);
      throw error;
    }
  }

  private _destroyReceiverSlot(slot: 0 | 1): void {
    this._receiverRTs[slot] = ScreenSpaceReflectionPass._destroyRT(this._receiverRTs[slot]);
    this._history.recvNRTex[slot] = ScreenSpaceReflectionPass._destroyTex(this._history.recvNRTex[slot]);
    this._history.recvDepthTex[slot] = ScreenSpaceReflectionPass._destroyTex(this._history.recvDepthTex[slot]);
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

  private _copyTextureToRT(
    source: Texture2D,
    destRT: RenderTarget,
    destMipLevel: number,
    srcMipLevel: number = 0,
    scaleOffset?: Vector4
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
      destMipLevel
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
    this.engine._activeSSRPasses.push(this);
  }

  private _unregisterActiveResources(): void {
    if (!this._hasPersistentResources) {
      return;
    }
    this._hasPersistentResources = false;
    const list = this.engine._activeSSRPasses;
    const idx = list.indexOf(this);
    if (idx !== -1) {
      const last = list.length - 1;
      if (idx !== last) {
        list[idx] = list[last];
      }
      list.length = last;
    }
  }

  private _releasePersistentResources(): void {
    this._unregisterActiveResources();
    this._lastActiveFrameCount = -1;
    // Destroy FBO wrappers before owned textures to keep GL deletion cleanly ordered.
    this._destroyReceiverSlot(0);
    this._destroyReceiverSlot(1);
    this._traceOutRT = ScreenSpaceReflectionPass._destroyRT(this._traceOutRT);
    this._ssrDepthRT = ScreenSpaceReflectionPass._destroyRT(this._ssrDepthRT);

    this._history.releaseResources();
    this._traceRawTex = ScreenSpaceReflectionPass._destroyTex(this._traceRawTex);
    this._hitDistTex = ScreenSpaceReflectionPass._destroyTex(this._hitDistTex);
    this._ssrDepthTex = ScreenSpaceReflectionPass._destroyTex(this._ssrDepthTex);

    this._lastHiZBytes = 0;
    this._lastHiZScratchBytes = 0;
    this._lastColorScratchBytes = 0;
    this._lastContribDepthBytes = 0;
  }

  private _syncEncodingMacros(camera: Camera, materialData: ShaderData): void {
    const packedDepth = this._usesPackedDepthRG8;
    const packedNormal = this._usesPackedNormalOct8;
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
    camera._ssrPackedDepthRG8 = packedDepth;
    camera._ssrPackedNormalOct8 = packedNormal;
  }

  private _resetTemporaryBindings(): void {
    const materialData = this._material.shaderData;
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
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._highVirtualReprojMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._colorPyramidFullResMacro, false);
    ScreenSpaceReflectionPass._setMacro(macros, ScreenSpaceReflectionPass._colorPyramidKarisDownsampleMacro, false);
  }

  private _handleFailure(camera: Camera, stage: string, error: unknown): void {
    Logger.warn(`ScreenSpaceReflectionPass failed during ${stage}; falling back to IBL.`, error);
    this._resetTemporaryBindings();
    this._clearCameraSSREnable(camera);
    this._history.invalidateAll();
    this._state = SSRRuntimeState.Skipped;
    this._updateDiagnostics(false);
  }

  private _clearCameraSSREnable(camera: Camera): void {
    const cameraData = camera.shaderData;
    camera._ssrForwardEnabled = false;
    camera._ssrVerifyReceiverDepth = false;
    camera._ssrBilateralSample = false;
    camera._ssrPackedDepthRG8 = false;
    camera._ssrPackedNormalOct8 = false;
    camera._ssrMaxRoughness = 0.6;
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
    if (history.prevTraceDepthTex) total += history.prevTraceDepthTex._memorySize;
    if (history.recvNRTex[0]) total += history.recvNRTex[0]._memorySize;
    if (history.recvNRTex[1]) total += history.recvNRTex[1]._memorySize;
    if (history.recvDepthTex[0]) total += history.recvDepthTex[0]._memorySize;
    if (history.recvDepthTex[1]) total += history.recvDepthTex[1]._memorySize;
    if (history.ssrPingPongTex[0]) total += history.ssrPingPongTex[0]._memorySize;
    if (history.ssrPingPongTex[1]) total += history.ssrPingPongTex[1]._memorySize;
    total += this._lastHiZBytes + this._lastHiZScratchBytes + this._lastColorScratchBytes + this._lastContribDepthBytes;
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
  }

  private static _setMacro(collection: ShaderMacroCollection, macro: ShaderMacro, enabled: boolean): void {
    if (enabled) {
      collection.enable(macro);
    } else {
      collection.disable(macro);
    }
  }

  private static _destroyRT(rt: RenderTarget | null): null {
    if (rt && !rt.destroyed) {
      const engine = rt.engine;
      const prev = engine._processingPendingDestroys;
      engine._processingPendingDestroys = true;
      try {
        rt.destroy(true);
      } finally {
        engine._processingPendingDestroys = prev;
      }
    }
    return null;
  }

  private static _destroyTex(tex: Texture2D | null): null {
    if (tex && !tex.destroyed) {
      const engine = tex.engine;
      const prev = engine._processingPendingDestroys;
      engine._processingPendingDestroys = true;
      try {
        tex.destroy(true);
      } finally {
        engine._processingPendingDestroys = prev;
      }
    }
    return null;
  }
}
