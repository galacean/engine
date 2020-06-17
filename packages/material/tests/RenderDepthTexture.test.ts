import assert from "power-assert";
import gl from "gl";
import { RenderDepthTexture } from "../src/RenderDepthTexture";
import { RenderBufferDepthFormat } from "@alipay/o3-base";

describe("RenderDepthTexture", () => {
  const width = 1024;
  const height = 1024;
  const rhi: any = {
    gl: gl(width, height),
    canIUse: jest.fn().mockReturnValue(true)
  };

  beforeEach(() => {
    rhi.isWebGL2 = false;
    delete rhi.gl.texStorage2D;
  });

  it("cube", () => {
    const texture = new RenderDepthTexture(rhi, width, height);
    const cubeTexture = new RenderDepthTexture(rhi, width, height, undefined, undefined, true);

    assert(texture._isCube == false);
    assert(cubeTexture._isCube === true);
    assert.throws(() => {
      new RenderDepthTexture(rhi, 100, 200, undefined, undefined, true);
    });
  });

  describe("格式测试", () => {
    it("不支持单独生成模版纹理", () => {
      assert.throws(() => {
        new RenderDepthTexture(rhi, width, height, RenderBufferDepthFormat.Stencil);
      });
    });
    it("不支持生成深度纹理", () => {
      assert.throws(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderDepthTexture(rhi, width, height, RenderBufferDepthFormat.Depth);
      });
    });
    it("不支持生成高精度深度纹理", () => {
      assert.throws(() => {
        new RenderDepthTexture(rhi, width, height, RenderBufferDepthFormat.Depth32);
      });
    });
    it("不支持生成高精度深度模版纹理", () => {
      assert.throws(() => {
        new RenderDepthTexture(rhi, width, height, RenderBufferDepthFormat.Depth32Stencil8);
      });
    });
    it("引擎不支持的格式", () => {
      assert.throws(() => {
        new RenderDepthTexture(rhi, width, height, 1234567);
      });
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi.isWebGL2 = true;
      rhi.gl.texStorage2D = function() {};

      const texture = new RenderDepthTexture(rhi, 100, 100, undefined, true);

      assert(texture.mipmapCount !== 1);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new RenderDepthTexture(rhi, width, height, undefined, false);

      assert(texture.mipmapCount === 1);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      const texture = new RenderDepthTexture(rhi, 100, 100, undefined, true);

      assert(texture.mipmapCount === 1);
    });
  });
});
