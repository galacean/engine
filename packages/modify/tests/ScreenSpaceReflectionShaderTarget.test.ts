import { Shader, ShaderLanguage, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import pbrSurface from "../src/native/shader/src/Shaders/Pipeline/ScreenSpaceReflectionSurface.shader?raw";
import { expect, it } from "vitest";
it("compiles the PBR Surface pass for GLSLES300", async () => {
  const engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    shaderCompiler: new ShaderCompiler()
  });
  try {
    const shader = Shader.create(
      pbrSurface.replace('Shader "Pipeline/ScreenSpaceReflectionSurface"', 'Shader "Review/PBRSurface300"'),
      ShaderLanguage.GLSLES300
    )!;
    expect(shader.compileVariant(engine, [])).toBe(true);
  } finally {
    engine.destroy();
  }
});
