import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";
import {
  WATER_SURFACE_BRDF_EPSILON,
  WATER_SURFACE_BRDF_MINIMUM_PERCEPTUAL_ROUGHNESS,
  WATER_SURFACE_BRDF_PI,
  WATER_SURFACE_BRDF_RECIPROCAL_PI,
  createWaterSurfaceBrdfShaderFunctions
} from "../../runtime/surface/WaterSurfaceBrdfShader";
import { WaterWaveShaderVariant } from "../../runtime/wave/enums/WaterWaveShaderVariant";
import { createWaterWaveShaderSource } from "../../runtime/wave/WaterWaveMaterialFactory";
import { evaluateWaterSurfaceDirectBrdf } from "../../runtime/wave/WaterSurfaceBrdf";

interface GlesShaderPrecompiler {
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

interface BrdfReferenceInput {
  readonly fresnelF0: number;
  readonly roughness: number;
  readonly normalDotView: number;
  readonly normalDotLight: number;
  readonly normalDotHalf: number;
  readonly lightDotHalf: number;
}

function createBrdfTestShader(): string {
  return `
Shader "AIWorld/WaterSurfaceBrdfTest" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes {
        vec4 POSITION;
      };

      struct Varyings {
        vec4 values;
      };

      Varyings vert(Attributes attributes) {
        Varyings output;
        gl_Position = vec4(attributes.POSITION.xy, 0.0, 1.0);
        output.values = attributes.POSITION;
        return output;
      }

${createWaterSurfaceBrdfShaderFunctions()}

      void frag(Varyings input) {
        float directSpecular = waterSurfaceDirectSpecular(
          0.02,
          input.values.x,
          input.values.y,
          input.values.z,
          input.values.w,
          0.98
        );
        gl_FragColor = vec4(vec3(directSpecular), 1.0);
      }
    }
  }
}`;
}

function createFrozenWaveShaderBundle(): string {
  return [
    WaterWaveShaderVariant.None,
    WaterWaveShaderVariant.Low,
    WaterWaveShaderVariant.Medium,
    WaterWaveShaderVariant.High
  ]
    .flatMap((variant) => [
      `${variant}:default\n${createWaterWaveShaderSource(variant)}`,
      `${variant}:medium\n${createWaterWaveShaderSource(variant, "medium")}`,
      `${variant}:high\n${createWaterWaveShaderSource(variant, "high")}`
    ])
    .join("\n--WATER-WAVE-SHADER--\n");
}

function shaderContractReference(input: Readonly<BrdfReferenceInput>): number {
  const saturate = (value: number): number => Math.min(1, Math.max(0, value));
  const roughness = Math.max(WATER_SURFACE_BRDF_MINIMUM_PERCEPTUAL_ROUGHNESS, saturate(input.roughness));
  const alpha = roughness * roughness;
  const alphaSquared = alpha * alpha;
  const dotNV = saturate(input.normalDotView);
  const dotNL = saturate(input.normalDotLight);
  const dotNH = saturate(input.normalDotHalf);
  const dotLH = saturate(input.lightDotHalf);
  const f0 = saturate(input.fresnelF0);
  const fresnel = f0 + (1 - f0) * Math.pow(1 - dotLH, 5);
  const denominator = dotNH * dotNH * (alphaSquared - 1) + 1;
  const distribution =
    (WATER_SURFACE_BRDF_RECIPROCAL_PI * alphaSquared) / Math.max(denominator * denominator, WATER_SURFACE_BRDF_EPSILON);
  const gv = dotNL * Math.sqrt(alphaSquared + (1 - alphaSquared) * dotNV * dotNV);
  const gl = dotNV * Math.sqrt(alphaSquared + (1 - alphaSquared) * dotNL * dotNL);
  const visibility = 0.5 / Math.max(gv + gl, WATER_SURFACE_BRDF_EPSILON);
  return fresnel * distribution * visibility * dotNL * WATER_SURFACE_BRDF_PI;
}

describe("WaterSurfaceBrdfShader", () => {
  it("keeps the generated Wave shaders and CPU BRDF source byte-for-byte frozen", () => {
    const waveSource = createFrozenWaveShaderBundle();
    const cpuSource = readFileSync(new URL("../../runtime/wave/WaterSurfaceBrdf.ts", import.meta.url));

    expect(createHash("sha256").update(waveSource).digest("hex")).toBe(
      "1e375aae36b0c8dcb72158880507e6ce21ebcc0fb714c30bf71ffeb56524e347"
    );
    expect(createHash("sha256").update(cpuSource).digest("hex")).toBe(
      "9e3148631e31fb9714d825a9e7a85710123caf8068b675e35de9333a58e8753d"
    );
  });

  it.each([ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300])(
    "precompiles the helper module for shader language %s",
    (language) => {
      const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
      expect(() => compiler._precompile(createBrdfTestShader(), language, "")).not.toThrow();
    }
  );

  it("freezes the Wave and CPU BRDF constants and formulas in generated source", () => {
    const source = createWaterSurfaceBrdfShaderFunctions();

    expect(WATER_SURFACE_BRDF_MINIMUM_PERCEPTUAL_ROUGHNESS).toBe(0.045);
    expect(WATER_SURFACE_BRDF_EPSILON).toBe(0.000001);
    expect(WATER_SURFACE_BRDF_RECIPROCAL_PI).toBe(1 / Math.PI);
    expect(WATER_SURFACE_BRDF_PI).toBe(Math.PI);
    expect(source).toContain("pow(1.0 - clamp(dotLH, 0.0, 1.0), 5.0)");
    expect(source).toContain("WATER_SURFACE_BRDF_RECIPROCAL_PI * alphaSquared");
    expect(source).toContain("return 0.5 / max(gv + gl, WATER_SURFACE_BRDF_EPSILON)");
    expect(source).toContain("* boundedDotNL\n    * WATER_SURFACE_BRDF_PI");
  });

  it.each([
    [0.02, 0, 0.97, 0.91, 0.96, 0.98],
    [0.04, 0.32, 0.65, 0.72, 0.88, 0.81],
    [0.08, 0.78, 0.21, 0.4, 0.63, 0.55]
  ])(
    "maps representative vector %# to the CPU water BRDF oracle",
    (fresnelF0, roughness, normalDotView, normalDotLight, normalDotHalf, lightDotHalf) => {
      const input = {
        fresnelF0,
        roughness,
        normalDotView,
        normalDotLight,
        normalDotHalf,
        lightDotHalf
      };

      expect(shaderContractReference(input)).toBeCloseTo(evaluateWaterSurfaceDirectBrdf(input).directSpecular, 12);
    }
  );

  it("contains no scene-light binding, hard-coded light direction, or shadow contract", () => {
    const source = createWaterSurfaceBrdfShaderFunctions();

    expect(source).not.toMatch(/scene_Sunlight(?:Direction|Color)/);
    expect(source).not.toMatch(/\b(?:lightDirection|shadow|attenuation)\b/i);
    expect(source).not.toMatch(/vec3\s*\(\s*-?0\.\d+\s*,\s*-?0\.\d+\s*,\s*-?0\.\d+\s*\)/);
  });
});
