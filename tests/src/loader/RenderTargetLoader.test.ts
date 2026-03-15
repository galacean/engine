import { AssetType, RenderTarget, Texture2D, TextureFormat } from "@galacean/engine-core";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let engine: WebGLEngine;

beforeAll(async function () {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

afterAll(() => {
  engine.destroy();
});

function createRenderTargetBlob(data: Record<string, any>): string {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  return URL.createObjectURL(blob) + "#.renderTarget";
}

describe("RenderTargetLoader", () => {
  it("load returns RenderTarget with correct properties", async () => {
    const url = createRenderTargetBlob({
      width: 256,
      height: 256,
      colorFormat: TextureFormat.R8G8B8A8,
      depthFormat: TextureFormat.Depth,
      antiAliasing: 1,
      autoGenerateMipmaps: true
    });

    const rt = await engine.resourceManager.load<RenderTarget>({ url, type: AssetType.RenderTarget });
    expect(rt).to.be.instanceOf(RenderTarget);
    expect(rt.width).to.equal(256);
    expect(rt.height).to.equal(256);
    expect(rt.colorTextureCount).to.equal(1);
    expect(rt.autoGenerateMipmaps).to.equal(true);

    const colorTexture = rt.getColorTexture(0);
    expect(colorTexture).to.be.instanceOf(Texture2D);
    expect(colorTexture.width).to.equal(256);
    expect(colorTexture.height).to.equal(256);
    expect(colorTexture.format).to.equal(TextureFormat.R8G8B8A8);
  });

  it("load with no depth (depthFormat = -1)", async () => {
    const url = createRenderTargetBlob({
      width: 128,
      height: 128,
      colorFormat: TextureFormat.R8G8B8A8,
      depthFormat: -1,
      antiAliasing: 1,
      autoGenerateMipmaps: false
    });

    const rt = await engine.resourceManager.load<RenderTarget>({ url, type: AssetType.RenderTarget });
    expect(rt).to.be.instanceOf(RenderTarget);
    expect(rt.autoGenerateMipmaps).to.equal(false);
    expect(rt.depthTexture).to.be.null;
  });

  it("load applies colorTexture sampling properties", async () => {
    const url = createRenderTargetBlob({
      width: 64,
      height: 64,
      colorFormat: TextureFormat.R8G8B8A8,
      depthFormat: TextureFormat.Depth,
      antiAliasing: 1,
      autoGenerateMipmaps: false,
      colorTexture: {
        mipmap: false,
        isSRGBColorSpace: true,
        filterMode: 1,
        wrapModeU: 1,
        wrapModeV: 1,
        anisoLevel: 4
      }
    });

    const rt = await engine.resourceManager.load<RenderTarget>({ url, type: AssetType.RenderTarget });
    const colorTexture = rt.getColorTexture(0) as Texture2D;
    expect(colorTexture.filterMode).to.equal(1);
    expect(colorTexture.wrapModeU).to.equal(1);
    expect(colorTexture.wrapModeV).to.equal(1);
    expect(colorTexture.anisoLevel).to.equal(4);
  });

  it("cache works", async () => {
    const url = createRenderTargetBlob({
      width: 32,
      height: 32,
      colorFormat: TextureFormat.R8G8B8A8,
      depthFormat: TextureFormat.Depth,
      antiAliasing: 1,
      autoGenerateMipmaps: false
    });

    const rt1 = await engine.resourceManager.load<RenderTarget>({ url, type: AssetType.RenderTarget });
    const rt2 = await engine.resourceManager.load<RenderTarget>({ url, type: AssetType.RenderTarget });
    expect(rt1).to.equal(rt2);
  });
});

describe("RenderTarget.colorTextures getter", () => {
  it("returns readonly array of color textures", () => {
    const texture = new Texture2D(engine, 64, 64);
    const rt = new RenderTarget(engine, 64, 64, texture);
    const colorTextures = rt.colorTextures;
    expect(colorTextures).to.be.an("array");
    expect(colorTextures.length).to.equal(1);
    expect(colorTextures[0]).to.equal(texture);
  });

  it("returns empty array when no color textures", () => {
    const rt = new RenderTarget(engine, 64, 64, null, TextureFormat.Depth);
    expect(rt.colorTextures.length).to.equal(0);
  });
});
