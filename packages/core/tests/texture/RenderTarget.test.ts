// @ts-nocheck
// @todo: jest `_depth instanceof RenderDepthTexture` in `GLRenderTarget.ts` always return `false`, so test with depthTexture in renderTarget is ignored.

import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { RenderBufferDepthFormat, RenderColorTexture, RenderDepthTexture, RenderTarget } from "../../src/texture";

describe("RenderTarget", () => {
  const width = 1024;
  const height = 1024;

  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);
  const rhi = engine._hardwareRenderer;
  const isWebGL2 = rhi.isWebGL2;
  const maxAntiAliasing = rhi.capability._maxAntiAliasing;

  beforeEach(() => {
    rhi._isWebGL2 = isWebGL2;
    rhi.capability._maxAntiAliasing = maxAntiAliasing;
  });

  describe("创建渲染目标", () => {
    const renderColorTexture = new RenderColorTexture(engine, width, height);
    const renderColorTexture2 = new RenderColorTexture(engine, width, height);
    const renderDepthTexture = new RenderDepthTexture(engine, width, height);

    it("创建渲染目标-通过颜色纹理和深度格式", () => {
      const renderTarget = new RenderTarget(engine, width, height, renderColorTexture);

      expect(renderTarget.colorTextureCount).toBe(1);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.depthTexture).toBeUndefined();
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

      expect(renderTarget.colorTextureCount).toBe(2);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.getColorTexture(1)).toBe(renderColorTexture2);
      expect(renderTarget.depthTexture).toBeUndefined();
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

    it("创建失败-不支持高精度深度缓冲", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderTarget(engine, width, height, renderColorTexture, RenderBufferDepthFormat.Depth32);
      }).toThrow();
    });

    it("创建失败-不支持高精度深度模版缓冲", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderTarget(engine, width, height, renderColorTexture, RenderBufferDepthFormat.Depth32Stencil8);
      }).toThrow();
    });

    it("创建失败-不支持MRT", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderTarget(engine, width, height, [renderColorTexture, renderColorTexture2]);
      }).toThrow();
    });

    it("创建失败-不支持MRT+Cube+[,MSAA]", () => {
      expect(() => {
        const cubeRenderColorTexture = new RenderColorTexture(engine, width, height, undefined, undefined, true);
        new RenderTarget(engine, width, height, [renderColorTexture, cubeRenderColorTexture]);
      }).toThrow();
    });

    it("创建降级-MSAA自动降级", () => {
      rhi.capability._maxAntiAliasing = 1;

      const renderTarget = new RenderTarget(engine, width, height, renderColorTexture, undefined, 2);

      expect(renderTarget.antiAliasing).toBe(1);
    });

    it("销毁", () => {
      const renderTarget = new RenderTarget(engine, width, height, renderColorTexture);

      expect(renderTarget.colorTextureCount).toBe(1);
      expect(renderTarget.getColorTexture()).toBe(renderColorTexture);

      renderTarget.destroy();

      expect(renderTarget.colorTextureCount).toBe(0);
      expect(renderTarget.getColorTexture()).toBeUndefined();
    });
  });
});
