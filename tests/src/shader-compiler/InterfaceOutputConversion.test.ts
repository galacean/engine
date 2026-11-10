import { ShaderFactory } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";

describe("interface output conversion", () => {
  for (const mrt of [false, true]) {
    it(`declares ${mrt ? "MRT" : "color"} output before helpers without shadowing source locals`, () => {
      const gl = document.createElement("canvas").getContext("webgl2")!;
      expect(gl).not.toBeNull();
      const fragment = ShaderFactory.convertTo300(
        `void writeColor() {
          vec4 ${mrt ? "fragOutColor0" : "glFragColor"} = vec4(0.25, 0.0, 0.0, 1.0);
          ${mrt ? "gl_FragData[0]" : "gl_FragColor"} = ${mrt ? "fragOutColor0" : "glFragColor"};
        }
        void main() { writeColor(); }`,
        true
      );
      const program = gl.createProgram()!;
      const shaders = [gl.createShader(gl.VERTEX_SHADER)!, gl.createShader(gl.FRAGMENT_SHADER)!];
      try {
        const sources = ["void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }", fragment];
        for (let i = 0; i < shaders.length; i++) {
          gl.shaderSource(shaders[i], "#version 300 es\nprecision highp float;\n" + sources[i]);
          gl.compileShader(shaders[i]);
          expect(gl.getShaderParameter(shaders[i], gl.COMPILE_STATUS), gl.getShaderInfoLog(shaders[i]) ?? "").toBe(
            true
          );
          gl.attachShader(program, shaders[i]);
        }
        gl.linkProgram(program);
        expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program) ?? "").toBe(true);
        gl.useProgram(program);
        gl.viewport(0, 0, 1, 1);
        gl.drawArrays(gl.POINTS, 0, 1);
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        expect(Array.from(pixel)).toEqual([64, 0, 0, 255]);
      } finally {
        gl.deleteProgram(program);
        for (const shader of shaders) gl.deleteShader(shader);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    });
  }
});
