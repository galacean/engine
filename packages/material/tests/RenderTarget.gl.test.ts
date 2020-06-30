import gl from "gl";
import { RenderTarget } from "../src/RenderTarget";
import { RenderColorTexture } from "../src/RenderColorTexture";
import { RenderDepthTexture } from "../src/RenderDepthTexture";
import { RenderBufferDepthFormat } from "@alipay/o3-base";

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

  rhi.gl.drawBuffers = rhi.gl.renderbufferStorageMultisample = jest.fn();

  beforeEach(() => {
    rhi.capability.maxAntiAliasing = 1;
    rhi.isWebGL2 = false;
  });

  it("向下兼容", () => {
    const oldRenderTarget = new RenderTarget("old", {
      enableDepthTexture: true
    });
    const newRenderTarget = new RenderTarget(rhi, width, height, null, new RenderDepthTexture(rhi, width, height));

    expect(oldRenderTarget.depthTexture).not.toBeUndefined();
    expect(oldRenderTarget.depthTextureNew).toBeUndefined();
    expect(newRenderTarget.depthTexture).toBeUndefined();
    expect(newRenderTarget.depthTextureNew).not.toBeUndefined();

    expect(oldRenderTarget.width).toBe(width);
    expect(oldRenderTarget.height).toBe(height);
    expect(newRenderTarget.width).toBe(width);
    expect(newRenderTarget.height).toBe(height);
  });

  describe("创建渲染目标", () => {
    const renderColorTexture = new RenderColorTexture(rhi, width, height);
    const renderColorTexture2 = new RenderColorTexture(rhi, width, height);
    const renderDepthTexture = new RenderDepthTexture(rhi, width, height);

    it("创建渲染目标-通过颜色纹理和深度格式", () => {
      const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture);

      expect(renderTarget.colorTextureCount).toBe(1);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.depthTextureNew).toBeUndefined();
    });

    it("创建渲染目标-通过颜色纹理和深度纹理", () => {
      const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture, renderDepthTexture);

      expect(renderTarget.colorTextureCount).toBe(1);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.depthTextureNew).toBe(renderDepthTexture);
    });

    it("创建渲染目标-只生成深度纹理", () => {
      const renderTarget = new RenderTarget(rhi, width, height, null, renderDepthTexture);
      expect(renderTarget.colorTextureCount).toBe(0);
      expect(renderTarget.getColorTexture(0)).toBeUndefined();
      expect(renderTarget.depthTextureNew).toBe(renderDepthTexture);
    });

    it("创建渲染目标-通过颜色纹理数组和深度格式", () => {
      const renderTarget = new RenderTarget(rhi, width, height, [renderColorTexture, renderColorTexture2]);

      expect(renderTarget.colorTextureCount).toBe(2);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.getColorTexture(1)).toBe(renderColorTexture2);
      expect(renderTarget.depthTextureNew).toBeUndefined();
    });

    it("创建渲染目标-通过颜色纹理数组和深度纹理", () => {
      const renderTarget = new RenderTarget(
        rhi,
        width,
        height,
        [renderColorTexture, renderColorTexture2],
        renderDepthTexture
      );

      expect(renderTarget.colorTextureCount).toBe(2);
      expect(renderTarget.getColorTexture(0)).toBe(renderColorTexture);
      expect(renderTarget.getColorTexture(1)).toBe(renderColorTexture2);
      expect(renderTarget.depthTextureNew).toBe(renderDepthTexture);
    });

    // todo: jest gl2 needed
    // it("创建抗锯齿渲染目标-MSAA", () => {
    //   rhi.capability.maxAntiAliasing = 16;

    //   const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture, renderDepthTexture, 4);

    //   assert(renderTarget.colorTextureCount === 1);
    //   assert(renderTarget.getColorTexture(0) == renderColorTexture);
    //   assert(renderTarget.depthTextureNew === renderDepthTexture);
    //   assert(renderTarget.antiAliasing === 4);
    // });

    it("创建失败-不支持高精度深度缓冲", () => {
      expect(() => {
        new RenderTarget(rhi, width, height, renderColorTexture, RenderBufferDepthFormat.Depth32);
      }).toThrow();
    });

    it("创建失败-不支持高精度深度模版缓冲", () => {
      expect(() => {
        new RenderTarget(rhi, width, height, renderColorTexture, RenderBufferDepthFormat.Depth32Stencil8);
      }).toThrow();
    });

    it("创建失败-不支持MRT", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderTarget(rhi, width, height, [renderColorTexture, renderColorTexture2]);
      }).toThrow();
    });

    it("创建失败-不支持MRT+Cube+[,MSAA]", () => {
      expect(() => {
        const cubeRenderColorTexture = new RenderColorTexture(rhi, width, height, undefined, undefined, true);
        new RenderTarget(rhi, width, height, [renderColorTexture, cubeRenderColorTexture]);
      }).toThrow();
    });

    it("创建降级-MSAA自动降级", () => {
      const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture, renderDepthTexture, 2);

      expect(renderTarget.antiAliasing).toBe(1);
    });

    it("销毁", () => {
      const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture, renderDepthTexture);

      expect(renderTarget.colorTextureCount).toBe(1);
      expect(renderTarget.getColorTexture()).toBe(renderColorTexture);
      expect(renderTarget.depthTextureNew).toBe(renderDepthTexture);
      expect(renderTarget._frameBuffer).not.toBeNull();

      renderTarget.destroy();

      expect(renderTarget.colorTextureCount).toBe(0);
      expect(renderTarget.getColorTexture()).toBeUndefined();
      expect(renderTarget.depthTextureNew).toBeNull();
      expect(renderTarget._frameBuffer).toBeNull();
    });
  });
});
