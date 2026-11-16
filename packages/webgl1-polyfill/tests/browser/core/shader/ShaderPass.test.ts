import {
  Engine,
  Shader,
  ShaderLanguage,
  ShaderMacroCollection,
  WebGLEngine
} from "../../../../../galacean/dist/module.js";
import { ShaderCompiler } from "../../../../../shader-compiler/dist/module.js";
import { expect, it } from "vitest";
import { makeFallbackCanvas } from "../../../helpers/canvas";

it("compiles shared source shader instructions created before fallback without changing the native variant", async ({
  skip
}) => {
  const canvas = document.createElement("canvas");
  if (!canvas.getContext("webgl2")) skip();
  const native = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const shader = Shader.create(
    `Shader "BeforeFallback" {
    SubShader "Default" { Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }
      vec4 frag() { mat2 matrix = INVERSE_MAT(mat2(1.0)); return vec4(matrix[0], 0.0, 1.0); }
    } }
  }`,
    ShaderLanguage.GLSLES100
  );
  let legacy: WebGLEngine | undefined;
  try {
    expect(shader.compileVariant(native, [])).toBe(true);
    legacy = await WebGLEngine.create({ canvas: makeFallbackCanvas().canvas });
    expect(shader.compileVariant(legacy, [])).toBe(true);
    expect(shader.compileVariant(native, [])).toBe(true);
  } finally {
    shader.destroy();
    legacy?.destroy();
    native.destroy();
  }
});

it("isolates shared shader passes when WebGL1 and WebGL2 compile in either order", async ({ skip }) => {
  const nativeCanvas = document.createElement("canvas");
  if (!nativeCanvas.getContext("webgl2")) skip();
  const native = await WebGLEngine.create({ canvas: nativeCanvas });
  const legacy = await WebGLEngine.create({ canvas: makeFallbackCanvas().canvas });
  try {
    const context = legacy._hardwareRenderer.gl;
    const macros = new ShaderMacroCollection();
    for (const shader of [Engine._builtinShaders.unlit, Engine._builtinShaders.text]) {
      const pass = shader.subShaders[0].passes[0];
      const instructions = pass._vertexShaderInstructions;
      for (const engine of [legacy, native, native, legacy]) {
        const source = (pass as any)._compileShaderSource(engine, macros, false);
        expect(source.vertexSource.trimStart().startsWith(engine === native ? "#version 300 es" : "#version 100")).toBe(
          true
        );
        expect(pass._getShaderProgram(engine, macros).isValid).toBe(true);
        expect(pass._vertexShaderInstructions).toBe(instructions);
        expect(engine._hardwareRenderer.gl.getError()).toBe(0);
      }
    }
  } finally {
    legacy.destroy();
    native.destroy();
  }
});
