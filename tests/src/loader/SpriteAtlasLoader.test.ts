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

  it("protects in-flight multi-page atlas from concurrent gc() and isolates cancel when sharing page texture", async () => {
    const resourceManager = engine.resourceManager;
    const atlasAUrl = "mock/atlas/shared-a.atlas";
    const atlasBUrl = "mock/atlas/shared-b.atlas";
    const sharedPageUrl = "mock/atlas/shared-page.png";
    const secondPageUrl = "mock/atlas/second-page.png";

    let resolveSharedPage!: (tex: Texture2D) => void;
    let resolveSecondPage!: (tex: Texture2D) => void;
    let sharedLoadCalls = 0;

    const requestSpy = vi.spyOn(resourceManager as any, "_requestByRemoteUrl").mockImplementation((url: string) => {
      if (url === atlasAUrl) {
        return AssetPromise.resolve({
          atlasItems: [
            {
              img: "second-page.png",
              sprites: [
                { name: "a_page0", region: { x: 0, y: 0, w: 1, h: 1 }, atlasRegion: { x: 0, y: 0, w: 1, h: 1 } }
              ]
            },
            {
              img: "shared-page.png",
              sprites: [
                { name: "a_page1", region: { x: 0, y: 0, w: 1, h: 1 }, atlasRegion: { x: 0, y: 0, w: 1, h: 1 } }
              ]
            }
          ]
        });
      }
      if (url === atlasBUrl) {
        return AssetPromise.resolve({
          atlasItems: [
            {
              img: "shared-page.png",
              sprites: [
                { name: "b_page0", region: { x: 0, y: 0, w: 1, h: 1 }, atlasRegion: { x: 0, y: 0, w: 1, h: 1 } }
              ]
            }
          ]
        });
      }
      return AssetPromise.reject(new Error(`Unexpected request: ${url}`));
    });

    // @ts-ignore -- mock texture loader for deterministic multi-page timing
    const textureLoaderSpy = vi
      .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
      .mockImplementation((item) => {
        if (item.url === sharedPageUrl) {
          sharedLoadCalls++;
          return new AssetPromise<Texture2D>((resolve) => {
            resolveSharedPage = resolve;
          });
        }
        if (item.url === secondPageUrl) {
          return new AssetPromise<Texture2D>((resolve) => {
            resolveSecondPage = resolve;
          });
        }
        return AssetPromise.reject(new Error(`Unexpected texture: ${item.url}`));
      });

    try {
      const taskA = resourceManager.load({ url: atlasAUrl, type: AssetType.SpriteAtlas });
      const taskB = resourceManager.load({ url: atlasBUrl, type: AssetType.SpriteAtlas });

      // Wait one microtask for atlas configs to resolve and initiate page loads
      await Promise.resolve();
      await Promise.resolve();
      expect(sharedLoadCalls).to.equal(1);

      // Finish atlasA's first page, then run gc() while shared page is still in flight
      const page0Tex = new Texture2D(engine, 2, 2);
      resolveSecondPage(page0Tex);
      await Promise.resolve();
      await Promise.resolve();

      resourceManager.gc();
      expect(page0Tex.destroyed).to.be.false;

      // Canceling atlasA must clean up atlasA's partial state without canceling shared page load for atlasB
      const cancelledA = taskA.catch((e) => e);
      taskA.cancel();
      expect(await cancelledA).to.equal("canceled");

      const sharedTex = new Texture2D(engine, 2, 2);
      resolveSharedPage(sharedTex);

      const atlasB: any = await taskB;
      expect(atlasB.destroyed).to.be.false;
      expect(atlasB.refCount).to.equal(0);
      expect(atlasB.isGCIgnored).to.be.false;
      expect(atlasB.getSprite("b_page0")?.texture).to.equal(sharedTex);

      // page0Tex was detached when atlasA aborted and is collected by gc(); atlasB + sharedTex survive when pinned
      atlasB.isGCIgnored = true;
      resourceManager.gc();
      expect(page0Tex.destroyed).to.be.true;
      expect(atlasB.destroyed).to.be.false;
      expect(sharedTex.destroyed).to.be.false;

      atlasB.isGCIgnored = false;
      resourceManager.gc();
      expect(atlasB.destroyed).to.be.true;
      expect(sharedTex.destroyed).to.be.true;
    } finally {
      requestSpy.mockRestore();
      textureLoaderSpy.mockRestore();
    }
  });

  it("cleans up partial atlas state when a later page texture fails to load", async () => {
    const resourceManager = engine.resourceManager;
    const atlasUrl = "mock/atlas/failing.atlas";
    const okPageUrl = "mock/atlas/ok-page.png";
    const failPageUrl = "mock/atlas/fail-page.png";
    let rejectFailPage!: (err: Error) => void;
    const okTex = new Texture2D(engine, 2, 2);

    const requestSpy = vi.spyOn(resourceManager as any, "_requestByRemoteUrl").mockImplementation((url: string) => {
      if (url === atlasUrl) {
        return AssetPromise.resolve({
          atlasItems: [
            {
              img: "ok-page.png",
              sprites: [{ name: "s_ok", region: { x: 0, y: 0, w: 1, h: 1 }, atlasRegion: { x: 0, y: 0, w: 1, h: 1 } }]
            },
            {
              img: "fail-page.png",
              sprites: [{ name: "s_fail", region: { x: 0, y: 0, w: 1, h: 1 }, atlasRegion: { x: 0, y: 0, w: 1, h: 1 } }]
            }
          ]
        });
      }
      return AssetPromise.reject(new Error(`Unexpected request: ${url}`));
    });

    // @ts-ignore -- mock texture loader for page failure path
    const textureLoaderSpy = vi
      .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
      .mockImplementation((item) => {
        if (item.url === okPageUrl) {
          return AssetPromise.resolve(okTex);
        }
        if (item.url === failPageUrl) {
          return new AssetPromise<Texture2D>((_, reject) => {
            rejectFailPage = reject;
          });
        }
        return AssetPromise.reject(new Error(`Unexpected texture: ${item.url}`));
      });

    try {
      const task = resourceManager.load({ url: atlasUrl, type: AssetType.SpriteAtlas });
      await Promise.resolve();
      await Promise.resolve();

      // While second page is pending, gc() must keep okTex alive via the in-flight atlas
      resourceManager.gc();
      expect(okTex.destroyed).to.be.false;

      const failure = task.catch((e) => e);
      rejectFailPage(new Error("page load failed"));
      const err: any = await failure;
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.equal("page load failed");

      // After failure, partial atlas was destroyed and okTex is collectable
      resourceManager.gc();
      expect(okTex.destroyed).to.be.true;
    } finally {
      requestSpy.mockRestore();
      textureLoaderSpy.mockRestore();
    }
  });
});
