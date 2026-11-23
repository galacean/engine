import { AssetPromise, AssetType, ResourceManager, SpriteAtlas, Texture2D, WebGLEngine } from "@galacean/engine";
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
    // @ts-ignore -- loaders are registered in ResourceManager's internal registry
    const textureLoaderSpy = vi
      .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
      .mockImplementation((item, manager) => {
        // @ts-ignore -- exercise ResourceManager's virtual-to-transport mapping boundary
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

  it("retains in-flight pages across concurrent gc() and cleans up on cancel", async () => {
    const resourceManager = engine.resourceManager;
    const page0Tex = new Texture2D(engine, 16, 16);
    let resolvePage1!: (tex: Texture2D) => void;
    let cancelPage1Spy = vi.fn();

    const requestSpy = vi.spyOn(resourceManager as any, "_requestByRemoteUrl").mockImplementation(() => {
      return AssetPromise.resolve({
        atlasItems: [
          {
            img: "./page0.png",
            sprites: [{ name: "s0", atlasRegion: { x: 0, y: 0, w: 8, h: 8 } }]
          },
          {
            img: "./page1.png",
            sprites: [{ name: "s1", atlasRegion: { x: 0, y: 0, w: 8, h: 8 } }]
          }
        ]
      });
    });
    // @ts-ignore -- mock texture loader to stage page0 before page1
    const textureLoaderSpy = vi
      .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
      .mockImplementation((item) => {
        if (item.url!.endsWith("page0.png")) {
          return AssetPromise.resolve(page0Tex);
        }
        return new AssetPromise<Texture2D>((resolve, _reject, _c, _d, onCancel) => {
          resolvePage1 = resolve;
          onCancel(cancelPage1Spy);
        });
      });

    try {
      const loadPromise = resourceManager.load<SpriteAtlas>({
        url: "https://example.com/in-flight/ui.atlas",
        type: AssetType.SpriteAtlas
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Concurrent gc() mid-load must not destroy the in-flight atlas, page0 texture, or sprite0
      resourceManager.gc();
      expect(page0Tex.destroyed).to.equal(false);

      const page1Tex = new Texture2D(engine, 16, 16);
      resolvePage1(page1Tex);
      const atlas = await loadPromise;
      expect(atlas.destroyed).to.equal(false);
      expect(atlas.refCount).to.equal(0);
      expect(atlas.getSprite("s0")?.texture).to.equal(page0Tex);
      expect(atlas.getSprite("s1")?.texture).to.equal(page1Tex);

      // Pinning atlas protects both pages across gc(); unpinning sweeps all in one pass
      atlas.isGCIgnored = true;
      resourceManager.gc();
      expect(page0Tex.destroyed).to.equal(false);
      expect(page1Tex.destroyed).to.equal(false);

      atlas.isGCIgnored = false;
      resourceManager.gc();
      expect(atlas.destroyed).to.equal(true);
      expect(page0Tex.destroyed).to.equal(true);
      expect(page1Tex.destroyed).to.equal(true);

      // Canceling mid-load destroys partial atlas/sprites and cancels pending page loads
      cancelPage1Spy = vi.fn();
      const cancelPage0Tex = new Texture2D(engine, 16, 16);
      textureLoaderSpy.mockImplementation((item) => {
        if (item.url!.endsWith("page0.png")) {
          return AssetPromise.resolve(cancelPage0Tex);
        }
        return new AssetPromise<Texture2D>((_resolve, _reject, _c, _d, onCancel) => {
          onCancel(cancelPage1Spy);
        });
      });

      const canceledPromise = resourceManager.load<SpriteAtlas>({
        url: "https://example.com/canceled/ui.atlas",
        type: AssetType.SpriteAtlas
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      canceledPromise.cancel();
      await expect(canceledPromise).rejects.toBe("canceled");
      expect(cancelPage1Spy).toHaveBeenCalledOnce();
      resourceManager.gc();
      expect(cancelPage0Tex.destroyed).to.equal(true);
    } finally {
      requestSpy.mockRestore();
      textureLoaderSpy.mockRestore();
    }
  });
});
