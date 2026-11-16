import { WebGLEngine, WebGLGraphicDevice } from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { makeFallbackCanvas } from "../../helpers/canvas";
import { createEngine } from "../../helpers/createEngine";

it("adapts buffer uploads through the automatic WebGL1 fallback", async () => {
  const { canvas } = makeFallbackCanvas();
  const gl = canvas.getContext("webgl")!;
  const upload = vi.spyOn(gl, "bufferSubData");
  const engine = await WebGLEngine.create({ canvas });
  const device = engine._hardwareRenderer as WebGLGraphicDevice;
  try {
    expect(device.isWebGL2).toBe(false);
    expect(device.gl).toBe(gl);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, 16, gl.STATIC_DRAW);

    for (let iteration = 0; iteration < 2; iteration++) {
      const view = new Uint16Array(new Uint16Array([10, 20, 30, 40]).buffer, 2, 3);
      (device.gl as WebGL2RenderingContext).bufferSubData(gl.ARRAY_BUFFER, 0, view, 1, 2);
      const uploaded = upload.mock.calls.at(-1)![2] as Uint8Array;
      expect(uploaded.byteOffset).toBe(4);
      expect(uploaded.byteLength).toBe(4);
      expect(gl.getError()).toBe(gl.NO_ERROR);
      if (iteration === 0) device.resetState();
    }
    gl.deleteBuffer(buffer);
  } finally {
    engine.destroy();
  }
});

it("binds VAO and divisor extension entry points", async () => {
  const { engine, gl } = await createEngine();
  try {
    const adapted = gl as unknown as WebGL2RenderingContext;
    const vao = adapted.createVertexArray();
    expect(vao).not.toBeNull();
    adapted.bindVertexArray(vao);
    expect(adapted.isVertexArray(vao)).toBe(true);
    adapted.bindVertexArray(null);
    adapted.deleteVertexArray(vao);
    expect(adapted.isVertexArray(vao)).toBe(false);
    adapted.vertexAttribDivisor(0, 1);
    expect(adapted.getVertexAttrib(0, adapted.VERTEX_ATTRIB_ARRAY_DIVISOR ?? 0x88fe)).toBe(1);
    adapted.vertexAttribDivisor(0, 0);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("draws indexed and non-indexed instances through ANGLE_instanced_arrays", async () => {
  const { engine, gl } = await createEngine();
  try {
    const context = gl as unknown as WebGL2RenderingContext;
    const vertex = gl.createShader(gl.VERTEX_SHADER)!;
    const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(
      vertex,
      "attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); gl_PointSize = 16.0; }"
    );
    gl.shaderSource(fragment, "precision mediump float; void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }");
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    expect(gl.getProgramParameter(program, gl.LINK_STATUS)).toBe(true);
    gl.useProgram(program);
    gl.viewport(0, 0, 16, 16);
    gl.disable(gl.DEPTH_TEST);
    const positions = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const indices = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0]), gl.STATIC_DRAW);
    for (const draw of [
      () => context.drawArraysInstanced(gl.POINTS, 0, 1, 2),
      () => context.drawElementsInstanced(gl.POINTS, 1, gl.UNSIGNED_SHORT, 0, 2)
    ]) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      draw();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      const pixel = new Uint8Array(4);
      gl.readPixels(8, 8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      expect([...pixel]).toEqual([255, 0, 0, 255]);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    }
    gl.deleteBuffer(indices);
    gl.deleteBuffer(positions);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  } finally {
    engine.destroy();
  }
});
