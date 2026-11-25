import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BaseMaterial,
  Engine,
  EngineObject,
  GLCapabilityType,
  Material,
  PBRMaterial,
  PipelineStage,
  RenderQueueType,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionSettings,
  ShaderData,
  ShaderDataGroup,
  SSRRuntimeState,
  TextureFormat
} from "@galacean/engine";
import { RenderTargetPool } from "../../core/src/RenderPipeline/RenderTargetPool";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import { ShaderProgram } from "../../core/src/shader/ShaderProgram";
import { TextureUtils } from "../../core/src/texture/TextureUtils";
import { GLCapability } from "../../rhi-webgl/src/GLCapability";

const compiledDir = new URL("../.cache/compiled/", import.meta.url);
const readCompiledShader = (name: string) =>
  JSON.parse(fs.readFileSync(new URL(`${name}.shaderc`, compiledDir), "utf8"));

describe("ScreenSpaceReflection v2 (Node unit & shader compatibility)", () => {
  it("enforces ScreenSpaceReflectionSettings defaults, clamping, apply, cloneTo, and toJSON", () => {
    const settings = new ScreenSpaceReflectionSettings();
    expect(settings.toJSON()).toEqual({
      enabled: false,
      quality: ScreenSpaceReflectionQuality.Medium,
      intensity: 1.0,
      maxRoughness: 0.6,
      maxDistance: 25,
      thickness: 0.15,
      edgeFade: 0.1,
      temporalBlend: 0.85,
      useLinearTrace: false
    });

    settings.intensity = -5;
    expect(settings.intensity).toBe(0);
    settings.intensity = Number.NaN;
    expect(settings.intensity).toBe(1.0);

    settings.maxRoughness = 2.5;
    expect(settings.maxRoughness).toBe(1);
    settings.maxRoughness = -1;
    expect(settings.maxRoughness).toBe(0);

    settings.maxDistance = 0;
    expect(settings.maxDistance).toBe(0.1);
    settings.maxDistance = 5000;
    expect(settings.maxDistance).toBe(1000);

    settings.thickness = 0;
    expect(settings.thickness).toBe(0.005);
    settings.thickness = 20;
    expect(settings.thickness).toBe(5);

    settings.edgeFade = -1;
    expect(settings.edgeFade).toBe(0);
    settings.edgeFade = 1;
    expect(settings.edgeFade).toBe(0.5);

    settings.temporalBlend = -0.2;
    expect(settings.temporalBlend).toBe(0);
    settings.temporalBlend = 1.0;
    expect(settings.temporalBlend).toBe(0.95);

    // Invalid quality falls back to Medium
    settings.quality = 999 as ScreenSpaceReflectionQuality;
    expect(settings.quality).toBe(ScreenSpaceReflectionQuality.Medium);

    settings.apply({
      enabled: true,
      quality: ScreenSpaceReflectionQuality.XHigh,
      intensity: 1.4,
      maxRoughness: 0.8,
      maxDistance: 40,
      thickness: 0.25,
      edgeFade: 0.2,
      temporalBlend: 0.75,
      useLinearTrace: true
    });

    const clone = new ScreenSpaceReflectionSettings();
    settings.cloneTo(clone);
    expect(clone.toJSON()).toEqual(settings.toJSON());
    expect(clone.useLinearTrace).toBe(true);
    expect(clone._isValid()).toBe(true);

    clone.intensity = 0;
    expect(clone._isValid()).toBe(false);
  });

  it("exposes SSR v2 PipelineStage and SSRRuntimeState enums", () => {
    expect(PipelineStage.SSRReceiver).toBe("SSRReceiver");
    expect(PipelineStage.SSRContributionDepth).toBe("SSRContributionDepth");
    expect(SSRRuntimeState.Disabled).toBe("disabled");
    expect(SSRRuntimeState.Skipped).toBe("skipped");
    expect(SSRRuntimeState.WarmupColor).toBe("warmup-color");
    expect(SSRRuntimeState.FirstTrace).toBe("first-trace");
    expect(SSRRuntimeState.ActiveSteady).toBe("active-steady");
    expect(SSRRuntimeState.ContextLost).toBe("context-lost");
  });

  it("preserves alpha.59 TextureFormat names while adding SSR float formats and byte sizes", () => {
    expect(TextureFormat.R8G8B8A8_UNorm).toBe(1);
    expect(TextureFormat.R16G16B16A16_SFloat).toBe(7);
    expect(TextureFormat.R11G11B10_UFloat).toBe(35);
    expect(TextureFormat.R8_UNorm).toBe(36);
    expect(TextureFormat.R8G8_UNorm).toBe(37);
    expect(TextureFormat.R16_SFloat).toBe(39);
    expect(TextureFormat.R16G16_SFloat).toBe(40);
    expect(TextureFormat.R32_SFloat).toBe(41);
    expect(TextureFormat.R32G32_SFloat).toBe(42);

    expect(TextureUtils.getMipLevelByteCount(TextureFormat.R16_SFloat, 4, 4)).toBe(32);
    expect(TextureUtils.getMipLevelByteCount(TextureFormat.R16G16_SFloat, 4, 4)).toBe(64);
    expect(TextureUtils.getMipLevelByteCount(TextureFormat.R32_SFloat, 4, 4)).toBe(64);
    expect(TextureUtils.getMipLevelByteCount(TextureFormat.R32G32_SFloat, 4, 4)).toBe(128);
  });

  it("precompiles SSR v2 shaders and evaluates Forward SSR macro combinations cleanly", () => {
    const ssrShader = readCompiledShader("Lighting/ScreenSpaceReflection");
    const ssrReceiver = readCompiledShader("Pipeline/SSRReceiver");
    const ssrContribDepth = readCompiledShader("Pipeline/SSRContributionDepth");
    const pbr = readCompiledShader("PBR");

    expect(ssrShader.subShaders[0].passes.length).toBeGreaterThanOrEqual(8);
    expect(ssrReceiver.subShaders[0].passes[0].tags.pipelineStage).toBe("SSRReceiver");
    expect(ssrContribDepth.subShaders[0].passes[0].tags.pipelineStage).toBe("SSRContributionDepth");

    const pbrForward = pbr.subShaders[0].passes.find(
      (pass: { tags?: { pipelineStage?: string } }) => pass.tags?.pipelineStage === "Forward"
    );
    expect(pbrForward).toBeDefined();

    const baseMacros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["CAMERA_ENABLE_SSR", ""]
    ]);
    const evaluatedBase = ShaderMacroProcessor.evaluate(pbrForward.fragmentShaderInstructions, baseMacros);
    expect(evaluatedBase).toContain("camera_SSRTexture");
    expect(evaluatedBase).not.toContain("camera_SSRReceiverDepthTexture");
    expect(evaluatedBase).not.toContain("camera_SSRReceiverNormalRoughnessTexture");

    const bilateralMacros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["CAMERA_ENABLE_SSR", ""],
      ["CAMERA_SSR_BILATERAL_SAMPLE", ""],
      ["SSR_PACKED_DEPTH_RG8", ""],
      ["SSR_PACKED_NORMAL_OCT8", ""]
    ]);
    const evaluated = ShaderMacroProcessor.evaluate(pbrForward.fragmentShaderInstructions, bilateralMacros);
    expect(evaluated).toContain("camera_SSRTexture");
    expect(evaluated).toContain("camera_SSRReceiverDepthTexture");
    expect(evaluated).toContain("camera_SSRReceiverNormalRoughnessTexture");

    const verifyOnlyMacros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["CAMERA_ENABLE_SSR", ""],
      ["CAMERA_SSR_VERIFY_RECEIVER_DEPTH", ""],
      ["SSR_PACKED_DEPTH_RG8", ""]
    ]);
    const evaluatedVerifyOnly = ShaderMacroProcessor.evaluate(pbrForward.fragmentShaderInstructions, verifyOnlyMacros);
    expect(evaluatedVerifyOnly).toContain("camera_SSRTexture");
    expect(evaluatedVerifyOnly).toContain("camera_SSRReceiverDepthTexture");
    expect(evaluatedVerifyOnly).not.toContain("camera_SSRReceiverNormalRoughnessTexture");
  });

  it("P0-1: compiles DownsampleAndBuildHiZMip0 as pass 8 preserving passes 0..7 and evaluates all macro permutations cleanly", () => {
    const ssrShader = readCompiledShader("Lighting/ScreenSpaceReflection");
    const passes = ssrShader.subShaders[0].passes as Array<{
      name: string;
      fragmentShaderInstructions: unknown;
    }>;

    expect(passes.map((p) => p.name)).toEqual([
      "DownsampleDepth",
      "BuildHiZMip0",
      "BuildHiZMipN",
      "CopyTexture",
      "HiZTrace",
      "TemporalResolve",
      "ColorPyramidPrefilter",
      "ColorPyramidDownsample",
      "DownsampleAndBuildHiZMip0"
    ]);

    const mergedPass = passes[8];
    for (const downsampleFull of [false, true]) {
      for (const hasContrib of [false, true]) {
        for (const packedRG8 of [false, true]) {
          const macros = new Map<string, string>([["GRAPHICS_API_WEBGL2", ""]]);
          if (downsampleFull) macros.set("SSR_DOWNSAMPLE_FROM_FULL_DEPTH", "");
          if (hasContrib) macros.set("SSR_HAS_CONTRIB_DEPTH", "");
          if (packedRG8) macros.set("SSR_PACKED_DEPTH_RG8", "");

          const evaluated = ShaderMacroProcessor.evaluate(mergedPass.fragmentShaderInstructions as any, macros);
          expect(evaluated).not.toContain("#ifdef");
          expect(evaluated).not.toContain("#endif");
          expect(evaluated).toContain("material_SSRFullDepthTexture");
          expect(evaluated).toContain("gl_FragDepth = maxD");
          expect(evaluated).toContain("output_color");

          if (downsampleFull) {
            expect(evaluated).toContain("dy < 6");
            expect(evaluated).toContain("maxD = max");
            expect(evaluated).toContain("minD = min");
          } else {
            expect(evaluated).not.toContain("dy < 6");
            expect(evaluated).toContain("texture ( material_SSRFullDepthTexture , v.v_uv ).r");
          }

          if (hasContrib) {
            expect(evaluated).toContain("material_SSRContribDepthTexture");
            expect(evaluated).toContain("contribRawDepth");
          } else {
            expect(evaluated).not.toContain("material_SSRContribDepthTexture");
          }

          if (packedRG8) {
            expect(evaluated).toContain("65535.0");
          } else {
            expect(evaluated).toContain("65000.0");
          }
        }
      }
    }
  });

  it("Track 1 P1-2 & P1-3b: verifies HiZTrace mip0 prevTraceDepth/loop simplifications, TemporalResolve deferred 3x3 clamp, and sampleScreenSpaceReflectionRaw helper", () => {
    const ssrShader = readCompiledShader("Lighting/ScreenSpaceReflection");
    const pbr = readCompiledShader("PBR");
    const hiZTracePass = ssrShader.subShaders[0].passes[4];
    const temporalResolvePass = ssrShader.subShaders[0].passes[5];

    expect(hiZTracePass.name).toBe("HiZTrace");
    expect(temporalResolvePass.name).toBe("TemporalResolve");

    for (const packedRG8 of [false, true]) {
      for (const hitDist of [false, true]) {
        for (const ortho of [false, true]) {
          const traceMacros = new Map<string, string>([["GRAPHICS_API_WEBGL2", ""]]);
          if (packedRG8) traceMacros.set("SSR_PACKED_DEPTH_RG8", "");
          if (hitDist) traceMacros.set("SSR_OUTPUT_HIT_DIST", "");
          if (ortho) traceMacros.set("CAMERA_ORTHOGRAPHIC", "");
          const evalTrace = ShaderMacroProcessor.evaluate(hiZTracePass.fragmentShaderInstructions, traceMacros);
          expect(evalTrace).not.toContain("#ifdef");
          expect(evalTrace).toContain("textureLod ( material_SSRPrevTraceDepthTexture , prevColorUV , 0.0 )");
          expect(evalTrace).toContain("qDelta");
          expect(evalTrace).toContain("invWDelta");
          expect(evalTrace).toContain("invDirUV");
          expect(evalTrace).toContain("mipScale");
          expect(evalTrace).not.toContain("exp2 (");
        }
      }
    }

    for (const highVirtual of [false, true]) {
      const tempMacros = new Map<string, string>([["GRAPHICS_API_WEBGL2", ""]]);
      if (highVirtual) tempMacros.set("SSR_HIGH_VIRTUAL_REPROJECTION", "");
      const evalTemp = ShaderMacroProcessor.evaluate(temporalResolvePass.fragmentShaderInstructions, tempMacros);
      expect(evalTemp).not.toContain("#ifdef");
      expect(evalTemp).toContain("vec4 m1 = currCenter ;");
      expect(evalTemp).toContain("if ( x == 0 && y == 0 )");
      expect(evalTemp).not.toContain("clamp ( uv + vec2 ( float ( x ) , float ( y ) ) * texel");
      const earlyOutIdx = evalTemp.indexOf("output_color = currCenter ;");
      const clampLoopIdx = evalTemp.indexOf("vec4 m1 = currCenter ;");
      expect(earlyOutIdx).toBeGreaterThan(-1);
      expect(clampLoopIdx).toBeGreaterThan(earlyOutIdx);
    }

    // Verify ScreenSpaceReflectionSample.glsl exposes sampleScreenSpaceReflectionRaw* and delegates without duplication
    const sampleGlsl = fs.readFileSync(
      new URL("../src/native/shader/src/ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionSample.glsl", import.meta.url),
      "utf8"
    );
    expect(sampleGlsl).toContain("vec4 sampleScreenSpaceReflectionRawWithDepth(");
    expect(sampleGlsl).toContain("vec4 sampleScreenSpaceReflectionRaw(");
    expect(sampleGlsl).toContain("vec4 raw = sampleScreenSpaceReflectionRawWithDepth(");

    const pbrForward = pbr.subShaders[0].passes.find(
      (pass: { tags?: { pipelineStage?: string } }) => pass.tags?.pipelineStage === "Forward"
    );
    const evaluatedPBR = ShaderMacroProcessor.evaluate(
      pbrForward.fragmentShaderInstructions,
      new Map<string, string>([
        ["GRAPHICS_API_WEBGL2", ""],
        ["CAMERA_ENABLE_SSR", ""],
        ["CAMERA_SSR_VERIFY_RECEIVER_DEPTH", ""],
        ["SSR_PACKED_DEPTH_RG8", ""]
      ])
    );
    expect(evaluatedPBR).toContain("sampleScreenSpaceReflectionRawWithDepth");
  });

  it("CR-001: requires colorBufferFloat (not colorBufferHalfFloat) for R16_SFloat / R16G16_SFloat render targets", () => {
    const makeCap = (caps: GLCapabilityType[]) => {
      const set = new Set(caps);
      return {
        canIUse: (type: GLCapabilityType) => set.has(type),
        supportsTextureFormat: GLCapability.prototype.supportsTextureFormat
      };
    };

    const halfFloatOnly = makeCap([GLCapabilityType.colorBufferHalfFloat]);
    expect(
      GLCapability.prototype.supportsRenderTargetColorFormat.call(halfFloatOnly, TextureFormat.R16G16B16A16_SFloat)
    ).toBe(true);
    expect(GLCapability.prototype.supportsRenderTargetColorFormat.call(halfFloatOnly, TextureFormat.R16_SFloat)).toBe(
      false
    );
    expect(
      GLCapability.prototype.supportsRenderTargetColorFormat.call(halfFloatOnly, TextureFormat.R16G16_SFloat)
    ).toBe(false);

    const floatCap = makeCap([GLCapabilityType.colorBufferFloat]);
    expect(GLCapability.prototype.supportsRenderTargetColorFormat.call(floatCap, TextureFormat.R16_SFloat)).toBe(true);
    expect(GLCapability.prototype.supportsRenderTargetColorFormat.call(floatCap, TextureFormat.R16G16_SFloat)).toBe(
      true
    );
  });

  it("defaults Material.screenSpaceReflectionBilateral to true and preserves opt-out across cloneTo", () => {
    const mockEngine = { resourceManager: { _addReferResource() {} } } as any;
    const mockShader = { name: "MockSSRShader", destroyed: false, _addReferCount() {} } as any;

    const mat = new Material(mockEngine, mockShader);
    expect(mat.screenSpaceReflectionBilateral).toBe(true);

    mat.screenSpaceReflectionBilateral = false;
    const cloned = mat.clone();
    expect(cloned.screenSpaceReflectionBilateral).toBe(false);

    const target = new Material(mockEngine, mockShader);
    expect(target.screenSpaceReflectionBilateral).toBe(true);
    mat.cloneTo(target);
    expect(target.screenSpaceReflectionBilateral).toBe(false);
  });

  it("defaults Material.screenSpaceReflectionOccluder to true and preserves opt-out across cloneTo", () => {
    const mockEngine = { resourceManager: { _addReferResource() {} } } as any;
    const mockShader = { name: "MockSSRShader", destroyed: false, _addReferCount() {} } as any;

    const mat = new Material(mockEngine, mockShader);
    expect(mat.screenSpaceReflectionOccluder).toBe(true);

    mat.screenSpaceReflectionOccluder = false;
    const cloned = mat.clone();
    expect(cloned.screenSpaceReflectionOccluder).toBe(false);

    const target = new Material(mockEngine, mockShader);
    expect(target.screenSpaceReflectionOccluder).toBe(true);
    mat.cloneTo(target);
    expect(target.screenSpaceReflectionOccluder).toBe(false);
  });

  it("P1-2: _destroyImmediate destroys synchronously during a frame without mutating engine._processingPendingDestroys", () => {
    const pending: EngineObject[] = [];
    const mockEngine = {
      _frameInProcess: true,
      _processingPendingDestroys: false,
      _pendingDestroyObjects: pending,
      resourceManager: {
        _addReferResource() {},
        _deleteReferResource() {},
        _deleteAsset() {},
        _deleteContentRestorer() {}
      }
    } as any;

    const deferredObj = new EngineObject(mockEngine);
    let sawProcessingFlag = false;
    class ImmediateProbe extends EngineObject {
      protected override _onDestroy(): void {
        sawProcessingFlag = mockEngine._processingPendingDestroys;
        // A secondary object destroyed during _onDestroy must still obey normal frame-deferred destruction.
        deferredObj.destroy();
        super._onDestroy();
      }
    }

    const immediateObj = new ImmediateProbe(mockEngine);
    immediateObj._destroyImmediate();

    expect(immediateObj.destroyed).toBe(true);
    expect(immediateObj.pendingDestroy).toBe(false);
    expect(sawProcessingFlag).toBe(false);
    expect(mockEngine._processingPendingDestroys).toBe(false);
    expect(deferredObj.destroyed).toBe(false);
    expect(deferredObj.pendingDestroy).toBe(true);
    expect(pending).toContain(deferredObj);
  });

  it("P1-3a: RenderTargetPool sweeps registered generic idle reclaimers safely during self-unregistration", () => {
    const mockEngine = { time: { frameCount: 42 } } as any;
    const pool = new RenderTargetPool(mockEngine);
    const visited: string[] = [];

    const reclaimerA = {
      _sweepIfIdle(frameCount: number) {
        visited.push(`A:${frameCount}`);
      }
    };
    const reclaimerB = {
      _sweepIfIdle(frameCount: number) {
        visited.push(`B:${frameCount}`);
        pool.unregisterIdleReclaimer(reclaimerB);
      }
    };
    const reclaimerC = {
      _sweepIfIdle(frameCount: number) {
        visited.push(`C:${frameCount}`);
      }
    };

    pool.registerIdleReclaimer(reclaimerA);
    pool.registerIdleReclaimer(reclaimerB);
    pool.registerIdleReclaimer(reclaimerB); // dedupe
    pool.registerIdleReclaimer(reclaimerC);

    pool.trim();
    expect(visited.sort()).toEqual(["A:42", "B:42", "C:42"]);

    visited.length = 0;
    mockEngine.time.frameCount = 43;
    pool.trim();
    expect(visited.sort()).toEqual(["A:43", "C:43"]);

    visited.length = 0;
    pool.destroy();
    pool.trim();
    expect(visited).toEqual([]);
  });

  it("P1-3c: applies PBR roughness pre-culling to PBRMaterial and base-Material PBR assets without silently culling custom shaders", () => {
    const mockEngine = { resourceManager: { _addReferResource() {} } } as any;
    const fakePbrShader = { name: "PBR", destroyed: false, _addReferCount() {} } as any;
    const customShader = { name: "Custom/WaterOrGlass", destroyed: false, _addReferCount() {} } as any;
    const prevBuiltins = Engine._builtinShaders;
    Engine._builtinShaders = { ...(prevBuiltins as any), pbr: fakePbrShader } as any;

    try {
      // Custom shader that declares material_Roughness = 1.0 with its own roughness pipeline must NOT be silently culled.
      const customMat = new Material(mockEngine, customShader);
      customMat.screenSpaceReflectionIntensity = 1.0;
      customMat.shaderData.setFloat("material_Roughness", 1.0);
      expect(customMat._canReceiveScreenSpaceReflection(0.6)).toBe(true);

      // MaterialLoader-style base Material using the built-in PBR shader MUST still honor PBR roughness culling.
      const loadedPbrMat = new Material(mockEngine, fakePbrShader);
      loadedPbrMat.screenSpaceReflectionIntensity = 1.0;
      loadedPbrMat.shaderData.setFloat("material_Roughness", 0.9);
      expect(loadedPbrMat._canReceiveScreenSpaceReflection(0.6)).toBe(false);

      loadedPbrMat.shaderData.enableMacro("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE");
      expect(loadedPbrMat._canReceiveScreenSpaceReflection(0.6)).toBe(true);

      loadedPbrMat.shaderData.disableMacro("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE");
      loadedPbrMat.shaderData.enableMacro("MATERIAL_ENABLE_CLEAR_COAT");
      expect(loadedPbrMat._canReceiveScreenSpaceReflection(0.6)).toBe(true);

      // PBRMaterial subclass checks work identically.
      const pbrMat = new PBRMaterial(mockEngine);
      expect(pbrMat._canReceiveScreenSpaceReflection(0.6)).toBe(false);
      pbrMat.roughness = 0.2;
      expect(pbrMat._canReceiveScreenSpaceReflection(0.6)).toBe(true);
    } finally {
      Engine._builtinShaders = prevBuiltins;
    }
  });

  it("P3-1: BaseMaterial._syncDefaultDepthOnlyRenderQueue derives queue from Forward state and preserves explicit values", () => {
    const transparentData = new ShaderData(ShaderDataGroup.Material);
    transparentData.setInt("blendEnabled", 1);
    BaseMaterial._syncDefaultDepthOnlyRenderQueue(transparentData);
    expect(transparentData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Transparent);

    const alphaCutData = new ShaderData(ShaderDataGroup.Material);
    alphaCutData.enableMacro("MATERIAL_IS_ALPHA_CUTOFF");
    BaseMaterial._syncDefaultDepthOnlyRenderQueue(alphaCutData);
    expect(alphaCutData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.AlphaTest);

    const explicitQueueData = new ShaderData(ShaderDataGroup.Material);
    explicitQueueData.setInt("renderQueueType", RenderQueueType.Transparent);
    explicitQueueData.setFloat("material_DepthOnlyRenderQueue", RenderQueueType.Opaque);
    BaseMaterial._syncDefaultDepthOnlyRenderQueue(explicitQueueData);
    expect(explicitQueueData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Opaque);
  });

  it("P3-2: ShaderProgram._containsIdentifier ignores struct member access while matching real sampler references", () => {
    const contains = (ShaderProgram as any)._containsIdentifier as (source: string, ident: string) => boolean;
    expect(contains("vec4 c = data.u_vertexTex + other . u_vertexTex;", "u_vertexTex")).toBe(false);
    expect(contains("vec4 c = texture2D(u_vertexTex, uv);", "u_vertexTex")).toBe(true);
    expect(contains("vec4 c = data.u_vertexTex + texture2D(u_vertexTex, uv);", "u_vertexTex")).toBe(true);
  });

  it("SSR Linear Trace A/B: evaluates SSR_LINEAR_TRACE macro cleanly alone and combined with current-frame color and packed HDR", () => {
    const ssrShader = readCompiledShader("Lighting/ScreenSpaceReflection");
    const hiZTracePass = ssrShader.subShaders[0].passes[4];
    expect(hiZTracePass.name).toBe("HiZTrace");

    for (const currentFrameColor of [false, true]) {
      for (const packedHDR of [false, true]) {
        const macros = new Map<string, string>([
          ["GRAPHICS_API_WEBGL2", ""],
          ["SSR_LINEAR_TRACE", ""]
        ]);
        if (currentFrameColor) macros.set("SSR_CURRENT_FRAME_COLOR", "");
        if (packedHDR) macros.set("SSR_PACKED_HDR_REINHARD", "");
        const evaluated = ShaderMacroProcessor.evaluate(hiZTracePass.fragmentShaderInstructions, macros);
        expect(evaluated).not.toContain("#ifdef");
        expect(evaluated).not.toContain("#endif");
        expect(evaluated).toContain("textureLod ( material_SSRHiZTexture , uv , 0.0 )");
        expect(evaluated).toContain("binaryRefines");
        expect(evaluated).not.toContain("parentMipCount");
        if (currentFrameColor) {
          expect(evaluated).not.toContain("prevColorUV");
          expect(evaluated).not.toContain("textureLod ( material_SSRPrevTraceDepthTexture");
        } else {
          expect(evaluated).toContain("prevColorUV");
          expect(evaluated).toContain("textureLod ( material_SSRPrevTraceDepthTexture");
        }
        if (packedHDR) {
          expect(evaluated).toContain("encodedRadiance");
        } else {
          expect(evaluated).not.toContain("encodedRadiance");
        }
      }
    }
  });

  it("evaluates SSR_PACKED_HDR_REINHARD decode, SSR_TEMPORAL_5TAP_CLAMP, and tightened HiZTrace Stage 2 bounds", () => {
    const pbrShader = readCompiledShader("PBR");
    const pbrForward = pbrShader.subShaders[0].passes.find(
      (pass: { tags?: { pipelineStage?: string } }) => pass.tags?.pipelineStage === "Forward"
    );
    expect(pbrForward).toBeDefined();
    const pbrMacros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["CAMERA_ENABLE_SSR", ""],
      ["SSR_PACKED_HDR_REINHARD", ""]
    ]);
    const evaluatedPbr = ShaderMacroProcessor.evaluate(pbrForward.fragmentShaderInstructions, pbrMacros);
    expect(evaluatedPbr).toContain("253.0 / 255.0");
    expect(evaluatedPbr).toContain("2.0 / 255.0");

    const ssrShader = readCompiledShader("Lighting/ScreenSpaceReflection");
    const hiZTracePass = ssrShader.subShaders[0].passes[4];
    const hiZMacros = new Map<string, string>([["GRAPHICS_API_WEBGL2", ""]]);
    const evaluatedHiZ = ShaderMacroProcessor.evaluate(hiZTracePass.fragmentShaderInstructions, hiZMacros);
    expect(evaluatedHiZ).toContain("j < 12");
    expect(evaluatedHiZ).toContain("binaryRefines < 2");
    expect(evaluatedHiZ).toContain("b < 2");

    const temporalPass = ssrShader.subShaders[0].passes[5];
    expect(temporalPass.name).toBe("TemporalResolve");
    const evaluated5Tap = ShaderMacroProcessor.evaluate(
      temporalPass.fragmentShaderInstructions,
      new Map<string, string>([
        ["GRAPHICS_API_WEBGL2", ""],
        ["SSR_TEMPORAL_5TAP_CLAMP", ""]
      ])
    );
    expect(evaluated5Tap).toContain("invTapCount = 0.2");
    expect(evaluated5Tap).not.toContain("1.0 / 9.0");

    const evaluated9Tap = ShaderMacroProcessor.evaluate(
      temporalPass.fragmentShaderInstructions,
      new Map<string, string>([["GRAPHICS_API_WEBGL2", ""]])
    );
    expect(evaluated9Tap).toContain("1.0 / 9.0");
  });

  it("Blitter.draw isolates fullscreen/SSR/post-process shaders from scene macros like SCENE_POINT_LIGHT_COUNT while preserving camera macros", async () => {
    const { Blitter, ShaderMacro, ShaderMacroCollection } = await import("@galacean/engine");

    const observedMacroSets: Set<string>[] = [];
    const fakeProgram = {
      bind() {},
      regroupUniformBlocks() {},
      uploadAll() {},
      uploadMultiGroupUniforms() {},
      uploadUnGroupTextures() {},
      sceneUniformBlock: {},
      cameraUniformBlock: {},
      rendererUniformBlock: {},
      materialUniformBlock: {}
    };
    const fakePass = {
      _getShaderProgram(_engine: unknown, macros: any) {
        const elems: any[] = [];
        (ShaderMacro as any)._getMacrosElements(macros, elems);
        observedMacroSets.push(new Set(elems.map((m) => (m.value !== undefined ? `${m.name}=${m.value}` : m.name))));
        return fakeProgram;
      },
      _renderState: { _applyStates() {} },
      _renderStateDataMap: {}
    };
    const fakeMaterial = {
      shader: { subShaders: [{ passes: [fakePass] }] },
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    } as any;
    const fakeSceneMacros = new ShaderMacroCollection();
    const fakeCameraMacros = new ShaderMacroCollection();
    fakeCameraMacros.enable(ShaderMacro.getByName("CAMERA_ORTHOGRAPHIC"));
    const fakeGlobalMacros = new ShaderMacroCollection();

    const fakeEngine = {
      _macroCollection: new ShaderMacroCollection(),
      _basicResources: {
        blitMaterial: fakeMaterial,
        blitMesh: { _primitive: {}, subMesh: {} },
        flipYBlitMesh: { _primitive: {}, subMesh: {} }
      },
      _hardwareRenderer: { drawPrimitive() {} },
      _renderContext: {
        flipProjection: false,
        camera: {
          _globalShaderMacro: fakeGlobalMacros,
          shaderData: { _macroCollection: fakeCameraMacros },
          scene: { shaderData: { _macroCollection: fakeSceneMacros } }
        }
      }
    } as any;
    const fakeSource = { width: 128, height: 128 } as any;

    // Frame A: 0 point lights
    ShaderMacroCollection.unionCollection(fakeSceneMacros, fakeCameraMacros, fakeGlobalMacros);
    Blitter.draw(fakeEngine, fakeSource, 0, fakeMaterial, 0);

    // Frame B: village spawns 4 point lights (mutates scene & camera._globalShaderMacro)
    fakeSceneMacros.enable(ShaderMacro.getByName("SCENE_POINT_LIGHT_COUNT", "4"));
    fakeSceneMacros.enable(ShaderMacro.getByName("SCENE_DIRECT_LIGHT_COUNT", "1"));
    ShaderMacroCollection.unionCollection(fakeSceneMacros, fakeCameraMacros, fakeGlobalMacros);
    Blitter.draw(fakeEngine, fakeSource, 0, fakeMaterial, 0);

    expect(observedMacroSets).toHaveLength(2);
    expect(observedMacroSets[0]).toEqual(observedMacroSets[1]);
    expect(observedMacroSets[1]!.has("CAMERA_ORTHOGRAPHIC")).toBe(true);
    expect(observedMacroSets[1]!.has("SCENE_POINT_LIGHT_COUNT=4")).toBe(false);
    expect(observedMacroSets[1]!.has("SCENE_DIRECT_LIGHT_COUNT=1")).toBe(false);
  });
});
