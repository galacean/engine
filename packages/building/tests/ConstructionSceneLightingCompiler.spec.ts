import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { IShaderInfo } from "@galacean/engine-design";
import { compileWebGPUShaderPass, createWebGPUShaderCompiler } from "../../shader-compiler/src/webgpu";
import { engineShaderSource } from "../src/building/runtime/EngineShaderSource";
import { residentFragment } from "../src/building/runtime/EngineResidentScene";
import { injectConstructionDecorationLighting } from "../src/building/runtime/ConstructionDecorationLightShader";
import { injectConstructionEntrance } from "../src/building/runtime/ConstructionEntranceShader";
import { describe, expect, it } from "vitest";
import { ShaderFactory, ShaderLanguage } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { shaderLibrary as webGPUIncludes } from "@galacean/engine-shader/webgpu";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import {
  constructionLightingBridgeSource,
  constructionLightingHelpers,
  createConstructionForwardPass,
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

  it("compiles the recovered brick and wood forward passes with their scene lighting and entrance variants", async () => {
    const fromCompiler = createRequire(new URL("../../shader-compiler/package.json", import.meta.url));
    const backend = await createWebGPUShaderCompiler(readFileSync(fromCompiler.resolve("web-naga/web_naga_bg.wasm")));
    registerConstructionSceneLighting();
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(ShaderFactory._getRuntimeIncludes(webGPUIncludes));
    for (const family of ["brick", "wood"]) {
      const asset = new URL(`../src/building/assets/native/Shaders/${family}.shaderc`, import.meta.url);
      const pass = JSON.parse(readFileSync(asset, "utf8")).subShaders[0].passes[0];
      const lit = injectConstructionDecorationLighting(
        pass.vertexShaderInstructions[0][1],
        pass.fragmentShaderInstructions[0][1]
      );
      const vertex = engineShaderSource(lit.vertex, "webgpu").source;
      const fragment = engineShaderSource(lit.fragment, "webgpu").source;
      const entrance = injectConstructionEntrance(vertex, fragment, family);
      const forward = createConstructionForwardPass(compiler, entrance.vertex, residentFragment(entrance.fragment));
      const linked = forward as unknown as {
        _vertexShaderInstructions: IShaderInfo["vertexShaderInstructions"];
        _fragmentShaderInstructions: IShaderInfo["fragmentShaderInstructions"];
        _uniformBlocks: NonNullable<IShaderInfo["uniformBlocks"]>;
      };
      for (const animating of [false, true]) {
        const features = new Map([
          ["SCENE_DIRECT_LIGHT_COUNT", "1"], ["SCENE_POINT_LIGHT_COUNT", "4"],
          ["SCENE_SHADOW_TYPE", "1"], ["SCENE_SHADOW_CASCADED_COUNT", "2"], ["RENDERER_IS_RECEIVE_SHADOWS", ""],
          ["SCENE_FOG_MODE", "3"], ["SCENE_USE_SH", ""], ["SCENE_USE_REALTIME_SH", ""],
          ["SCENE_USE_SPECULAR_ENV", ""], ["SCENE_VOLUMETRIC_CLOUD_SHADOW", ""]
        ]);
        if (animating) features.set("RENDERER_MASONRY_ENTRANCE", "");
        const program = compileWebGPUShaderPass(backend, {
          vertexShaderInstructions: linked._vertexShaderInstructions,
          fragmentShaderInstructions: linked._fragmentShaderInstructions,
          uniformBlocks: linked._uniformBlocks
        }, features);
        expect(program.vertex).toContain("@vertex");
        expect(program.fragment).toContain("@fragment");
        expect(program.reflection.uniformBlocks.map(block => block.bindingName))
          .toEqual(expect.arrayContaining(["gs_Camera", "gs_Scene"]));
      }
    }
  });
});
