import { AssetPromise, AssetType, Texture2D, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let engine: WebGLEngine;

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

afterAll(() => {
  engine.destroy();
});

describe("TextureLoader", () => {
  it("restores a relative texture from its original request base URL", async () => {
    const resourceManager = engine.resourceManager;
    const logicalUrl = "textures/relative.png";
    const baseUrlA = "https://a.example.com/";
    const baseUrlB = "https://b.example.com/";
    const remoteUrlA = `${baseUrlA}${logicalUrl}`;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
    const pngBytes = await pngBlob.arrayBuffer();
    const requestSpy = vi.spyOn(resourceManager, "_requestByRemoteUrl").mockReturnValue(AssetPromise.resolve(pngBytes));

    try {
      resourceManager.baseUrl = baseUrlA;
      const texture = await resourceManager.load<Texture2D>({ url: logicalUrl, type: AssetType.Texture });
      const restorer = Object.values((resourceManager as any)._contentRestorerPool).find(
        (candidate: any) => candidate.resource === texture
      ) as { restoreContent(): AssetPromise<Texture2D> };

      resourceManager.baseUrl = baseUrlB;
      expect(await restorer.restoreContent()).toBe(texture);
      expect(requestSpy.mock.calls.map(([url]) => url)).toEqual([remoteUrlA, remoteUrlA]);
    } finally {
      resourceManager.baseUrl = null;
      requestSpy.mockRestore();
    }
  });

  it("keeps the resource identity when image decoding fails during content restoration", async () => {
    const resourceManager = engine.resourceManager;
    const virtualPath = "Texture/Migrated/page.tex";
    const physicalPath = "blob:https://local.alipay.net/page";
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
    const pngBytes = await pngBlob.arrayBuffer();
    const invalidBytes = new Uint8Array([1, 2, 3]).buffer;
    resourceManager.registerVirtualResources([{ virtualPath, path: physicalPath, type: AssetType.Texture }]);
    const requestSpy = vi
      .spyOn(resourceManager as any, "_requestByRemoteUrl")
      .mockReturnValue(AssetPromise.resolve(pngBytes));

    try {
      const texture = await resourceManager.load<Texture2D>({ url: virtualPath });
      const restorers = Object.values((resourceManager as any)._contentRestorerPool) as Array<{
        resource: Texture2D;
        restoreContent(): AssetPromise<Texture2D>;
      }>;
      const restorer = restorers.find((candidate) => candidate.resource === texture);
      expect(restorer).toBeDefined();

      requestSpy.mockReturnValue(AssetPromise.resolve(invalidBytes));

      await expect(restorer!.restoreContent()).rejects.toThrow(
        `TextureLoader: failed to decode texture "${virtualPath}" (${invalidBytes.byteLength} bytes).`
      );
    } finally {
      requestSpy.mockRestore();
    }
  });
});
