import { AssetPromise, AssetType, ResourceManager, Texture2D, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { GLTFBufferParser, GLTFTextureParser } from "@galacean/engine-loader";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GLTFContentRestorer } from "../../../packages/loader/src/GLTFContentRestorer";

describe("virtual path loading", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("loads a SpriteAtlas image through its resolved virtualPath", async () => {
    const resourceManager = engine.resourceManager;
    const atlasVirtualPath = "Assets/UI/Hero.atlas";
    const textureVirtualPath = "Assets/Textures/Hero.png";
    resourceManager.registerVirtualResources([
      { virtualPath: atlasVirtualPath, path: "https://cdn.ali.com/atlas-hash", type: AssetType.SpriteAtlas },
      { virtualPath: textureVirtualPath, path: "https://cdn.ali.com/texture-hash", type: AssetType.Texture }
    ]);
    const texture = new Texture2D(engine, 4, 4);
    // @ts-ignore
    const loader = ResourceManager._loaders[AssetType.SpriteAtlas];
    // @ts-ignore
    const requestSpy = vi.spyOn(resourceManager, "_request").mockReturnValue(
      AssetPromise.resolve({
        atlasItems: [
          {
            img: "../Textures/Hero.png",
            sprites: [
              {
                name: "Hero",
                region: { x: 0, y: 0, w: 1, h: 1 },
                atlasRegion: { x: 0, y: 0, w: 4, h: 4 }
              }
            ]
          }
        ]
      }) as any
    );
    const loadSpy = vi.spyOn(resourceManager, "load").mockReturnValue(AssetPromise.resolve(texture) as any);

    try {
      await loader.load({ url: atlasVirtualPath }, resourceManager);
      expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ url: textureVirtualPath }));
    } finally {
      loadSpy.mockRestore();
      requestSpy.mockRestore();
    }
  });

  it("maps an embedded font path only at the FontFace request boundary", async () => {
    const resourceManager = engine.resourceManager;
    const fontAssetVirtualPath = "Assets/Fonts/Hero.font";
    const sourceFontVirtualPath = "Assets/Fonts/Hero.woff";
    const sourceFontRemotePath = "https://cdn.ali.com/font-hash";
    resourceManager.registerVirtualResources([
      { virtualPath: fontAssetVirtualPath, path: "https://cdn.ali.com/font-asset-hash", type: AssetType.Font },
      { virtualPath: sourceFontVirtualPath, path: sourceFontRemotePath, type: AssetType.SourceFont }
    ]);
    // @ts-ignore
    const loader = ResourceManager._loaders[AssetType.Font];
    // @ts-ignore
    const requestSpy = vi
      .spyOn(resourceManager, "_request")
      .mockReturnValue(AssetPromise.resolve({ fontName: "Hero", fontUrl: "./Hero.woff" }) as any);
    const registerSpy = vi.spyOn(loader as any, "_registerFontFace").mockResolvedValue(undefined);

    try {
      const font = await loader.load({ url: fontAssetVirtualPath }, resourceManager);
      expect(registerSpy).toHaveBeenCalledWith("Hero", sourceFontVirtualPath, resourceManager);
      font.destroy();
    } finally {
      registerSpy.mockRestore();
      requestSpy.mockRestore();
    }
  });

  it("keeps a source font identified by virtualPath while requesting its remote path", async () => {
    const resourceManager = engine.resourceManager;
    const sourceFontVirtualPath = "Assets/Fonts/Body.woff";
    const sourceFontRemotePath = "https://cdn.ali.com/body-font-hash";
    resourceManager.registerVirtualResources([
      { virtualPath: sourceFontVirtualPath, path: sourceFontRemotePath, type: AssetType.SourceFont }
    ]);
    // @ts-ignore
    const loader = ResourceManager._loaders[AssetType.SourceFont];
    const registerSpy = vi.spyOn(loader as any, "_registerFontFace").mockResolvedValue(undefined);

    try {
      const font = await loader.load({ url: sourceFontVirtualPath }, resourceManager);
      expect(registerSpy).toHaveBeenCalledWith(sourceFontVirtualPath, sourceFontVirtualPath, resourceManager);
      expect(font.name).equal(sourceFontVirtualPath);
      font.destroy();
    } finally {
      registerSpy.mockRestore();
    }
  });

  it("loads and restores an external glTF buffer through its virtualPath", async () => {
    const resourceManager = engine.resourceManager;
    const glTFVirtualPath = "Assets/Models/Hero.gltf";
    const bufferVirtualPath = "Assets/Buffers/Hero.bin";
    const bufferRemotePath = "https://cdn.ali.com/buffer-hash";
    resourceManager.registerVirtualResources([
      { virtualPath: glTFVirtualPath, path: "https://cdn.ali.com/gltf-hash", type: AssetType.GLTF },
      { virtualPath: bufferVirtualPath, path: bufferRemotePath, type: AssetType.Buffer }
    ]);
    const resource = { engine } as any;
    const contentRestorer = new GLTFContentRestorer(resource);
    const context = {
      glTF: { buffers: [{ uri: "../Buffers/Hero.bin", byteLength: 4 }] },
      glTFResource: { url: glTFVirtualPath },
      contentRestorer,
      resourceManager,
      _onTaskDetail: vi.fn(),
      _addTaskCompletePromise: vi.fn()
    } as any;
    // @ts-ignore
    const requestSpy = vi
      .spyOn(resourceManager as any, "_requestByUrl")
      .mockReturnValue(AssetPromise.resolve(new ArrayBuffer(4)) as any);

    try {
      await new GLTFBufferParser().parse(context, 0);
      expect(contentRestorer.bufferRequests[0].assetPath).equal(bufferVirtualPath);
      expect(requestSpy).toHaveBeenCalledWith(bufferRemotePath, expect.objectContaining({ type: "arraybuffer" }));

      await contentRestorer.restoreContent();
      expect(requestSpy).toHaveBeenCalledTimes(2);
      expect(requestSpy).toHaveBeenLastCalledWith(bufferRemotePath, expect.objectContaining({ type: "arraybuffer" }));
    } finally {
      requestSpy.mockRestore();
    }
  });

  it("loads an external glTF image through its resolved virtualPath", async () => {
    const resourceManager = engine.resourceManager;
    const glTFVirtualPath = "Assets/Models/Hero.gltf";
    const textureVirtualPath = "Assets/Textures/Hero.png";
    resourceManager.registerVirtualResources([
      { virtualPath: glTFVirtualPath, path: "https://cdn.ali.com/gltf-texture-source-hash", type: AssetType.GLTF },
      { virtualPath: textureVirtualPath, path: "https://cdn.ali.com/gltf-texture-hash", type: AssetType.Texture }
    ]);
    const texture = new Texture2D(engine, 4, 4);
    const loadSpy = vi.spyOn(resourceManager, "load").mockReturnValue(AssetPromise.resolve(texture) as any);
    const context = {
      glTFResource: { engine, url: glTFVirtualPath },
      glTF: { images: [{ uri: "../Textures/Hero.png" }] },
      _onTaskDetail: vi.fn(),
      _addTaskCompletePromise: vi.fn()
    } as any;

    try {
      await GLTFTextureParser._parseTexture(context, 0, 0);
      expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ url: textureVirtualPath }));
    } finally {
      loadSpy.mockRestore();
      texture.destroy();
    }
  });
});
