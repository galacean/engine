// @ts-nocheck
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { RenderBufferDepthFormat, RenderDepthTexture } from "../../src/texture";

describe("RenderDepthTexture", () => {
  const width = 1024;
  const height = 1024;

  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);
  const rhi = engine._hardwareRenderer;
  const isWebGL2 = rhi.isWebGL2;

  beforeEach(() => {
    rhi._isWebGL2 = isWebGL2;
  });

  it("cube", () => {
    const texture = new RenderDepthTexture(engine, width, height);
    const cubeTexture = new RenderDepthTexture(engine, width, height, undefined, undefined, true);

    expect(texture.isCube).toBe(false);
    expect(cubeTexture.isCube).toBe(true);
    expect(() => {
      new RenderDepthTexture(engine, 100, 200, undefined, undefined, true);
    }).toThrow();
  });

  describe("格式测试", () => {
    it("不支持单独生成模版纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderDepthTexture(engine, width, height, RenderBufferDepthFormat.Stencil);
      }).toThrow();
    });
    it("不支持生成深度纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderDepthTexture(engine, width, height, RenderBufferDepthFormat.Depth);
      }).toThrow();
    });
    it("不支持生成高精度深度纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderDepthTexture(engine, width, height, RenderBufferDepthFormat.Depth32);
      }).toThrow();
    });
    it("不支持生成高精度深度模版纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderDepthTexture(engine, width, height, RenderBufferDepthFormat.Depth32Stencil8);
      }).toThrow();
    });
    it("引擎不支持的格式", () => {
      expect(() => {
        new RenderDepthTexture(engine, width, height, 1234567);
      }).toThrow();
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi._isWebGL2 = true;
      rhi.gl.texStorage2D = function () {};

      const texture = new RenderDepthTexture(engine, 100, 100, undefined, true);
      expect(texture.mipmapCount).not.toBe(1);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new RenderDepthTexture(engine, width, height, undefined, false);
      expect(texture.mipmapCount).toBe(1);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      rhi._isWebGL2 = false;

      const texture = new RenderDepthTexture(engine, 100, 100, undefined, true);
      expect(texture.mipmapCount).toBe(1);
    });
  });
});
