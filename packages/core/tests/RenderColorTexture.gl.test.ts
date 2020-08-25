import { Engine, RenderBufferColorFormat } from "@alipay/o3-core";
import gl from "gl";
import { RenderColorTexture } from "../src/RenderColorTexture";

describe("RenderColorTexture", () => {
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
    const texture = new RenderColorTexture(width, height);
    const cubeTexture = new RenderColorTexture(width, height, undefined, undefined, true);
    expect(texture._isCube).toBe(false);
    expect(cubeTexture._isCube).toBe(true);
    expect(() => {
      new RenderColorTexture(100, 200, undefined, undefined, true);
    }).toThrow();
  });

  describe("格式测试", () => {
    it("不支持浮点纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderColorTexture(width, height, RenderBufferColorFormat.R32G32B32A32);
      }).toThrow();
    });
    it("不支持半浮点纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderColorTexture(width, height, RenderBufferColorFormat.R16G16B16A16);
      }).toThrow();
    });
    it("引擎不支持的格式", () => {
      expect(() => {
        new RenderColorTexture(width, height, 1234567);
      }).toThrow();
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi.isWebGL2 = true;
      rhi.gl.texStorage2D = function () {};

      const texture = new RenderColorTexture(100, 100, undefined, true);
      expect(texture.mipmapCount).not.toBe(1);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new RenderColorTexture(width, height, undefined, false);
      expect(texture.mipmapCount).toBe(1);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      const texture = new RenderColorTexture(100, 100, undefined, true);
      expect(texture.mipmapCount).toBe(1);
    });
  });
});
