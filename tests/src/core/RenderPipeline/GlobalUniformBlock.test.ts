import { Scene, Shader, ShaderMacroCollection, Vector2, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it, vi } from "vitest";

describe("global uniform buffer lifetime", () => {
  it("shares across programs, orphans on wrap, and repopulates after resource loss", async () => {
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    const source = `Shader "Tests/GlobalBlockLifetime" {
      SubShader "Default" { Pass "Default" {
        uniform Scene { vec4 lifetimeValues[512]; };
        void vert() { gl_Position = vec4(0.0); }
        void frag() { gl_FragColor = lifetimeValues[511]; }
        VertexShader = vert;
        FragmentShader = frag;
      }}
    }`;
    const shaders = [Shader.create(source), Shader.create(source)];
    try {
      const macros = new ShaderMacroCollection();
      const [first, second] = shaders.map((s) => s.subShaders[0].passes[0]._getShaderProgram(engine, macros));
      const data = engine.sceneManager.activeScene.shaderData;
      const values = new Float32Array(512 * 4);
      data.setFloatArray("lifetimeValues", values);
      const ranges = vi.spyOn(engine._hardwareRenderer, "bindUniformBufferRange");
      first.uploadSharedUniforms(data, data);
      const [, backing, firstOffset] = ranges.mock.calls[0];
      const gl = engine._hardwareRenderer.gl;
      const uploads = vi.spyOn(gl, "bufferSubData");
      const orphans = vi.spyOn(gl, "bufferData");
      second.uploadSharedUniforms(data, data);
      expect(ranges.mock.calls[1][1]).toBe(backing);
      expect(uploads).not.toHaveBeenCalled();

      values[0] = 1;
      first.uploadSharedUniforms(data, data);
      const nextOffset = ranges.mock.calls[2][2];
      expect(nextOffset).toBeGreaterThan(firstOffset);
      expect(nextOffset % engine._hardwareRenderer.uniformBufferOffsetAlignment).toBe(0);
      values[0] = 2;
      second.uploadSharedUniforms(data, data);
      expect(ranges.mock.calls[3][2]).toBe(firstOffset);
      expect(orphans).toHaveBeenCalledOnce();
      expect(orphans.mock.lastCall![0]).toBe(gl.UNIFORM_BUFFER);

      const destroy = vi.spyOn(backing, "destroy");
      shaders[0].destroy(true);
      engine.resourceManager.gc();
      expect(destroy).not.toHaveBeenCalled();
      engine.resourceManager._lostGraphicResources();
      second.uploadSharedUniforms(data, data);
      expect(uploads).toHaveBeenCalledTimes(3);

      const other = new Scene(engine);
      const otherData = other.shaderData;
      const readOther = () => {
        second.uploadSharedUniforms(otherData, otherData);
        const [, buffer, offset] = ranges.mock.lastCall!;
        const result = new Float32Array(8);
        buffer.getData(result, offset, 0, result.length);
        return Array.from(result);
      };
      values.fill(9);
      second.uploadSharedUniforms(data, data);
      expect(readOther()).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      otherData.setFloatArray("lifetimeValues", new Float32Array([1, 2, 3, 4, 5]));
      expect(readOther()).toEqual([1, 2, 3, 4, 5, 0, 0, 0]);
      otherData.setVector2("lifetimeValues", new Vector2(7, 8));
      expect(readOther()).toEqual([7, 8, 0, 0, 0, 0, 0, 0]);
      otherData.setFloat("lifetimeValues", 6);
      expect(readOther()).toEqual([6, 0, 0, 0, 0, 0, 0, 0]);
      other.destroy();
      shaders[1].destroy(true);
      expect(destroy).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      for (const shader of shaders) shader.destroy(true);
      engine.destroy();
    }
  });

  it("relinks and repopulates the block after a WebGL context is restored", async () => {
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    const shader = Shader.create(`Shader "Tests/RestoredBlock" {
      SubShader "Default" { Pass "Default" {
        uniform Scene { float restoredValue; };
        void vert() { gl_Position = vec4(0.0); }
        void frag() { gl_FragColor = vec4(restoredValue); }
        VertexShader = vert;
        FragmentShader = frag;
      }}
    }`);
    try {
      const pass = shader.subShaders[0].passes[0];
      const macros = new ShaderMacroCollection();
      const scene = engine.sceneManager.activeScene.shaderData;
      scene.setFloat("restoredValue", 0.75);
      const ranges = vi.spyOn(engine._hardwareRenderer, "bindUniformBufferRange");
      const first = pass._getShaderProgram(engine, macros);
      first.uploadSharedUniforms(scene, scene);
      const initialBuffer = ranges.mock.lastCall![1];
      const lost = new Promise<void>((resolve) => engine.once("devicelost", resolve));
      engine.forceLoseDevice();
      await lost;
      const restored = new Promise<void>((resolve) => engine.once("devicerestored", resolve));
      // Allow the full context-loss event to unwind before Chromium enables restoration.
      await new Promise((resolve) => setTimeout(resolve, 0));
      engine.forceRestoreDevice();
      await restored;

      const second = pass._getShaderProgram(engine, macros);
      expect(second).not.toBe(first);
      second.uploadSharedUniforms(scene, scene);
      const [, buffer, offset] = ranges.mock.lastCall!;
      expect(buffer).not.toBe(initialBuffer);
      const result = new Float32Array(1);
      buffer.getData(result, offset, 0, 1);
      expect(result[0]).toBe(0.75);
      const gl = engine._hardwareRenderer.gl;
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      vi.restoreAllMocks();
      shader.destroy(true);
      engine.destroy();
    }
  });
});
