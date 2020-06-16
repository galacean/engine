import assert from "power-assert";
import gl from "gl";
import { Texture2D } from "../src/Texture2D";
import { TextureFormat } from "@alipay/o3-base";

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

  it("向下兼容", () => {
    const oldTexture = new Texture2D("old");
    const newTexture = new Texture2D(rhi, width, height);

    assert(oldTexture.format == null);
    assert(newTexture.format === TextureFormat.R8G8B8A8);
  });

  describe("格式测试", () => {
    it("不支持浮点纹理", () => {
      rhi.canIUse.mockReturnValueOnce(false);

      try {
        new Texture2D(rhi, width, height, TextureFormat.R32G32B32A32);
        assert(false, "should throw error");
      } catch (e) {
        assert(e.message);
      }
    });
    it("引擎不支持的格式", () => {
      try {
        new Texture2D(rhi, width, height, 1234567);
        assert(false, "should throw error");
      } catch (e) {
        assert(e.message);
      }
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi.isWebGL2 = true;
      rhi.gl.texStorage2D = function() {};

      const texture1 = new Texture2D(rhi, width, height);
      const texture2 = new Texture2D(rhi, width, height, undefined, true);

      assert(texture1._mipmap === true);
      assert(texture2._mipmap === true);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new Texture2D(rhi, width, height, undefined, false);

      assert(texture._mipmap === false);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      const texture1 = new Texture2D(rhi, 100, 100);
      const texture2 = new Texture2D(rhi, 100, 100, undefined, true);

      assert(texture1._mipmap === false);
      assert(texture2._mipmap === false);
    });
  });

  // it("设置图源", () => {
  //   const img: HTMLImageElement = null;
  //   const texture = new Texture2D(rhi, width, height);

  //   texture.setImageSource(img);
  // });

  describe("设置颜色缓冲", () => {
    const texture = new Texture2D(rhi, width, height);
    const buffer = new Uint8Array(width * height * 4);

    it("默认匹配大小", () => {
      texture.setPixelBuffer(buffer);
    });
    it("设置 mip 数据", () => {
      texture.setPixelBuffer(buffer, 1);
    });
    it("手动设置偏移和宽高", () => {
      texture.setPixelBuffer(buffer, 1, 0, 0, width, height);
    });
    it("浮点纹理写入数据", () => {
      const texture = new Texture2D(rhi, width, height, TextureFormat.R32G32B32A32);
      const buffer = new Float32Array(4);

      texture.setPixelBuffer(buffer);
      texture.setPixelBuffer(buffer, 1, 0, 0, 1, 1);
    });
  });

  describe("读取颜色缓冲", () => {
    it("异常-无法读取压缩纹理", () => {
      try {
        new Texture2D(rhi, width, height, TextureFormat.ETC2_RGBA8);
        assert(false, "should throw error");
      } catch (e) {
        assert(e.message);
      }
    });
    it("读取成功", () => {
      const texture = new Texture2D(rhi, width, height);
      const buffer = new Uint8Array(4);

      texture.setPixelBuffer(new Uint8Array([1, 2, 3, 4]), 0, 5, 0, 1, 1);
      texture.getPixelsBuffer(5, 0, 1, 1, buffer);
      assert(buffer[0] === 1);
      assert(buffer[1] === 2);
      assert(buffer[2] === 3);
      assert(buffer[3] === 4);
    });
  });
});
