import { describe, expect, it } from "vitest";
import { WATER_WAVE_SHADER_PROPERTY } from "../../runtime/wave/constants/WaterWaveShaderConstants";
import { WaterWaveShaderVariant } from "../../runtime/wave/enums/WaterWaveShaderVariant";
import { createWaterWaveShaderSource } from "../../runtime/wave/WaterWaveMaterialFactory";

describe("WaterWaveMaterialFactory fixed shaders", () => {
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

  it("uses analytic macro normals, fixed-time override, Fresnel, and no scene textures or render targets", () => {
    const source = createWaterWaveShaderSource(WaterWaveShaderVariant.High);

    expect(source).toContain("normalize(cross(derivativeZ, derivativeX))");
    expect(source).toContain("material_SurfaceTimeOverride >= 0.0");
    expect(source).toContain("float fresnel = pow(");
    expect(source).toContain("float specular = pow(");
    expect(source).not.toContain("camera_DepthTexture");
    expect(source).not.toContain("camera_OpaqueTexture");
    expect(source).not.toContain("sampler2D");
    expect(source).not.toContain("RenderTarget");
  });
});
