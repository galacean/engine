import { describe, expect, it } from "vitest";
import { ShaderFactory, ShaderLanguage } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import {
  constructionLightingBridgeSource,
  constructionLightingHelpers,
  registerConstructionSceneLighting
} from "../src/building/runtime/ConstructionSceneLighting";

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
});
