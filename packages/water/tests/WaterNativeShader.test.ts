import { Logger, Shader, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";
import lakeSource from "../src/water/native/assets/Water/Shaders/lake.shader?raw";
import oceanSource from "../src/water/native/assets/Water/Shaders/ocean.shader?raw";
import source from "../src/water/native/assets/Water/Shaders/river.shader?raw";

describe("native Water Shader assets", () => {
  it.each([
    ["lake", lakeSource],
    ["river", source],
    ["ocean", oceanSource]
  ])("compiles the native %s Shader including every region", async (_kind, source) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    const shader = Shader.create(source);
    const errors: string[] = [];
    const loggingEnabled = Logger.isEnabled;
    Logger.enable();
    const originalError = Logger.error;
    const originalWarn = console.warn;
    console.warn = (...messages) => errors.push(messages.join(" "));
    Logger.error = (...messages) => errors.push(messages.join(" "));
    try {
      const compiled = shader.compileVariant(engine, []);
      expect(compiled, errors.join("\n")).toBe(true);
    } finally {
      Logger.error = originalError;
      console.warn = originalWarn;
      if (!loggingEnabled) Logger.disable();
      shader.destroy();
      engine.destroy();
    }
  });
});
