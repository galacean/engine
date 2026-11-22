import { describe, expect, it, vi } from "vitest";
import { Engine, ShaderLanguage, ShaderPass } from "@galacean/engine";
import { ShaderMacroCollection } from "../../core/src/shader/ShaderMacroCollection";

describe("World shader compiler compatibility", () => {
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
    expect(pass._compileShaderProgram(engine, new ShaderMacroCollection())).toBe(cachedProgram);
    expect(JSON.parse(map.getBySource.mock.calls[0][0])[2]).toEqual(["generated_position", "gl_Position"]);
    expect(pass._feedbackVaryings).toEqual(["position", "gl_Position"]);
  });
});
