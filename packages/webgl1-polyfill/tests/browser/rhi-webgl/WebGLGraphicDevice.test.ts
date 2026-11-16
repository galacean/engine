import {
  Buffer,
  BufferBindFlag,
  Camera,
  Color,
  Logger,
  RenderTarget,
  Texture2D,
  Texture2DArray,
  TextureFormat,
  WebCanvas,
  WebGLEngine,
  WebGLGraphicDevice
} from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { makeFallbackCanvas } from "../../helpers/canvas";
import { createEngine } from "../../helpers/createEngine";

it("keeps direct device initialization WebGL2-only", () => {
  const { canvas } = makeFallbackCanvas();
  const device = new WebGLGraphicDevice();
  expect(() =>
    device.init(
      new WebCanvas(canvas),
      () => {},
      () => {}
    )
  ).toThrow("WebGL2 is unavailable");
  device.destroy();
});

it("rejects explicit Transform Feedback and rasterizer discard operations on WebGL1", async () => {
  const { canvas } = makeFallbackCanvas();
  const engine = await WebGLEngine.create({ canvas });
  try {
    const device = engine._hardwareRenderer as WebGLGraphicDevice;
    expect(() => device.createPlatformTransformFeedback()).toThrow("Transform Feedback is not supported on WebGL1.");
    expect(() => device.createPlatformTransformFeedbackPrimitive()).toThrow(
      "Transform Feedback primitives are not supported on WebGL1."
    );
    expect(() => device.enableRasterizerDiscard()).toThrow("Rasterizer discard is not supported on WebGL1.");
    expect(() => device.disableRasterizerDiscard()).toThrow("Rasterizer discard is not supported on WebGL1.");

    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(1, 0, 0, 1);
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.enablePostProcess = false;
    camera.render();
    const gl = canvas.getContext("webgl")!;
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(Array.from(pixel)).toEqual([255, 0, 0, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("rejects unsupported texture arrays, buffer reads and MRT without the extension", async () => {
  const { canvas } = makeFallbackCanvas();
  const gl = canvas.getContext("webgl")!;
  const getExtension = gl.getExtension.bind(gl);
  vi.spyOn(gl, "getExtension").mockImplementation((name) =>
    name === "WEBGL_draw_buffers" ? null : getExtension(name)
  );
  const engine = await WebGLEngine.create({ canvas });
  try {
    expect(() => new Texture2DArray(engine, 4, 4, 2)).toThrow("Texture2D Array is not supported in WebGL1.0");
    const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 16);
    expect(() => buffer.getData(new Uint8Array(16))).toThrow("Buffer is write-only on WebGL1.0 platforms.");
    const color = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8, false, false);
    const second = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8, false, false);
    expect(() => new RenderTarget(engine, 4, 4, [color, second], null)).toThrow("MRT is not supported");

    const target = new RenderTarget(engine, 4, 4, color, null);
    expect(target.colorTextureCount).toBe(1);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("creates and installs an XR base layer using the WebGL1 context", async () => {
  const { engine, gl } = await createEngine();
  const layer = vi.fn(function () {});
  vi.stubGlobal("XRWebGLLayer", layer);
  try {
    const updateRenderState = vi.fn();
    const session = { renderState: { layers: [] }, updateRenderState };
    const result = (engine._hardwareRenderer as any)._createXRLayer(session, 0.75);
    expect(layer).toHaveBeenCalledWith(session, gl, expect.objectContaining({ framebufferScaleFactor: 0.75 }));
    expect(updateRenderState).toHaveBeenCalledWith({ baseLayer: result });
  } finally {
    vi.unstubAllGlobals();
    engine.destroy();
  }
});

it("accepts two color attachments with WEBGL_draw_buffers", async () => {
  const { engine, gl } = await createEngine();
  try {
    const textures = [0, 1].map(() => new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8, false, false));
    const target = new RenderTarget(engine, 4, 4, textures, null);
    expect(target.colorTextureCount).toBe(2);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("warns when framebuffer blit is called directly", async () => {
  const { engine } = await createEngine();
  try {
    const warn = vi.spyOn(Logger, "warn");
    try {
      engine._hardwareRenderer.blitInternalRTByBlitFrameBuffer();
      expect(warn).toHaveBeenCalledWith("WebGL1.0 not support blit frame buffer.");
    } finally {
      warn.mockRestore();
    }
  } finally {
    engine.destroy();
  }
});
