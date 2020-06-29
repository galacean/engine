import assert from "power-assert";
import gl from "gl";
import { TextureCubeMap } from "../src/TextureCubeMap";
import { TextureFormat, TextureCubeFace } from "@alipay/o3-base";

describe("TextureCubeMap", () => {
  const width = 1024;
  const height = 1024;
  const size = 1024;
  const rhi: any = {
    gl: gl(width, height),
    canIUse: jest.fn().mockReturnValue(true)
  };

  beforeEach(() => {
    rhi.isWebGL2 = false;
    delete rhi.gl.texStorage2D;
  });

  it("向下兼容", () => {
    const oldTexture = new TextureCubeMap("old");
    const newTexture = new TextureCubeMap(rhi, size);

    assert(oldTexture.format == null);
    assert(newTexture.format === TextureFormat.R8G8B8A8);
  });

  describe("格式测试", () => {
    it("不支持浮点纹理", () => {
      assert.throws(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new TextureCubeMap(rhi, size, TextureFormat.R32G32B32A32);
      });
    });
    it("引擎不支持的格式", () => {
      assert.throws(() => {
        new TextureCubeMap(rhi, size, 1234567);
      });
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi.isWebGL2 = true;
      rhi.gl.texStorage2D = function () {};

      const texture1 = new TextureCubeMap(rhi, 100);
      const texture2 = new TextureCubeMap(rhi, 100, undefined, true);

      assert(texture1.mipmapCount !== 1);
      assert(texture2.mipmapCount !== 1);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new TextureCubeMap(rhi, size, undefined, false);

      assert(texture.mipmapCount === 1);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      const texture1 = new TextureCubeMap(rhi, 100);
      const texture2 = new TextureCubeMap(rhi, 100, undefined, true);

      assert(texture1.mipmapCount === 1);
      assert(texture2.mipmapCount === 1);
    });
  });

  // todo: dom test

  describe("设置颜色缓冲", () => {
    const texture = new TextureCubeMap(rhi, size);
    const buffer = new Uint8Array(width * height * 4);

    it("默认匹配大小", () => {
      texture.setPixelBuffer(TextureCubeFace.PositiveX, buffer);
    });
    it("设置 mip 数据", () => {
      texture.setPixelBuffer(TextureCubeFace.PositiveX, buffer, 0);
    });
    it("手动设置偏移和宽高", () => {
      texture.setPixelBuffer(TextureCubeFace.PositiveX, buffer, 0, 0, 0, width, height);
    });
    it("设置cube的不同面", () => {
      texture.setPixelBuffer(TextureCubeFace.PositiveX, buffer, 0, 0, 0, width, height);
      texture.setPixelBuffer(TextureCubeFace.NegativeX, buffer, 0, 0, 0, width, height);
      texture.setPixelBuffer(TextureCubeFace.PositiveY, buffer, 0, 0, 0, width, height);
      texture.setPixelBuffer(TextureCubeFace.NegativeY, buffer, 0, 0, 0, width, height);
      texture.setPixelBuffer(TextureCubeFace.PositiveZ, buffer, 0, 0, 0, width, height);
      texture.setPixelBuffer(TextureCubeFace.NegativeZ, buffer, 0, 0, 0, width, height);
    });

    it("浮点纹理写入数据", () => {
      const texture = new TextureCubeMap(rhi, size, TextureFormat.R32G32B32A32);
      const buffer = new Float32Array(4);

      texture.setPixelBuffer(TextureCubeFace.PositiveX, buffer);
      texture.setPixelBuffer(TextureCubeFace.PositiveX, buffer, 1, 0, 0, 1, 1);
    });
  });

  describe("读取颜色缓冲", () => {
    it("异常-无法读取压缩纹理", () => {
      assert.throws(() => {
        const texture = new TextureCubeMap(rhi, size, TextureFormat.ETC2_RGBA8);
        const buffer = new Uint8Array(4);

        texture.getPixelBuffer(TextureCubeFace.PositiveX, 0, 0, 1, 1, buffer);
      });
    });
    it("读取成功", () => {
      const texture = new TextureCubeMap(rhi, size);
      const buffer = new Uint8Array(4);

      texture.setPixelBuffer(TextureCubeFace.PositiveX, new Uint8Array([1, 1, 1, 1]), 0, 0, 0, 1, 1);
      texture.setPixelBuffer(TextureCubeFace.NegativeX, new Uint8Array([2, 2, 2, 2]), 0, 0, 0, 1, 1);
      texture.setPixelBuffer(TextureCubeFace.PositiveY, new Uint8Array([3, 3, 3, 3]), 0, 0, 0, 1, 1);
      texture.setPixelBuffer(TextureCubeFace.NegativeY, new Uint8Array([4, 4, 4, 4]), 0, 0, 0, 1, 1);
      texture.setPixelBuffer(TextureCubeFace.PositiveZ, new Uint8Array([5, 5, 5, 5]), 0, 0, 0, 1, 1);
      texture.setPixelBuffer(TextureCubeFace.NegativeZ, new Uint8Array([6, 6, 6, 6]), 0, 0, 0, 1, 1);

      texture.getPixelBuffer(TextureCubeFace.PositiveX, 0, 0, 1, 1, buffer);
      assert(buffer[0] === 1);
      assert(buffer[1] === 1);
      assert(buffer[2] === 1);
      assert(buffer[3] === 1);
      texture.getPixelBuffer(TextureCubeFace.NegativeX, 0, 0, 1, 1, buffer);
      assert(buffer[0] === 2);
      assert(buffer[1] === 2);
      assert(buffer[2] === 2);
      assert(buffer[3] === 2);
      texture.getPixelBuffer(TextureCubeFace.PositiveY, 0, 0, 1, 1, buffer);
      assert(buffer[0] === 3);
      assert(buffer[1] === 3);
      assert(buffer[2] === 3);
      assert(buffer[3] === 3);
      texture.getPixelBuffer(TextureCubeFace.NegativeY, 0, 0, 1, 1, buffer);
      assert(buffer[0] === 4);
      assert(buffer[1] === 4);
      assert(buffer[2] === 4);
      assert(buffer[3] === 4);
      texture.getPixelBuffer(TextureCubeFace.PositiveZ, 0, 0, 1, 1, buffer);
      assert(buffer[0] === 5);
      assert(buffer[1] === 5);
      assert(buffer[2] === 5);
      assert(buffer[3] === 5);
      texture.getPixelBuffer(TextureCubeFace.NegativeZ, 0, 0, 1, 1, buffer);
      assert(buffer[0] === 6);
      assert(buffer[1] === 6);
      assert(buffer[2] === 6);
      assert(buffer[3] === 6);
    });
  });
});
