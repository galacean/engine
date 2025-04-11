import { Engine, Texture2D, TextureFormat } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("Texture2D", () => {
  const width = 1024;
  const height = 1024;

  const canvas = document.createElement("canvas");

  let engine: Engine;
  let rhi: any;
  let isWebGL2: boolean;
  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: canvas });
    // @ts-ignore
    rhi = engine._hardwareRenderer;
    isWebGL2 = rhi.isWebGL2;
  });

  beforeEach(() => {
    rhi._isWebGL2 = isWebGL2;
  });

  describe("格式测试", () => {
    it("不支持浮点纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new Texture2D(engine, width, height, TextureFormat.R32G32B32A32, undefined, false);
      }).to.throw;
    });
    it("引擎不支持的格式", () => {
      expect(() => {
        new Texture2D(engine, width, height, 1234567 as any, undefined, false);
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
    it("设置数据", () => {
      const texture = new Texture2D(engine, width, height);
      const buffer = new Uint8Array(width * height * 4);
      expect(() => {
        texture.setPixelBuffer(buffer);
      }).not.to.throw;

      expect(() => {
        texture.setPixelBuffer(buffer, 1);
      }).not.to.throw;

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
    it("读取 R8G8B8A8 成功", () => {
      const texture = new Texture2D(engine, width, height);
      const buffer = new Uint8Array(4);

      texture.setPixelBuffer(new Uint8Array([1, 2, 3, 4]), 0, 5, 0, 1, 1);
      texture.getPixelBuffer(5, 0, 1, 1, buffer);

      expect(buffer[0]).to.eq(1);
      expect(buffer[1]).to.eq(2);
      expect(buffer[2]).to.eq(3);
      expect(buffer[3]).to.eq(4);
    });

    it("读取 R8G8 成功", () => {
      const texture = new Texture2D(engine, width, height, TextureFormat.R8G8);
      const buffer = new Uint8Array(8);

      texture.setPixelBuffer(new Uint8Array([1, 2, 3, 4, 7, 4, 3, 3]), 0, 5, 0, 2, 2);
      texture.getPixelBuffer(5, 0, 2, 2, buffer);

      expect(buffer[0]).to.eq(1);
      expect(buffer[1]).to.eq(2);
      expect(buffer[2]).to.eq(3);
      expect(buffer[3]).to.eq(4);
      expect(buffer[4]).to.eq(7);
      expect(buffer[5]).to.eq(4);
      expect(buffer[6]).to.eq(3);
      expect(buffer[7]).to.eq(3);
    });

    it("读取 R8 成功", () => {
      const texture = new Texture2D(engine, width, height, TextureFormat.R8);
      const buffer = new Uint8Array(4);

      texture.setPixelBuffer(new Uint8Array([1, 6, 8, 4]), 0, 5, 0, 2, 2);
      texture.getPixelBuffer(5, 0, 2, 2, buffer);

      expect(buffer[0]).to.eq(1);
      expect(buffer[1]).to.eq(6);
      expect(buffer[2]).to.eq(8);
      expect(buffer[3]).to.eq(4);
    });
  });

  describe("sRGB", () => {
    it("默认 sRGB", () => {
      const texture = new Texture2D(engine, width, height);

      expect(texture.isSRGBColorSpace).to.true;
      expect(texture.mipmapCount).not.to.eq(1);

      const RGBTexture = new Texture2D(engine, width, height, TextureFormat.R8G8B8, true, true);
      expect(RGBTexture.isSRGBColorSpace).to.true;

      // no downgrade mipmap
      expect(RGBTexture.mipmapCount).to.eq(11);
    });
  });
});
