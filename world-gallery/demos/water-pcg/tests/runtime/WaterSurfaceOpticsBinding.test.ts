import type { ShaderData, Texture2D, TextureCube } from "@galacean/engine-core";
import { Matrix } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";
import {
  applyWaterSurfaceOpticalProfile,
  applyWaterSurfaceOpticsBinding,
  applyWaterSurfaceReflectionBinding,
  createWaterSurfaceOpticsBindingState
} from "../../runtime/optics/WaterSurfaceOpticsBinding";
import {
  createWaterSurfaceOpticsResult,
  evaluateWaterSurfaceOptics
} from "../../runtime/optics/WaterSurfaceOpticsMath";
import {
  WaterOpticsDebugView,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBinding
} from "../../runtime/optics/WaterSurfaceOpticsTypes";
import {
  WATER_OPTICS_REFLECTION_SOURCE_VALUE,
  WATER_OPTICS_SHADER_PROPERTY
} from "../../runtime/optics/constants/WaterOpticsShaderConstants";
import type { WaterReflectionSource } from "../../runtime/optics/WaterReflectionPolicy";

function createShaderDataMock(): {
  readonly shaderData: ShaderData;
  readonly setFloat: ReturnType<typeof vi.fn>;
  readonly setVector3: ReturnType<typeof vi.fn>;
  readonly setVector4: ReturnType<typeof vi.fn>;
  readonly setMatrix: ReturnType<typeof vi.fn>;
  readonly setTexture: ReturnType<typeof vi.fn>;
} {
  const setFloat = vi.fn();
  const setVector3 = vi.fn();
  const setVector4 = vi.fn();
  const setMatrix = vi.fn();
  const setTexture = vi.fn();
  return {
    shaderData: { setFloat, setVector3, setVector4, setMatrix, setTexture } as unknown as ShaderData,
    setFloat,
    setVector3,
    setVector4,
    setMatrix,
    setTexture
  };
}

function createPlanarBinding(tier: WaterOpticsTier): WaterSurfaceOpticsBinding {
  return {
    tier,
    opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
    refractionEnabled: true,
    reflection: {
      requestedSource: "planar",
      resolvedSource: "planar",
      planarTexture: { width: 321.8, height: 181.2 } as Texture2D,
      planarViewProjection: new Matrix()
    },
    reflectionSampling: { highFilterSampleCount: 5 },
    debugView: WaterOpticsDebugView.Final
  };
}

describe("WaterSurfaceOpticsBinding", () => {
  it("keeps the P0 material property and debug-number ABI stable", () => {
    expect(WATER_OPTICS_SHADER_PROPERTY).toMatchObject({
      debugMode: "material_DebugMode",
      refractionEnabled: "material_RefractionEnabled",
      absorptionCoefficient: "material_AbsorptionCoefficient",
      maximumSurfaceOpticalDistance: "material_MaximumSurfaceOpticalDistance",
      reflectionSource: "material_ReflectionSource",
      reflectionCubeTexture: "material_ReflectionCubeTexture",
      planarReflectionTexture: "material_PlanarReflectionTexture",
      planarReflectionViewProjection: "material_PlanarReflectionVP",
      planarReflectionSampling: "material_PlanarReflectionSampling"
    });
    expect(WaterOpticsDebugView.Final).toBe(0);
    expect(WaterOpticsDebugView.ReflectionSource).toBe(16);
    expect(WaterOpticsDebugView.RefractionGates).toBe(20);
    expect(WaterOpticsDebugView.ReflectionColor).toBe(21);
    expect(WaterOpticsDebugView.NormalDotView).toBe(22);
    expect([
      WaterOpticsDebugView.DetailNormal,
      WaterOpticsDebugView.SceneDepthDelta,
      WaterOpticsDebugView.DepthTint,
      WaterOpticsDebugView.ContactFoam,
      WaterOpticsDebugView.CoastalAlpha,
      WaterOpticsDebugView.DirectSpecular,
      WaterOpticsDebugView.EffectiveRoughness
    ]).toEqual([23, 24, 25, 26, 27, 28, 29]);
    expect(WATER_OPTICS_REFLECTION_SOURCE_VALUE).toEqual({ sky: 0, probe: 1, planar: 2 });
  });

  it("accepts every appended Surface Appearance debug view and rejects values beyond the frozen ABI", () => {
    const { shaderData, setFloat } = createShaderDataMock();
    const state = createWaterSurfaceOpticsBindingState();
    const binding = createPlanarBinding("high");

    for (const debugView of [
      WaterOpticsDebugView.DetailNormal,
      WaterOpticsDebugView.SceneDepthDelta,
      WaterOpticsDebugView.DepthTint,
      WaterOpticsDebugView.ContactFoam,
      WaterOpticsDebugView.CoastalAlpha,
      WaterOpticsDebugView.DirectSpecular,
      WaterOpticsDebugView.EffectiveRoughness
    ]) {
      setFloat.mockClear();
      expect(
        applyWaterSurfaceOpticsBinding(shaderData, state, {
          ...binding,
          debugView
        }).debugView
      ).toBe(debugView);
      expect(setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.debugMode, debugView);
    }
    expect(
      applyWaterSurfaceOpticsBinding(shaderData, state, {
        ...binding,
        debugView: WaterOpticsDebugView.EffectiveRoughness + 1
      }).debugView
    ).toBe(WaterOpticsDebugView.Final);
  });

  it.each([
    ["medium", "medium", 1],
    ["high", "high", 5],
    ["experimental", "high", 5]
  ] as const)("resolves %s through %s with %i planar taps", (requestedTier, resolvedTier, sampleCount) => {
    const { shaderData, setFloat } = createShaderDataMock();
    const readback = applyWaterSurfaceOpticsBinding(
      shaderData,
      createWaterSurfaceOpticsBindingState(),
      createPlanarBinding(requestedTier)
    );

    expect(readback).toMatchObject({
      requestedTier,
      resolvedTier,
      tierFallbackReason: requestedTier === "experimental" ? "water-optics-experimental-resolved-high" : undefined,
      effectiveSource: "planar",
      textureWidth: 321,
      textureHeight: 181,
      filterSampleCount: sampleCount
    });
    expect(setFloat).toHaveBeenCalledWith(
      WATER_OPTICS_SHADER_PROPERTY.reflectionSource,
      WATER_OPTICS_REFLECTION_SOURCE_VALUE.planar
    );
  });

  it("sanitizes one profile contract before writing Beer-Lambert and Fresnel inputs", () => {
    const { shaderData, setFloat, setVector3 } = createShaderDataMock();
    const state = createWaterSurfaceOpticsBindingState();
    const readback = applyWaterSurfaceOpticsBinding(shaderData, state, {
      tier: "high",
      opticalProfile: {
        absorptionCoefficient: [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
        scatteringColor: [Number.NaN, -2, Number.POSITIVE_INFINITY],
        scatteringCoefficient: Number.POSITIVE_INFINITY,
        maximumViewDistance: Number.NaN,
        maximumSurfaceOpticalDistance: Number.POSITIVE_INFINITY,
        indexOfRefraction: Number.NEGATIVE_INFINITY,
        refractionStrength: Number.POSITIVE_INFINITY,
        roughness: 4,
        reflectionIntensity: -1
      },
      refractionEnabled: false,
      reflection: undefined,
      debugView: Number.NaN
    });

    expect(readback.opticalProfile).toMatchObject({
      absorptionCoefficient: [0.21, 0, 1_000_000],
      scatteringColor: [0.06, 0, 65_504],
      scatteringCoefficient: 1_000_000,
      maximumViewDistance: 36,
      maximumSurfaceOpticalDistance: 1_000_000,
      indexOfRefraction: 1,
      fresnelF0: 0,
      refractionStrength: 4,
      roughness: 1,
      reflectionIntensity: 0
    });
    expect(readback.refractionEnabled).toBe(false);
    expect(readback.debugView).toBe(WaterOpticsDebugView.Final);
    expect(state.opticalAbsorption).toMatchObject({ x: 0.21, y: 0, z: 1_000_000 });
    expect(setVector3).toHaveBeenCalledWith(
      WATER_OPTICS_SHADER_PROPERTY.absorptionCoefficient,
      state.opticalAbsorption
    );
    expect(setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.maximumViewDistance, 36);
    expect(setFloat).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.refractionEnabled, 0);
  });

  it("clears stale resources and reapplies a reused mutable binding reference", () => {
    const { shaderData, setMatrix, setTexture } = createShaderDataMock();
    const state = createWaterSurfaceOpticsBindingState();
    const planarTexture = { width: 320, height: 180 } as Texture2D;
    const probeTexture = {} as TextureCube;
    const planarViewProjection = new Matrix();
    const reflection: {
      requestedSource: WaterReflectionSource;
      resolvedSource: WaterReflectionSource;
      probeTexture?: TextureCube;
      planarTexture?: Texture2D;
      planarViewProjection?: Readonly<Matrix>;
    } = {
      requestedSource: "planar",
      resolvedSource: "planar",
      planarTexture,
      planarViewProjection
    };
    const binding: WaterSurfaceOpticsBinding = {
      tier: "high",
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: true,
      reflection,
      debugView: WaterOpticsDebugView.Final
    };

    const first = applyWaterSurfaceOpticsBinding(shaderData, state, binding);
    const firstEffectiveSource = first.effectiveSource;
    reflection.requestedSource = "probe";
    reflection.resolvedSource = "probe";
    reflection.probeTexture = probeTexture;
    reflection.planarTexture = undefined;
    reflection.planarViewProjection = undefined;
    const second = applyWaterSurfaceOpticsBinding(shaderData, state, binding);

    expect(firstEffectiveSource).toBe("planar");
    expect(first).toBe(second);
    expect(second.effectiveSource).toBe("probe");
    expect(setTexture).toHaveBeenCalledTimes(4);
    expect(setTexture).toHaveBeenNthCalledWith(3, WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture, probeTexture);
    expect(setTexture).toHaveBeenNthCalledWith(4, WATER_OPTICS_SHADER_PROPERTY.planarReflectionTexture, null);
    expect(setMatrix).toHaveBeenLastCalledWith(
      WATER_OPTICS_SHADER_PROPERTY.planarReflectionViewProjection,
      state.reflectionIdentityViewProjection
    );
  });

  it("reuses profile, reflection, aggregate, and nested RGB identities across 300 applies", () => {
    const { shaderData } = createShaderDataMock();
    const state = createWaterSurfaceOpticsBindingState();
    const mutableProfile = {
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      absorptionCoefficient: [0.21, 0.085, 0.04] as [number, number, number],
      scatteringColor: [0.06, 0.28, 0.32] as [number, number, number]
    };
    const binding: WaterSurfaceOpticsBinding = {
      tier: "high",
      opticalProfile: mutableProfile,
      refractionEnabled: true,
      reflection: {
        requestedSource: "planar",
        resolvedSource: "planar",
        planarTexture: { width: 320, height: 180 } as Texture2D,
        planarViewProjection: new Matrix()
      },
      reflectionSampling: { highFilterSampleCount: 5 },
      debugView: WaterOpticsDebugView.Final
    };
    const profileReadback = applyWaterSurfaceOpticalProfile(shaderData, state, mutableProfile);
    const absorptionReadback = profileReadback.absorptionCoefficient;
    const scatteringReadback = profileReadback.scatteringColor;
    const reflectionReadback = applyWaterSurfaceReflectionBinding(
      shaderData,
      state,
      binding.tier,
      binding.reflection,
      binding.reflectionSampling
    );
    const aggregateReadback = applyWaterSurfaceOpticsBinding(shaderData, state, binding);

    for (let index = 0; index < 300; index++) {
      mutableProfile.absorptionCoefficient[0] = 0.1 + index / 10_000;
      expect(applyWaterSurfaceOpticalProfile(shaderData, state, mutableProfile)).toBe(profileReadback);
      expect(applyWaterSurfaceReflectionBinding(shaderData, state, binding.tier, binding.reflection)).toBe(
        reflectionReadback
      );
      expect(applyWaterSurfaceOpticsBinding(shaderData, state, binding)).toBe(aggregateReadback);
      expect(aggregateReadback.opticalProfile).toBe(profileReadback);
      expect(aggregateReadback.opticalProfile.absorptionCoefficient).toBe(absorptionReadback);
      expect(aggregateReadback.opticalProfile.scatteringColor).toBe(scatteringReadback);
    }
    expect(aggregateReadback.opticalProfile.absorptionCoefficient[0]).toBeCloseTo(0.1299, 10);
  });

  it("shares identical invalid-profile sanitize facts with the CPU reference", () => {
    const { shaderData } = createShaderDataMock();
    const invalidProfile = {
      absorptionCoefficient: [Number.NaN, Number.NEGATIVE_INFINITY, 0.4] as const,
      scatteringColor: [Number.NaN, 0.3, Number.POSITIVE_INFINITY] as const,
      scatteringCoefficient: Number.NaN,
      maximumViewDistance: Number.NaN,
      maximumSurfaceOpticalDistance: 2,
      indexOfRefraction: Number.NaN,
      refractionStrength: Number.NaN,
      roughness: Number.NaN,
      reflectionIntensity: Number.NaN
    };
    const gpu = applyWaterSurfaceOpticalProfile(shaderData, createWaterSurfaceOpticsBindingState(), invalidProfile);
    const cpu = createWaterSurfaceOpticsResult();
    evaluateWaterSurfaceOptics(invalidProfile, 2, 1, { red: 1, green: 1, blue: 1 }, { red: 0, green: 0, blue: 0 }, cpu);

    expect(cpu.fresnelF0).toBe(gpu.fresnelF0);
    expect(cpu.refractionStrength).toBe(gpu.refractionStrength);
    expect(cpu.roughness).toBe(gpu.roughness);
    expect(cpu.reflectionIntensity).toBe(gpu.reflectionIntensity);
    expect(cpu.transmittance.red).toBeCloseTo(Math.exp(-gpu.absorptionCoefficient[0] * 2), 12);
    expect(cpu.transmittance.green).toBeCloseTo(Math.exp(-gpu.absorptionCoefficient[1] * 2), 12);
    const scatteringWeight = 1 - Math.exp(-gpu.scatteringCoefficient * 2);
    expect(cpu.scattering.red).toBeCloseTo(gpu.scatteringColor[0] * scatteringWeight, 12);
    expect(cpu.scattering.blue).toBeCloseTo(gpu.scatteringColor[2] * scatteringWeight, 12);
  });

  it("fails closed to Sky when a resolved reflection resource is incomplete", () => {
    const { shaderData, setMatrix, setTexture } = createShaderDataMock();
    const state = createWaterSurfaceOpticsBindingState();
    const readback = applyWaterSurfaceOpticsBinding(shaderData, state, {
      tier: "medium",
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: true,
      reflection: {
        requestedSource: "planar",
        resolvedSource: "planar",
        planarTexture: { width: 320, height: 180 } as Texture2D
      },
      debugView: WaterOpticsDebugView.ClipSide
    });

    expect(readback).toMatchObject({
      effectiveSource: "sky",
      fallbackReason: "water-optics-planar-view-projection-unavailable",
      textureWidth: 0,
      textureHeight: 0,
      filterSampleCount: 1
    });
    expect(setTexture).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture, null);
    expect(setTexture).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.planarReflectionTexture, null);
    expect(setMatrix).toHaveBeenCalledWith(
      WATER_OPTICS_SHADER_PROPERTY.planarReflectionViewProjection,
      state.reflectionIdentityViewProjection
    );
  });
});
