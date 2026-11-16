import { RenderTarget, Texture2D, TextureFormat } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, expect, it, vi } from "vitest";

describe("GLRenderTarget", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    engine = await WebGLEngine.create({ canvas });
  });

  describe("lifecycle", () => {
    it("should create and destroy non-MSAA render target", () => {
      const colorTexture = new Texture2D(engine, 512, 512);
      const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 1);

      // @ts-ignore
      const glRenderTarget = renderTarget._platformRenderTarget as any;

      expect(() => {
        glRenderTarget.activeRenderTarget(0);
        glRenderTarget.blitRenderTarget();
      }).not.toThrow();

      renderTarget.destroy();
    });

    it("should create and destroy MSAA render target", () => {
      const colorTexture = new Texture2D(engine, 512, 512);
      const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 4);

      // @ts-ignore
      const glRenderTarget = renderTarget._platformRenderTarget as any;

      expect(() => {
        glRenderTarget.activeRenderTarget(0);
        glRenderTarget.blitRenderTarget();
      }).not.toThrow();

      renderTarget.destroy();
    });
  });

  it("attaches R11G11B10_UFloat when EXT_color_buffer_float is available", () => {
    const gl = engine._hardwareRenderer.gl;
    const color = new Texture2D(engine, 4, 4, TextureFormat.R11G11B10_UFloat, false, false);
    const target = new RenderTarget(engine, 4, 4, color, null);
    try {
      target._platformRenderTarget.activeRenderTarget(0);
      expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(gl.FRAMEBUFFER_COMPLETE);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      target.destroy();
      color.destroy();
    }
  });

  it("rejects R11G11B10_UFloat color attachments without EXT_color_buffer_float", async () => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2")!;
    const getExtension = gl.getExtension.bind(gl);
    const extension = vi
      .spyOn(gl, "getExtension")
      .mockImplementation((name) => (name === "EXT_color_buffer_float" ? null : getExtension(name)));
    let engine: WebGLEngine | undefined;
    try {
      engine = await WebGLEngine.create({ canvas });
      const color = new Texture2D(engine, 4, 4, TextureFormat.R11G11B10_UFloat, false, false);
      expect(() => new RenderTarget(engine, 4, 4, color, null)).toThrow("R11G11B10_UFloat");
      expect(color.refCount).toBe(0);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      extension.mockRestore();
      engine?.destroy();
    }
  });
});
