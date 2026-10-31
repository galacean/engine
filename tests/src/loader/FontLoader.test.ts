import { AssetPromise, AssetType, Font, ResourceManager, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let engine: WebGLEngine;

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

afterAll(() => {
  engine.destroy();
});

describe("FontLoader", () => {
  it("preserves an absolute blob font URL", async () => {
    const resourceManager = engine.resourceManager;
    const configVirtualPath = "Assets/Fonts/Blob.font";
    const configPhysicalPath = "blob:https://local.alipay.net/blob-font-config";
    const fontUrl = "blob:https://local.alipay.net/blob-font";
    resourceManager.registerVirtualResources([
      { virtualPath: configVirtualPath, path: configPhysicalPath, type: AssetType.Font }
    ]);
    const requestSpy = vi
      .spyOn(resourceManager, "_requestByRemoteUrl")
      .mockReturnValue(AssetPromise.resolve({ fontName: "BlobFont", fontUrl }) as any);
    const registerSpy = vi
      .spyOn(ResourceManager._loaders[AssetType.Font] as any, "_registerFont")
      .mockResolvedValue(undefined);
    let font: Font;

    try {
      font = await resourceManager.load(configVirtualPath);

      expect(requestSpy).toHaveBeenCalledWith(configPhysicalPath, expect.objectContaining({ type: "json" }));
      expect(registerSpy).toHaveBeenCalledWith("BlobFont", fontUrl);
    } finally {
      font?.destroy();
      delete (resourceManager as any)._virtualPathResourceMap[configVirtualPath];
      requestSpy.mockRestore();
      registerSpy.mockRestore();
    }
  });

  it("resolves relative font URLs in logical space before virtual mapping", async () => {
    const resourceManager = engine.resourceManager;
    const configVirtualPath = "Assets/Fonts/Hero.font";
    const fontVirtualPath = "Assets/Fonts/Hero.woff";
    const configPhysicalPath = "blob:https://local.alipay.net/hero-font-config";
    const fontPhysicalPath = "blob:https://local.alipay.net/hero-font";
    resourceManager.registerVirtualResources([
      { virtualPath: configVirtualPath, path: configPhysicalPath, type: AssetType.Font },
      { virtualPath: fontVirtualPath, path: fontPhysicalPath, type: AssetType.SourceFont }
    ]);
    const requestSpy = vi
      .spyOn(resourceManager, "_requestByRemoteUrl")
      .mockReturnValue(AssetPromise.resolve({ fontName: "Hero", fontUrl: "./Hero.woff" }) as any);
    const registerSpy = vi
      .spyOn(ResourceManager._loaders[AssetType.Font] as any, "_registerFont")
      .mockResolvedValue(undefined);
    let font: Font;

    try {
      font = await resourceManager.load(configVirtualPath);

      expect(requestSpy).toHaveBeenCalledWith(configPhysicalPath, expect.objectContaining({ type: "json" }));
      expect(registerSpy).toHaveBeenCalledWith("Hero", fontPhysicalPath);
    } finally {
      font?.destroy();
      delete (resourceManager as any)._virtualPathResourceMap[configVirtualPath];
      delete (resourceManager as any)._virtualPathResourceMap[fontVirtualPath];
      requestSpy.mockRestore();
      registerSpy.mockRestore();
    }
  });
});
