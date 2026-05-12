import { AssetType, ResourceManager } from "@galacean/engine-core";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, expect, it } from "vitest";

describe("SceneLoader cache policy", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("SceneLoader should have useCache disabled", () => {
    const sceneLoader = ResourceManager._loaders[AssetType.Scene];
    expect(sceneLoader).to.not.be.undefined;
    expect(sceneLoader.useCache).to.eq(false);
  });

  it("PrimitiveMeshLoader should also have useCache disabled (existing convention)", () => {
    const loader = ResourceManager._loaders[AssetType.PrimitiveMesh];
    expect(loader).to.not.be.undefined;
    expect(loader.useCache).to.eq(false);
  });

  it("Texture2D loader should still have useCache enabled (immutable asset)", () => {
    const loader = ResourceManager._loaders[AssetType.Texture2D] || ResourceManager._loaders[AssetType.Texture];
    expect(loader).to.not.be.undefined;
    expect(loader.useCache).to.eq(true);
  });
});
