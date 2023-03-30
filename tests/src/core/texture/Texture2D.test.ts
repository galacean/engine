import { Texture2D, TextureFormat } from "@oasis-engine/core";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { expect } from "chai";

describe("Texture2D", () => {
  const width = 1024;
  const height = 1024;

  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);
  const rhi = engine._hardwareRenderer;
  const isWebGL2 = rhi.isWebGL2;

  beforeEach(() => {
    rhi._isWebGL2 = isWebGL2;
  });

  describe("格式测试", () => {
    it("不支持浮点纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new Texture2D(engine, width, height, TextureFormat.R32G32B32A32);
      }).to.throw;
    });
    it("引擎不支持的格式", () => {
      expect(() => {
        new Texture2D(engine, width, height, 1234567);
      }).to.throw;
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi._isWebGL2 = true;

      const texture1 = new Texture2D(engine, 100, 100);
      const texture2 = new Texture2D(engine, 100, 100, undefined, true);

      expect(texture1.mipmapCount).not.to.eq(1);
      expect(texture2.mipmapCount).not.to.eq(1);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new Texture2D(engine, width, height, undefined, false);

      expect(texture.mipmapCount).to.eq(1);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      rhi._isWebGL2 = false;

      const texture1 = new Texture2D(engine, 100, 100);
      const texture2 = new Texture2D(engine, 100, 100, undefined, true);

      expect(texture1.mipmapCount).to.eq(1);
      expect(texture2.mipmapCount).to.eq(1);
    });
  });

  describe("设置颜色缓冲", () => {
    const texture = new Texture2D(engine, width, height);
    const buffer = new Uint8Array(width * height * 4);

    it("默认匹配大小", () => {
      expect(() => {
        texture.setPixelBuffer(buffer);
      }).not.to.throw;
    });
    it("设置 mip 数据", () => {
      expect(() => {
        texture.setPixelBuffer(buffer, 1);
      }).not.to.throw;
    });
    it("手动设置偏移和宽高", () => {
      expect(() => {
        texture.setPixelBuffer(buffer, 1, 0, 0, width, height);
      }).not.to.throw;
    });
    it("浮点纹理写入数据", () => {
      expect(() => {
        const texture = new Texture2D(engine, width, height, TextureFormat.R32G32B32A32);
        const buffer = new Float32Array(4);

        texture.setPixelBuffer(buffer);
        texture.setPixelBuffer(buffer, 1, 0, 0, 1, 1);
      }).not.to.throw;
    });
  });

  describe("读取颜色缓冲", () => {
    it("异常-无法读取压缩纹理", () => {
      expect(() => {
        const texture = new Texture2D(engine, width, height, TextureFormat.ETC2_RGBA8);
        const buffer = new Uint8Array(4);

        texture.getPixelBuffer(0, 0, 1, 1, buffer);
      }).to.throw;
    });
    it("读取成功", () => {
      const texture = new Texture2D(engine, width, height);
      const buffer = new Uint8Array(4);

      texture.setPixelBuffer(new Uint8Array([1, 2, 3, 4]), 0, 5, 0, 1, 1);
      texture.getPixelBuffer(5, 0, 1, 1, buffer);

      expect(buffer[0]).to.eq(1);
      expect(buffer[1]).to.eq(2);
      expect(buffer[2]).to.eq(3);
      expect(buffer[3]).to.eq(4);
    });
  });
});
