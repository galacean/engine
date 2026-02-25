import { RenderTarget, Texture2D, TextureFormat } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { GLRenderTarget } from "@galacean/engine-rhi-webgl/src/GLRenderTarget";
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
      const glRenderTarget = renderTarget._platformRenderTarget as GLRenderTarget;

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
      const glRenderTarget = renderTarget._platformRenderTarget as GLRenderTarget;

      expect(() => {
        glRenderTarget.activeRenderTarget(0);
        glRenderTarget.blitRenderTarget();
      }).not.toThrow();

      renderTarget.destroy();
    });
  });

  describe("validation", () => {
    it("should reject unsupported texture format", () => {
      const colorTexture = new Texture2D(engine, 512, 512);

      expect(() => {
        new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.R32G32B32A32, 1);
      }).toThrow("this TextureFormat is not supported");
    });

    it("should reject mismatched color texture sizes", () => {
      const colorTexture1 = new Texture2D(engine, 512, 512);
      const colorTexture2 = new Texture2D(engine, 256, 256);

      expect(() => {
        new RenderTarget(engine, 512, 512, [colorTexture1, colorTexture2], TextureFormat.Depth16, 1);
      }).toThrow("ColorTexture's size must as same as RenderTarget");
    });

    it("should auto-downgrade MSAA level to max supported", () => {
      // @ts-ignore
      const originalMaxAA = engine._hardwareRenderer.capability.maxAntiAliasing;
      // @ts-ignore
      engine._hardwareRenderer.capability._maxAntiAliasing = 2;

      try {
        const colorTexture = new Texture2D(engine, 512, 512);
        const renderTarget = new RenderTarget(engine, 512, 512, colorTexture, TextureFormat.Depth16, 8);

        expect(renderTarget.antiAliasing).toBe(2);

        renderTarget.destroy();
      } finally {
        // @ts-ignore
        engine._hardwareRenderer.capability._maxAntiAliasing = originalMaxAA;
      }
    });
  });
});
