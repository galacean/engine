import { describe, expect, it, vi } from "vitest";
import { Engine, Shader, ShaderLanguage, ShaderPass } from "@galacean/engine";
import { shaderLibrary as glslIncludes } from "@galacean/engine-shader";
import { shaderLibrary as webgpuIncludes } from "@galacean/engine-shader/webgpu";
import { ShaderMacroCollection } from "../../core/src/shader/ShaderMacroCollection";

describe("World shader compiler compatibility", () => {
  it.each([["WebGL2", glslIncludes], ["WebGPU", webgpuIncludes]] as const)(
    "ships the entire built-in include closure for the %s runtime compiler",
    (_name, library) => {
      const paths = new Set(library.map((include) => include.path));
      for (const { path, source } of library) {
        for (const [, dependency] of source.matchAll(/^[ \t]*#include\s+"(ShaderLibrary\/[^"]+)"/gm)) {
          expect(paths.has(dependency), path + " includes " + dependency).toBe(true);
        }
      }
    }
  );

  it("emits native GLSL ES 300 sources directly without runtime ES100 rewriting", () => {
    const pass = new ShaderPass(
      "Pick",
      [[0, "void main(){gl_Position=vec4(0.0);}"]],
      [
        [
          0,
          "layout(location=0) out highp uvec4 pick;\nvec4 sampleMap(){return texture(map,uv)+textureLod(env,direction,0.0);}"
        ]
      ],
      ShaderLanguage.GLSLES300
    );
    const engine = { _hardwareRenderer: { supportsRendering: true, canIUse: () => false } } as unknown as Engine;
    const result = pass["_compileShaderSource"](engine, new ShaderMacroCollection(), false).fragmentSource;
    expect(result).toContain("#version 300 es");
    expect(result).toContain("texture(map,uv)+textureLod(env,direction,0.0)");
    expect(result).toContain("layout(location=0) out highp uvec4 pick;");
    expect(result.match(/\bout\b/g)).toHaveLength(1);
  });

  it("preserves the WebGL screen UVs when one precompiled product pass is used by both backends", () => {
    const fragment = "void main(){vec2 screenUv=clipPosition.xy/clipPosition.w*.5+.5;}";
    const shader = Shader._createFromPrecompiled({
      name: "Terrain/Grass/asset/" + "a".repeat(64),
      platformTarget: ShaderLanguage.GLSLES300,
      subShaders: [{ name: "Default", passes: [{
        name: "Forward", isUsePass: false, renderStates: { constantMap: {}, variableMap: {} },
        vertexShaderInstructions: [[0, "void main(){gl_Position=vec4(0.0);}"]],
        fragmentShaderInstructions: [[0, fragment]]
      }] }]
    });
    try {
      const pass = shader.subShaders[0].passes[0];
      const compile = (backend: string) => {
        const engine = { _hardwareRenderer: { backend, supportsRendering: true, canIUse: () => false } } as unknown as Engine;
        return pass["_compileShaderSource"](engine, new ShaderMacroCollection(), false).fragmentSource;
      };
      expect(compile("webgpu")).toContain("screenUv.y = 1.0 - screenUv.y");
      expect(compile("webgl2")).toContain(fragment);
    } finally {
      shader.destroy(true);
    }
  });

  it("uses compiler output names for transform feedback and its program cache", () => {
    const pass = new ShaderPass(
      "Feedback",
      [[0, "out vec3 generated_position; void main(){generated_position=vec3(0.0);gl_Position=vec4(0.0);}"]],
      [[0, "void main(){}"]],
      ShaderLanguage.GLSLES300,
      undefined,
      { position: "generated_position" }
    );
    pass._feedbackVaryings = ["position", "gl_Position"];
    const cachedProgram = {};
    const map = { getBySource: vi.fn((_key: string) => cachedProgram) };
    const engine = {
      _hardwareRenderer: { supportsRendering: true, canIUse: () => false },
      _getShaderProgramMap: () => map
    } as unknown as Engine;
    expect(pass._compileShaderProgram(engine, new ShaderMacroCollection(), pass._feedbackVaryings)).toBe(cachedProgram);
    expect(JSON.parse(map.getBySource.mock.calls[0][0])[0].feedbackVaryings).toEqual(["generated_position", "gl_Position"]);
    expect(pass._feedbackVaryings).toEqual(["position", "gl_Position"]);
  });
});
