import { Engine, RenderBufferDepthFormat } from "@alipay/o3-core";
import gl from "gl";
import { RenderDepthTexture } from "../src/RenderDepthTexture";

describe("RenderDepthTexture", () => {
  const width = 1024;
  const height = 1024;
  const rhi: any = {
    gl: gl(width, height),
    canIUse: jest.fn().mockReturnValue(true)
  };
  // mock engine
  const engine = new Engine(null, {
    init: jest.fn()
  });
  engine._hardwareRenderer = rhi;
  beforeEach(() => {
    rhi.isWebGL2 = false;
    delete rhi.gl.texStorage2D;
  });

  it("cube", () => {
    const texture = new RenderDepthTexture(width, height);
    const cubeTexture = new RenderDepthTexture(width, height, undefined, undefined, true);

    expect(texture._isCube).toBe(false);
    expect(cubeTexture._isCube).toBe(true);
    expect(() => {
      new RenderDepthTexture(100, 200, undefined, undefined, true);
    }).toThrow();
  });

  describe("格式测试", () => {
    it("不支持单独生成模版纹理", () => {
      expect(() => {
        new RenderDepthTexture(width, height, RenderBufferDepthFormat.Stencil);
      }).toThrow();
    });
    it("不支持生成深度纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderDepthTexture(width, height, RenderBufferDepthFormat.Depth);
      }).toThrow();
    });
    it("不支持生成高精度深度纹理", () => {
      expect(() => {
        new RenderDepthTexture(width, height, RenderBufferDepthFormat.Depth32);
      }).toThrow();
    });
    it("不支持生成高精度深度模版纹理", () => {
      expect(() => {
        new RenderDepthTexture(width, height, RenderBufferDepthFormat.Depth32Stencil8);
      }).toThrow();
    });
    it("引擎不支持的格式", () => {
      expect(() => {
        new RenderDepthTexture(width, height, 1234567);
      }).toThrow();
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi.isWebGL2 = true;
      rhi.gl.texStorage2D = function () {};

      const texture = new RenderDepthTexture(100, 100, undefined, true);
      expect(texture.mipmapCount).not.toBe(1);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new RenderDepthTexture(width, height, undefined, false);
      expect(texture.mipmapCount).toBe(1);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      const texture = new RenderDepthTexture(100, 100, undefined, true);
      expect(texture.mipmapCount).toBe(1);
    });
  });
});
