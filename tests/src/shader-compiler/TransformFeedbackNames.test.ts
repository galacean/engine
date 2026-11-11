import { Shader, ShaderFactory, ShaderLanguage, ShaderPass, ShaderMacroCollection } from "@galacean/engine-core";
import { WebGLEngine, WebGLMode } from "@galacean/engine";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { ShaderInstructionEncoder } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import { describe, expect, it } from "vitest";

// The local `feedbackValue` shares the member name, which reproduced issue #3160 before value lowering.
const source = `Shader "feedback-binding" {
  SubShader "s" { Pass "p" {
    struct Varyings { vec4 feedbackValue; };
    Varyings vert() {
      Varyings v;
      float feedbackValue = 0.25;
      v.feedbackValue = vec4(feedbackValue, 0.5, 0.75, 1.0);
      gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
      return v;
    }
    void frag(Varyings v) { gl_FragColor = vec4(1.0); }
    VertexShader = vert;
    FragmentShader = frag;
  } }
}`;

async function capture(
  vertex: string,
  fragment: string,
  varying: string,
  compiledPass?: ShaderPass
): Promise<number[]> {
  const engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  const gl = engine._hardwareRenderer.gl as WebGL2RenderingContext;
  expect(gl).not.toBeNull();
  const pass =
    compiledPass ??
    new ShaderPass(
      "feedback",
      ShaderInstructionEncoder.parse(vertex),
      ShaderInstructionEncoder.parse(fragment),
      ShaderLanguage.GLSLES300
    );
  const shaderProgram = pass._compileShaderProgram(engine, new ShaderMacroCollection(), [varying]);
  const program = shaderProgram["_glProgram"]!;
  const buffer = gl.createBuffer()!;
  const feedback = gl.createTransformFeedback()!;
  try {
    expect(program).not.toBeNull();
    expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program) ?? "").toBe(true);
    gl.useProgram(program);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 16, gl.DYNAMIC_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, 1);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    const result = new Float32Array(4);
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, result);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    return Array.from(result);
  } finally {
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.deleteTransformFeedback(feedback);
    gl.deleteBuffer(buffer);
    shaderProgram.destroy();
    engine.destroy();
  }
}

describe("transform feedback captures interface members by source name", () => {
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    for (const precompiled of [false, true]) {
      it(`captures the member name for target ${target}, precompiled=${precompiled}`, async () => {
        const compiler = new ShaderCompiler();
        const parsed = compiler._parseShaderSource(source).subShaders[0].passes[0];
        const program = precompiled
          ? JSON.parse(JSON.stringify(new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]))
          : compiler._parseShaderPass(
              parsed.contents,
              parsed.vertexEntry,
              parsed.fragmentEntry,
              target,
              undefined,
              parsed.contentScopeStarts
            )!;
        const macros = new Map<string, string>();
        let vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions, macros);
        let fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions, macros);
        if (target === ShaderLanguage.GLSLES100) {
          vertex = ShaderFactory.convertTo300(vertex);
          fragment = ShaderFactory.convertTo300(fragment, true);
        }
        expect(await capture(vertex, fragment, "feedbackValue")).toEqual([0.25, 0.5, 0.75, 1]);
      });
    }
  }

  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    it(`captures through a serialized Shader for target ${target}`, async () => {
      const data = JSON.parse(JSON.stringify(new ShaderPrecompiler().precompile(source, target)));
      const shader = Shader._createFromPrecompiled(data);
      try {
        expect(await capture("", "", "feedbackValue", shader.subShaders[0].passes[0])).toEqual([0.25, 0.5, 0.75, 1]);
      } finally {
        shader.destroy();
      }
    });
  }

  it("captures raw GLSL instruction streams", async () => {
    const vertex = ShaderMacroProcessor.evaluate(
      ShaderInstructionEncoder.parse(
        "out vec4 feedbackValue; void main() { feedbackValue = vec4(0.25, 0.5, 0.75, 1.0); gl_Position = vec4(0.0); }"
      ),
      new Map()
    );
    expect(await capture(vertex, "out vec4 color; void main() { color = vec4(1.0); }", "feedbackValue")).toEqual([
      0.25, 0.5, 0.75, 1
    ]);
  });
});
