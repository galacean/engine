import { Shader, ShaderLanguage, ShaderMacro, ShaderMacroCollection } from "@galacean/engine-core";
import { WebGLEngine, WebGLMode } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { expect, it } from "vitest";

it("warms preconfigured feedback outputs using lowered names without changing the pass ABI or cache", async () => {
  const previousCompiler = Shader._shaderCompiler;
  const engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  const gl = engine._hardwareRenderer.gl as WebGL2RenderingContext;
  let shader: Shader | undefined;
  let buffer: WebGLBuffer | null = null;
  let feedback: WebGLTransformFeedback | null = null;
  try {
    shader = Shader.create(
      `Shader "Review/FeedbackWarmupCompatibility" { SubShader "s" { Pass "p" {
        struct Varyings { vec4 input; };
        Varyings vert() {
          Varyings v;
          float localValue = 0.25;
          v.input = vec4(localValue, 0.5, 0.75, 1.0);
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
          return v;
        }
        void frag(Varyings v) { gl_FragColor = vec4(1.0); }
        VertexShader = vert; FragmentShader = frag;
      } } }`,
      ShaderLanguage.GLSLES300
    );
    const pass = shader.subShaders[0].passes[0];
    const configuredNames = ["input"];
    // ShaderPool configures these before startup warmup, without a simulator call.
    pass._feedbackVaryings = configuredNames;
    expect(await pass.compileVariantAsync(engine, [])).toBe(true);

    const macros = new ShaderMacroCollection();
    const warmedProgram = pass._getShaderProgram(engine, macros, false, true);
    expect(pass._compileShaderProgram(engine, macros, configuredNames, true)).toBe(warmedProgram);
    expect(pass._getShaderProgram(engine, macros, configuredNames, true)).toBe(warmedProgram);
    const equivalentMacros = new ShaderMacroCollection();
    equivalentMacros.enable(ShaderMacro.getByName("REVIEW_UNUSED_FEEDBACK_MACRO"));
    expect(pass._getShaderProgram(engine, equivalentMacros, false, true)).toBe(warmedProgram);
    expect(pass._feedbackVaryings).toBe(configuredNames);
    expect(configuredNames).toEqual(["input"]);
    expect(() => pass._getShaderProgram(engine, macros, ["differentOutput"])).toThrow(
      "Transform feedback outputs cannot change after the pass ABI is configured"
    );

    const program = warmedProgram["_glProgram"]!;
    expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program) ?? "").toBe(true);
    expect(gl.getTransformFeedbackVarying(program, 0)!.name).not.toBe("input");
    buffer = gl.createBuffer();
    feedback = gl.createTransformFeedback();
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
    expect(Array.from(result)).toEqual([0.25, 0.5, 0.75, 1]);
  } finally {
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.deleteTransformFeedback(feedback);
    gl.deleteBuffer(buffer);
    shader?.destroy();
    engine.destroy();
    Shader._shaderCompiler = previousCompiler;
  }
});
