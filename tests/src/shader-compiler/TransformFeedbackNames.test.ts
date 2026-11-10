import { ShaderFactory, ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { ShaderInstructionEncoder } from "@galacean/engine-shader-compiler/src/ShaderInstructionEncoder";
import { describe, expect, it } from "vitest";

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

function capture(vertex: string, fragment: string, varying: string): number[] {
  const gl = document.createElement("canvas").getContext("webgl2")!;
  expect(gl).not.toBeNull();
  const program = gl.createProgram()!;
  const buffer = gl.createBuffer()!;
  const feedback = gl.createTransformFeedback()!;
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, code] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, `#version 300 es\nprecision highp float;\n${code}`);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader) ?? "").toBe(true);
      gl.attachShader(program, shader);
    }
    gl.transformFeedbackVaryings(program, [varying], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
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
    gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

describe("transform feedback interface bindings", () => {
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    for (const precompiled of [false, true]) {
      for (const collision of [false, true]) {
        it(`captures original field names for target ${target}, precompiled=${precompiled}, macro collision=${collision}`, () => {
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
          const bindings = new Map<string, string>();
          const macros = new Map<string, string>();
          ShaderMacroProcessor.evaluate(program.vertexShaderInstructions, macros, bindings);
          const defaultName = bindings.get("feedbackValue")!;
          expect(defaultName).toBeDefined();
          if (collision) macros.set(defaultName, "0.0");
          let vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions, macros, bindings);
          let fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions, macros);
          const varying = bindings.get("feedbackValue")!;
          if (collision) expect(varying).not.toBe(defaultName);
          if (target === ShaderLanguage.GLSLES100) {
            vertex = ShaderFactory.convertTo300(vertex);
            fragment = ShaderFactory.convertTo300(fragment, true);
          }
          expect(capture(vertex, fragment, varying)).toEqual([0.25, 0.5, 0.75, 1]);
        });
      }
    }
  }

  it("clears stale alias mappings for raw GLSL instruction streams", () => {
    const bindings = new Map([["feedbackValue", "stale_name"]]);
    const vertex = ShaderMacroProcessor.evaluate(
      ShaderInstructionEncoder.parse(
        "out vec4 feedbackValue; void main() { feedbackValue = vec4(0.25, 0.5, 0.75, 1.0); gl_Position = vec4(0.0); }"
      ),
      new Map(),
      bindings
    );
    expect(bindings.size).toBe(0);
    expect(
      capture(
        vertex,
        "out vec4 color; void main() { color = vec4(1.0); }",
        bindings.get("feedbackValue") ?? "feedbackValue"
      )
    ).toEqual([0.25, 0.5, 0.75, 1]);
  });
});
