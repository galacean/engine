import assert from "power-assert";
import gl from "gl";
import { RenderColorTexture } from "../src/RenderColorTexture";
import { RenderBufferColorFormat } from "@alipay/o3-base";

describe("Texture2D", () => {
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
    const texture = new RenderColorTexture(rhi, width, height);
    const cubeTexture = new RenderColorTexture(rhi, width, height, undefined, undefined, true);

    assert(texture._isCube == false);
    assert(cubeTexture._isCube === true);
    assert.throws(() => {
      new RenderColorTexture(rhi, 100, 200, undefined, undefined, true);
    });
  });

  describe("格式测试", () => {
    it("不支持浮点纹理", () => {
      assert.throws(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderColorTexture(rhi, width, height, RenderBufferColorFormat.R32G32B32A32);
      });
    });
    it("不支持半浮点纹理", () => {
      assert.throws(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderColorTexture(rhi, width, height, RenderBufferColorFormat.R16G16B16A16);
      });
    });
    it("引擎不支持的格式", () => {
      assert.throws(() => {
        new RenderColorTexture(rhi, width, height, 1234567);
      });
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi.isWebGL2 = true;
      rhi.gl.texStorage2D = function() {};

      const texture = new RenderColorTexture(rhi, 100, 100, undefined, true);

      assert(texture.mipmapCount !== 1);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new RenderColorTexture(rhi, width, height, undefined, false);

      assert(texture.mipmapCount === 1);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      const texture = new RenderColorTexture(rhi, 100, 100, undefined, true);

      assert(texture.mipmapCount === 1);
    });
  });
});
