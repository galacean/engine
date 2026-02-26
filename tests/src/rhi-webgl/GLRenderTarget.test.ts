import { RenderTarget, Texture2D, TextureFormat } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { describe, beforeAll, expect, it } from "vitest";

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

});
