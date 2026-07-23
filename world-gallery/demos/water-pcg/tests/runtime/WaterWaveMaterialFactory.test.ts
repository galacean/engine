import type { Material, ShaderData, Texture2D } from "@galacean/engine-core";
import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { Matrix } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";
import { createWaterSurfaceOpticsBindingState } from "../../runtime/optics/WaterSurfaceOpticsBinding";
import { WaterOpticsDebugView } from "../../runtime/optics/WaterSurfaceOpticsTypes";
import {
  WATER_WAVE_SHADER_PROPERTY,
  WATER_WAVE_SHADER_TUNING
} from "../../runtime/wave/constants/WaterWaveShaderConstants";
import { WaterWaveShaderVariant } from "../../runtime/wave/enums/WaterWaveShaderVariant";
import {
  createWaterWaveShaderSource,
  setWaterWaveSurfaceOpticsBinding
} from "../../runtime/wave/WaterWaveMaterialFactory";
import type { WaterWaveMaterialState } from "../../runtime/wave/WaterWaveRuntimeTypes";

interface GlesShaderPrecompiler {
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

function createBindingHarness(): {
  readonly state: WaterWaveMaterialState;
  readonly shaderData: ShaderData;
  readonly setFloat: ReturnType<typeof vi.fn>;
  readonly setVector3: ReturnType<typeof vi.fn>;
  readonly setTexture: ReturnType<typeof vi.fn>;
  readonly setMatrix: ReturnType<typeof vi.fn>;
} {
  const setFloat = vi.fn();
  const setVector3 = vi.fn();
  const setTexture = vi.fn();
  const setMatrix = vi.fn();
  const shaderData = {
    setFloat,
    setVector3,
    setVector4: vi.fn(),
    setTexture,
    setMatrix
  } as unknown as ShaderData;
  return {
    state: {
      material: { shaderData } as unknown as Material,
      variant: WaterWaveShaderVariant.High,
      opticsTier: "high",
      waveSet: {} as CompiledWaterWaveSet,
      opticsBindingState: createWaterSurfaceOpticsBindingState()
    },
    shaderData,
    setFloat,
    setVector3,
    setTexture,
    setMatrix
  };
}

describe("WaterWaveMaterialFactory fixed shaders", () => {
  it.each([
    ["None", WaterWaveShaderVariant.None],
    ["Low", WaterWaveShaderVariant.Low],
    ["Medium", WaterWaveShaderVariant.Medium],
    ["High", WaterWaveShaderVariant.High]
  ])("precompiles the %s variant to GLES100", (_label, variant) => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    const source = createWaterWaveShaderSource(variant);
    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES100, "")).not.toThrow();
  });

  it("creates only the None, 2, 6, and 12 fixed unrolled variants", () => {
    const expectedCounts: Readonly<Record<WaterWaveShaderVariant, number>> = {
      [WaterWaveShaderVariant.None]: 0,
      [WaterWaveShaderVariant.Low]: 2,
      [WaterWaveShaderVariant.Medium]: 6,
      [WaterWaveShaderVariant.High]: 12
    };
    for (const value of Object.values(WaterWaveShaderVariant).filter(
      (entry): entry is WaterWaveShaderVariant => typeof entry === "number"
    )) {
      const source = createWaterWaveShaderSource(value);
      const calls = source.match(/applyGerstnerWave\(\s*material_WaveA/g) ?? [];
      expect(calls).toHaveLength(expectedCounts[value]);
      expect(source).not.toMatch(/for\s*\(/);
    }
  });

  it("consumes two vec4 uniforms per wave with the compiler packed order", () => {
    const source = createWaterWaveShaderSource(WaterWaveShaderVariant.Medium);

    expect(source).toContain(`vec4 ${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}0;`);
    expect(source).toContain(`vec4 ${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}5;`);
    expect(source).toContain("waveA.w * dot(waveA.xy, restXZ)");
    expect(source).toContain("float wrappedTime = mod(elapsedTime, wavePeriod)");
    expect(source).toContain("angularRate * wrappedTime");
    expect(source).toContain("waveA.xy * waveB.y * cosine");
  });

  it("keeps world-space phase while selecting independent sky, probe, or planar reflection", () => {
    const source = createWaterWaveShaderSource(WaterWaveShaderVariant.High);

    expect(source).toContain("normalize(cross(derivativeZ, derivativeX))");
    expect(source).toContain("material_SurfaceTimeOverride >= 0.0");
    expect(source).toContain("vec4 displacedPosition = renderer_ModelMat * attr.POSITION");
    expect(source).toContain("vec2 restXZ = displacedPosition.xz");
    expect(source).toContain("output.worldPosition = displacedPosition.xyz");
    expect(source).toContain("output.worldNormal = surfaceNormal");
    expect(source).toContain("gl_Position = camera_VPMat * displacedPosition");
    expect(source).toContain("float fresnelF0 = fresnelRatio * fresnelRatio");
    expect(source).toContain("float fresnel = fresnelF0");
    expect(source).toContain("float specular = pow(");
    expect(source).toContain("samplerCube material_ReflectionCubeTexture");
    expect(source).toContain("sampler2D material_PlanarReflectionTexture");
    expect(source).toContain("material_ReflectionSource > 1.5");
    expect(source).toContain("material_ReflectionIntensity * material_ReflectionIntensityMultiplier");
    expect(source).toContain("vec3 centeredSurfaceBackground = texture2D(camera_OpaqueTexture, screenUv).rgb");
    expect(source).toContain("clamp(material_Alpha");
    expect(source).not.toContain("RenderTarget");
  });

  it("keeps Low/None free of scene textures and adds guarded precomposed refraction only to Medium/High", () => {
    for (const variant of [WaterWaveShaderVariant.None, WaterWaveShaderVariant.Low]) {
      const source = createWaterWaveShaderSource(variant);
      expect(source).not.toContain("camera_DepthTexture");
      expect(source).not.toContain("camera_OpaqueTexture");
      expect(source).toContain("Enabled = true");
    }
    for (const variant of [WaterWaveShaderVariant.Medium, WaterWaveShaderVariant.High]) {
      const source = createWaterWaveShaderSource(variant);
      expect(source).toContain("sampler2D camera_DepthTexture");
      expect(source).toContain("sampler2D camera_OpaqueTexture");
      expect(source).toContain("vec4 clipPosition");
      expect(source).toContain("float surfaceEyeDepth");
      expect(source).toContain("float opticalDistance = min(");
      expect(source).toContain("float refractionDepthContinuity = 1.0 - smoothstep(");
      expect(source).toContain("float refractedGeometryBehindSurface = smoothstep(");
      expect(source).toContain("mix(centeredOpaqueColor, displacedOpaqueColor, refractionSampleValidity)");
      expect(source).toContain("vec3 transmittance = exp(-absorption * opticalDistance)");
      expect(source).toContain("step(0.5, material_RefractionEnabled)");
      expect(source).toContain("Enabled = false");
      expect(source).toMatch(/gl_FragColor = vec4\(\s*waterColor,\s*1\.0/);
    }
  });

  it("compiles wave count and surface-optics tier independently", () => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    const lowWavesHighOptics = createWaterWaveShaderSource(WaterWaveShaderVariant.Low, "high");
    const mediumWavesHighOptics = createWaterWaveShaderSource(WaterWaveShaderVariant.Medium, "experimental");

    expect(() => compiler._precompile(lowWavesHighOptics, ShaderLanguage.GLSLES100, "")).not.toThrow();
    expect(() => compiler._precompile(mediumWavesHighOptics, ShaderLanguage.GLSLES100, "")).not.toThrow();
    expect(lowWavesHighOptics).toContain('Shader "AIWorld/WaterGerstner2OpticsHigh"');
    expect(mediumWavesHighOptics).toContain('Shader "AIWorld/WaterGerstner6OpticsHigh"');
    expect(lowWavesHighOptics.match(/applyGerstnerWave\(\s*material_WaveA/g) ?? []).toHaveLength(2);
    expect(lowWavesHighOptics).toContain("sampler2D camera_DepthTexture");
    expect(lowWavesHighOptics).toContain(WATER_WAVE_SHADER_TUNING.highRefractionUvScale.toFixed(8));
    expect(mediumWavesHighOptics.match(/applyGerstnerWave\(\s*material_WaveA/g) ?? []).toHaveLength(6);
    expect(mediumWavesHighOptics).toContain(WATER_WAVE_SHADER_TUNING.highRefractionUvScale.toFixed(8));
  });

  it("consumes shared Planar texture size, distortion, fades, roughness, and the opt-in five-tap filter", () => {
    const source = createWaterWaveShaderSource(WaterWaveShaderVariant.High);

    expect(source).toContain("material_PlanarReflectionTextureSize");
    expect(source).toContain("material_PlanarReflectionSampling");
    expect(source).toContain("material_PlanarReflectionFade");
    expect(source).toContain("material_PlanarReflectionRoughnessFootprint");
    expect(source).toContain("reflectionUv += normal.xz * material_PlanarReflectionSampling.x");
    expect(source).toContain("float planarValidity = step(minimumClipW, reflectionClip.w)");
    expect(source).toContain("material_PlanarReflectionSampling.w > 3.0");
    expect(source.match(/texture2D\(material_PlanarReflectionTexture/g) ?? []).toHaveLength(5);
    expect(source).toContain("clamp(material_Roughness, 0.0, 1.0)");
  });

  it("applies the shared optical profile and explicit refraction toggle", () => {
    const harness = createBindingHarness();
    const profile = {
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      absorptionCoefficient: [0.4, 0.2, 0.1] as const,
      indexOfRefraction: 1.5,
      maximumSurfaceOpticalDistance: 12,
      refractionStrength: 2.5,
      reflectionIntensity: 0.75
    };
    const readback = setWaterWaveSurfaceOpticsBinding(harness.state, {
      tier: "experimental",
      opticalProfile: profile,
      refractionEnabled: true,
      reflection: undefined,
      debugView: WaterOpticsDebugView.Final
    });

    expect(readback.requestedTier).toBe("experimental");
    expect(readback.resolvedTier).toBe("high");
    expect(readback.opticalProfile.fresnelF0).toBeCloseTo(0.04);
    expect(readback.opticalProfile.maximumSurfaceOpticalDistance).toBe(12);
    expect(harness.setVector3).toHaveBeenCalledWith(
      WATER_WAVE_SHADER_PROPERTY.absorptionCoefficient,
      harness.state.opticsBindingState.opticalAbsorption
    );
    expect(harness.setFloat).toHaveBeenCalledWith(WATER_WAVE_SHADER_PROPERTY.refractionStrength, 2.5);
    expect(harness.setFloat).toHaveBeenCalledWith(WATER_WAVE_SHADER_PROPERTY.refractionEnabled, 1);

    setWaterWaveSurfaceOpticsBinding(harness.state, {
      tier: "high",
      opticalProfile: profile,
      refractionEnabled: false,
      reflection: undefined,
      debugView: WaterOpticsDebugView.Final
    });
    expect(harness.setFloat).toHaveBeenLastCalledWith(
      "material_PlanarReflectionRoughnessFootprint",
      expect.any(Number)
    );
    expect(harness.setFloat).toHaveBeenCalledWith(WATER_WAVE_SHADER_PROPERTY.refractionEnabled, 0);
  });

  it("fails closed when requested refraction tier does not match the compiled optics path", () => {
    const harness = createBindingHarness();

    expect(() =>
      setWaterWaveSurfaceOpticsBinding(harness.state, {
        tier: "medium",
        opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
        refractionEnabled: true,
        reflection: undefined,
        debugView: WaterOpticsDebugView.Final
      })
    ).toThrow(/compiled high/);
  });

  it("clears stale Probe/Planar resources and restores identity VP on every shared binding apply", () => {
    const harness = createBindingHarness();
    const planarTexture = { width: 320, height: 180 } as unknown as Texture2D;
    const planarViewProjection = new Matrix();
    setWaterWaveSurfaceOpticsBinding(harness.state, {
      tier: "high",
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: true,
      reflection: {
        requestedSource: "planar",
        resolvedSource: "planar",
        planarTexture,
        planarViewProjection
      },
      debugView: WaterOpticsDebugView.Final
    });
    expect(harness.setTexture).toHaveBeenCalledWith(WATER_WAVE_SHADER_PROPERTY.planarReflectionTexture, planarTexture);
    expect(harness.setMatrix).toHaveBeenCalledWith(
      WATER_WAVE_SHADER_PROPERTY.planarReflectionViewProjection,
      planarViewProjection
    );

    const cleared = setWaterWaveSurfaceOpticsBinding(harness.state, {
      tier: "medium",
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: false,
      reflection: undefined,
      debugView: WaterOpticsDebugView.Final
    });
    expect(cleared.effectiveSource).toBe("sky");
    expect(harness.setTexture).toHaveBeenLastCalledWith(WATER_WAVE_SHADER_PROPERTY.planarReflectionTexture, null);
    expect(harness.setTexture).toHaveBeenCalledWith(WATER_WAVE_SHADER_PROPERTY.reflectionCubeTexture, null);
    expect(harness.setMatrix).toHaveBeenLastCalledWith(
      WATER_WAVE_SHADER_PROPERTY.planarReflectionViewProjection,
      harness.state.opticsBindingState.reflectionIdentityViewProjection
    );
  });
});
