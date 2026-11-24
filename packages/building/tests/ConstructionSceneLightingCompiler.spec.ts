import { describe, expect, it } from "vitest";
import { ShaderFactory, ShaderLanguage } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import {
  constructionLightingBridgeSource,
  constructionLightingHelpers,
  registerConstructionSceneLighting
} from "../src/building/runtime/ConstructionSceneLighting";
import { constructionPlasterFinishGLSL, constructionPlasterGLSL } from "../src/building/runtime/ConstructionPlasterShader";

describe("Construction lighting compiler bridge", () => {
  it("retains lighting helpers without the compiler's fragment entry or output", () => {
    registerConstructionSceneLighting();
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(ShaderFactory.includeMap);
    const pass = compiler._parseShaderSource(constructionLightingBridgeSource).subShaders[0].passes[0];
    const compiled = compiler._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES300,
      undefined,
      pass.contentScopeStarts
    )!;
    const instructions = compiled.fragmentShaderInstructions!;
    const helpers = constructionLightingHelpers(instructions);
    expect(helpers.length).toBe(instructions.length);
    const source = ShaderMacroProcessor.evaluate(
      helpers,
      new Map([
        ["GRAPHICS_API_WEBGL2", ""],
        ["SCENE_DIRECT_LIGHT_COUNT", "1"],
        ["SCENE_USE_SH", ""]
      ])
    );
    expect(source).toContain("masonryResidentSceneLight");
    expect(source).toContain("masonrySceneFog");
    expect(source).not.toMatch(/\b(?:masonryBridge\w+|BridgeFragment|main)\b/);
    expect(source).not.toMatch(/\bout\s+vec4\s+\w+\s*;/);
  });

  it("compiles matte fast-path, single-cascade shadow, and SSR-free specular IBL under full Seed World macros", () => {
    registerConstructionSceneLighting();
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(ShaderFactory.includeMap);
    const pass = compiler._parseShaderSource(constructionLightingBridgeSource).subShaders[0].passes[0];
    const compiled = compiler._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES300,
      undefined,
      pass.contentScopeStarts
    )!;
    const helpers = constructionLightingHelpers(compiled.fragmentShaderInstructions!);
    const source = ShaderMacroProcessor.evaluate(
      helpers,
      new Map([
        ["GRAPHICS_API_WEBGL2", ""],
        ["SCENE_DIRECT_LIGHT_COUNT", "1"],
        ["SCENE_POINT_LIGHT_COUNT", "2"],
        ["SCENE_SPOT_LIGHT_COUNT", "1"],
        ["SCENE_SHADOW_TYPE", "2"],
        ["RENDERER_IS_RECEIVE_SHADOWS", ""],
        ["SCENE_SHADOW_CASCADED_COUNT", "2"],
        ["SCENE_USE_SH", ""],
        ["SCENE_USE_SPECULAR_ENV", ""],
        ["CAMERA_ENABLE_SSR", ""],
        ["SCENE_VOLUMETRIC_CLOUD_SHADOW", ""],
        ["SCENE_FOG_MODE", "3"]
      ])
    );
    expect(source).toContain("masonrySampleShadow");
    expect(source).toContain("masonrySurfaceShading");
    expect(source).toMatch(/bool\s+glossy\s*=\s*roughness\s*<\s*0\.72/);
    expect(source).not.toContain("masonryMatteDirectRadiance");
    expect(source).not.toMatch(/\binitBSDFData\s*\(/);
    expect(source).not.toMatch(/\bgetAARoughnessFactor\s*\(/);
    expect(source).not.toMatch(/\bBRDF_Specular_GGX\s*\(/);
    expect(source).not.toMatch(/\bsurfaceShading\s*\(/);
    expect(source).not.toMatch(/\bevaluateIBL\s*\(/);
    expect(source).not.toMatch(/\bevaluateScreenSpaceReflectionWithDepth\s*\(/);
    expect(source).not.toMatch(/\bgetShadowCascadeBlend\s*\(/);
    expect(source).not.toMatch(/\bcamera_VPMat\b/);
    // Single shared masonryDirectRadiance loop set: 1 direct + 1 point + 1 spot + 1 fallback = 4 loops max
    // (0 duplicated matte loops -> avoids Apple M2 / mobile TBDR SIMD register-spill cliff).
    const loopCount = (source.match(/\bfor\s*\(/g) ?? []).length;
    expect(loopCount).toBe(4);
    expect(source.length).toBeLessThan(20_000);
    expect(source).not.toMatch(/\b(?:masonryBridge\w+|BridgeFragment|main)\b/);
    expect(source).not.toMatch(/\bout\s+vec4\s+\w+\s*;/);

    // Without spot lights (Seed World original runtime macro set): strictly 3 loops (exact pre-P0 count).
    const sourceNoSpot = ShaderMacroProcessor.evaluate(
      helpers,
      new Map([
        ["GRAPHICS_API_WEBGL2", ""],
        ["SCENE_DIRECT_LIGHT_COUNT", "1"],
        ["SCENE_POINT_LIGHT_COUNT", "2"],
        ["SCENE_SHADOW_TYPE", "2"],
        ["RENDERER_IS_RECEIVE_SHADOWS", ""],
        ["SCENE_SHADOW_CASCADED_COUNT", "2"],
        ["SCENE_USE_SH", ""],
        ["SCENE_USE_SPECULAR_ENV", ""],
        ["CAMERA_ENABLE_SSR", ""],
        ["SCENE_VOLUMETRIC_CLOUD_SHADOW", ""],
        ["SCENE_FOG_MODE", "3"]
      ])
    );
    expect((sourceNoSpot.match(/\bfor\s*\(/g) ?? []).length).toBe(3);
    expect(sourceNoSpot.length).toBeLessThan(18_000);
  });

  it("keeps plaster shader diet invariants (analytic rim gradient, early discard before textureGrad, 3/2 octaves)", () => {
    expect(constructionPlasterGLSL).toContain("if(edge<.1 || wear>=1.0) return vec3(0.0);");
    expect(constructionPlasterGLSL).toContain("plasterNativeNoise(uv*.5+.5+offset,3)");
    expect(constructionPlasterGLSL).toContain("plasterNativeNoise(uv+23.4+offset,2)");
    const finishCodeOnly = constructionPlasterFinishGLSL.replace(/\/\/[^\n]*/g, "");
    expect(finishCodeOnly).not.toContain("plasterSurface(");
    const earlyReturnIdx = finishCodeOnly.indexOf("if(detail.x<.5) return vec3(0.0);");
    const firstTexGradIdx = finishCodeOnly.indexOf("textureGrad(material_PlasterColors");
    expect(earlyReturnIdx).toBeGreaterThan(-1);
    expect(firstTexGradIdx).toBeGreaterThan(earlyReturnIdx);
  });
});
