import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";
import {
  createWaterContactFoamShaderFunctions,
  createWaterContactFoamShaderFunctionsForQuality
} from "../../runtime/surface/WaterContactFoamShader";

interface GlesShaderPrecompiler {
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

function createFoamTestShader(octaveCount: 1 | 2 | 3): string {
  return `
Shader "AIWorld/WaterContactFoamTest${octaveCount}" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes {
        vec4 POSITION_UV;
      };

      struct Varyings {
        vec2 worldPositionXz;
      };

      Varyings vert(Attributes attributes) {
        Varyings output;
        gl_Position = vec4(attributes.POSITION_UV.xy, 0.0, 1.0);
        output.worldPositionXz = attributes.POSITION_UV.zw;
        return output;
      }

${createWaterContactFoamShaderFunctions(octaveCount)}

      void frag(Varyings input) {
        float mask = evaluateWaterContactFoamMask(
          input.worldPositionXz,
          12.5,
          0.05,
          1.0,
          2.5,
          1.0,
          0.453,
          0.1791,
          vec3(0.5, 0.25, 0.125),
          2.0
        );
        gl_FragColor = vec4(vec3(mask), 1.0);
      }
    }
  }
}`;
}

describe("WaterContactFoamShader", () => {
  it.each([
    ["one octave", 1],
    ["two octaves", 2],
    ["three octaves", 3]
  ] as const)("precompiles the %s module for GLES100 and GLES300", (_label, octaveCount) => {
    const compiler = new ShaderCompiler() as unknown as GlesShaderPrecompiler;
    const source = createFoamTestShader(octaveCount);

    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES100, "")).not.toThrow();
    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES300, "")).not.toThrow();
  });

  it("uses a polynomial hash and an unrolled 3x3 squared-distance F1 search", () => {
    const source = createWaterContactFoamShaderFunctions(3);

    expect(source).toContain("(value * 34.0 + 1.0) * value");
    expect(source).toContain("WATER_CONTACT_FOAM_HASH_MODULUS = 289.0");
    expect(source.match(/waterContactFoamCandidateSquared\(cell,/g) ?? []).toHaveLength(9);
    expect(source).not.toMatch(/\bsin\s*\(/);
    expect(source).not.toMatch(/\bsqrt\s*\(/);
    expect(source).not.toMatch(/\bfor\s*\(/);
  });

  it("emits exactly one, two, or three active normalized octave calls", () => {
    for (const octaveCount of [1, 2, 3] as const) {
      const source = createWaterContactFoamShaderFunctions(octaveCount);
      expect(source.match(/weightedPattern \+= waterContactFoamVoronoiPattern\(/g) ?? []).toHaveLength(octaveCount);
      expect(source).toContain("weightedPattern / weightSum");
      expect(source).toContain("octaveWeights.x");
      if (octaveCount >= 2) expect(source).toContain("octaveWeights.y");
      if (octaveCount === 3) expect(source).toContain("octaveWeights.z");
    }
  });

  it("selects no Low module, two Medium octaves, and three High octaves", () => {
    expect(createWaterContactFoamShaderFunctionsForQuality("low")).toBeUndefined();
    expect(
      createWaterContactFoamShaderFunctionsForQuality("medium")?.match(
        /weightedPattern \+= waterContactFoamVoronoiPattern\(/g
      ) ?? []
    ).toHaveLength(2);
    expect(
      createWaterContactFoamShaderFunctionsForQuality("high")?.match(
        /weightedPattern \+= waterContactFoamVoronoiPattern\(/g
      ) ?? []
    ).toHaveLength(3);
  });

  it("uses bounded periodic time and the raw centered Scene Depth contact band", () => {
    const source = createWaterContactFoamShaderFunctions(3);

    expect(source).toContain("WATER_CONTACT_FOAM_PHASE_PERIOD = 289.0");
    expect(source).toContain("waterContactFoamPositiveMod(scaledTime");
    expect(source).toContain("rawSceneDepthDelta");
    expect(source).toContain("centeredDepthBehind");
    expect(source).toContain("rawSceneDepthDelta >= contactDistance");
    expect(source).toContain("depthMask * voronoi * opacity");
    expect(source).not.toContain("opticalDepth");
  });
});
