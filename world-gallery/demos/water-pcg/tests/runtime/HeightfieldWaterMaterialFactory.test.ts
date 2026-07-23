import { ShaderLanguage, type Texture2D, type TextureCube } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { Matrix, Vector4 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { createHeightfieldWaterFixture } from "../../demo/heightfield/heightfieldFixture";
import {
  HEIGHTFIELD_WATER_SHADER_PROPERTY,
  HEIGHTFIELD_WATER_SURFACE_TEXTURE,
  HEIGHTFIELD_WATER_SURFACE_TUNING
} from "../../runtime/heightfield/constants";
import {
  heightfieldWaterHighShaderSource,
  heightfieldWaterLowShaderSource,
  heightfieldWaterMediumShaderSource,
  setHeightfieldWaterCompositionMode,
  setHeightfieldWaterDepthWriteEnabled,
  setHeightfieldWaterOpticsCalibrationMode,
  setHeightfieldWaterLocalFoamMask,
  setHeightfieldWaterOpticalProfile,
  setHeightfieldWaterReflectionBinding,
  setHeightfieldWaterRefractionEnabled,
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

interface GlesShaderPrecompiler {
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

function createOpticsMaterialState(
  shaderDataOverrides: Readonly<Record<string, unknown>>,
  quality = WaterQualityTier.Medium
): HeightfieldWaterMaterialState {
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
    material: { shaderData } as never,
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
    }
  };
}

describe("HeightfieldWaterMaterialFactory", () => {
  it("keeps debug and composition enum values stable for Lab capture automation", () => {
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
      HeightfieldWaterDebugMode.NormalDotView
    ]).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
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
      [HeightfieldWaterOpticsDebugOutput.NormalDotView]: HeightfieldWaterDebugMode.NormalDotView
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
