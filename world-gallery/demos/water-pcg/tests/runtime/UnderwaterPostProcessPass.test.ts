import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";
import {
  createResolvedWaterOpticalProfileFingerprint,
  UNDERWATER_POST_PROCESS_SHADER_SOURCE
} from "../../runtime/optics/UnderwaterPostProcessPass";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";
import { resolveWaterSurfaceOpticalProfile } from "../../runtime/optics/WaterSurfaceOpticsBinding";

interface GlesShaderPrecompiler {
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

describe("UnderwaterPostProcessPass shader", () => {
  it("precompiles for the current WebGL2 runtime", () => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    expect(() =>
      compiler._precompile(UNDERWATER_POST_PROCESS_SHADER_SOURCE, ShaderLanguage.GLSLES300, "")
    ).not.toThrow();
  });

  it("uses scene colour, linear depth, and Beer-Lambert attenuation without an opaque copy", () => {
    expect(UNDERWATER_POST_PROCESS_SHADER_SOURCE).toContain("renderer_BlitTexture");
    expect(UNDERWATER_POST_PROCESS_SHADER_SOURCE).toContain("camera_DepthTexture");
    expect(UNDERWATER_POST_PROCESS_SHADER_SOURCE).toContain("eyeDepthFromBuffer");
    expect(UNDERWATER_POST_PROCESS_SHADER_SOURCE).toContain("transmittance = exp(");
    expect(UNDERWATER_POST_PROCESS_SHADER_SOURCE).toContain("scatteringWeight");
    expect(UNDERWATER_POST_PROCESS_SHADER_SOURCE).not.toContain("camera_OpaqueTexture");
  });

  it("creates one deterministic fingerprint from the sanitized shader profile values", () => {
    const resolved = resolveWaterSurfaceOpticalProfile(DEFAULT_WATER_OPTICAL_PROFILE);
    const fingerprint = createResolvedWaterOpticalProfileFingerprint(resolved);

    expect(fingerprint).toBe(createResolvedWaterOpticalProfileFingerprint(resolved));
    expect(JSON.parse(fingerprint)).toEqual([
      ...resolved.absorptionCoefficient,
      ...resolved.scatteringColor,
      resolved.scatteringCoefficient,
      resolved.maximumViewDistance,
      resolved.indexOfRefraction,
      resolved.fresnelF0,
      resolved.maximumSurfaceOpticalDistance,
      resolved.refractionStrength,
      resolved.roughness,
      resolved.reflectionIntensity
    ]);
  });
});
