import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { Camera } from "../../Camera";
import type { Engine } from "../../Engine";
import { Blitter } from "../../RenderPipeline/Blitter";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import type { RenderContext } from "../../RenderPipeline/RenderContext";
import type { Material } from "../../material/Material";
import { type ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import type { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import type { Texture2D } from "../../texture";
import type { SSRHistoryState } from "./SSRHistoryState";
import type { SSRResourceManager } from "./SSRResourceManager";
import type { SSRCapabilities, SSRFrameConfig } from "./SSRConfig";
import { SSRRuntimeState, SSRShaderPass } from "./SSRConfig";

/**
 * Executes Hi-Z / linear ray tracing, temporal resolve, and forward camera uniform binding
 * using the shared prepass depth & normal-roughness textures with zero per-frame allocations.
 * @internal
 */
export class SSRTraceExecutor {
  // Camera shader properties (Forward sampling)
  private static readonly _cameraSSRTextureProp = ShaderProperty.getByName("camera_SSRTexture");
  private static readonly _cameraSSRParamsProp = ShaderProperty.getByName("camera_SSRParams");
  private static readonly _cameraSSRTraceTexelSizeProp = ShaderProperty.getByName("camera_SSRTraceTexelSize");

  // Material shader properties (internal Trace / Temporal passes)
  private static readonly _matInvProjMatProp = ShaderProperty.getByName("material_SSRInvProjMat");
  private static readonly _matInvViewMatProp = ShaderProperty.getByName("material_SSRInvViewMat");
  private static readonly _matPrevVPMatProp = ShaderProperty.getByName("material_SSRPrevVPMat");
  private static readonly _matPrevInvProjMatProp = ShaderProperty.getByName("material_SSRPrevInvProjMat");
  private static readonly _matPrevInvViewMatProp = ShaderProperty.getByName("material_SSRPrevInvViewMat");
  private static readonly _matPrevViewZRowProp = ShaderProperty.getByName("material_SSRPrevViewZRow");
  private static readonly _matHiZTextureProp = ShaderProperty.getByName("material_SSRHiZTexture");
  private static readonly _matDepthTextureProp = ShaderProperty.getByName("material_SSRDepthTexture");
  private static readonly _matNormalRoughnessProp = ShaderProperty.getByName("material_SSRNormalRoughnessTexture");
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
  private static readonly _ssrEnableMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
  private static readonly _ssrBilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
  private static readonly _packedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static readonly _packedNormalMacro = ShaderMacro.getByName("CAMERA_DEPTH_NORMALS_PACKED_OCT8");
  private static readonly _packedHDRMacro = ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD");
  private static readonly _outputHitDistMacro = ShaderMacro.getByName("SSR_OUTPUT_HIT_DIST");
  private static readonly _highVirtualReprojMacro = ShaderMacro.getByName("SSR_HIGH_VIRTUAL_REPROJECTION");
  private static readonly _linearTraceMacro = ShaderMacro.getByName("SSR_LINEAR_TRACE");
  private static readonly _temporal5TapMacro = ShaderMacro.getByName("SSR_TEMPORAL_5TAP_CLAMP");

  private static readonly _traceCleanupTextures: readonly ShaderProperty[] = [
    SSRTraceExecutor._matPrevColorPyramidProp,
    SSRTraceExecutor._matPrevTraceDepthProp,
    SSRTraceExecutor._matHiZTextureProp
  ];
  private static readonly _temporalCleanupTextures: readonly ShaderProperty[] = [
    SSRTraceExecutor._matTraceRawProp,
    SSRTraceExecutor._matPrevSSRProp,
    SSRTraceExecutor._matPrevRecvDepthProp,
    SSRTraceExecutor._matHitDistProp,
    SSRTraceExecutor._matPrevNormalRoughnessProp
  ];
  private static readonly _forwardCleanupMacros: readonly ShaderMacro[] = [
    SSRTraceExecutor._ssrEnableMacro,
    SSRTraceExecutor._ssrBilateralMacro,
    SSRTraceExecutor._packedNormalMacro,
    SSRTraceExecutor._packedHDRMacro
  ];

  // Pre-allocated scratch uniform vectors
  private readonly _ssrParams = new Vector2();
  private readonly _traceTexelSize = new Vector4();
  private readonly _colorPyramidInfo = new Vector3();
  private readonly _traceSettings = new Vector4();

  private readonly _engine: Engine;
  private readonly _material: Material;
  private readonly _history: SSRHistoryState;
  private readonly _resources: SSRResourceManager;

  constructor(engine: Engine, material: Material, history: SSRHistoryState, resources: SSRResourceManager) {
    this._engine = engine;
    this._material = material;
    this._history = history;
    this._resources = resources;
  }

  /**
   * Execute ray tracing, optional temporal resolve, previous normal capture, and forward binding.
   */
  executeFrame(
    context: RenderContext,
    state: SSRRuntimeState,
    fullDepthTex: Texture2D,
    fullNormalRoughnessTex: Texture2D,
    caps: SSRCapabilities,
    frame: SSRFrameConfig
  ): void {
    const history = this._history;
    const resources = this._resources;
    const {
      settings,
      useHighVirtual,
      preset: { useTemporal }
    } = frame;
    const currHiZIdx = history.hiZPingPongIndex;
    const prevHiZIdx: 0 | 1 = currHiZIdx === 0 ? 1 : 0;
    const currHiZTex = resources.hiZTex[currHiZIdx]!;
    const prevHiZTex = history.hasHiZHistory ? resources.hiZTex[prevHiZIdx]! : currHiZTex;
    const currIdx = useTemporal ? history.temporalPingPongIndex : 0;
    const prevIdx: 0 | 1 = currIdx === 0 ? 1 : 0;

    const { camera } = context;
    this._ssrParams.set(settings.intensity, settings.maxRoughness);
    camera.shaderData.setVector2(SSRTraceExecutor._cameraSSRParamsProp, this._ssrParams);

    this._executeTracePass(caps, frame, currHiZTex, prevHiZTex, fullDepthTex, fullNormalRoughnessTex);

    const traceRawTex = resources.traceRawTex!;
    const finalSSRTex = useTemporal
      ? this._executeTemporalResolve(state, caps, frame, traceRawTex, prevHiZTex, currIdx, prevIdx)
      : traceRawTex;

    // Clear encoding macros before CopyTexture / onPostTransparent color pyramid blits
    // so shared passes do not multiply unused shader variants.
    this.clearMaterialEncodingMacros();

    // Unbind trace/temporal shared inputs from the SSR material after both passes finish.
    const materialData = this._material.shaderData;
    materialData.setTexture(SSRTraceExecutor._matDepthTextureProp, null);
    materialData.setTexture(SSRTraceExecutor._matNormalRoughnessProp, null);

    if (useHighVirtual) {
      // Snapshot current normal-roughness into trace-resolution history for next frame's virtual reprojection.
      Blitter.blitTexture(
        this._engine,
        fullNormalRoughnessTex,
        resources.prevNormalRoughnessRT!,
        0,
        PipelineUtils.defaultViewport,
        this._material,
        SSRShaderPass.CopyTexture,
        undefined,
        0
      );
    }

    this._bindForwardSampling(context, finalSSRTex);
  }

  /**
   * Synchronize depth encoding macro for Hi-Z pyramid passes without enabling normal/HDR trace macros.
   */
  syncDepthEncodingMacro(caps: SSRCapabilities): void {
    const macros = this._material.shaderData._macroCollection;
    SSRTraceExecutor._setMacro(macros, SSRTraceExecutor._packedDepthMacro, caps.usesPackedDepthRG8);
    macros.disable(SSRTraceExecutor._packedNormalMacro);
    macros.disable(SSRTraceExecutor._packedHDRMacro);
  }

  /**
   * Disable encoding macros on the shared SSR material so copy and color-pyramid passes share one minimal variant.
   */
  clearMaterialEncodingMacros(): void {
    const macros = this._material.shaderData._macroCollection;
    macros.disable(SSRTraceExecutor._packedDepthMacro);
    macros.disable(SSRTraceExecutor._packedNormalMacro);
    macros.disable(SSRTraceExecutor._packedHDRMacro);
  }

  private _executeTracePass(
    caps: SSRCapabilities,
    frame: SSRFrameConfig,
    currHiZTex: Texture2D,
    prevHiZTex: Texture2D,
    fullDepthTex: Texture2D,
    fullNormalRoughnessTex: Texture2D
  ): void {
    const engine = this._engine;
    const history = this._history;
    const resources = this._resources;
    const material = this._material;
    const materialData = material.shaderData;
    const macros = materialData._macroCollection;
    const {
      settings,
      preset: { maxSteps: traceSteps, useLinearTrace },
      invProjMat,
      invViewMat,
      traceWidth: traceW,
      traceHeight: traceH,
      colorHeight: colorH,
      maxHiZMip,
      useHighVirtual
    } = frame;

    this._traceTexelSize.set(1 / traceW, 1 / traceH, traceW, traceH);
    this._colorPyramidInfo.set(history.maxColorMip, colorH, engine.time.frameCount & 63);
    this._traceSettings.set(settings.maxDistance, settings.thickness, settings.maxRoughness, settings.edgeFade);

    materialData.setMatrix(SSRTraceExecutor._matInvProjMatProp, invProjMat);
    materialData.setMatrix(SSRTraceExecutor._matInvViewMatProp, invViewMat);
    materialData.setMatrix(SSRTraceExecutor._matPrevVPMatProp, history.prevVPMat);
    if (useHighVirtual) {
      materialData.setMatrix(SSRTraceExecutor._matPrevInvProjMatProp, history.prevInvProjMat);
      materialData.setMatrix(SSRTraceExecutor._matPrevInvViewMatProp, history.prevInvViewMat);
    }
    materialData.setVector4(SSRTraceExecutor._matPrevViewZRowProp, history.prevViewZRow);

    materialData.setTexture(SSRTraceExecutor._matHiZTextureProp, currHiZTex);
    materialData.setTexture(SSRTraceExecutor._matDepthTextureProp, fullDepthTex);
    materialData.setTexture(SSRTraceExecutor._matNormalRoughnessProp, fullNormalRoughnessTex);
    materialData.setTexture(SSRTraceExecutor._matPrevColorPyramidProp, resources.prevColorPyramidTex!);
    materialData.setTexture(SSRTraceExecutor._matPrevTraceDepthProp, prevHiZTex);
    materialData.setVector4(SSRTraceExecutor._matTraceTexelSizeProp, this._traceTexelSize);
    materialData.setVector3(SSRTraceExecutor._matColorPyramidInfoProp, this._colorPyramidInfo);
    materialData.setVector4(SSRTraceExecutor._matTraceSettingsProp, this._traceSettings);
    materialData.setFloat(SSRTraceExecutor._matMaxStepsProp, traceSteps);
    if (!useLinearTrace) {
      materialData.setFloat(SSRTraceExecutor._matHiZMaxMipProp, maxHiZMip);
    }
    SSRTraceExecutor._setMacro(macros, SSRTraceExecutor._packedNormalMacro, caps.usesPackedNormalOct8);
    SSRTraceExecutor._setMacro(macros, SSRTraceExecutor._packedHDRMacro, caps.usesPackedHDRReinhard);
    SSRTraceExecutor._setMacro(macros, SSRTraceExecutor._outputHitDistMacro, useHighVirtual);
    SSRTraceExecutor._setMacro(macros, SSRTraceExecutor._linearTraceMacro, useLinearTrace);

    Blitter.blitTexture(
      engine,
      fullNormalRoughnessTex,
      resources.traceOutRT!,
      0,
      PipelineUtils.defaultViewport,
      material,
      SSRShaderPass.HiZTrace
    );
    macros.disable(SSRTraceExecutor._packedHDRMacro);
    macros.disable(SSRTraceExecutor._outputHitDistMacro);
    macros.disable(SSRTraceExecutor._linearTraceMacro);
    SSRTraceExecutor._clearTextures(materialData, SSRTraceExecutor._traceCleanupTextures);
  }

  private _executeTemporalResolve(
    state: SSRRuntimeState,
    caps: SSRCapabilities,
    frame: SSRFrameConfig,
    traceRawTex: Texture2D,
    prevHiZTex: Texture2D,
    currIdx: 0 | 1,
    prevIdx: 0 | 1
  ): Texture2D {
    const engine = this._engine;
    const resources = this._resources;
    const material = this._material;
    const materialData = material.shaderData;
    const macros = materialData._macroCollection;
    const dstSSRRT = resources.ssrPingPongRT[currIdx]!;
    const dstSSRTex = resources.ssrPingPongTex[currIdx]!;
    const { settings, useHighVirtual } = frame;

    if (state === SSRRuntimeState.FirstTrace) {
      this.clearMaterialEncodingMacros();
      Blitter.blitTexture(
        engine,
        traceRawTex,
        dstSSRRT,
        0,
        PipelineUtils.defaultViewport,
        material,
        SSRShaderPass.CopyTexture,
        undefined,
        0
      );
      this._history.hasTemporalHistory = true;
      return dstSSRTex;
    }

    SSRTraceExecutor._setMacro(macros, SSRTraceExecutor._packedNormalMacro, caps.usesPackedNormalOct8);
    SSRTraceExecutor._setMacro(macros, SSRTraceExecutor._highVirtualReprojMacro, useHighVirtual);
    SSRTraceExecutor._setMacro(macros, SSRTraceExecutor._temporal5TapMacro, !useHighVirtual);
    materialData.setTexture(SSRTraceExecutor._matTraceRawProp, traceRawTex);
    materialData.setTexture(SSRTraceExecutor._matPrevSSRProp, resources.ssrPingPongTex[prevIdx]!);
    materialData.setTexture(SSRTraceExecutor._matPrevRecvDepthProp, prevHiZTex);
    materialData.setFloat(SSRTraceExecutor._matTemporalBlendProp, settings.temporalBlend);
    if (useHighVirtual) {
      materialData.setTexture(SSRTraceExecutor._matHitDistProp, resources.hitDistTex!);
      materialData.setTexture(SSRTraceExecutor._matPrevNormalRoughnessProp, resources.prevNormalRoughnessTex!);
    }

    Blitter.blitTexture(
      engine,
      traceRawTex,
      dstSSRRT,
      0,
      PipelineUtils.defaultViewport,
      material,
      SSRShaderPass.TemporalResolve
    );
    SSRTraceExecutor._clearTextures(materialData, SSRTraceExecutor._temporalCleanupTextures);
    macros.disable(SSRTraceExecutor._highVirtualReprojMacro);
    macros.disable(SSRTraceExecutor._temporal5TapMacro);

    return dstSSRTex;
  }

  private _bindForwardSampling(context: RenderContext, finalSSRTex: Texture2D): void {
    const cameraData = context.camera.shaderData;
    cameraData.setTexture(SSRTraceExecutor._cameraSSRTextureProp, finalSSRTex);
    cameraData.setVector4(SSRTraceExecutor._cameraSSRTraceTexelSizeProp, this._traceTexelSize);
  }

  /**
   * Enable transient Forward SSR sampling macros on `engine._macroCollection` for opaque/alpha-test rendering.
   */
  enableForwardMacros(caps: SSRCapabilities, frame: SSRFrameConfig): void {
    const engineMacros = this._engine._macroCollection;
    const { useBilateral } = frame.preset;
    engineMacros.enable(SSRTraceExecutor._ssrEnableMacro);
    SSRTraceExecutor._setMacro(engineMacros, SSRTraceExecutor._ssrBilateralMacro, useBilateral);
    SSRTraceExecutor._setMacro(
      engineMacros,
      SSRTraceExecutor._packedNormalMacro,
      caps.usesPackedNormalOct8 && useBilateral
    );
    SSRTraceExecutor._setMacro(engineMacros, SSRTraceExecutor._packedHDRMacro, caps.usesPackedHDRReinhard);
  }

  /**
   * Clear transient Forward SSR sampling macros from `engine._macroCollection`.
   */
  disableForwardMacros(): void {
    const engineMacros = this._engine._macroCollection;
    const macros = SSRTraceExecutor._forwardCleanupMacros;
    for (let i = 0; i < macros.length; i++) {
      engineMacros.disable(macros[i]);
    }
  }

  private static _setMacro(macros: ShaderMacroCollection, macro: ShaderMacro, enabled: boolean): void {
    if (enabled) {
      macros.enable(macro);
    } else {
      macros.disable(macro);
    }
  }

  private static _clearTextures(shaderData: ShaderData, properties: readonly ShaderProperty[]): void {
    for (let i = 0; i < properties.length; i++) {
      shaderData.setTexture(properties[i], null);
    }
  }

  /**
   * Unbind the SSR camera texture from `camera.shaderData`.
   */
  static clearCameraBindings(camera: Camera | null): void {
    if (camera) {
      camera.shaderData.setTexture(SSRTraceExecutor._cameraSSRTextureProp, null);
    }
  }
}
