import { describe, expect, it } from "vitest";
import { Shader, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import oceanSource from "../src/water/native/assets/Water/Shaders/ocean.shader?raw";
import source from "../src/water/native/assets/Water/Shaders/river.shader?raw";

describe("native Water Shader assets", () => {
  it.each([
    ["river", source],
    ["ocean", oceanSource]
  ])("compiles the native %s Shader including every region", async (_kind, source) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    const shader = Shader.create(source);
    try {
      expect(shader.compileVariant(engine, [])).toBe(true);
    } finally {
      shader.destroy();
      engine.destroy();
    }
  });
});
