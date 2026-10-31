import { TextureFormat, RenderTarget, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("RenderTarget", async () => {
  const width = 1024;
  const height = 1024;

  const canvas = document.createElement("canvas");

  let engine: WebGLEngine;
  let rhi: any;
  let maxAntiAliasing: number;
  let renderColorTexture: Texture2D;
  let renderColorTexture2: Texture2D;
  let renderDepthTexture: Texture2D;
  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: canvas });
    // @ts-ignore
    rhi = engine._hardwareRenderer;
    maxAntiAliasing = rhi.capability._maxAntiAliasing;
    renderColorTexture = new Texture2D(engine, width, height);
    renderColorTexture2 = new Texture2D(engine, width, height);
    renderDepthTexture = new Texture2D(engine, width, height);
  });

  beforeEach(() => {
    rhi.capability._maxAntiAliasing = maxAntiAliasing;
  });

  describe("创建渲染目标", () => {
    it("创建渲染目标-通过颜色纹理和深度格式", () => {
      const renderTarget = new RenderTarget(engine, width, height, renderColorTexture);

      expect(renderTarget.colorTextureCount).to.eq(1);
      expect(renderTarget.getColorTexture(0)).to.eq(renderColorTexture);
      expect(renderTarget.depthTexture).to.be.null;
    });

    it("创建渲染目标-通过颜色纹理和深度纹理", () => {
      // const renderTarget = new RenderTarget(engine, width, height, renderColorTexture, renderDepthTexture);
      // expect(renderTarget.colorTextureCount).toBe(1);
      // expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      // expect(renderTarget.depthTexture).toBe(renderDepthTexture);
    });

    it("创建渲染目标-只生成深度纹理", () => {
      // const renderTarget = new RenderTarget(engine, width, height, null, renderDepthTexture);
      // expect(renderTarget.colorTextureCount).toBe(0);
      // expect(renderTarget.getColorTexture(0)).toBeUndefined();
      // expect(renderTarget.depthTexture).toBe(renderDepthTexture);
    });

    it("创建渲染目标-通过颜色纹理数组和深度格式", () => {
      const renderTarget = new RenderTarget(engine, width, height, [renderColorTexture, renderColorTexture2]);

      expect(renderTarget.colorTextureCount).to.eq(2);
      expect(renderTarget.getColorTexture(0)).to.eq(renderColorTexture);
      expect(renderTarget.getColorTexture(1)).to.eq(renderColorTexture2);
      expect(renderTarget.depthTexture).to.be.null;
    });

    it("创建渲染目标-通过颜色纹理数组和深度纹理", () => {
      // const renderTarget = new RenderTarget(
      //   engine,
      //   width,
      //   height,
      //   [renderColorTexture, renderColorTexture2],
      //   renderDepthTexture
      // );
      // expect(renderTarget.colorTextureCount).toBe(2);
      // expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      // expect(renderTarget.getColorTexture(1)).toBe(renderColorTexture2);
      // expect(renderTarget.depthTexture).toBe(renderDepthTexture);
    });

    it.each([TextureFormat.Depth32, TextureFormat.Depth32Stencil8])(
      "creates a complete WebGL2 framebuffer with two color attachments and depth format %i",
      (format) => {
        const target = new RenderTarget(engine, width, height, [renderColorTexture, renderColorTexture2], format);
        const gl = canvas.getContext("webgl2")!;
        try {
          target._platformRenderTarget.activeRenderTarget(0);
          expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(gl.FRAMEBUFFER_COMPLETE);
          expect(gl.getParameter(gl.DRAW_BUFFER1)).toBe(gl.COLOR_ATTACHMENT1);
        } finally {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          target.destroy();
        }
      }
    );

    // it("创建失败-不支持MRT+Cube+[,MSAA]", () => {
    //   expect(() => {
    //     const cubeRenderColorTexture = new TextureCube(engine, width);
    //     new RenderTarget(engine, width, height, [renderColorTexture, cubeRenderColorTexture]);
    //   }).toThrow();
    // });

    it("创建降级-MSAA自动降级", () => {
      rhi.capability._maxAntiAliasing = 1;

      const renderTarget = new RenderTarget(engine, width, height, renderColorTexture, undefined, 2);

      // The requested level is kept while the device creates a single-sample target
      expect(renderTarget.antiAliasing).to.eq(2);
      expect(renderTarget._platformRenderTarget["_MSAAFrameBuffer"]).to.be.undefined;
    });

    it("销毁", () => {
      const renderTarget = new RenderTarget(engine, width, height, renderColorTexture);

      expect(renderTarget.colorTextureCount).to.eq(1);
      expect(renderTarget.getColorTexture()).to.eq(renderColorTexture);

      renderTarget.destroy();

      expect(renderTarget.colorTextureCount).to.eq(0);
      expect(renderTarget.getColorTexture()).to.be.null;
    });
  });
});
