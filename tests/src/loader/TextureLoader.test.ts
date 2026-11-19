import { AssetPromise, AssetType, Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";
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

  it("disables mipmaps when loading an HDR texture on a device without half-float color-renderable support", async () => {
    const header = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 8\n");
    const scanline = [2, 2, 0, 8, 136, 128, 136, 128, 136, 128, 136, 128];
    const hdrBytes = new Uint8Array(header.length + scanline.length * 2);
    hdrBytes.set(header, 0);
    hdrBytes.set(scanline, header.length);
    hdrBytes.set(scanline, header.length + scanline.length);

    const resourceManager = engine.resourceManager;
    const rhi = engine._hardwareRenderer;
    const requestSpy = vi
      .spyOn(resourceManager as any, "_requestByRemoteUrl")
      .mockImplementation(() => AssetPromise.resolve(hdrBytes.buffer.slice(0)));
    const origSupportsColor = rhi.supportsRenderTargetColorFormat.bind(rhi);
    const colorSpy = vi.spyOn(rhi, "supportsRenderTargetColorFormat").mockImplementation((format) => {
      if (format === TextureFormat.R16G16B16A16_SFloat) return false;
      return origSupportsColor(format);
    });

    try {
      const texture = await resourceManager.load<Texture2D>({
        url: "textures/no-half-float-rt.hdr",
        type: AssetType.Texture
      });
      expect(texture.format).toBe(TextureFormat.R16G16B16A16_SFloat);
      expect(texture.mipmapCount).toBe(1);
      texture.destroy(true);

      colorSpy.mockRestore();
      if (rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16_SFloat)) {
        const mipTexture = await resourceManager.load<Texture2D>({
          url: "textures/with-half-float-rt.hdr",
          type: AssetType.Texture
        });
        expect(mipTexture.mipmapCount).toBe(4);
        mipTexture.destroy(true);
      }
    } finally {
      colorSpy.mockRestore();
      requestSpy.mockRestore();
    }
  });
});
