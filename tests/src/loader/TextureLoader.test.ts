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
