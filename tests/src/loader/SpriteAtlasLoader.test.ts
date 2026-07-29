import { AssetPromise, AssetType, ResourceManager, Texture2D, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let engine: WebGLEngine;

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

afterAll(() => {
  engine.destroy();
});

describe("SpriteAtlasLoader", () => {
  it("keeps virtual atlas page paths resolvable when a base URL is configured", async () => {
    const resourceManager = engine.resourceManager;
    const atlasVirtualPath = "SpriteAtlas/Migrated/BaseUrl/ui.atlas";
    const pageVirtualPath = "SpriteAtlas/Migrated/BaseUrl/ui_image_0.tex";
    const atlasPhysicalPath = "blob:https://local.alipay.net/atlas";
    const pagePhysicalPath = "blob:https://local.alipay.net/atlas-page";
    resourceManager.registerVirtualResources([
      { virtualPath: atlasVirtualPath, path: atlasPhysicalPath, type: AssetType.SpriteAtlas },
      { virtualPath: pageVirtualPath, path: pagePhysicalPath, type: AssetType.Texture }
    ]);
    resourceManager.baseUrl = "https://base.example.com/project/";

    const requestSpy = vi.spyOn(resourceManager as any, "_requestByRemoteUrl").mockImplementation((url: string) => {
      return new AssetPromise((resolve, reject) => {
        if (url === atlasPhysicalPath) {
          resolve({ atlasItems: [{ img: "./ui_image_0.tex", sprites: [] }] });
        } else if (url === pagePhysicalPath) {
          resolve(new ArrayBuffer(0));
        } else {
          reject(new Error(`Unexpected transport URL: ${url}`));
        }
      });
    });
    // @ts-ignore -- 需要替换内部 Texture Loader，隔离图片解码并观察页面资源请求
    const textureLoaderSpy = vi
      .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
      .mockImplementation((item, manager) => {
        // @ts-ignore -- 通过内部请求入口验证逻辑路径只在 I/O 边界映射为物理地址
        return manager._request(item.url, { ...item, type: "arraybuffer" }).then(() => new Texture2D(engine, 1, 1));
      });

    try {
      await resourceManager.load({ url: atlasVirtualPath });

      expect(requestSpy).toHaveBeenCalledWith(atlasPhysicalPath, expect.objectContaining({ type: "json" }));
      expect(requestSpy).toHaveBeenCalledWith(pagePhysicalPath, expect.objectContaining({ type: "arraybuffer" }));
      expect(textureLoaderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: pageVirtualPath,
          type: AssetType.Texture
        }),
        resourceManager
      );
    } finally {
      resourceManager.baseUrl = null;
      requestSpy.mockRestore();
      textureLoaderSpy.mockRestore();
    }
  });
});
