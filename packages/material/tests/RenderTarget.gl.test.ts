import assert from "power-assert";
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

    assert(oldRenderTarget.depthTexture);
    assert(oldRenderTarget.depthTextureNew == null);
    assert(newRenderTarget.depthTexture == null);
    assert(newRenderTarget.depthTextureNew);

    assert(oldRenderTarget.width == width);
    assert(oldRenderTarget.height == height);
    assert(newRenderTarget.width == width);
    assert(newRenderTarget.height == height);
  });

  describe("创建渲染目标", () => {
    const renderColorTexture = new RenderColorTexture(rhi, width, height);
    const renderColorTexture2 = new RenderColorTexture(rhi, width, height);
    const renderDepthTexture = new RenderDepthTexture(rhi, width, height);

    it("创建渲染目标-通过颜色纹理和深度格式", () => {
      const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture);

      assert(renderTarget.colorTextureCount === 1);
      assert(renderTarget.getColorTexture(0) === renderColorTexture);
      assert(renderTarget.depthTextureNew == null);
    });

    it("创建渲染目标-通过颜色纹理和深度纹理", () => {
      const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture, renderDepthTexture);

      assert(renderTarget.colorTextureCount === 1);
      assert(renderTarget.getColorTexture(0) === renderColorTexture);
      assert(renderTarget.depthTextureNew === renderDepthTexture);
    });

    it("创建渲染目标-只生成深度纹理", () => {
      const renderTarget = new RenderTarget(rhi, width, height, null, renderDepthTexture);

      assert(renderTarget.colorTextureCount === 0);
      assert(renderTarget.getColorTexture(0) == null);
      assert(renderTarget.depthTextureNew === renderDepthTexture);
    });

    it("创建渲染目标-通过颜色纹理数组和深度格式", () => {
      const renderTarget = new RenderTarget(rhi, width, height, [renderColorTexture, renderColorTexture2]);

      assert(renderTarget.colorTextureCount === 2);
      assert(renderTarget.getColorTexture(0) == renderColorTexture);
      assert(renderTarget.getColorTexture(1) == renderColorTexture2);
      assert(renderTarget.depthTextureNew == null);
    });

    it("创建渲染目标-通过颜色纹理数组和深度纹理", () => {
      const renderTarget = new RenderTarget(
        rhi,
        width,
        height,
        [renderColorTexture, renderColorTexture2],
        renderDepthTexture
      );

      assert(renderTarget.colorTextureCount === 2);
      assert(renderTarget.getColorTexture(0) == renderColorTexture);
      assert(renderTarget.getColorTexture(1) == renderColorTexture2);
      assert(renderTarget.depthTextureNew === renderDepthTexture);
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
      assert.throws(() => {
        new RenderTarget(rhi, width, height, renderColorTexture, RenderBufferDepthFormat.Depth32);
      });
    });

    it("创建失败-不支持高精度深度模版缓冲", () => {
      assert.throws(() => {
        new RenderTarget(rhi, width, height, renderColorTexture, RenderBufferDepthFormat.Depth32Stencil8);
      });
    });

    it("创建失败-不支持MRT", () => {
      assert.throws(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderTarget(rhi, width, height, [renderColorTexture, renderColorTexture2]);
      });
    });

    it("创建失败-不支持MRT+Cube+[,MSAA]", () => {
      assert.throws(() => {
        const cubeRenderColorTexture = new RenderColorTexture(rhi, width, height, undefined, undefined, true);

        new RenderTarget(rhi, width, height, [renderColorTexture, cubeRenderColorTexture]);
      });
    });

    it("创建降级-MSAA自动降级", () => {
      const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture, renderDepthTexture, 2);

      assert(renderTarget.antiAliasing === 1);
    });

    it("销毁", () => {
      const renderTarget = new RenderTarget(rhi, width, height, renderColorTexture, renderDepthTexture);

      assert(renderTarget.colorTextureCount === 1);
      assert(renderTarget.getColorTexture() === renderColorTexture);
      assert(renderTarget.depthTextureNew === renderDepthTexture);
      assert(renderTarget._frameBuffer);

      renderTarget.destroy();

      assert(renderTarget.colorTextureCount === 0);
      assert(renderTarget.getColorTexture() == null);
      assert(renderTarget.depthTextureNew == null);
      assert(renderTarget._frameBuffer == null);
    });
  });
});
