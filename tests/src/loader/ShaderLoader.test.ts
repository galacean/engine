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

describe("ShaderLoader", () => {
  it("loads a precompiled Shader from its physical .shaderc path", () => {
    const virtualPath = "Shader/Migrated/outline.shader";
    const physicalPath = "/Shader/Migrated/outline.shaderc";
    const requestSpy = vi.spyOn(engine.resourceManager as any, "_request").mockReturnValue(new AssetPromise(() => {}));

    try {
      // @ts-ignore - loaders are registered in ResourceManager's internal registry.
      ResourceManager._loaders[AssetType.Shader].load(
        { url: virtualPath, resolvedUrl: physicalPath },
        engine.resourceManager
      );

      expect(requestSpy).toHaveBeenCalledWith(physicalPath, expect.objectContaining({ type: "json" }));
    } finally {
      requestSpy.mockRestore();
    }
  });
});
