import { RenderBufferDepthFormat } from "@alipay/o3-core";
import { Engine } from "@alipay/o3-core";
import gl from "gl";
import { RenderColorTexture } from "../src/RenderColorTexture";
import { RenderDepthTexture } from "../src/RenderDepthTexture";
import { RenderTarget } from "../src/RenderTarget";

describe("RenderTarget", () => {
  const width = 1024;
  const height = 1024;
  const rhi: any = {
    gl: gl(width, height),
    canIUse: jest.fn().mockReturnValue(true),
    capability: {
      maxAntiAliasing: 1
    }
  };
  // mock engine
  Engine.defaultCreateObjectEngine = <any>{
    _hardwareRenderer: rhi
  };
  rhi.gl.drawBuffers = rhi.gl.renderbufferStorageMultisample = jest.fn();

  beforeEach(() => {
    rhi.capability.maxAntiAliasing = 1;
    rhi.isWebGL2 = false;
  });

  describe("创建渲染目标", () => {
    const renderColorTexture = new RenderColorTexture(width, height);
    const renderColorTexture2 = new RenderColorTexture(width, height);
    const renderDepthTexture = new RenderDepthTexture(width, height);

    it("创建渲染目标-通过颜色纹理和深度格式", () => {
      const renderTarget = new RenderTarget(width, height, renderColorTexture);

      expect(renderTarget.colorTextureCount).toBe(1);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.depthTexture).toBeUndefined();
    });

    it("创建渲染目标-通过颜色纹理和深度纹理", () => {
      const renderTarget = new RenderTarget(width, height, renderColorTexture, renderDepthTexture);

      expect(renderTarget.colorTextureCount).toBe(1);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.depthTexture).toBe(renderDepthTexture);
    });

    it("创建渲染目标-只生成深度纹理", () => {
      const renderTarget = new RenderTarget(width, height, null, renderDepthTexture);
      expect(renderTarget.colorTextureCount).toBe(0);
      expect(renderTarget.getColorTexture(0)).toBeUndefined();
      expect(renderTarget.depthTexture).toBe(renderDepthTexture);
    });

    it("创建渲染目标-通过颜色纹理数组和深度格式", () => {
      const renderTarget = new RenderTarget(width, height, [renderColorTexture, renderColorTexture2]);

      expect(renderTarget.colorTextureCount).toBe(2);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.getColorTexture(1)).toBe(renderColorTexture2);
      expect(renderTarget.depthTexture).toBeUndefined();
    });

    it("创建渲染目标-通过颜色纹理数组和深度纹理", () => {
      const renderTarget = new RenderTarget(
        width,
        height,
        [renderColorTexture, renderColorTexture2],
        renderDepthTexture
      );

      expect(renderTarget.colorTextureCount).toBe(2);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.getColorTexture(1)).toBe(renderColorTexture2);
      expect(renderTarget.depthTexture).toBe(renderDepthTexture);
    });

    it("创建失败-不支持高精度深度缓冲", () => {
      expect(() => {
        new RenderTarget(width, height, renderColorTexture, RenderBufferDepthFormat.Depth32);
      }).toThrow();
    });

    it("创建失败-不支持高精度深度模版缓冲", () => {
      expect(() => {
        new RenderTarget(width, height, renderColorTexture, RenderBufferDepthFormat.Depth32Stencil8);
      }).toThrow();
    });

    it("创建失败-不支持MRT", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderTarget(width, height, [renderColorTexture, renderColorTexture2]);
      }).toThrow();
    });

    it("创建失败-不支持MRT+Cube+[,MSAA]", () => {
      expect(() => {
        const cubeRenderColorTexture = new RenderColorTexture(width, height, undefined, undefined, true);
        new RenderTarget(width, height, [renderColorTexture, cubeRenderColorTexture]);
      }).toThrow();
    });

    it("创建降级-MSAA自动降级", () => {
      const renderTarget = new RenderTarget(width, height, renderColorTexture, renderDepthTexture, 2);

      expect(renderTarget.antiAliasing).toBe(1);
    });

    it("销毁", () => {
      const renderTarget = new RenderTarget(width, height, renderColorTexture, renderDepthTexture);

      expect(renderTarget.colorTextureCount).toBe(1);
      expect(renderTarget.getColorTexture()).toBe(renderColorTexture);
      expect(renderTarget.depthTexture).toBe(renderDepthTexture);
      expect(renderTarget._frameBuffer).not.toBeNull();

      renderTarget.destroy();

      expect(renderTarget.colorTextureCount).toBe(0);
      expect(renderTarget.getColorTexture()).toBeUndefined();
      expect(renderTarget.depthTexture).toBeNull();
      expect(renderTarget._frameBuffer).toBeNull();
    });
  });
});
