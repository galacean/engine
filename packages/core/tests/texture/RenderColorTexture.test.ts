// @ts-nocheck
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { RenderBufferColorFormat, RenderColorTexture } from "../../src/texture";

describe("RenderColorTexture", () => {
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
    const texture = new RenderColorTexture(engine, width, height);
    const cubeTexture = new RenderColorTexture(engine, width, height, undefined, undefined, true);
    expect(texture.isCube).toBe(false);
    expect(cubeTexture.isCube).toBe(true);
    expect(() => {
      new RenderColorTexture(engine, 100, 200, undefined, undefined, true);
    }).toThrow();
  });

  describe("格式测试", () => {
    it("不支持浮点纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderColorTexture(engine, width, height, RenderBufferColorFormat.R32G32B32A32);
      }).toThrow();
    });
    it("不支持半浮点纹理", () => {
      expect(() => {
        rhi.canIUse.mockReturnValueOnce(false);
        new RenderColorTexture(engine, width, height, RenderBufferColorFormat.R16G16B16A16);
      }).toThrow();
    });
    it("引擎不支持的格式", () => {
      expect(() => {
        new RenderColorTexture(engine, width, height, 1234567);
      }).toThrow();
    });
  });

  describe("mipmap", () => {
    it("webgl2 支持非2次幂开启 mipmap ", () => {
      rhi._isWebGL2 = true;

      const texture = new RenderColorTexture(engine, 100, 100, undefined, true);
      expect(texture.mipmapCount).not.toBe(1);
    });
    it("关闭 mipmap 成功", () => {
      const texture = new RenderColorTexture(engine, width, height, undefined, false);
      expect(texture.mipmapCount).toBe(1);
    });
    it("webgl1 开启 mipmap 失败自动降级 - 非2次幂图片", () => {
      rhi._isWebGL2 = false;

      const texture = new RenderColorTexture(engine, 100, 100, undefined, true);
      expect(texture.mipmapCount).toBe(1);
    });
  });
});
