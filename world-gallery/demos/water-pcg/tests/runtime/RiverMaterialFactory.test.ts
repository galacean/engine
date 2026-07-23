import type { Material, ShaderData, Texture2D, TextureCube } from "@galacean/engine-core";
import { ShaderLanguage } from "@galacean/engine-core";
import { Matrix } from "@galacean/engine-math";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";
import { WaterOpticsDebugView } from "../../runtime/optics/WaterSurfaceOpticsTypes";
import { WATER_OPTICS_SHADER_PROPERTY } from "../../runtime/optics/constants/WaterOpticsShaderConstants";
import {
  lowRiverShaderSource,
  riverSurfaceLocalMapShaderSource,
  riverSurfaceShaderSource,
  setRiverSurfaceOpticsBinding
} from "../../runtime/river/RiverMaterialFactory";
import { RIVER_SURFACE_TEXTURE_SAMPLE_COUNT } from "../../runtime/river/constants";

interface GlesShaderPrecompiler {
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

function createOpticsHarness(): {
  readonly material: Material;
  readonly setFloat: ReturnType<typeof vi.fn>;
  readonly setVector3: ReturnType<typeof vi.fn>;
  readonly setTexture: ReturnType<typeof vi.fn>;
} {
  const setFloat = vi.fn();
  const setVector3 = vi.fn();
  const setTexture = vi.fn();
  const shaderData = {
    setFloat,
    setVector3,
    setVector4: vi.fn(),
    setTexture,
    setMatrix: vi.fn()
  } as unknown as ShaderData;
  return {
    material: { shaderData } as unknown as Material,
    setFloat,
    setVector3,
    setTexture
  };
}

describe("RiverMaterialFactory shaders", () => {
  it.each([
    ["surface", riverSurfaceShaderSource],
    ["local-map surface", riverSurfaceLocalMapShaderSource]
  ])("precompiles the %s shader to GLES100", (_label, source) => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES100, "")).not.toThrow();
  });

  it("uses one pass, one texture sample, and no FBM loop", () => {
    expect(lowRiverShaderSource.match(/Pass \"/g) ?? []).toHaveLength(1);
    expect(lowRiverShaderSource.match(/texture2D\(/g) ?? []).toHaveLength(1);
    expect(lowRiverShaderSource).not.toMatch(/fbm|for\s*\(/i);
    expect(lowRiverShaderSource).toContain("scene_ElapsedTime.x");
    expect(lowRiverShaderSource).toContain("TEXCOORD_1");
    expect(lowRiverShaderSource).toContain("COLOR_0");
    expect(lowRiverShaderSource).toContain("input.color.b");
    expect(lowRiverShaderSource).toContain("input.uv.y - flowTime");
    expect(lowRiverShaderSource).not.toContain("input.localFlowSpeed * material_FlowSpeed");
    expect(lowRiverShaderSource).not.toContain("max(material_FlowSpeed, 0.08)");
  });

  it("keeps Low transparency clarity-driven without scene textures", () => {
    expect(lowRiverShaderSource).toContain("float waterAlpha = mix(");
    expect(lowRiverShaderSource).toContain("clamp(material_Clarity, 0.0, 1.0)");
    expect(lowRiverShaderSource).not.toContain("water * material_BaseColor.a");
    expect(lowRiverShaderSource).not.toContain("camera_DepthTexture");
    expect(lowRiverShaderSource).not.toContain("camera_OpaqueTexture");
  });

  it("displaces vertices from continuous network flow coordinates", () => {
    expect(riverSurfaceShaderSource).toContain("float riverMacroHeight(");
    expect(riverSurfaceShaderSource).toContain(
      "riverWarpedDomain(input.motionCoordinates, input.localFlowSpeed, elapsedTime)"
    );
    expect(riverSurfaceShaderSource).toContain("localPosition.y += computedMacroHeight");
    expect(riverSurfaceShaderSource).toContain("output.motionCoordinates = attr.TEXCOORD_2");
    expect(riverSurfaceShaderSource).toContain("output.authoredDepth = attr.TEXCOORD_3.y");
    expect(riverSurfaceShaderSource).toContain("baseNormalWS - acrossWS * acrossDerivative");
    expect(riverSurfaceShaderSource).not.toContain("float streak = sin(detailPhase");
    expect(riverSurfaceShaderSource).not.toContain("branchDownstream");
    expect(riverSurfaceShaderSource).toContain("point = mod(point,");
    expect(riverSurfaceShaderSource).not.toContain("mod(motionCoord.y, timePeriod)");
    expect(riverSurfaceShaderSource).toContain("safeNormalize2(mix(baseFlow, localFlowDirection, localFlowWeight)");
  });

  it("uses eroded ridged crests and three-scale continuous flow normals", () => {
    expect(riverSurfaceShaderSource.match(/Pass \"/g) ?? []).toHaveLength(1);
    expect(riverSurfaceShaderSource).toContain("float ridgeMask = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float erosionMask = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float crestCurvature");
    expect(riverSurfaceShaderSource).toContain("vec4 sampleFlowSurface(");
    expect(riverSurfaceShaderSource).toContain("float progressA = fract(cycle)");
    expect(riverSurfaceShaderSource).toContain("float progressB = fract(cycle + 0.5)");
    expect(riverSurfaceShaderSource).toContain("(cycle - progressA) * cycleJump");
    expect(riverSurfaceShaderSource).toContain("vec4 flowSurfaceA = sampleFlowSurface(");
    expect(riverSurfaceShaderSource).toContain("vec4 flowSurfaceB = sampleFlowSurface(");
    expect(riverSurfaceShaderSource).toContain("vec4 flowSurfaceC = sampleFlowSurface(");
    expect(riverSurfaceShaderSource).toContain("float microDetailScale = clamp(");
    expect(riverSurfaceShaderSource).toContain("0.07500000 * microDetailScale");
    expect(riverSurfaceShaderSource).toContain("float shoreEnvelope");
    expect(riverSurfaceShaderSource).toContain("float crestFoam");
    expect(riverSurfaceShaderSource).toContain("float shoreFoam");
    expect(riverSurfaceShaderSource).toContain("float shorePatchNoise = riverFbm(");
    expect(riverSurfaceShaderSource).toContain("float shorePulse = 0.5 + 0.5 * sin(");
    expect(riverSurfaceShaderSource).toContain("float shorePatchGate = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float shoreLifePulse = 0.5 + 0.5 * sin(");
    expect(riverSurfaceShaderSource).toContain("float shoreLifeGate = smoothstep(");
    expect(riverSurfaceShaderSource).toContain("float shoreBreakup = shorePatchGate");
    expect(riverSurfaceShaderSource).toContain("float shoreFoam = shoreEnvelope");
    expect(riverSurfaceShaderSource).not.toContain("shoreFoamMinimum");
    expect(riverSurfaceShaderSource).toContain("float foamTint");
    expect(riverSurfaceShaderSource).toContain("float foamTint = saturate(");
    expect(riverSurfaceShaderSource).toContain("+ shoreFoam *");
    expect(riverSurfaceShaderSource).toContain("+ localWakeFoam *");
    expect(riverSurfaceShaderSource).toContain("+ obstacleEdgeFoam *");
    expect(riverSurfaceShaderSource).toContain("vec3 softFoamColor");
    expect(RIVER_SURFACE_TEXTURE_SAMPLE_COUNT).toEqual({ low: 1, regular: 11, localMap: 12 });
  });

  it("uses profile-driven Schlick reflection, one optional Probe, and two-scale sunlight", () => {
    expect(riverSurfaceShaderSource).toContain("float fresnelRatio = (1.0 - indexOfRefraction)");
    expect(riverSurfaceShaderSource).toContain("float fresnelF0 = fresnelRatio * fresnelRatio");
    expect(riverSurfaceShaderSource).not.toContain("float fresnel = 0.02200000");
    expect(riverSurfaceShaderSource).toContain("float broadSpecular = pow(");
    expect(riverSurfaceShaderSource).toContain("float tightSpecular = pow(");
    expect(riverSurfaceShaderSource).toContain("vec3 skyReflection = mix(");
    expect(riverSurfaceShaderSource).toContain("samplerCube material_ReflectionCubeTexture");
    expect(riverSurfaceShaderSource).toContain("textureCube(");
    expect(riverSurfaceShaderSource).toContain("material_PlanarReflectionTexture");
    expect(riverSurfaceShaderSource).toContain("material_PlanarReflectionVP");
    expect(riverSurfaceShaderSource).toContain("material_PlanarReflectionSampling.w > 3.0");
    expect(riverSurfaceShaderSource).toContain("float sparkleMask = mix(");
    expect(riverSurfaceShaderSource).toContain("sampler2D camera_OpaqueTexture");
    expect(riverSurfaceShaderSource).toContain("vec2 displacedScreenUv = screenUv");
    expect(riverSurfaceShaderSource).toContain("float refractionDepthContinuity = 1.0 - smoothstep(");
  });

  it("keeps the regular path atlas-free and adds one guarded sample only to complex chunks", () => {
    expect(riverSurfaceShaderSource).not.toContain("material_LocalMapTexture");
    expect(riverSurfaceLocalMapShaderSource).toContain("sampler2D material_LocalMapTexture");
    expect(riverSurfaceLocalMapShaderSource).toContain("vec4 localMapSample = texture2D(material_LocalMapTexture");
    expect(riverSurfaceLocalMapShaderSource).toContain("float atlasRectMask");
    expect(riverSurfaceLocalMapShaderSource).toContain("float confluenceInteriorWeight = smoothstep(");
    expect(riverSurfaceLocalMapShaderSource).toContain("renderer_LocalMapConfluence");
    expect(riverSurfaceLocalMapShaderSource).toContain("* localEffectWeight");
    expect(riverSurfaceLocalMapShaderSource).toContain("renderer_LocalMapWorldToUv");
    expect(riverSurfaceLocalMapShaderSource).toContain("float obstacleRegionWeight =");
    expect(riverSurfaceLocalMapShaderSource).toContain("float localWakeSignal =");
    expect(riverSurfaceLocalMapShaderSource).toContain("float wakeTravelPhase = dot(input.worldXZ, baseFlow)");
    expect(riverSurfaceLocalMapShaderSource).toContain("float wakeAlternation = 0.5 + 0.5 * sin(");
    expect(riverSurfaceLocalMapShaderSource).toContain("float wakeShedding = smoothstep(");
    expect(riverSurfaceLocalMapShaderSource).toContain("float dynamicWakeSignal = localWakeSignal * wakeShedding");
    expect(riverSurfaceLocalMapShaderSource).toContain("float wakeLiftedSignal = smoothstep(");
    expect(riverSurfaceLocalMapShaderSource).toContain("float localConfluenceFoam =");
    expect(riverSurfaceLocalMapShaderSource).toContain("float localWakeFoam =");
    expect(riverSurfaceLocalMapShaderSource).toContain("float obstacleEdgeFoam =");
    expect(riverSurfaceLocalMapShaderSource).toContain("vec2 localFlowBend = (localFlowDirection - baseFlow)");
    expect(riverSurfaceLocalMapShaderSource).toContain("vec2 localWakeRipple = wakeLateralDirection");
  });

  it("caps Medium scene-depth thickness with the authored water column", () => {
    expect(riverSurfaceShaderSource).toContain("sampler2D camera_DepthTexture");
    expect(riverSurfaceShaderSource).toContain("remapDepthBufferEyeDepth");
    expect(riverSurfaceShaderSource).toContain("sceneEyeDepth - input.surfaceEyeDepth");
    expect(riverSurfaceShaderSource).toContain("input.authoredDepth * input.shoreDamping");
    expect(riverSurfaceShaderSource).toContain("float authoredDepthAvailable = step(");
    expect(riverSurfaceShaderSource).toContain("min(sampledOpticalDepth, authoredOpticalDepth)");
    expect(riverSurfaceShaderSource).toContain(
      "opticalDepth = min(opticalDepth, max(material_MaximumSurfaceOpticalDistance, 0.0))"
    );
    expect(riverSurfaceShaderSource).toContain("vec3 absorption = max(material_AbsorptionCoefficient, vec3(0.0))");
    expect(riverSurfaceShaderSource).toContain("vec3 transmittance = exp(-absorption * opticalDepth)");
    expect(riverSurfaceShaderSource).toContain("vec3 profileScattering = max(material_ScatteringColor");
    expect(riverSurfaceShaderSource).toContain("step(0.5, material_RefractionEnabled)");
    expect(riverSurfaceShaderSource).toContain("max(material_RefractionStrength, 0.0)");
    expect(riverSurfaceShaderSource).toContain("float absorptionAlpha = 1.0 - exp(-averageAbsorption");
    expect(riverSurfaceShaderSource).toContain("float waterAlpha = clamp(");
    expect(riverSurfaceShaderSource).toContain("alpha * material_OpacityScale");
    expect(riverSurfaceShaderSource).toContain("saturate(material_TintWeight)");
    expect(riverSurfaceShaderSource).toContain("vec3 deepWaterColor = mix(");
    expect(riverSurfaceShaderSource).toContain(
      "vec3 volumeColor = mix(material_BaseColor.rgb, deepWaterColor, depthColorMix)"
    );
    expect(riverSurfaceShaderSource).toContain("camera_OpaqueTexture");
    expect(riverSurfaceShaderSource).not.toContain("material_BaseColor.a *");
  });

  it("uses semantic varyings without compatibility packing", () => {
    const varyingBlock = riverSurfaceShaderSource.match(/struct Varyings \{([\s\S]*?)\};/)?.[1] ?? "";
    expect(varyingBlock).toContain("vec2 motionCoordinates");
    expect(varyingBlock).toContain("float riverHalfWidth");
    expect(varyingBlock).toContain("float localFlowSpeed");
    expect(varyingBlock).toContain("float macroHeight");
    expect(varyingBlock).toContain("float shoreDamping");
    expect(varyingBlock).toContain("float surfaceEyeDepth");
    expect(varyingBlock).toContain("float authoredDepth");
    expect(varyingBlock).not.toContain("motionData");
    expect(varyingBlock).not.toContain("surfaceData");
  });

  it("applies the shared profile and explicit refraction toggle", () => {
    const harness = createOpticsHarness();
    const profile = {
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      absorptionCoefficient: [0.4, 0.2, 0.1] as const,
      scatteringColor: [0.08, 0.3, 0.36] as const,
      scatteringCoefficient: 0.22,
      maximumSurfaceOpticalDistance: 9,
      indexOfRefraction: 1.5,
      refractionStrength: 1.75
    };

    const enabled = setRiverSurfaceOpticsBinding(harness.material, {
      tier: "medium",
      opticalProfile: profile,
      refractionEnabled: true,
      reflection: undefined,
      debugView: WaterOpticsDebugView.Final
    });
    expect(enabled.opticalProfile.fresnelF0).toBeCloseTo(0.04);
    expect(enabled.opticalProfile.maximumSurfaceOpticalDistance).toBe(9);
    expect(harness.setVector3).toHaveBeenCalledWith(
      WATER_OPTICS_SHADER_PROPERTY.absorptionCoefficient,
      expect.objectContaining({ x: 0.4, y: 0.2, z: 0.1 })
    );
    expect(harness.setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.scatteringCoefficient, 0.22);
    expect(harness.setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.indexOfRefraction, 1.5);
    expect(harness.setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.refractionStrength, 1.75);
    expect(harness.setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.refractionEnabled, 1);

    setRiverSurfaceOpticsBinding(harness.material, {
      tier: "high",
      opticalProfile: profile,
      refractionEnabled: false,
      reflection: undefined,
      debugView: WaterOpticsDebugView.Final
    });
    expect(harness.setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.refractionEnabled, 0);
  });

  it("binds Probe but makes Planar fail closed to Probe or Sky and clears stale textures", () => {
    const harness = createOpticsHarness();
    const probeTexture = {} as TextureCube;
    const base = {
      tier: "high" as const,
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: true,
      debugView: WaterOpticsDebugView.Final
    };

    const probe = setRiverSurfaceOpticsBinding(harness.material, {
      ...base,
      reflection: {
        requestedSource: "probe",
        resolvedSource: "probe",
        probeTexture
      }
    });
    expect(probe.effectiveSource).toBe("probe");
    expect(harness.setTexture).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture, probeTexture);
    expect(harness.setTexture).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.planarReflectionTexture, null);

    const planarToProbe = setRiverSurfaceOpticsBinding(harness.material, {
      ...base,
      reflection: {
        requestedSource: "planar",
        resolvedSource: "planar",
        probeTexture
      }
    });
    expect(planarToProbe).toMatchObject({
      requestedSource: "planar",
      bindingResolvedSource: "probe",
      effectiveSource: "probe",
      fallbackReason: "planar-ineligible"
    });
    expect(harness.setTexture).toHaveBeenLastCalledWith(WATER_OPTICS_SHADER_PROPERTY.planarReflectionTexture, null);

    const planarToSky = setRiverSurfaceOpticsBinding(harness.material, {
      ...base,
      reflection: {
        requestedSource: "planar",
        resolvedSource: "planar"
      }
    });
    expect(planarToSky).toMatchObject({
      requestedSource: "planar",
      bindingResolvedSource: "sky",
      effectiveSource: "sky",
      fallbackReason: "planar-ineligible"
    });
    expect(harness.setTexture).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture, null);

    const cleared = setRiverSurfaceOpticsBinding(harness.material);
    expect(cleared.effectiveSource).toBe("sky");
    expect(harness.setTexture).toHaveBeenLastCalledWith(WATER_OPTICS_SHADER_PROPERTY.planarReflectionTexture, null);
  });

  it("lets a flat Pool adapter opt into the shared Planar binding without changing River defaults", () => {
    const harness = createOpticsHarness();
    const planarTexture = { width: 512, height: 360 } as Texture2D;
    const readback = setRiverSurfaceOpticsBinding(
      harness.material,
      {
        tier: "high",
        opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
        refractionEnabled: true,
        reflection: {
          requestedSource: "planar",
          resolvedSource: "planar",
          planarTexture,
          planarViewProjection: new Matrix()
        },
        reflectionSampling: {
          highFilterSampleCount: 5
        },
        debugView: WaterOpticsDebugView.Final
      },
      { planarEligible: true }
    );

    expect(readback).toMatchObject({
      requestedSource: "planar",
      bindingResolvedSource: "planar",
      effectiveSource: "planar",
      filterSampleCount: 5
    });
    expect(harness.setTexture).toHaveBeenCalledWith(
      WATER_OPTICS_SHADER_PROPERTY.planarReflectionTexture,
      planarTexture
    );
  });
});
