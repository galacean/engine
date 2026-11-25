import { Vector4 } from "@galacean/engine-math";
import type { RenderStateElementMap } from "../../BasicResources";
import type { Camera } from "../../Camera";
import type { Engine } from "../../Engine";
import { Blitter } from "../../RenderPipeline/Blitter";
import type { CullingResults } from "../../RenderPipeline/CullingResults";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import type { RenderContext } from "../../RenderPipeline/RenderContext";
import type { RenderElement } from "../../RenderPipeline/RenderElement";
import { PipelineStage } from "../../RenderPipeline/enums/PipelineStage";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import type { Material } from "../../material/Material";
import { CompareFunction, ShaderMacro, ShaderProperty } from "../../shader";
import { RenderStateElementKey } from "../../shader/enums/RenderStateElementKey";
import { type Texture2D, TextureFilterMode } from "../../texture";
import type { SSRForwardProgramResolver } from "./SSRForwardProgramResolver";
import type { SSRHistoryState } from "./SSRHistoryState";
import type { SSRPyramidBuilder } from "./SSRPyramidBuilder";
import type { SSRResourceManager } from "./SSRResourceManager";
import {
  type SSRCapabilities,
  type SSRFrameConfig,
  SSRRuntimeState,
  SSR_PASS_HIZ_TRACE,
  SSR_PASS_TEMPORAL_RESOLVE
} from "./SSRConfig";
import { SSRUtils } from "./SSRUtils";

/**
 * Executes SSR receiver MRT generation, Hi-Z / linear ray tracing, temporal resolve,
 * and forward camera uniform binding with zero per-frame allocations.
 * @internal
 */
export class SSRTraceExecutor {
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
  private static readonly _matTraceTexelSizeProp = ShaderProperty.getByName("material_SSRTraceTexelSize");
  private static readonly _matColorPyramidInfoProp = ShaderProperty.getByName("material_SSRColorPyramidInfo");
  private static readonly _matTraceSettingsProp = ShaderProperty.getByName("material_SSRTraceSettings");
  private static readonly _matMaxStepsProp = ShaderProperty.getByName("material_SSRMaxSteps");
  private static readonly _matHiZMaxMipProp = ShaderProperty.getByName("material_SSRHiZMaxMip");
  private static readonly _matTemporalBlendProp = ShaderProperty.getByName("material_SSRTemporalBlend");

  // Pass macros
  private static readonly _packedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static readonly _packedNormalMacro = ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8");
  private static readonly _packedHDRMacro = ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD");
  private static readonly _outputHitDistMacro = ShaderMacro.getByName("SSR_OUTPUT_HIT_DIST");
  private static readonly _highVirtualReprojMacro = ShaderMacro.getByName("SSR_HIGH_VIRTUAL_REPROJECTION");
  private static readonly _linearTraceMacro = ShaderMacro.getByName("SSR_LINEAR_TRACE");
  private static readonly _temporal5TapMacro = ShaderMacro.getByName("SSR_TEMPORAL_5TAP_CLAMP");

  // Pre-allocated scratch uniform vectors and receiver render state map
  private readonly _ssrParams = new Vector4();
  private readonly _traceTexelSize = new Vector4();
  private readonly _colorPyramidInfo = new Vector4();
  private readonly _traceSettings = new Vector4();
  private readonly _receiverStates: RenderStateElementMap = <RenderStateElementMap>{
    [RenderStateElementKey.DepthStateEnabled]: true,
    [RenderStateElementKey.DepthStateWriteEnabled]: true,
    [RenderStateElementKey.DepthStateCompareFunction]: CompareFunction.LessEqual
  };

  private readonly _engine: Engine;
  private readonly _material: Material;
  private readonly _history: SSRHistoryState;
  private readonly _resources: SSRResourceManager;
  private readonly _pyramidBuilder: SSRPyramidBuilder;
  private readonly _programResolver: SSRForwardProgramResolver;

  constructor(
    engine: Engine,
    material: Material,
    history: SSRHistoryState,
    resources: SSRResourceManager,
    pyramidBuilder: SSRPyramidBuilder,
    programResolver: SSRForwardProgramResolver
  ) {
    this._engine = engine;
    this._material = material;
    this._history = history;
    this._resources = resources;
    this._pyramidBuilder = pyramidBuilder;
    this._programResolver = programResolver;
  }

  /**
   * Execute Step E–I: receiver MRT, ray tracing, optional temporal resolve, forward sampling bindings,
   * and commit current-frame Hi-Z ping-pong state.
   */
  executeFrame(
    context: RenderContext,
    cullingResults: CullingResults,
    state: SSRRuntimeState,
    caps: SSRCapabilities,
    frame: SSRFrameConfig,
    isReceiverElement: (element: RenderElement) => boolean
  ): void {
    const history = this._history;
    const resources = this._resources;
    const { traceWidth: traceW, traceHeight: traceH, receiverScissor: scissor } = frame;
    const { useTemporal } = frame.preset;
    const currHiZIdx = history.hiZPingPongIndex;
    const prevHiZIdx: 0 | 1 = currHiZIdx === 0 ? 1 : 0;
    const currHiZTex = history.hiZTex[currHiZIdx]!;
    const prevHiZTex = history.hasHiZHistory ? history.hiZTex[prevHiZIdx]! : currHiZTex;
    const currIdx = useTemporal ? history.temporalPingPongIndex : 0;
    const prevIdx: 0 | 1 = currIdx === 0 ? 1 : 0;
    const isFullScreenScissor = scissor.x === 0 && scissor.y === 0 && scissor.z === traceW && scissor.w === traceH;
    const scissorArg = isFullScreenScissor ? undefined : scissor;

    this._executeReceiverPass(context, cullingResults, caps, frame, currIdx, isFullScreenScissor, isReceiverElement);

    const currRecvNR = frame.aliasRecvNR ? history.ssrPingPongTex[currIdx]! : history.recvNRTex[currIdx]!;
    const currRecvDepth = history.recvDepthTex[currIdx]!;
    this._executeTracePass(context, frame, currHiZTex, prevHiZTex, currRecvNR, currRecvDepth, scissorArg);

    const traceRawTex = resources.traceRawTex!;
    const finalSSRTex = useTemporal
      ? this._executeTemporalResolve(context, state, frame, traceRawTex, currRecvNR, currIdx, prevIdx, scissorArg)
      : traceRawTex;

    if (!isFullScreenScissor) {
      this._engine._hardwareRenderer.scissor(0, 0, traceW, traceH);
    }

    this._bindForwardSampling(context, finalSSRTex, currRecvDepth, currRecvNR, caps, frame);
    history.hasHiZHistory = true;
    history.hiZPingPongIndex = prevHiZIdx;
  }

  /**
   * Clear previously dirty receiver/trace/temporal regions when receivers are offscreen.
   */
  clearOffscreenDirtyRects(context: RenderContext, frame: SSRFrameConfig): void {
    const engine = this._engine;
    const history = this._history;
    const resources = this._resources;
    const currIdx = frame.preset.useTemporal ? history.temporalPingPongIndex : 0;
    const {
      preset: { useTemporal },
      traceWidth: traceW,
      traceHeight: traceH,
      aliasRecvNR
    } = frame;
    const receiverRT = resources.receiverRTs[currIdx];
    if (receiverRT) {
      SSRUtils.clearDirtyUnion(
        engine,
        context,
        receiverRT,
        history.recvSlotDirtyRect[currIdx],
        aliasRecvNR ? history.ssrSlotDirtyRect[currIdx] : null,
        0,
        0,
        0,
        0,
        0,
        traceW,
        traceH
      );
    }
    if (resources.traceOutRT) {
      SSRUtils.clearDirtyUnion(
        engine,
        context,
        resources.traceOutRT,
        resources.traceDirtyRect,
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
    if (useTemporal) {
      const dstSSRRT = history.ssrPingPongRT[currIdx];
      if (dstSSRRT) {
        SSRUtils.clearDirtyUnion(
          engine,
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

  /**
   * Synchronize packed depth/normal/HDR shader encoding macros on the shared SSR material
   * before Hi-Z pyramid generation or receiver/trace passes execute.
   */
  syncEncodingMacros(caps: SSRCapabilities): void {
    const macros = this._material.shaderData._macroCollection;
    SSRUtils.setMacro(macros, SSRTraceExecutor._packedDepthMacro, caps.usesPackedDepthRG8);
    SSRUtils.setMacro(macros, SSRTraceExecutor._packedNormalMacro, caps.usesPackedNormalOct8);
    SSRUtils.setMacro(macros, SSRTraceExecutor._packedHDRMacro, caps.usesPackedHDRReinhard);
  }

  private _executeReceiverPass(
    context: RenderContext,
    cullingResults: CullingResults,
    caps: SSRCapabilities,
    frame: SSRFrameConfig,
    currIdx: 0 | 1,
    isFullScreenScissor: boolean,
    isReceiverElement: (element: RenderElement) => boolean
  ): void {
    const engine = this._engine;
    const rhi = engine._hardwareRenderer;
    const { camera } = context;
    const history = this._history;
    const {
      settings,
      receiverScissor: scissor,
      traceWidth: traceW,
      traceHeight: traceH,
      aliasRecvNR,
      opaqueReceiverCount,
      transparentReceiverCount
    } = frame;
    const sx0 = scissor.x;
    const sy0 = scissor.y;
    const sw = scissor.z;
    const sh = scissor.w;
    const traceScale = Math.min(1, traceW / Math.max(1, camera.pixelViewport.width));

    this._ssrParams.set(settings.intensity, settings.maxRoughness, traceScale, camera.farClipPlane);
    camera.shaderData.setVector4(SSRTraceExecutor._cameraSSRParamsProp, this._ssrParams);

    const receiverRT = this._resources.receiverRTs[currIdx]!;
    SSRUtils.clearDirtyUnion(
      engine,
      context,
      receiverRT,
      history.recvSlotDirtyRect[currIdx],
      aliasRecvNR ? history.ssrSlotDirtyRect[currIdx] : null,
      sx0,
      sy0,
      sx0 + sw,
      sy0 + sh,
      0,
      traceW,
      traceH
    );
    if (!isFullScreenScissor) {
      rhi.scissor(sx0, sy0, sw, sh);
    }

    this._programResolver.configureReceiverEncoding(
      caps.usesPackedDepthRG8,
      caps.usesPackedNormalOct8,
      caps.usesPackedHDRReinhard
    );
    context.programResolver = this._programResolver;

    const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;
    if (opaqueReceiverCount > 0) {
      opaqueQueue.render(context, PipelineStage.SSRReceiver, undefined, this._receiverStates, isReceiverElement);
      alphaTestQueue.render(context, PipelineStage.SSRReceiver, undefined, this._receiverStates, isReceiverElement);
    }
    if (transparentReceiverCount > 0) {
      transparentQueue.render(context, PipelineStage.SSRReceiver, undefined, this._receiverStates, isReceiverElement);
    }
  }

  private _executeTracePass(
    context: RenderContext,
    frame: SSRFrameConfig,
    currHiZTex: Texture2D,
    prevHiZTex: Texture2D,
    currRecvNR: Texture2D,
    currRecvDepth: Texture2D,
    scissorArg: Vector4 | undefined
  ): void {
    const engine = this._engine;
    const history = this._history;
    const resources = this._resources;
    const material = this._material;
    const materialData = material.shaderData;
    const cameraData = context.camera.shaderData;
    const {
      settings,
      preset: { maxSteps: traceSteps, useLinearTrace, useHighVirtual, useTemporal },
      invProjMat,
      invViewMat,
      receiverScissor: scissor,
      traceWidth: traceW,
      traceHeight: traceH,
      colorWidth: colorW,
      colorHeight: colorH,
      maxHiZMip,
      useHardwareStencil,
      aliasRecvNR
    } = frame;
    const sx0 = scissor.x;
    const sy0 = scissor.y;
    const sx1 = sx0 + scissor.z;
    const sy1 = sy0 + scissor.w;

    if (aliasRecvNR) {
      currRecvNR.filterMode = TextureFilterMode.Point;
    }
    try {
      SSRUtils.setTexelSize(this._traceTexelSize, traceW, traceH);
      this._colorPyramidInfo.set(this._pyramidBuilder.lastMaxColorMip, colorW, colorH, engine.time.frameCount & 63);
      this._traceSettings.set(settings.maxDistance, settings.thickness, settings.maxRoughness, settings.edgeFade);

      cameraData.setMatrix(SSRTraceExecutor._cameraSSRInvProjMatProp, invProjMat);
      cameraData.setMatrix(SSRTraceExecutor._cameraSSRInvViewMatProp, invViewMat);
      cameraData.setMatrix(SSRTraceExecutor._cameraSSRPrevVPMatProp, history.prevVPMat);
      if (useHighVirtual) {
        cameraData.setMatrix(SSRTraceExecutor._cameraSSRPrevInvProjMatProp, history.prevInvProjMat);
        cameraData.setMatrix(SSRTraceExecutor._cameraSSRPrevInvViewMatProp, history.prevInvViewMat);
      }
      cameraData.setVector4(SSRTraceExecutor._cameraSSRPrevViewZRowProp, history.prevViewZRow);

      materialData.setInt(SSRTraceExecutor._matUseHWStencilProp, useHardwareStencil ? 1 : 0);
      materialData.setTexture(SSRTraceExecutor._matHiZTextureProp, currHiZTex);
      materialData.setTexture(SSRTraceExecutor._matNormalRoughnessProp, currRecvNR);
      materialData.setTexture(SSRTraceExecutor._matReceiverDepthProp, currRecvDepth);
      materialData.setTexture(SSRTraceExecutor._matPrevColorPyramidProp, history.prevColorPyramidTex!);
      materialData.setTexture(SSRTraceExecutor._matPrevTraceDepthProp, prevHiZTex);
      materialData.setVector4(SSRTraceExecutor._matTraceTexelSizeProp, this._traceTexelSize);
      materialData.setVector4(SSRTraceExecutor._matColorPyramidInfoProp, this._colorPyramidInfo);
      materialData.setVector4(SSRTraceExecutor._matTraceSettingsProp, this._traceSettings);
      materialData.setFloat(SSRTraceExecutor._matMaxStepsProp, traceSteps);
      materialData.setFloat(SSRTraceExecutor._matHiZMaxMipProp, maxHiZMip);
      SSRUtils.setMacro(materialData._macroCollection, SSRTraceExecutor._outputHitDistMacro, useHighVirtual);
      SSRUtils.setMacro(materialData._macroCollection, SSRTraceExecutor._linearTraceMacro, useLinearTrace);

      const traceOutRT = resources.traceOutRT!;
      // Expand clear pad by 2px on traceOutRT so TemporalResolve neighbor taps outside scissor read zero.
      SSRUtils.clearDirtyUnion(
        engine,
        context,
        traceOutRT,
        resources.traceDirtyRect,
        null,
        sx0,
        sy0,
        sx1,
        sy1,
        2,
        traceW,
        traceH
      );
      Blitter.blitTexture(
        engine,
        currRecvNR,
        traceOutRT,
        0,
        PipelineUtils.defaultViewport,
        material,
        SSR_PASS_HIZ_TRACE,
        undefined,
        0,
        false,
        scissorArg
      );
      if (!useTemporal && useHardwareStencil) {
        engine._hardwareRenderer.invalidateRenderTarget?.(traceOutRT, CameraClearFlags.DepthStencil);
      }
    } finally {
      if (aliasRecvNR) {
        currRecvNR.filterMode = TextureFilterMode.Bilinear;
      }
      SSRUtils.setMacro(materialData._macroCollection, SSRTraceExecutor._outputHitDistMacro, false);
      SSRUtils.setMacro(materialData._macroCollection, SSRTraceExecutor._linearTraceMacro, false);
    }
    materialData.setTexture(SSRTraceExecutor._matHiZTextureProp, null);
    materialData.setTexture(SSRTraceExecutor._matNormalRoughnessProp, null);
  }

  private _executeTemporalResolve(
    context: RenderContext,
    state: SSRRuntimeState,
    frame: SSRFrameConfig,
    traceRawTex: Texture2D,
    currRecvNR: Texture2D,
    currIdx: 0 | 1,
    prevIdx: 0 | 1,
    scissorArg: Vector4 | undefined
  ): Texture2D {
    const engine = this._engine;
    const rhi = engine._hardwareRenderer;
    const history = this._history;
    const material = this._material;
    const materialData = material.shaderData;
    const dstSSRRT = history.ssrPingPongRT[currIdx]!;
    const dstSSRTex = history.ssrPingPongTex[currIdx]!;
    const {
      settings,
      preset: { useHighVirtual },
      receiverScissor: scissor,
      traceWidth: traceW,
      traceHeight: traceH,
      useHardwareStencil
    } = frame;
    const sx0 = scissor.x;
    const sy0 = scissor.y;
    const sx1 = sx0 + scissor.z;
    const sy1 = sy0 + scissor.w;

    SSRUtils.clearDirtyUnion(
      engine,
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
      this._pyramidBuilder.copyTextureToRT(traceRawTex, dstSSRRT, 0, 0, undefined, scissorArg, false);
      if (useHardwareStencil) {
        rhi.invalidateRenderTarget?.(dstSSRRT, CameraClearFlags.DepthStencil);
      }
      history.hasTemporalHistory = true;
      return dstSSRTex;
    }

    try {
      SSRUtils.setMacro(materialData._macroCollection, SSRTraceExecutor._highVirtualReprojMacro, useHighVirtual);
      SSRUtils.setMacro(materialData._macroCollection, SSRTraceExecutor._temporal5TapMacro, !useHighVirtual);
      materialData.setTexture(SSRTraceExecutor._matTraceRawProp, traceRawTex);
      materialData.setTexture(SSRTraceExecutor._matPrevSSRProp, history.ssrPingPongTex[prevIdx]!);
      materialData.setTexture(SSRTraceExecutor._matPrevRecvDepthProp, history.recvDepthTex[prevIdx]!);
      materialData.setFloat(SSRTraceExecutor._matTemporalBlendProp, settings.temporalBlend);

      if (useHighVirtual) {
        materialData.setTexture(SSRTraceExecutor._matHitDistProp, this._resources.hitDistTex!);
        materialData.setTexture(SSRTraceExecutor._matNormalRoughnessProp, currRecvNR);
        materialData.setTexture(SSRTraceExecutor._matPrevNormalRoughnessProp, history.recvNRTex[prevIdx]!);
      }

      Blitter.blitTexture(
        engine,
        traceRawTex,
        dstSSRRT,
        0,
        PipelineUtils.defaultViewport,
        material,
        SSR_PASS_TEMPORAL_RESOLVE,
        undefined,
        0,
        false,
        scissorArg
      );
      if (useHardwareStencil) {
        rhi.invalidateRenderTarget?.(dstSSRRT, CameraClearFlags.DepthStencil);
      }
    } finally {
      materialData.setTexture(SSRTraceExecutor._matTraceRawProp, null);
      materialData.setTexture(SSRTraceExecutor._matPrevSSRProp, null);
      materialData.setTexture(SSRTraceExecutor._matPrevRecvDepthProp, null);
      materialData.setTexture(SSRTraceExecutor._matHitDistProp, null);
      materialData.setTexture(SSRTraceExecutor._matNormalRoughnessProp, null);
      materialData.setTexture(SSRTraceExecutor._matPrevNormalRoughnessProp, null);
      SSRUtils.setMacro(materialData._macroCollection, SSRTraceExecutor._highVirtualReprojMacro, false);
      SSRUtils.setMacro(materialData._macroCollection, SSRTraceExecutor._temporal5TapMacro, false);
    }

    return dstSSRTex;
  }

  private _bindForwardSampling(
    context: RenderContext,
    finalSSRTex: Texture2D,
    currRecvDepth: Texture2D,
    currRecvNR: Texture2D,
    caps: SSRCapabilities,
    frame: SSRFrameConfig
  ): void {
    const materialData = this._material.shaderData;
    materialData.setTexture(SSRTraceExecutor._matReceiverDepthProp, null);
    materialData.setTexture(SSRTraceExecutor._matPrevColorPyramidProp, null);
    materialData.setTexture(SSRTraceExecutor._matPrevTraceDepthProp, null);

    const cameraData = context.camera.shaderData;
    const hasTransparentReceivers = frame.transparentReceiverCount > 0;
    const { useBilateral } = frame.preset;
    const needsRecvDepthInForward = useBilateral || hasTransparentReceivers;
    cameraData.setTexture(SSRTraceExecutor._cameraSSRTextureProp, finalSSRTex);
    cameraData.setVector4(SSRTraceExecutor._cameraSSRTraceTexelSizeProp, this._traceTexelSize);
    cameraData.setTexture(SSRTraceExecutor._cameraSSRRecvDepthProp, needsRecvDepthInForward ? currRecvDepth : null);
    cameraData.setTexture(SSRTraceExecutor._cameraSSRRecvNRProp, useBilateral ? currRecvNR : null);

    this._programResolver.configureForward(
      frame.settings.maxRoughness,
      useBilateral,
      hasTransparentReceivers,
      caps.usesPackedDepthRG8,
      caps.usesPackedNormalOct8,
      caps.usesPackedHDRReinhard
    );
    context.programResolver = this._programResolver;
  }

  /**
   * Unbind SSR camera textures and detach the forward program resolver.
   */
  static clearCameraBindings(
    engine: Engine,
    programResolver: SSRForwardProgramResolver,
    camera: Camera,
    context?: RenderContext
  ): void {
    programResolver.reset();
    const cameraData = camera.shaderData;
    const renderContext =
      context ??
      (engine._renderContext.camera === camera || engine._renderContext.camera === null ? engine._renderContext : null);
    if (renderContext && renderContext.programResolver === programResolver) {
      renderContext.programResolver = null;
    }
    if (cameraData) {
      cameraData.setTexture(SSRTraceExecutor._cameraSSRTextureProp, null);
      cameraData.setTexture(SSRTraceExecutor._cameraSSRRecvDepthProp, null);
      cameraData.setTexture(SSRTraceExecutor._cameraSSRRecvNRProp, null);
    }
  }

  /**
   * Clear temporary texture bindings and macros on the internal SSR material.
   */
  static resetTemporaryBindings(material: Material | null | undefined): void {
    const materialData = material?.shaderData;
    if (!materialData) {
      return;
    }
    const macros = materialData._macroCollection;
    materialData.setTexture(SSRTraceExecutor._matHiZTextureProp, null);
    materialData.setTexture(SSRTraceExecutor._matNormalRoughnessProp, null);
    materialData.setTexture(SSRTraceExecutor._matReceiverDepthProp, null);
    materialData.setTexture(SSRTraceExecutor._matPrevColorPyramidProp, null);
    materialData.setTexture(SSRTraceExecutor._matPrevTraceDepthProp, null);
    materialData.setTexture(SSRTraceExecutor._matTraceRawProp, null);
    materialData.setTexture(SSRTraceExecutor._matPrevSSRProp, null);
    materialData.setTexture(SSRTraceExecutor._matPrevRecvDepthProp, null);
    materialData.setTexture(SSRTraceExecutor._matHitDistProp, null);
    materialData.setTexture(SSRTraceExecutor._matPrevNormalRoughnessProp, null);
    SSRUtils.setMacro(macros, SSRTraceExecutor._outputHitDistMacro, false);
    SSRUtils.setMacro(macros, SSRTraceExecutor._linearTraceMacro, false);
    SSRUtils.setMacro(macros, SSRTraceExecutor._temporal5TapMacro, false);
    SSRUtils.setMacro(macros, SSRTraceExecutor._packedHDRMacro, false);
    SSRUtils.setMacro(macros, SSRTraceExecutor._highVirtualReprojMacro, false);
  }
}
