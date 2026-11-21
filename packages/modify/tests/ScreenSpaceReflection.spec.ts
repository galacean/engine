import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GLCapabilityType,
  Material,
  PipelineStage,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionSettings,
  SSRRuntimeState,
  TextureFormat
} from "@galacean/engine";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import { TextureUtils } from "../src/native/core/src/texture/TextureUtils";
import { GLCapability } from "../src/native/rhi-webgl/src/GLCapability";

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
      temporalBlend: 0.85
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
      temporalBlend: 0.75
    });

    const clone = new ScreenSpaceReflectionSettings();
    settings.cloneTo(clone);
    expect(clone.toJSON()).toEqual(settings.toJSON());
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
    expect(TextureFormat.R8G8B8A8).toBe(1);
    expect(TextureFormat.R16G16B16A16).toBe(7);
    expect(TextureFormat.R11G11B10_UFloat).toBe(35);
    expect(TextureFormat.R8).toBe(36);
    expect(TextureFormat.R8G8).toBe(37);
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

  it("CR-001: requires WebGL2 colorBufferFloat (not colorBufferHalfFloat) for R16_SFloat / R16G16_SFloat render targets", () => {
    const makeCap = (isWebGL2: boolean, caps: GLCapabilityType[]) => {
      const set = new Set(caps);
      return {
        rhi: { isWebGL2 },
        canIUse: (type: GLCapabilityType) => set.has(type),
        supportsTextureFormat: GLCapability.prototype.supportsTextureFormat
      };
    };

    const halfFloatOnly = makeCap(true, [GLCapabilityType.colorBufferHalfFloat, GLCapabilityType.textureHalfFloat]);
    expect(
      GLCapability.prototype.supportsRenderTargetColorFormat.call(halfFloatOnly, TextureFormat.R16G16B16A16)
    ).toBe(true);
    expect(GLCapability.prototype.supportsRenderTargetColorFormat.call(halfFloatOnly, TextureFormat.R16_SFloat)).toBe(
      false
    );
    expect(
      GLCapability.prototype.supportsRenderTargetColorFormat.call(halfFloatOnly, TextureFormat.R16G16_SFloat)
    ).toBe(false);

    const floatCap = makeCap(true, [GLCapabilityType.colorBufferFloat]);
    expect(GLCapability.prototype.supportsRenderTargetColorFormat.call(floatCap, TextureFormat.R16_SFloat)).toBe(true);
    expect(GLCapability.prototype.supportsRenderTargetColorFormat.call(floatCap, TextureFormat.R16G16_SFloat)).toBe(
      true
    );

    const webgl1Float = makeCap(false, [GLCapabilityType.colorBufferFloat, GLCapabilityType.colorBufferHalfFloat]);
    expect(GLCapability.prototype.supportsRenderTargetColorFormat.call(webgl1Float, TextureFormat.R16_SFloat)).toBe(
      false
    );
    expect(GLCapability.prototype.supportsRenderTargetColorFormat.call(webgl1Float, TextureFormat.R16G16_SFloat)).toBe(
      false
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
});
