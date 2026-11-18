import { describe, expect, it } from "vitest";
import { ShaderFactory, ShaderLanguage } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import { registerConstructionSceneLighting } from "../src/building/runtime/ConstructionSceneLighting";
import { constructionPlasterGLSL } from "../src/building/runtime/ConstructionPlasterShader";
import farProxyShaderSource from "../src/building/runtime/MasonryFarProxy.shader?raw";
import lodDither from "../src/building/runtime/MasonryLodDither.glsl?raw";

describe("Masonry/FarProxy shader packing contract", () => {
  it("compiles DepthOnly and Forward passes and unpacks compact vertex attributes", () => {
    registerConstructionSceneLighting();
    if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"]) {
      ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
    }
    if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"]) {
      ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
    }
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(ShaderFactory.includeMap);
    const parsed = compiler._parseShaderSource(farProxyShaderSource);
    const macros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_HAS_NORMAL", ""],
      ["RENDERER_ENABLE_VERTEXCOLOR", ""],
      ["RENDERER_HAS_UV", ""],
      ["RENDERER_HAS_TANGENT", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_USE_SH", ""]
    ]);

    const passes = parsed.subShaders[0].passes;
    expect(passes).toHaveLength(2);
    for (const pass of passes) {
      const compiled = compiler._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        ShaderLanguage.GLSLES300,
        undefined,
        pass.contentScopeStarts
      );
      expect(compiled).toBeDefined();
      const vs = ShaderMacroProcessor.evaluate([...compiled!.vertexShaderInstructions!], macros);
      const fs = ShaderMacroProcessor.evaluate([...compiled!.fragmentShaderInstructions!], macros);
      expect(vs).toContain("a.TANGENT.x * 255.0");
      expect(vs).toContain("a.TANGENT.z * 256.0");
      expect(fs.length).toBeGreaterThan(0);
    }

    const forwardCompiled = compiler._parseShaderPass(
      passes[1].contents,
      passes[1].vertexEntry,
      passes[1].fragmentEntry,
      ShaderLanguage.GLSLES300,
      undefined,
      passes[1].contentScopeStarts
    )!;
    const forwardVs = ShaderMacroProcessor.evaluate([...forwardCompiled.vertexShaderInstructions!], macros);
    expect(forwardVs).toContain("a.COLOR_0.rgb * 2.0");
    expect(forwardVs).toContain("a.COLOR_0.a * 8.0");
  });
});
