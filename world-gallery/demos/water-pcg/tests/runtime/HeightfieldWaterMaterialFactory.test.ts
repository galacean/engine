import { createHash } from "node:crypto";
import { Shader, ShaderLanguage, type Texture2D, type TextureCube } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { Matrix, Vector3, Vector4 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import { createHeightfieldWaterFixture } from "../../demo/heightfield/heightfieldFixture";
import {
  DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS,
  HEIGHTFIELD_WATER_SHADER_PROPERTY,
  HEIGHTFIELD_WATER_SURFACE_TEXTURE,
  HEIGHTFIELD_WATER_SURFACE_TUNING
} from "../../runtime/heightfield/constants";
import {
  createHeightfieldWaterShaderSource,
  heightfieldWaterHighShaderSource,
  heightfieldWaterLowShaderSource,
  heightfieldWaterMediumShaderSource,
  heightfieldWaterSurfaceAppearanceHighShaderSource,
  heightfieldWaterSurfaceAppearanceMediumShaderSource,
  setHeightfieldWaterCompositionMode,
  setHeightfieldWaterDepthWriteEnabled,
  setHeightfieldWaterOpticsCalibrationMode,
  setHeightfieldWaterLocalFoamMask,
  setHeightfieldWaterOpticalProfile,
  setHeightfieldWaterReflectionBinding,
  setHeightfieldWaterRefractionEnabled,
  setHeightfieldWaterSurfaceAppearanceBinding,
  setHeightfieldWaterSurfaceAppearanceFeatureFlags,
  setHeightfieldWaterSurfaceOpticsBinding
} from "../../runtime/heightfield/HeightfieldWaterMaterialFactory";
import {
  HEIGHTFIELD_WATER_SHADER_DEBUG_MODE_BY_OUTPUT,
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode,
  HeightfieldWaterOpticsCalibrationMode,
  HeightfieldWaterOpticsDebugOutput
} from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import { buildHeightfieldWaterSurfaceTexturePixels } from "../../runtime/heightfield/HeightfieldWaterSurfaceTextureFactory";
import { DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS } from "../../runtime/heightfield/HeightfieldWaterReflectionSampling";
import type { HeightfieldWaterMaterialState } from "../../runtime/heightfield/types";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";
import { createWaterSurfaceOpticsBindingState } from "../../runtime/optics/WaterSurfaceOpticsBinding";
import { WATER_OPTICS_SHADER_PROPERTY } from "../../runtime/optics/constants/WaterOpticsShaderConstants";
import { grasslandsSurfaceAppearanceFixture } from "../fixtures/waterSurfaceAppearanceFixtures";

interface GlesShaderPrecompiler {
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

function createOpticsMaterialState(
  shaderDataOverrides: Readonly<Record<string, unknown>>,
  quality = WaterQualityTier.Medium
): HeightfieldWaterMaterialState {
  const legacyShader = { name: "AIWorld/HeightfieldWaterTest" };
  const shaderData = {
    setFloat: vi.fn(),
    setInt: vi.fn(),
    setVector3: vi.fn(),
    setVector4: vi.fn(),
    setMatrix: vi.fn(),
    setTexture: vi.fn(),
    ...shaderDataOverrides
  };
  return {
    material: { shaderData, shader: legacyShader } as never,
    legacyShader: legacyShader as never,
    quality,
    waveSet: {} as never,
    ...createWaterSurfaceOpticsBindingState(),
    surfaceOpticsBinding: {
      tier: quality === WaterQualityTier.High ? "high" : "medium",
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: true,
      reflection: undefined,
      reflectionSampling: DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
      debugView: HeightfieldWaterDebugMode.Final
    },
    heightfieldReflectionReadback: {
      ...DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
      quality,
      requestedSource: "sky",
      bindingResolvedSource: "sky",
      effectiveSource: "sky",
      textureWidth: 0,
      textureHeight: 0,
      filterSampleCount: 1
    },
    opticsCalibrationReadback: {
      mode: HeightfieldWaterOpticsCalibrationMode.None,
      referenceCompositionEnabled: false,
      effectiveFresnelOverride: undefined
    },
    surfaceAppearanceReadback: {
      requested: false,
      active: false,
      normalTextureWidth: 0,
      normalTextureHeight: 0,
      normalLayerCount: 0,
      normalTiling: 0,
      normalScrollUvPerSecond: 0,
      normalStrength: 0,
      flipGreen: false,
      depthTintEnabled: false,
      depthTintDistance: 0,
      depthTintExponent: 0,
      coastalAlphaEnabled: false,
      coastalAlphaDistance: 0,
      contactFoamEnabled: false,
      contactFoamWorldScale: 0,
      contactFoamTimeRate: 0,
      contactFoamOpacity: 0,
      contactFoamContactDistance: 0,
      contactFoamOctaveCount: 0,
      contactFoamWeights: [],
      contactFoamLacunarity: 0,
      contactFoamSuppressRefraction: 0,
      contactFoamSmoothnessReduction: 0
    },
    surfaceAppearanceFeatureFlags: {
      ...DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS
    }
  };
}

describe("HeightfieldWaterMaterialFactory", () => {
  it("keeps debug and composition enum values stable for Lab capture automation", () => {
    expect([
      HeightfieldWaterDebugMode.Final,
      HeightfieldWaterDebugMode.BaseHeight,
      HeightfieldWaterDebugMode.BaseNormal,
      HeightfieldWaterDebugMode.SignedDistance,
      HeightfieldWaterDebugMode.Depth,
      HeightfieldWaterDebugMode.Flow,
      HeightfieldWaterDebugMode.WaveDisplacement
    ]).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([
      HeightfieldWaterDebugMode.CenteredOpaqueColor,
      HeightfieldWaterDebugMode.DisplacedOpaqueColor,
      HeightfieldWaterDebugMode.RefractionUvDelta,
      HeightfieldWaterDebugMode.OpticalDepth,
      HeightfieldWaterDebugMode.DepthContinuity,
      HeightfieldWaterDebugMode.SampleValidity,
      HeightfieldWaterDebugMode.Fresnel,
      HeightfieldWaterDebugMode.ShaderCompositedColor,
      HeightfieldWaterDebugMode.SurfaceAlpha,
      HeightfieldWaterDebugMode.ReflectionSource,
      HeightfieldWaterDebugMode.PlanarUv,
      HeightfieldWaterDebugMode.ClipSide,
      HeightfieldWaterDebugMode.RefractionAmount,
      HeightfieldWaterDebugMode.RefractionGates,
      HeightfieldWaterDebugMode.ReflectionColor,
      HeightfieldWaterDebugMode.NormalDotView,
      HeightfieldWaterDebugMode.DetailNormal,
      HeightfieldWaterDebugMode.SceneDepthDelta,
      HeightfieldWaterDebugMode.DepthTint,
      HeightfieldWaterDebugMode.ContactFoam,
      HeightfieldWaterDebugMode.CoastalAlpha,
      HeightfieldWaterDebugMode.DirectSpecular,
      HeightfieldWaterDebugMode.EffectiveRoughness
    ]).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect(Object.values(HeightfieldWaterOpticsDebugOutput)).toEqual([
      "centered-opaque-color",
      "displaced-opaque-color",
      "refraction-uv-delta",
      "optical-depth",
      "depth-continuity",
      "sample-validity",
      "fresnel",
      "shader-composited-color",
      "surface-alpha",
      "reflection-source",
      "planar-uv",
      "clip-side",
      "refraction-amount",
      "refraction-gates",
      "reflection-color",
      "normal-dot-view",
      "detail-normal",
      "scene-depth-delta",
      "depth-tint",
      "contact-foam",
      "coastal-alpha",
      "direct-specular",
      "effective-roughness",
      "final-framebuffer-color"
    ]);
    expect(HeightfieldWaterCompositionMode.LegacyAlpha).toBe(0);
    expect(HeightfieldWaterCompositionMode.PrecomposedReplace).toBe(1);
    expect(HeightfieldWaterOpticsCalibrationMode.None).toBe(0);
    expect(HeightfieldWaterOpticsCalibrationMode.CpuReference).toBe(1);
    expect(HeightfieldWaterOpticsCalibrationMode.PureTransmission).toBe(2);
    expect(HEIGHTFIELD_WATER_SHADER_PROPERTY.opticsCalibrationMode).toBe("material_OpticsCalibrationMode");
    expect(HEIGHTFIELD_WATER_SHADER_DEBUG_MODE_BY_OUTPUT).toEqual({
      [HeightfieldWaterOpticsDebugOutput.CenteredOpaqueColor]: HeightfieldWaterDebugMode.CenteredOpaqueColor,
      [HeightfieldWaterOpticsDebugOutput.DisplacedOpaqueColor]: HeightfieldWaterDebugMode.DisplacedOpaqueColor,
      [HeightfieldWaterOpticsDebugOutput.RefractionUvDelta]: HeightfieldWaterDebugMode.RefractionUvDelta,
      [HeightfieldWaterOpticsDebugOutput.OpticalDepth]: HeightfieldWaterDebugMode.OpticalDepth,
      [HeightfieldWaterOpticsDebugOutput.DepthContinuity]: HeightfieldWaterDebugMode.DepthContinuity,
      [HeightfieldWaterOpticsDebugOutput.SampleValidity]: HeightfieldWaterDebugMode.SampleValidity,
      [HeightfieldWaterOpticsDebugOutput.Fresnel]: HeightfieldWaterDebugMode.Fresnel,
      [HeightfieldWaterOpticsDebugOutput.ShaderCompositedColor]: HeightfieldWaterDebugMode.ShaderCompositedColor,
      [HeightfieldWaterOpticsDebugOutput.SurfaceAlpha]: HeightfieldWaterDebugMode.SurfaceAlpha,
      [HeightfieldWaterOpticsDebugOutput.ReflectionSource]: HeightfieldWaterDebugMode.ReflectionSource,
      [HeightfieldWaterOpticsDebugOutput.PlanarUv]: HeightfieldWaterDebugMode.PlanarUv,
      [HeightfieldWaterOpticsDebugOutput.ClipSide]: HeightfieldWaterDebugMode.ClipSide,
      [HeightfieldWaterOpticsDebugOutput.RefractionAmount]: HeightfieldWaterDebugMode.RefractionAmount,
      [HeightfieldWaterOpticsDebugOutput.RefractionGates]: HeightfieldWaterDebugMode.RefractionGates,
      [HeightfieldWaterOpticsDebugOutput.ReflectionColor]: HeightfieldWaterDebugMode.ReflectionColor,
      [HeightfieldWaterOpticsDebugOutput.NormalDotView]: HeightfieldWaterDebugMode.NormalDotView,
      [HeightfieldWaterOpticsDebugOutput.DetailNormal]: HeightfieldWaterDebugMode.DetailNormal,
      [HeightfieldWaterOpticsDebugOutput.SceneDepthDelta]: HeightfieldWaterDebugMode.SceneDepthDelta,
      [HeightfieldWaterOpticsDebugOutput.DepthTint]: HeightfieldWaterDebugMode.DepthTint,
      [HeightfieldWaterOpticsDebugOutput.ContactFoam]: HeightfieldWaterDebugMode.ContactFoam,
      [HeightfieldWaterOpticsDebugOutput.CoastalAlpha]: HeightfieldWaterDebugMode.CoastalAlpha,
      [HeightfieldWaterOpticsDebugOutput.DirectSpecular]: HeightfieldWaterDebugMode.DirectSpecular,
      [HeightfieldWaterOpticsDebugOutput.EffectiveRoughness]: HeightfieldWaterDebugMode.EffectiveRoughness
    });
    expect(HEIGHTFIELD_WATER_SHADER_DEBUG_MODE_BY_OUTPUT[HeightfieldWaterOpticsDebugOutput.FinalFramebufferColor]).toBe(
      undefined
    );
  });

  it.each([
    ["Low", heightfieldWaterLowShaderSource],
    ["Medium", heightfieldWaterMediumShaderSource],
    ["High", heightfieldWaterHighShaderSource]
  ])("precompiles the %s variant to GLES100", (_label, source) => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES100, "")).not.toThrow();
  });

  it.each([
    ["Medium", heightfieldWaterSurfaceAppearanceMediumShaderSource],
    ["High", heightfieldWaterSurfaceAppearanceHighShaderSource]
  ])("precompiles the surface appearance %s variant to GLES100", (_label, source) => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES100, "")).not.toThrow();
  });

  it.each([
    ["Medium", heightfieldWaterSurfaceAppearanceMediumShaderSource],
    ["High", heightfieldWaterSurfaceAppearanceHighShaderSource]
  ])("precompiles the surface appearance %s variant to GLES300", (_label, source) => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES300, "")).not.toThrow();
  });

  it("rejects the forbidden Low Surface Appearance shader family", () => {
    expect(() => createHeightfieldWaterShaderSource(WaterQualityTier.Low, 2, true)).toThrow(
      "Low heightfield water does not support the Surface Appearance shader family."
    );
  });

  it("keeps every legacy shader source byte-for-byte compatible", () => {
    expect([
      [
        heightfieldWaterLowShaderSource.length,
        createHash("sha256").update(heightfieldWaterLowShaderSource).digest("hex")
      ],
      [
        heightfieldWaterMediumShaderSource.length,
        createHash("sha256").update(heightfieldWaterMediumShaderSource).digest("hex")
      ],
      [
        heightfieldWaterHighShaderSource.length,
        createHash("sha256").update(heightfieldWaterHighShaderSource).digest("hex")
      ]
    ]).toEqual([
      [24204, "4acb01a7f30df480998ba55b0d4832df901f2d132e89e482e431ed4c7339a222"],
      [37477, "019666a896b887f3c5089fe84e2ee4f387181cd86d8dc384142b9f7b872fb6fa"],
      [44713, "6fe14c2877a9ead46c59b3d177e0988c80b87e8443098cc9917936d13897936f"]
    ]);
  });

  it("uses exactly two mirrored world-XZ external normal samples with explicit decode controls", () => {
    for (const source of [
      heightfieldWaterSurfaceAppearanceMediumShaderSource,
      heightfieldWaterSurfaceAppearanceHighShaderSource
    ]) {
      expect(source.match(/texture2D\(\s*material_AppearanceNormalTexture/g) ?? []).toHaveLength(2);
      expect(source).toContain("appearanceWorldUv + appearanceScrollUv");
      expect(source).toContain("-appearanceWorldUv + appearanceScrollUv");
      expect(source).toContain("baseWorldPosition.xz * material_AppearanceNormalTiling");
      expect(source).toContain("elapsedTime * material_AppearanceNormalScrollUvPerSecond");
      expect(source).toContain("slope.y *= mix(1.0, -1.0");
      expect(source).toContain("slope *= strength");
      expect(source).toContain("waterSurfaceAppearanceBlendTangentNormals(");
      expect(source).toContain("float externalNormalWeight = material_AppearanceExternalNormalEnabled");
      expect(source).not.toMatch(/Grasslands|hero-grasslands|https?:\/\//);
    }
    expect(heightfieldWaterLowShaderSource).not.toContain("material_AppearanceNormalTexture");
  });

  it("uses one raw centered Scene Depth delta for exact appearance refraction, depth tint, and coastal alpha", () => {
    for (const source of [
      heightfieldWaterSurfaceAppearanceMediumShaderSource,
      heightfieldWaterSurfaceAppearanceHighShaderSource
    ]) {
      expect(source.match(/texture2D\(\s*camera_DepthTexture/g) ?? []).toHaveLength(2);
      expect(source.match(/texture2D\(\s*camera_DepthTexture,\s*screenUv/g) ?? []).toHaveLength(1);
      expect(source).toContain("float sceneDepthDelta = max(sceneEyeDepth - input.surfaceEyeDepth, 0.0)");
      expect(source).toContain("float sampledOpticalDepth = sceneDepthDelta");
      expect(source).toContain("bool centeredSceneDepthFinite = sceneEyeDepthSample >= 0.0");
      expect(source).toContain("bool refractedSceneDepthFinite = refractedSceneEyeDepthSample >= 0.0");
      expect(source).toContain("waterSurfaceAppearanceRefractionSampleValidity(");
      expect(source).toContain("centeredDepthBehind,\n          refractedSceneDepthFiniteWeight");
      expect(source).toContain("waterSurfaceAppearanceDepthTintFactor(");
      expect(source).toContain(
        "sceneDepthDelta,\n          material_AppearanceDepthTintDistance,\n          material_AppearanceDepthTintExponent"
      );
      expect(source).toContain(
        "mix(\n          refractedSceneColor,\n          material_AppearanceDepthTintColor.rgb,\n          appearanceDepthTintFactor"
      );
      expect(source).toContain("waterSurfaceAppearanceCoastalAlpha(");
      expect(source).toContain(
        "alpha = mix(\n          alpha,\n          appearanceCoastalAlpha,\n          material_AppearanceCoastalAlphaEnabled"
      );
      expect(source).toContain("alpha = clamp(alpha, 0.0, 1.0) * coverage");
      expect(source).toContain(
        "shaderCompositedColor = mix(\n            centeredOpaqueColor,\n            waterColor,\n            surfaceAlpha"
      );
      const displacedUvBlock = source.match(/vec2 displacedScreenUv = screenUv[\s\S]*?;/)?.[0] ?? "";
      expect(displacedUvBlock).toContain("waterSurfaceAppearanceRefractionUvDelta(");
      expect(displacedUvBlock).toContain("material_RefractionStrength");
      expect(displacedUvBlock).not.toContain("refractionDepthWeight");
      expect(displacedUvBlock).not.toMatch(/\b0\.008\b|\b0\.012\b/);
    }
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).not.toContain("material_AppearanceDepthTintEnabled");
      expect(source).not.toContain("material_AppearanceCoastalAlphaEnabled");
      expect(source).not.toContain("shaderCompositedColor = mix(\n            centeredOpaqueColor");
      expect(source).not.toContain("sceneDepthDelta");
    }
  });

  it("reuses one Scene Depth contact mask for color, refraction, alpha, and roughness", () => {
    for (const source of [
      heightfieldWaterSurfaceAppearanceMediumShaderSource,
      heightfieldWaterSurfaceAppearanceHighShaderSource
    ]) {
      expect(source.match(/texture2D\(\s*camera_DepthTexture/g) ?? []).toHaveLength(2);
      expect(source.match(/texture2D\(\s*camera_DepthTexture,\s*screenUv/g) ?? []).toHaveLength(1);
      expect(source).toContain("float contactFoamMask = material_AppearanceContactFoamEnabled");
      expect(source).toContain("evaluateWaterContactFoamMask(");
      expect(source).toContain("sceneDepthDelta,\n            centeredDepthBehind,");
      expect(source).toContain("float foamTint = max(legacyFoamTint, contactFoamMask)");
      expect(source).toContain("contactFoamMask\n                * material_AppearanceContactFoamSuppressRefraction");
      expect(source.match(/material_AppearanceContactFoamSuppressRefraction/g) ?? []).toHaveLength(2);
      expect(source).toContain("alpha += contactFoamMask * (1.0 - alpha)");
      expect(source).toContain(
        "material_Roughness\n            + contactFoamMask\n              * material_AppearanceContactFoamSmoothnessReduction"
      );
    }
    expect(heightfieldWaterSurfaceAppearanceMediumShaderSource.match(/weightedPattern \+=/g) ?? []).toHaveLength(2);
    expect(heightfieldWaterSurfaceAppearanceHighShaderSource.match(/weightedPattern \+=/g) ?? []).toHaveLength(3);
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).not.toContain("material_AppearanceContactFoamEnabled");
      expect(source).not.toContain("evaluateWaterContactFoamMask");
    }
  });

  it("uses the real scene sunlight and shared GGX only in Surface Appearance variants", () => {
    for (const source of [
      heightfieldWaterSurfaceAppearanceMediumShaderSource,
      heightfieldWaterSurfaceAppearanceHighShaderSource
    ]) {
      expect(source).toContain("vec4 scene_SunlightColor");
      expect(source).toContain("vec3 scene_SunlightDirection");
      expect(source).toContain("vec3 sunlightDirectionVector = -scene_SunlightDirection");
      expect(source).toContain("float sunlightAvailable = step(0.000001, sunlightDirectionLengthSquared)");
      expect(source).toContain("vec3 sunlightColor = max(scene_SunlightColor.rgb, vec3(0.0))");
      expect(source).toContain("float material_AppearanceDirectSpecularEnabled");
      expect(source).toContain(
        "float directSpecular = material_AppearanceDirectSpecularEnabled\n          * waterSurfaceDirectSpecular("
      );
      expect(source).toMatch(
        /waterSurfaceDirectSpecular\(\s*fresnelF0,\s*effectiveSurfaceRoughness,\s*normalDotView,\s*normalDotLight,\s*normalDotHalf,\s*lightDotHalf\s*\)/
      );
      expect(source).toContain("waterColor += sunlightColor * directSpecular");
      expect(source).toContain("saturate(effectiveSurfaceRoughness)");
      expect(source).not.toContain("normalize(vec3(-0.32, 0.86, 0.39))");
      expect(source).not.toMatch(/\bshadow\b/i);
    }
    expect(heightfieldWaterSurfaceAppearanceHighShaderSource).toContain(
      "float planarRoughness = saturate(effectiveSurfaceRoughness)"
    );
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).not.toContain("scene_SunlightColor");
      expect(source).not.toContain("waterSurfaceDirectSpecular");
      expect(source).toContain("normalize(vec3(-0.32, 0.86, 0.39))");
    }
  });

  it("appends Surface Appearance debug modes 23 through 29 without changing legacy debug source", () => {
    for (const source of [
      heightfieldWaterSurfaceAppearanceMediumShaderSource,
      heightfieldWaterSurfaceAppearanceHighShaderSource
    ]) {
      expect(source).toContain(`material_DebugMode < ${HeightfieldWaterDebugMode.NormalDotView + 0.5}`);
      expect(source).toContain(`material_DebugMode < ${HeightfieldWaterDebugMode.DetailNormal + 0.5}`);
      expect(source).toContain(`material_DebugMode < ${HeightfieldWaterDebugMode.SceneDepthDelta + 0.5}`);
      expect(source).toContain(`material_DebugMode < ${HeightfieldWaterDebugMode.DepthTint + 0.5}`);
      expect(source).toContain(`material_DebugMode < ${HeightfieldWaterDebugMode.ContactFoam + 0.5}`);
      expect(source).toContain(`material_DebugMode < ${HeightfieldWaterDebugMode.CoastalAlpha + 0.5}`);
      expect(source).toContain(`material_DebugMode < ${HeightfieldWaterDebugMode.DirectSpecular + 0.5}`);
      expect(source).toContain("fragmentColor = appearanceNormalTS * 0.5 + 0.5");
      expect(source).toContain("fragmentColor = vec3(sceneDepthDelta)");
      expect(source).toContain("fragmentColor = vec3(appearanceDepthTintFactor)");
      expect(source).toContain("fragmentColor = vec3(contactFoamMask)");
      expect(source).toContain("fragmentColor = vec3(appearanceCoastalAlpha)");
      expect(source).toContain("fragmentColor = sunlightColor * directSpecular");
      expect(source).toContain("fragmentColor = vec3(effectiveSurfaceRoughness)");
    }
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).not.toContain("fragmentColor = appearanceNormalTS * 0.5 + 0.5");
      expect(source).not.toContain("fragmentColor = vec3(sceneDepthDelta)");
      expect(source).not.toContain("fragmentColor = vec3(contactFoamMask)");
      expect(source).not.toContain("fragmentColor = sunlightColor * directSpecular");
    }
  });

  it("binds and detaches a borrowed external normal without destroying it", () => {
    const setFloat = vi.fn();
    const setInt = vi.fn();
    const setTexture = vi.fn();
    const setVector3 = vi.fn();
    const setVector4 = vi.fn();
    const state = createOpticsMaterialState(
      { setFloat, setInt, setTexture, setVector3, setVector4 },
      WaterQualityTier.High
    );
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const binding = {
      appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
      assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
      contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
      texture,
      ownership: "borrowed" as const
    };
    const readback = state.surfaceAppearanceReadback;
    const appearanceShader = { name: "AIWorld/HeightfieldWaterSurfaceAppearanceV1High12" };
    const findShader = vi.spyOn(Shader, "find").mockReturnValue(appearanceShader as never);

    try {
      setHeightfieldWaterCompositionMode(state, HeightfieldWaterCompositionMode.PrecomposedReplace);
      setHeightfieldWaterDepthWriteEnabled(state, true);
      expect(setHeightfieldWaterSurfaceAppearanceBinding(state, binding)).toBe(readback);
      expect(readback).toMatchObject({
        active: true,
        normalLayerCount: 2,
        normalTextureWidth: 1024,
        normalTiling: 0.05,
        normalScrollUvPerSecond: 0.02,
        normalStrength: 0.2,
        depthTintModel: "scene-depth-power",
        depthTintEnabled: true,
        depthTintColor: [0.21710525, 0.45953944, 0.55, 1],
        depthTintDistance: 10,
        depthTintExponent: 0.5,
        coastalAlphaModel: "scene-depth",
        coastalAlphaEnabled: true,
        coastalAlphaDistance: 0.5,
        contactFoamModel: "scene-depth-voronoi",
        contactFoamEnabled: true,
        contactFoamWorldScale: 2.5,
        contactFoamTimeRate: 1,
        contactFoamOpacity: 0.453,
        contactFoamContactDistance: 0.1791,
        contactFoamOctaveCount: 3,
        contactFoamWeights: [0.5, 0.25, 0.125],
        contactFoamLacunarity: 2,
        contactFoamSuppressRefraction: 1,
        contactFoamSmoothnessReduction: 0.35,
        ownership: "borrowed"
      });
      expect(state.material.shader).toBe(appearanceShader);
      expect(setTexture).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalTexture, texture);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceExternalNormalEnabled, 1);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalTiling, 0.05);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalScrollUvPerSecond, 0.02);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalStrength, 0.2);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalFlipGreen, 0);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintEnabled, 1);
      expect(setVector4).toHaveBeenCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintColor,
        new Vector4(0.21710525, 0.45953944, 0.55, 1)
      );
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintDistance, 10);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintExponent, 0.5);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceCoastalAlphaEnabled, 1);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceCoastalAlphaDistance, 0.5);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamEnabled, 1);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamWorldScale, 2.5);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamTimeRate, 1);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamOpacity, 0.453);
      expect(setFloat).toHaveBeenCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamContactDistance,
        0.1791
      );
      expect(setVector3).toHaveBeenCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamOctaveWeights,
        new Vector3(0.5, 0.25, 0.125)
      );
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamLacunarity, 2);
      expect(setFloat).toHaveBeenCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamSuppressRefraction,
        1
      );
      expect(setFloat).toHaveBeenCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamSmoothnessReduction,
        0.35
      );
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled, 1);

      const flippedAppearance = WaterSurfaceAppearanceCompiler.compile({
        ...grasslandsSurfaceAppearanceFixture,
        normal: { ...grasslandsSurfaceAppearanceFixture.normal, flipGreen: true }
      }).data!;
      expect(
        setHeightfieldWaterSurfaceAppearanceBinding(state, {
          ...binding,
          appearance: flippedAppearance
        })
      ).toBe(readback);
      expect(readback.flipGreen).toBe(true);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalFlipGreen, 1);

      expect(setHeightfieldWaterSurfaceAppearanceBinding(state)).toBe(readback);
      expect(readback).toMatchObject({
        requested: false,
        active: false,
        normalLayerCount: 0,
        depthTintEnabled: false,
        depthTintDistance: 0,
        depthTintExponent: 0,
        coastalAlphaEnabled: false,
        coastalAlphaDistance: 0,
        contactFoamEnabled: false,
        contactFoamOctaveCount: 0,
        contactFoamWeights: []
      });
      expect(state.material.shader).toBe(state.legacyShader);
      expect(setTexture).toHaveBeenLastCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalTexture, null);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalFlipGreen, 0);
      expect(setVector4).toHaveBeenLastCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintColor,
        new Vector4(0, 0, 0, 0)
      );
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceCoastalAlphaDistance, 0);
      expect(setVector3).toHaveBeenLastCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamOctaveWeights,
        new Vector3(0, 0, 0)
      );
      expect(setFloat).toHaveBeenLastCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled, 0);
      expect(setInt).toHaveBeenCalledTimes(2);
      expect(setInt).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.blendEnabled, 0);
      expect(setInt).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.depthWriteEnabled, 1);
      expect(texture.destroy).not.toHaveBeenCalled();
    } finally {
      findShader.mockRestore();
    }
  });

  it.each([
    ["externalNormal", HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceExternalNormalEnabled],
    ["depthTint", HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintEnabled],
    ["coastalAlpha", HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceCoastalAlphaEnabled],
    ["contactFoam", HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamEnabled],
    ["directSpecular", HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled]
  ] as const)("gates only the requested Surface Appearance %s feature", (disabledFeature, disabledProperty) => {
    const setFloat = vi.fn();
    const setTexture = vi.fn();
    const state = createOpticsMaterialState({ setFloat, setTexture }, WaterQualityTier.High);
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const binding = {
      appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
      assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
      contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
      texture,
      ownership: "borrowed" as const
    };
    const appearanceShader = { name: "AIWorld/HeightfieldWaterSurfaceAppearanceV1High12" };
    const findShader = vi.spyOn(Shader, "find").mockReturnValue(appearanceShader as never);

    try {
      expect(setHeightfieldWaterSurfaceAppearanceBinding(state, binding).active).toBe(true);
      setFloat.mockClear();
      setTexture.mockClear();
      setHeightfieldWaterSurfaceAppearanceFeatureFlags(state, {
        ...DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS,
        [disabledFeature]: false
      });

      const gateProperties = [
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceExternalNormalEnabled,
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintEnabled,
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceCoastalAlphaEnabled,
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamEnabled,
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled
      ];
      for (const property of gateProperties) {
        expect(setFloat).toHaveBeenCalledWith(property, property === disabledProperty ? 0 : 1);
      }
      expect(state.surfaceAppearanceReadback).toMatchObject({
        active: true,
        normalLayerCount: 2,
        depthTintEnabled: true,
        coastalAlphaEnabled: true,
        contactFoamEnabled: true
      });
      expect(state.material.shader).toBe(appearanceShader);
      expect(setTexture).not.toHaveBeenCalled();
      expect(texture.destroy).not.toHaveBeenCalled();
    } finally {
      findShader.mockRestore();
    }
  });

  it("retains combined feature requests across invalid detach and reattach while clearing inactive gates", () => {
    const setFloat = vi.fn();
    const setTexture = vi.fn();
    const state = createOpticsMaterialState({ setFloat, setTexture }, WaterQualityTier.High);
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const binding = {
      appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
      assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
      contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
      texture,
      ownership: "borrowed" as const
    };
    const requestedFlags = {
      externalNormal: false,
      depthTint: true,
      coastalAlpha: false,
      contactFoam: true,
      directSpecular: false
    } as const;
    const appearanceShader = { name: "AIWorld/HeightfieldWaterSurfaceAppearanceV1High12" };
    const findShader = vi.spyOn(Shader, "find").mockReturnValue(appearanceShader as never);

    try {
      expect(setHeightfieldWaterSurfaceAppearanceBinding(state, binding).active).toBe(true);
      setHeightfieldWaterSurfaceAppearanceFeatureFlags(state, requestedFlags);
      expect(state.surfaceAppearanceFeatureFlags).toEqual(requestedFlags);
      expect(setFloat).toHaveBeenLastCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled, 0);

      setFloat.mockClear();
      expect(
        setHeightfieldWaterSurfaceAppearanceBinding(state, {
          ...binding,
          contentHash: "f".repeat(64)
        })
      ).toMatchObject({
        requested: true,
        active: false,
        fallbackReason: "surface-appearance-content-hash-mismatch"
      });
      for (const property of [
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceExternalNormalEnabled,
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintEnabled,
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceCoastalAlphaEnabled,
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamEnabled,
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled
      ]) {
        expect(setFloat).toHaveBeenCalledWith(property, 0);
      }

      setFloat.mockClear();
      expect(setHeightfieldWaterSurfaceAppearanceBinding(state, binding).active).toBe(true);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceExternalNormalEnabled, 0);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintEnabled, 1);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceCoastalAlphaEnabled, 0);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamEnabled, 1);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled, 0);
      expect(state.surfaceAppearanceFeatureFlags).toEqual(requestedFlags);
      expect(texture.destroy).not.toHaveBeenCalled();
    } finally {
      findShader.mockRestore();
    }
  });

  it("clears every stale appearance resource after an active binding becomes invalid", () => {
    const setFloat = vi.fn();
    const setTexture = vi.fn();
    const setVector3 = vi.fn();
    const setVector4 = vi.fn();
    const state = createOpticsMaterialState({ setFloat, setTexture, setVector3, setVector4 }, WaterQualityTier.High);
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const binding = {
      appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
      assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
      contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
      texture,
      ownership: "borrowed" as const
    };
    const appearanceShader = { name: "AIWorld/HeightfieldWaterSurfaceAppearanceV1High12" };
    const findShader = vi.spyOn(Shader, "find").mockReturnValue(appearanceShader as never);

    try {
      expect(setHeightfieldWaterSurfaceAppearanceBinding(state, binding).active).toBe(true);
      setFloat.mockClear();
      setTexture.mockClear();
      setVector3.mockClear();
      setVector4.mockClear();

      expect(
        setHeightfieldWaterSurfaceAppearanceBinding(state, {
          ...binding,
          contentHash: "f".repeat(64)
        })
      ).toMatchObject({
        requested: true,
        active: false,
        fallbackReason: "surface-appearance-content-hash-mismatch",
        normalLayerCount: 0,
        depthTintEnabled: false,
        coastalAlphaEnabled: false,
        contactFoamEnabled: false,
        contactFoamOctaveCount: 0,
        contactFoamWeights: []
      });
      expect(state.material.shader).toBe(state.legacyShader);
      expect(setTexture).toHaveBeenLastCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceNormalTexture, null);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceExternalNormalEnabled, 0);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintEnabled, 0);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceCoastalAlphaEnabled, 0);
      expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamEnabled, 0);
      expect(setVector4).toHaveBeenLastCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDepthTintColor,
        new Vector4(0, 0, 0, 0)
      );
      expect(setVector3).toHaveBeenLastCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamOctaveWeights,
        new Vector3(0, 0, 0)
      );
      expect(texture.destroy).not.toHaveBeenCalled();
    } finally {
      findShader.mockRestore();
    }
  });

  it("caps Medium contact foam to two normalized authored octaves", () => {
    const setVector3 = vi.fn();
    const state = createOpticsMaterialState({ setVector3 }, WaterQualityTier.Medium);
    const texture = { width: 1024, height: 1024, destroyed: false } as unknown as Texture2D;
    const binding = {
      appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
      assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
      contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
      texture,
      ownership: "borrowed" as const
    };
    const appearanceShader = { name: "AIWorld/HeightfieldWaterSurfaceAppearanceV1Medium6" };
    const findShader = vi.spyOn(Shader, "find").mockReturnValue(appearanceShader as never);

    try {
      expect(setHeightfieldWaterSurfaceAppearanceBinding(state, binding)).toMatchObject({
        active: true,
        contactFoamOctaveCount: 2,
        contactFoamWeights: [0.5, 0.25]
      });
      expect(setVector3).toHaveBeenLastCalledWith(
        HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceContactFoamOctaveWeights,
        new Vector3(0.5, 0.25, 0)
      );
    } finally {
      findShader.mockRestore();
    }
  });

  it("fails appearance-only debug views closed on legacy and restores them only while Appearance is active", () => {
    const setFloat = vi.fn();
    const setTexture = vi.fn();
    const state = createOpticsMaterialState({ setFloat, setTexture }, WaterQualityTier.High);
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const binding = {
      appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
      assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
      contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
      texture,
      ownership: "borrowed" as const
    };
    const appearanceShader = { name: "AIWorld/HeightfieldWaterSurfaceAppearanceV1High12" };
    const findShader = vi.spyOn(Shader, "find").mockReturnValue(appearanceShader as never);

    try {
      expect(
        setHeightfieldWaterSurfaceOpticsBinding(state, {
          tier: "high",
          opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
          refractionEnabled: true,
          reflection: undefined,
          debugView: HeightfieldWaterDebugMode.EffectiveRoughness
        }).debugView
      ).toBe(HeightfieldWaterDebugMode.Final);
      expect(state.surfaceOpticsBinding.debugView).toBe(HeightfieldWaterDebugMode.EffectiveRoughness);

      expect(setHeightfieldWaterSurfaceAppearanceBinding(state, binding).active).toBe(true);
      expect(state.bindingReadback.debugView).toBe(HeightfieldWaterDebugMode.EffectiveRoughness);
      expect(setFloat).toHaveBeenLastCalledWith(
        WATER_OPTICS_SHADER_PROPERTY.debugMode,
        HeightfieldWaterDebugMode.EffectiveRoughness
      );

      expect(
        setHeightfieldWaterSurfaceAppearanceBinding(state, {
          ...binding,
          contentHash: "f".repeat(64)
        }).active
      ).toBe(false);
      expect(state.bindingReadback.debugView).toBe(HeightfieldWaterDebugMode.Final);
      expect(setFloat).toHaveBeenLastCalledWith(
        WATER_OPTICS_SHADER_PROPERTY.debugMode,
        HeightfieldWaterDebugMode.Final
      );
      expect(texture.destroy).not.toHaveBeenCalled();
    } finally {
      findShader.mockRestore();
    }
  });

  it("fails Low and mismatched external bindings closed on the exact legacy shader", () => {
    const texture = { width: 1024, height: 1024, destroyed: false } as unknown as Texture2D;
    const binding = {
      appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
      assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
      contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
      texture,
      ownership: "borrowed" as const
    };
    const lowSetFloat = vi.fn();
    const lowSetTexture = vi.fn();
    const highSetFloat = vi.fn();
    const highSetTexture = vi.fn();
    const low = createOpticsMaterialState({ setFloat: lowSetFloat, setTexture: lowSetTexture }, WaterQualityTier.Low);
    const high = createOpticsMaterialState(
      { setFloat: highSetFloat, setTexture: highSetTexture },
      WaterQualityTier.High
    );

    expect(setHeightfieldWaterSurfaceAppearanceBinding(low, binding)).toMatchObject({
      active: false,
      fallbackReason: "surface-appearance-quality-unsupported"
    });
    expect(low.material.shader).toBe(low.legacyShader);
    expect(lowSetTexture).not.toHaveBeenCalled();
    expect(lowSetFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled, 0);
    expect(
      setHeightfieldWaterSurfaceAppearanceBinding(high, { ...binding, assetId: "mismatched-normal" })
    ).toMatchObject({
      active: false,
      fallbackReason: "surface-appearance-asset-id-mismatch"
    });
    expect(high.material.shader).toBe(high.legacyShader);
    expect(highSetTexture).not.toHaveBeenCalled();
    expect(highSetFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled, 0);
  });

  it.each(
    [WaterQualityTier.Medium, WaterQualityTier.High].flatMap((quality) =>
      [HeightfieldWaterCompositionMode.LegacyAlpha, HeightfieldWaterCompositionMode.PrecomposedReplace].flatMap(
        (compositionMode) => [false, true].map((depthWrite) => ({ quality, compositionMode, depthWrite }))
      )
    )
  )("precompiles the shared $quality source for composition=$compositionMode depthWrite=$depthWrite", ({ quality }) => {
    const source =
      quality === WaterQualityTier.Medium ? heightfieldWaterMediumShaderSource : heightfieldWaterHighShaderSource;
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES100, "")).not.toThrow();
  });

  it("uses the mesh base normal/tangent and damps normal-directed waves with shoreline SDF", () => {
    expect(heightfieldWaterMediumShaderSource).toContain("vec3 computedBaseNormalWS = normalize");
    expect(heightfieldWaterMediumShaderSource).toContain("computedBaseTangentWS");
    expect(heightfieldWaterMediumShaderSource).toContain("computedBaseBitangentWS");
    expect(heightfieldWaterMediumShaderSource).toContain("computedBaseNormalWS * waveOffset");
    expect(heightfieldWaterMediumShaderSource).toContain("float shoreDamping = smoothstep(");
    expect(heightfieldWaterMediumShaderSource).toContain("displacement += amplitude * sine * shoreDamping");
    expect(heightfieldWaterMediumShaderSource).not.toContain("localPosition.y +=");
    expect(heightfieldWaterMediumShaderSource).toContain("output.atlasUv = computedAtlasUv");
    expect(heightfieldWaterMediumShaderSource).not.toMatch(/\b(atlasUv|baseNormalWS|macroNormalWS)\s*=\s*\1\s*;/);
  });

  it("samples RG flow, B depth, and A signed distance from the global mesh UV in the fragment path", () => {
    expect(heightfieldWaterMediumShaderSource).toContain("vec2 computedAtlasUv = attr.TEXCOORD_0");
    expect(heightfieldWaterMediumShaderSource).not.toContain("mix(renderer_AtlasUvRect");
    expect(heightfieldWaterLowShaderSource.match(/texture2D\(\s*material_LocalMapTexture/g) ?? []).toHaveLength(2);
    expect(heightfieldWaterMediumShaderSource.match(/texture2D\(\s*material_LocalMapTexture/g) ?? []).toHaveLength(5);
    expect(heightfieldWaterHighShaderSource.match(/texture2D\(\s*material_LocalMapTexture/g) ?? []).toHaveLength(8);
    expect(heightfieldWaterMediumShaderSource).toContain("vec2 flowXZ = (localMap.rg * 2.0 - 1.0)");
    expect(heightfieldWaterMediumShaderSource).toContain("localMap.b * material_LocalMapDecode.y");
    expect(heightfieldWaterMediumShaderSource).toContain("(localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z");
  });

  it("keeps Low authored-depth-only and enables defined scene-depth remapping for Medium and High", () => {
    expect(heightfieldWaterLowShaderSource).not.toContain("camera_DepthTexture");
    expect(heightfieldWaterLowShaderSource).not.toContain("camera_OpaqueTexture");
    expect(heightfieldWaterLowShaderSource).toContain("float opticalDepth = authoredDepth;");
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("sampler2D camera_DepthTexture");
      expect(source).toContain("sampler2D camera_OpaqueTexture");
      expect(source).toContain("float remapDepthBufferEyeDepth(float depth)");
      expect(source).toContain("float sampledOpticalDepth = max(sceneEyeDepth - input.surfaceEyeDepth, 0.0)");
      expect(source).toContain("float opticalDepth = min(sampledOpticalDepth, authoredDepth)");
    }
  });

  it("uses depth-guarded scene-color refraction only for Medium and High", () => {
    expect(heightfieldWaterLowShaderSource).not.toContain("refractedScreenUv");
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("vec2 refractedScreenUv = clamp(");
      expect(source).toContain("refractionDepthContinuity = 1.0 - smoothstep(");
      expect(source).toContain("abs(refractedSceneEyeDepth - sceneEyeDepth)");
      expect(source).toContain("float refractedGeometryBehindSurface = smoothstep(");
      expect(source).toContain("centeredOpaqueColor = texture2D(camera_OpaqueTexture, screenUv).rgb");
      expect(source).toContain("displacedOpaqueColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb");
      expect(source).toContain("float fragmentShoreDamping = smoothstep(");
      expect(source).toContain("signedDistance\n        );");
      expect(source).toContain("refractionShoreWeight = smoothstep(0.12, 0.72, fragmentShoreDamping)");
      expect(source).toContain("(1.0 - foamTint * 0.94)");
    }
    expect(heightfieldWaterHighShaderSource).toContain("* 0.012\n            * material_RefractionStrength");
    expect(heightfieldWaterMediumShaderSource).toContain("* 0.008\n            * material_RefractionStrength");
  });

  it("uses a bounded world-space local foam mask to visibly suppress refraction", () => {
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("float material_LocalFoamMaskEnabled");
      expect(source).toContain("vec4 material_LocalFoamMaskCenterHalfSize");
      expect(source).toContain("float localFoamMaskSignedDistance = max(");
      expect(source).toContain("float localFoamMask = material_LocalFoamMaskEnabled * material_FoamEnabled * (");
      expect(source).toContain("float foam = saturate(max(proceduralFoam, localFoamMask))");
      expect(source).toContain("* (1.0 - localFoamMask);");
    }

    const setFloat = vi.fn();
    const setVector4 = vi.fn();
    const state = createOpticsMaterialState({ setFloat, setVector4 });
    setHeightfieldWaterLocalFoamMask(state, {
      enabled: true,
      centerXZ: [-6, 1.5],
      halfSizeXZ: [3.25, 4.25],
      featherMeters: 0.45
    });
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskEnabled, 1);
    expect(setVector4).toHaveBeenCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskCenterHalfSize,
      new Vector4(-6, 1.5, 3.25, 4.25)
    );
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskFeather, 0.45);
    expect(() =>
      setHeightfieldWaterLocalFoamMask(state, {
        enabled: true,
        centerXZ: [Number.NaN, 0],
        halfSizeXZ: [1, 1],
        featherMeters: 0.2
      })
    ).toThrow("must be finite");
  });

  it("toggles refraction in the shader and always falls invalid displaced samples back to centered opaque", () => {
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("float material_RefractionEnabled");
      expect(source).toContain("float refractionFeatureWeight = step(0.5, material_RefractionEnabled)");
      expect(source).toContain("* material_RefractionStrength\n            * refractionFeatureWeight");
      expect(source).toContain("* refractionDepthWeight\n          * refractionFeatureWeight");
      expect(source).toContain(
        "refractedSceneColor = mix(\n          centeredOpaqueColor,\n          displacedOpaqueColor,\n          refractionSampleValidity"
      );
    }
  });

  it("samples real Probe and Planar sources while preserving analytic Sky as the default", () => {
    expect(heightfieldWaterLowShaderSource).not.toContain("samplerCube material_ReflectionCubeTexture");
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("samplerCube material_ReflectionCubeTexture");
      expect(source).toContain("sampler2D material_PlanarReflectionTexture");
      expect(source).toContain("vec3 reflectionColor = skyReflection");
      expect(source).toContain("reflectionColor = textureCube(material_ReflectionCubeTexture, probeDirection).rgb");
      expect(source).toContain("reflectionClip.xy / reflectionClip.w * 0.5 + 0.5");
      expect(source).toContain("The binding VP already contains the render-target Y flip");
      expect(source).not.toMatch(/planar\w*Uv\.y\s*=\s*1\.0\s*-/i);
      expect(source).toContain("vec3 microNormalDeltaWS = surfaceNormalWS - input.macroNormalWS");
      expect(source).toContain("bool planarInsideScreen = all(greaterThanEqual(");
      expect(source).toContain(
        "clamp(\n                distortedPlanarUv,\n                planarInteriorMin,\n                planarInteriorMax"
      );
      expect(source).toContain("float planeDistanceFade = smoothstep(");
      expect(source).toContain("float viewAngleFade = smoothstep(");
      expect(source).toContain("reflectionColor = mix(skyReflection, sampledPlanarReflection");
      expect(source).toContain("fragmentColor = reflectionSourceDebug");
      expect(source).toContain("fragmentColor = vec3(clamp(planarReflectionUvDebug");
      expect(source).toContain("fragmentColor = vec3(planarClipSideDebug)");
    }
    expect(
      heightfieldWaterMediumShaderSource.match(/texture2D\(\s*material_PlanarReflectionTexture/g) ?? []
    ).toHaveLength(1);
    expect(
      heightfieldWaterHighShaderSource.match(/texture2D\(\s*material_PlanarReflectionTexture/g) ?? []
    ).toHaveLength(5);
  });

  it("binds validated reflection state and clears every stale resource on fallback", () => {
    const setFloat = vi.fn();
    const setTexture = vi.fn();
    const setMatrix = vi.fn();
    const setVector4 = vi.fn();
    const state = createOpticsMaterialState({ setFloat, setTexture, setMatrix, setVector4 }, WaterQualityTier.High);
    const identity = state.reflectionIdentityViewProjection;
    const planarTexture = { width: 320, height: 180 } as Texture2D;
    const planarViewProjection = new Matrix();

    const planar = setHeightfieldWaterReflectionBinding(
      state,
      {
        requestedSource: "planar",
        resolvedSource: "planar",
        planarTexture,
        planarViewProjection
      },
      { distortionStrength: 0.04, edgeFadeTexels: 12, highFilterSampleCount: 5 }
    );
    expect(planar).toMatchObject({
      effectiveSource: "planar",
      textureWidth: 320,
      textureHeight: 180,
      distortionStrength: 0.04,
      edgeFadeTexels: 12,
      filterSampleCount: 5
    });
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.reflectionSource, 2);
    expect(setTexture).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.reflectionCubeTexture, null);
    expect(setTexture).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.planarReflectionTexture, planarTexture);
    expect(setMatrix).toHaveBeenCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.planarReflectionViewProjection,
      planarViewProjection
    );
    expect(state.reflectionTextureSize).toMatchObject({ x: 320, y: 180, z: 1 / 320, w: 1 / 180 });
    expect(state.reflectionSamplingParameters).toMatchObject({ x: 0.04, y: 12, z: 0.001, w: 5 });

    const missing = setHeightfieldWaterReflectionBinding(state, {
      requestedSource: "planar",
      resolvedSource: "planar"
    });
    expect(missing).toMatchObject({
      effectiveSource: "sky",
      fallbackReason: "heightfield-planar-texture-unavailable",
      textureWidth: 0,
      textureHeight: 0
    });
    expect(setFloat).toHaveBeenLastCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.planarReflectionRoughnessFootprint, 3);
    expect(setTexture).toHaveBeenLastCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.planarReflectionTexture, null);
    expect(setMatrix).toHaveBeenLastCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.planarReflectionViewProjection,
      identity
    );
    expect(state.reflectionTextureSize).toMatchObject({ x: 0, y: 0, z: 0, w: 0 });

    const probeTexture = {} as TextureCube;
    const probe = setHeightfieldWaterReflectionBinding(state, {
      requestedSource: "probe",
      resolvedSource: "probe",
      probeTexture
    });
    expect(probe.effectiveSource).toBe("probe");
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.reflectionSource, 1);
    expect(setTexture).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.reflectionCubeTexture, probeTexture);
    expect(setTexture).toHaveBeenLastCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.planarReflectionTexture, null);
  });

  it("applies and reuses the complete shared binding while legacy setters update the same cache", () => {
    const state = createOpticsMaterialState({}, WaterQualityTier.High);
    const binding = {
      tier: "experimental" as const,
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: false,
      reflection: undefined,
      reflectionSampling: { highFilterSampleCount: 5 as const },
      debugView: HeightfieldWaterDebugMode.Fresnel
    };
    const first = setHeightfieldWaterSurfaceOpticsBinding(state, binding);
    const second = setHeightfieldWaterSurfaceOpticsBinding(state, binding);

    expect(second).toBe(first);
    expect(second).toMatchObject({
      requestedTier: "experimental",
      resolvedTier: "high",
      tierFallbackReason: "water-optics-experimental-resolved-high",
      refractionEnabled: false,
      debugView: HeightfieldWaterDebugMode.Fresnel
    });
    setHeightfieldWaterRefractionEnabled(state, true);
    expect(state.surfaceOpticsBinding.refractionEnabled).toBe(true);
    expect(state.bindingReadback).toBe(first);
    expect(state.bindingReadback.refractionEnabled).toBe(true);
  });

  it("exports exact B/D/C/A diagnostics while keeping final framebuffer capture external", () => {
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("fragmentColor = centeredOpaqueColor");
      expect(source).toContain("fragmentColor = displacedOpaqueColor");
      expect(source).toContain("fragmentColor = vec3(refractionDepthContinuity)");
      expect(source).toContain("fragmentColor = vec3(refractionSampleValidity)");
      expect(source).toContain("fragmentColor = vec3(effectiveFresnel)");
      expect(source).toContain("fragmentColor = reflectionColor");
      expect(source).toContain("fragmentColor = vec3(normalDotView)");
      expect(source).toContain("vec3 shaderCompositedColor = waterColor");
      expect(source).toContain("float surfaceAlpha = alpha");
      expect(source).toContain("fragmentColor = shaderCompositedColor");
      expect(source).toContain("fragmentColor = vec3(surfaceAlpha)");
      expect(source).toContain("fragmentAlpha = 1.0");
      expect(source).not.toContain("finalFramebufferColor");
    }
  });

  it("binds stable calibration state and emits the CPU-reference and pure-transmission paths", () => {
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).toContain("float material_OpticsCalibrationMode");
      expect(source).toContain("material_OpticsCalibrationMode > 1.5 ? 0.0 : fresnel");
      expect(source).toContain("referenceSourceColor * referenceTransmittance + profileScattering");
      expect(source).toContain("referenceTransmittedColor * (1.0 - effectiveFresnel)");
      expect(source).toContain("referenceReflectionColor * (effectiveFresnel * reflectionIntensity)");
      expect(source).toContain("if (material_OpticsCalibrationMode > 0.5)");
      expect(source).toContain("waterColor = referenceSurfaceColor");
      expect(source).toContain("if (material_OpticsCalibrationMode < 0.5)");
      expect(source).toContain(
        "waterColor = mix(waterColor, reflectionColor, saturate(fresnel * 0.72 * reflectionIntensity))"
      );
      expect(source).toContain("foamTint * 0.3 * (1.0 - step(0.5, material_OpticsCalibrationMode))");
    }
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("waterColor = mix(waterColor, refractedSceneColor * refractionTint, refractionAmount)");
    }

    const setFloat = vi.fn();
    const state = createOpticsMaterialState({ setFloat });
    const readback = state.opticsCalibrationReadback;
    expect(setHeightfieldWaterOpticsCalibrationMode(state, HeightfieldWaterOpticsCalibrationMode.CpuReference)).toBe(
      readback
    );
    expect(readback).toEqual({
      mode: HeightfieldWaterOpticsCalibrationMode.CpuReference,
      referenceCompositionEnabled: true,
      effectiveFresnelOverride: undefined
    });
    expect(setFloat).toHaveBeenLastCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.opticsCalibrationMode,
      HeightfieldWaterOpticsCalibrationMode.CpuReference
    );

    setHeightfieldWaterOpticsCalibrationMode(state, HeightfieldWaterOpticsCalibrationMode.PureTransmission);
    expect(state.opticsCalibrationReadback).toBe(readback);
    expect(readback).toEqual({
      mode: HeightfieldWaterOpticsCalibrationMode.PureTransmission,
      referenceCompositionEnabled: true,
      effectiveFresnelOverride: 0
    });

    setHeightfieldWaterOpticsCalibrationMode(state, 99 as HeightfieldWaterOpticsCalibrationMode);
    expect(readback).toEqual({
      mode: HeightfieldWaterOpticsCalibrationMode.None,
      referenceCompositionEnabled: false,
      effectiveFresnelOverride: undefined
    });
    expect(setFloat).toHaveBeenLastCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.opticsCalibrationMode,
      HeightfieldWaterOpticsCalibrationMode.None
    );
  });

  it("switches legacy alpha and precomposed replace without coupling depth writes", () => {
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("Bool blendEnabled");
      expect(source).toContain("Bool depthWriteEnabled");
      expect(source).toContain("Enabled = blendEnabled");
      expect(source).toContain("WriteEnabled = depthWriteEnabled");
      expect(source).toContain("if (material_CompositionMode > 0.5)");
      expect(source).toContain("if (coverage <= 0.001) discard");
      expect(source).toContain("gl_FragColor = vec4(fragmentColor, fragmentAlpha)");
    }

    const setFloat = vi.fn();
    const setInt = vi.fn();
    const state = createOpticsMaterialState({ setFloat, setInt });
    setHeightfieldWaterRefractionEnabled(state, false);
    setHeightfieldWaterCompositionMode(state, HeightfieldWaterCompositionMode.LegacyAlpha);
    setHeightfieldWaterDepthWriteEnabled(state, false);
    setHeightfieldWaterRefractionEnabled(state, true);
    setHeightfieldWaterCompositionMode(state, HeightfieldWaterCompositionMode.PrecomposedReplace);
    setHeightfieldWaterDepthWriteEnabled(state, true);

    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.refractionEnabled, 0);
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.refractionEnabled, 1);
    expect(setFloat).toHaveBeenCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.compositionMode,
      HeightfieldWaterCompositionMode.LegacyAlpha
    );
    expect(setFloat).toHaveBeenCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.compositionMode,
      HeightfieldWaterCompositionMode.PrecomposedReplace
    );
    expect(setInt).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.blendEnabled, 1);
    expect(setInt).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.blendEnabled, 0);
    expect(setInt).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.depthWriteEnabled, 0);
    expect(setInt).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.depthWriteEnabled, 1);
  });

  it("uses fixed 2/6/12 unrolled wave variants and bounded surface time", () => {
    expect(heightfieldWaterLowShaderSource.match(/applyHeightfieldWave\(/g) ?? []).toHaveLength(3);
    expect(heightfieldWaterMediumShaderSource.match(/applyHeightfieldWave\(/g) ?? []).toHaveLength(7);
    expect(heightfieldWaterHighShaderSource.match(/applyHeightfieldWave\(/g) ?? []).toHaveLength(13);
    expect(heightfieldWaterMediumShaderSource).toContain("mod(max(selected, 0.0), 4096.0)");
    expect(heightfieldWaterMediumShaderSource).not.toMatch(/for\s*\(/);
  });

  it("advects a tileable surface texture with reset-free dual flow phases", () => {
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).toContain("sampler2D material_SurfaceTexture");
      expect(source).toContain("vec4 sampleFlowSurface(");
      expect(source).toContain("float progressA = fract(cycle)");
      expect(source).toContain("float progressB = fract(cycle + 0.5)");
      expect(source).toContain("float weightA = 1.0 - abs(progressA * 2.0 - 1.0)");
      expect(source).toContain("decodedA * weightA + decodedB * weightB");
      expect(source).toContain("float spatialPhase = dot(worldXZ, spatialPhaseDirection)");
      expect(source).toContain("float cycle = elapsedTime * cycleRate + spatialPhase");
      expect(source).toContain("+ (cycle - progressA) * cycleJump");
      expect(source).toContain("+ (cycle - progressB) * cycleJump");
      expect(source).not.toContain("float microA = sin");
      expect(source).not.toContain("float foamNoise = sin");
    }
  });

  it("uses per-layer cycle jumps and expands the authored flow-speed contrast", () => {
    expect(heightfieldWaterHighShaderSource).toContain("vec2(0.24, 0.2083333)");
    expect(heightfieldWaterHighShaderSource).toContain("vec2(0.2, 0.25)");
    expect(heightfieldWaterHighShaderSource).toContain("vec2(0.22, 0.27)");
    expect(heightfieldWaterHighShaderSource).toContain("0.54\n              + normalizedSpeed * 1.08");
    expect(heightfieldWaterHighShaderSource).toContain("0.48\n              + normalizedSpeed * 1.02");
    const tuning = HEIGHTFIELD_WATER_SURFACE_TUNING;
    const movingScale = (speed: number, base: number, speedScale: number): number =>
      base + (speed / tuning.maximumFlowSpeed) * speedScale;
    const cycleRateRatio =
      movingScale(1.65, tuning.flowingCycleRateBase, tuning.flowingCycleRateSpeedScale) /
      movingScale(0.9, tuning.flowingCycleRateBase, tuning.flowingCycleRateSpeedScale);
    const travelRatio =
      movingScale(1.65, tuning.flowingPhaseTravelBase, tuning.flowingPhaseTravelSpeedScale) /
      movingScale(0.9, tuning.flowingPhaseTravelBase, tuning.flowingPhaseTravelSpeedScale);
    expect(cycleRateRatio).toBeGreaterThan(1.35);
    expect(cycleRateRatio).toBeLessThan(1.5);
    expect(travelRatio).toBeGreaterThan(1.35);
    expect(travelRatio).toBeLessThan(1.5);
  });

  it("attenuates still-pond macro motion, micro normals, and foam", () => {
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      expect(source).toContain(
        "float macroAmplitudeScale = mix(\n          0.3,\n          1.0,\n          flowWeight"
      );
      expect(source).toContain(
        "material_MicroNormalsEnabled * mix(\n          0.35,\n          1.0,\n          flowWeight"
      );
      expect(source).toContain("float foamMotionScale = mix(\n          0.1,\n          1.0,\n          flowWeight");
      expect(source).toContain("* material_WavesEnabled\n          * macroAmplitudeScale");
    }
  });

  it("adds unrolled upstream-SDF wake taps only to Medium and High", () => {
    expect(heightfieldWaterLowShaderSource).toContain("float wakeFoam = 0.0");
    expect(heightfieldWaterLowShaderSource).not.toContain("upstreamAtlasUvRaw0");
    expect(heightfieldWaterMediumShaderSource.match(/vec2 upstreamAtlasUvRaw\d =/g) ?? []).toHaveLength(1);
    expect(heightfieldWaterMediumShaderSource).not.toContain("upstreamAtlasUvRaw1");
    expect(heightfieldWaterHighShaderSource.match(/vec2 upstreamAtlasUvRaw\d =/g) ?? []).toHaveLength(2);
    expect(heightfieldWaterHighShaderSource).toContain("upstreamAtlasUvRaw1");
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("- flowDirection * material_LocalMapWorldToUv.xy");
      expect(source).toContain("vec2 wakeLateralDirection = vec2(-flowDirection.y, flowDirection.x)");
      expect(source).toContain("float upstreamObstacleGate0 = min(");
      expect(source).toContain("* upstreamAtlasInterior0 * upstreamObstacleGate0");
      expect(source).toContain("float wakeInterior = smoothstep(");
      expect(source).toContain("float wakeDetail = smoothstep(");
      expect(source).toContain("foamNoise + abs(flowSurface.x) * 0.12");
      expect(source).toContain("* flowWeight\n          * wakeDetail");
    }
  });

  it("scales flow detail cost from one to three unrolled layers", () => {
    expect(heightfieldWaterLowShaderSource).toContain("vec4 flowSurface0");
    expect(heightfieldWaterLowShaderSource).not.toContain("vec4 flowSurface1");
    expect(heightfieldWaterMediumShaderSource).toContain("vec4 flowSurface1");
    expect(heightfieldWaterMediumShaderSource).not.toContain("vec4 flowSurface2");
    expect(heightfieldWaterHighShaderSource).toContain("vec4 flowSurface2");
    expect(heightfieldWaterHighShaderSource).toContain("mix(authoredDirection, localFlowDirection, flowAlignment)");
  });

  it("combines physical-looking absorption, Schlick Fresnel, sun glints, and three foam sources", () => {
    expect(heightfieldWaterMediumShaderSource).toContain("vec3 transmittance = exp(-absorption * opticalDepth)");
    expect(heightfieldWaterMediumShaderSource).toContain("float fresnelF0 = fresnelRatio * fresnelRatio");
    expect(heightfieldWaterMediumShaderSource).toContain("pow(1.0 - normalDotView, 5.0)");
    expect(heightfieldWaterMediumShaderSource).toContain("float broadSpecular = pow(");
    expect(heightfieldWaterMediumShaderSource).toContain("float tightSpecular = pow(");
    expect(heightfieldWaterMediumShaderSource).toContain("float shoreFoam = shoreEnvelope * foamBreakup");
    expect(heightfieldWaterMediumShaderSource).toContain("float crestFoam = smoothstep(");
    expect(heightfieldWaterMediumShaderSource).toContain("float currentFoam = smoothstep(");
  });

  it("drives surface optics from profile uniforms without hardcoding the legacy F0", () => {
    for (const source of [heightfieldWaterMediumShaderSource, heightfieldWaterHighShaderSource]) {
      expect(source).toContain("vec3 material_AbsorptionCoefficient");
      expect(source).toContain("vec3 material_ScatteringColor");
      expect(source).toContain("float material_ScatteringCoefficient");
      expect(source).toContain("float material_MaximumSurfaceOpticalDistance");
      expect(source).toContain("float material_IndexOfRefraction");
      expect(source).toContain("float material_RefractionStrength");
      expect(source).toContain("float material_Roughness");
      expect(source).toContain("float material_ReflectionIntensity");
      expect(source).toContain("opticalDepth = min(opticalDepth, max(material_MaximumSurfaceOpticalDistance, 0.0))");
      expect(source).toContain("max(material_AbsorptionCoefficient, vec3(0.0))");
      expect(source).toContain("profileScattering - legacyScattering");
      expect(source).toContain("* material_RefractionStrength");
      expect(source).toContain("saturate(material_Roughness)");
      expect(source).toContain("fresnel * 0.72 * reflectionIntensity");
      expect(source).not.toContain("float fresnel = 0.022");
      expect(source).not.toContain("1.0 - 0.022");
    }
  });

  it("reuses cached vectors and clamps every profile uniform to finite values", () => {
    const setFloat = vi.fn();
    const setVector3 = vi.fn();
    const state = createOpticsMaterialState({ setFloat, setVector3 });
    const absorption = state.opticalAbsorption;
    const scatteringColor = state.opticalScatteringColor;

    setHeightfieldWaterOpticalProfile(state, DEFAULT_WATER_OPTICAL_PROFILE);
    expect(setVector3).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.absorptionCoefficient, absorption);
    expect(setVector3).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.scatteringColor, scatteringColor);
    expect(setFloat).toHaveBeenCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.indexOfRefraction,
      DEFAULT_WATER_OPTICAL_PROFILE.indexOfRefraction
    );
    expect(setFloat).toHaveBeenCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.scatteringCoefficient,
      DEFAULT_WATER_OPTICAL_PROFILE.scatteringCoefficient
    );
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.maximumSurfaceOpticalDistance, 4);
    expect(setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.maximumViewDistance, 36);
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.refractionStrength, 1);
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.roughness, 0);
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.reflectionIntensity, 1);

    setHeightfieldWaterOpticalProfile(state, {
      absorptionCoefficient: [Number.NaN, -1, Number.POSITIVE_INFINITY],
      scatteringColor: [Number.NaN, -1, Number.POSITIVE_INFINITY],
      scatteringCoefficient: Number.NaN,
      maximumViewDistance: Number.NaN,
      maximumSurfaceOpticalDistance: Number.POSITIVE_INFINITY,
      indexOfRefraction: Number.NEGATIVE_INFINITY,
      refractionStrength: Number.POSITIVE_INFINITY,
      roughness: Number.POSITIVE_INFINITY,
      reflectionIntensity: Number.NEGATIVE_INFINITY
    });

    expect(state.opticalAbsorption).toBe(absorption);
    expect(state.opticalScatteringColor).toBe(scatteringColor);
    expect([absorption.x, absorption.y, absorption.z, scatteringColor.x, scatteringColor.y, scatteringColor.z]).toEqual(
      [0.21, 0, 1_000_000, 0.06, 0, 65504]
    );
    expect(
      [absorption.x, absorption.y, absorption.z, scatteringColor.x, scatteringColor.y, scatteringColor.z].every(
        Number.isFinite
      )
    ).toBe(true);
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.indexOfRefraction, 1);
    expect(setFloat).toHaveBeenCalledWith(
      HEIGHTFIELD_WATER_SHADER_PROPERTY.scatteringCoefficient,
      DEFAULT_WATER_OPTICAL_PROFILE.scatteringCoefficient
    );
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.maximumSurfaceOpticalDistance, 1_000_000);
    expect(setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.maximumViewDistance, 36);
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.refractionStrength, 4);
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.roughness, 1);
    expect(setFloat).toHaveBeenCalledWith(HEIGHTFIELD_WATER_SHADER_PROPERTY.reflectionIntensity, 0);
  });

  it("uses semantic varyings without compatibility packing", () => {
    for (const source of [
      heightfieldWaterLowShaderSource,
      heightfieldWaterMediumShaderSource,
      heightfieldWaterHighShaderSource
    ]) {
      const varyingBlock = source.match(/struct Varyings \{([\s\S]*?)\};/)?.[1] ?? "";
      expect(varyingBlock).toContain("float baseSurfaceHeight");
      expect(varyingBlock).toContain("float waveOffset");
      expect(varyingBlock).toContain("float surfaceEyeDepth");
      expect(varyingBlock).toContain("float shoreDamping");
      expect(varyingBlock).not.toContain("surfaceData");
    }
  });

  it("builds deterministic non-flat repeatable texture data", () => {
    const first = buildHeightfieldWaterSurfaceTexturePixels();
    const second = buildHeightfieldWaterSurfaceTexturePixels();
    const size = HEIGHTFIELD_WATER_SURFACE_TEXTURE.size;
    expect(first).toEqual(second);
    expect(first).toHaveLength(size * size * 4);
    const redValues = new Set<number>();
    const blueValues = new Set<number>();
    let decorrelatedChannelCount = 0;
    for (let offset = 0; offset < first.length; offset += 4) {
      redValues.add(first[offset]);
      blueValues.add(first[offset + 2]);
      if (first[offset + 2] !== first[offset + 3]) decorrelatedChannelCount++;
    }
    expect(redValues.size).toBeGreaterThan(64);
    expect(blueValues.size).toBeGreaterThan(64);
    expect(decorrelatedChannelCount).toBeGreaterThan(size * size * 0.8);
  });

  it("maps compiled wet surface vertices to positive atlas SDF texels without a V flip", () => {
    const data = HeightfieldWaterCompiler.compile(
      createHeightfieldWaterFixture(WaterQualityTier.Medium).descriptor
    ).data!;
    const atlas = data.localMapAtlas;
    const pixels = atlas.pixels.toTypedArray();
    let positive = 0;
    let negative = 0;
    for (const chunk of data.chunks) {
      const positions = chunk.geometry.positions.toTypedArray();
      for (let index = 0; index < chunk.geometry.vertexCount; index++) {
        const worldX = positions[index * 3] + chunk.localOrigin[0];
        const worldZ = positions[index * 3 + 2] + chunk.localOrigin[2];
        const u = worldX * atlas.worldToUv[0] + atlas.worldToUv[2];
        const v = worldZ * atlas.worldToUv[1] + atlas.worldToUv[3];
        const pixelX = Math.max(0, Math.min(atlas.width - 1, Math.floor(u * atlas.width)));
        const pixelY = Math.max(0, Math.min(atlas.height - 1, Math.floor(v * atlas.height)));
        if (pixels[(pixelY * atlas.width + pixelX) * 4 + 3] > 127) positive++;
        else negative++;
      }
    }
    expect(positive).toBeGreaterThan(negative);
  });
});
