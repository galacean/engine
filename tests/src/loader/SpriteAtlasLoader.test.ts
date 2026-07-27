import { AssetPromise, AssetType, ResourceManager, WebGLEngine } from "@galacean/engine";
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
  it("resolves prepacked SpriteAtlas pages from the physical atlas directory", async () => {
    const virtualPath = "SpriteAtlas/Migrated/ui.atlas";
    const physicalPath = "/SpriteAtlas/Migrated/ui.atlas";
    const requestSpy = vi.spyOn(engine.resourceManager as any, "_request").mockReturnValue(
      new AssetPromise((resolve) => {
        resolve({ atlasItems: [{ img: "./ui_image_0.tex", sprites: [] }] });
      })
    );
    const loadSpy = vi
      .spyOn(engine.resourceManager, "load")
      .mockReturnValue(new AssetPromise((resolve) => resolve({} as any)) as any);

    try {
      // @ts-ignore - loaders are registered in ResourceManager's internal registry.
      await ResourceManager._loaders[AssetType.SpriteAtlas].load(
        { url: virtualPath, resolvedUrl: physicalPath },
        engine.resourceManager
      );

      expect(requestSpy).toHaveBeenCalledWith(physicalPath, expect.objectContaining({ type: "json" }));
      expect(loadSpy).toHaveBeenCalledWith(
        expect.objectContaining({ url: "/SpriteAtlas/Migrated/ui_image_0.tex", type: AssetType.Texture })
      );
    } finally {
      requestSpy.mockRestore();
      loadSpy.mockRestore();
    }
  });
});
