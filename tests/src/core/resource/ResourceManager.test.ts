import { AssetPromise, AssetType, ResourceManager, Texture2D } from "@galacean/engine";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("ResourceManager", () => {
  let engine: WebGLEngine;
  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.run();
  });

  beforeEach(() => {
    engine.sceneManager.activeScene.createRootEntity("root");
  });
  describe("getFromCache test", () => {
    it("findEntityByName", () => {
      const texture = new Texture2D(engine, 128, 128);
      const textureUrl = "aa/bb/cc";

      // @ts-ignore
      engine.resourceManager._assetUrlPool[textureUrl] = texture;

      let getResource = engine.resourceManager.getFromCache(textureUrl);
      expect(getResource).equal(texture);

      const wrongUrl = "aa/bb/ccX";
      getResource = engine.resourceManager.getFromCache(wrongUrl);
      expect(getResource).equal(null);
    });

    it("resolves virtual paths to physical cache keys", () => {
      const resourceManager = engine.resourceManager;
      const virtualPath = "Prefab/Character.prefab";
      const physicalPath = "/Prefab/Character.prefab";
      const remoteUrl = "https://cdn.ali.com/Prefab/Remote.prefab";
      const physicalResource = {};
      const remoteResource = {};

      resourceManager.initVirtualResources([
        { virtualPath, path: physicalPath, type: AssetType.Prefab, params: { keep: true } }
      ]);
      // @ts-ignore
      resourceManager._assetUrlPool[physicalPath] = physicalResource;
      // @ts-ignore
      resourceManager._assetUrlPool[remoteUrl] = remoteResource;

      expect(resourceManager.getFromCache(virtualPath)).equal(physicalResource);
      expect(resourceManager.getFromCache(physicalPath)).equal(physicalResource);
      expect(resourceManager.getFromCache(remoteUrl)).equal(remoteResource);
      expect(resourceManager.getFromCache("Prefab/Missing.prefab")).equal(null);
    });
  });

  describe("findResourcesByType", () => {
    it("findResourcesByType", () => {
      const textures = engine.resourceManager.findResourcesByType(Texture2D);
      expect(textures.length).equal(5);
    });
  });

  describe("queryPath", () => {
    it("no encode", () => {
      // @ts-ignore
      const { assetBaseURL } = engine.resourceManager._parseURL(
        "https://cdn.ali.com/inner.jpg?x-oss-process=image/resize,l_1024"
      );
      expect(assetBaseURL).equal("https://cdn.ali.com/inner.jpg?x-oss-process=image/resize,l_1024");
    });

    it("encode", () => {
      // @ts-ignore
      const { assetBaseURL } = engine.resourceManager._parseURL(
        "https://cdn.ali.com/inner.jpg?x-oss-process=image%25resize,l_1024"
      );
      expect(assetBaseURL).equal("https://cdn.ali.com/inner.jpg?x-oss-process=image%25resize,l_1024");
    });

    it("query path", () => {
      // @ts-ignore
      const { assetBaseURL, queryPath } = engine.resourceManager._parseURL("https://cdn.ali.com/inner.jpg?q=abc");
      expect(assetBaseURL).equal("https://cdn.ali.com/inner.jpg");
      expect(queryPath).equal("abc");
    });
  });

  describe("load subAsset", () => {
    it("no repeat network query", () => {
      // @ts-ignore
      const glTFLoader = ResourceManager._loaders["GLTF"];

      const loaderSpy = vi.spyOn(glTFLoader, "load");

      engine.resourceManager.load("https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb");
      engine.resourceManager.load("https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb");
      engine.resourceManager.load(
        "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb?q=materials[0]"
      );
      expect(loaderSpy).toHaveBeenCalled();
    });
  });

  describe("load asset", () => {
    it("not found", async () => {
      try {
        await engine.resourceManager.load("/model.glb");
      } catch (e) {
        expect(e).to.be.an.instanceOf(Error);
      }
    });
  });

  describe("virtualPath loading", () => {
    it("infers loader type from virtualPathResourceMap when type is omitted", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.initVirtualResources([
        { virtualPath: "Assets/extensionless", path: "https://cdn.ali.com/a.json", type: AssetType.Texture }
      ]);
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
        .mockReturnValue(new AssetPromise(() => {}));

      resourceManager.load({ url: "Assets/extensionless" });

      expect(loaderSpy).toHaveBeenCalled();
      expect(loaderSpy.mock.calls[0][0].type).equal(AssetType.Texture);
      loaderSpy.mockRestore();
    });

    it("fills params from virtualPathResourceMap when params is omitted", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.initVirtualResources([
        {
          virtualPath: "Assets/withParams",
          path: "https://cdn.ali.com/p.json",
          type: AssetType.Texture,
          params: { mipmap: false }
        } as any
      ]);
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
        .mockReturnValue(new AssetPromise(() => {}));

      resourceManager.load({ url: "Assets/withParams" });

      expect(loaderSpy).toHaveBeenCalled();
      expect(loaderSpy.mock.calls[0][0].params).deep.equal({ mipmap: false });
      loaderSpy.mockRestore();
    });

    it("prefers explicit params over the virtualPath map params", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.initVirtualResources([
        {
          virtualPath: "Assets/overrideParams",
          path: "https://cdn.ali.com/o.json",
          type: AssetType.Texture,
          params: { mipmap: false }
        } as any
      ]);
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
        .mockReturnValue(new AssetPromise(() => {}));

      // Explicit params overrides the map params (overwrite, not merge), mirroring type precedence
      resourceManager.load({ url: "Assets/overrideParams", params: { mipmap: true } });

      expect(loaderSpy).toHaveBeenCalled();
      expect(loaderSpy.mock.calls[0][0].params).deep.equal({ mipmap: true });
      loaderSpy.mockRestore();
    });

    it("shares the main asset across sub-asset queries", () => {
      const resourceManager = engine.resourceManager;
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.GLTF], "load")
        .mockReturnValue(new AssetPromise(() => {}));

      resourceManager.load("https://cdn.ali.com/shared.glb?q=materials[0]");
      resourceManager.load("https://cdn.ali.com/shared.glb?q=materials[1]");

      expect(loaderSpy).toHaveBeenCalledTimes(1);
      loaderSpy.mockRestore();
    });

    it("prefers the virtualPath map type over an explicit type", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.initVirtualResources([
        { virtualPath: "Assets/explicit", path: "https://cdn.ali.com/x.json", type: AssetType.Texture }
      ]);
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
        .mockReturnValue(new AssetPromise(() => {}));

      // A registered virtualPath is the single source of truth for its type;
      // an explicit type cannot override the type the editor recorded for it.
      resourceManager.load({ url: "Assets/explicit", type: AssetType.GLTF });

      expect(loaderSpy).toHaveBeenCalled();
      expect(loaderSpy.mock.calls[0][0].type).equal(AssetType.Texture);
      loaderSpy.mockRestore();
    });

    it("getResourceByRef resolves the type from the map without passing it explicitly", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.initVirtualResources([
        { virtualPath: "Assets/byRef", path: "https://cdn.ali.com/r.json", type: AssetType.Texture }
      ]);
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
        .mockReturnValue(new AssetPromise(() => {}));

      // @ts-ignore — getResourceByRef no longer forwards a type; the map must drive loader selection
      resourceManager.getResourceByRef({ url: "Assets/byRef" });

      expect(loaderSpy).toHaveBeenCalled();
      expect(loaderSpy.mock.calls[0][0].type).equal(AssetType.Texture);
      loaderSpy.mockRestore();
    });

    it("resolves virtualPath via map even when baseUrl is set", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.initVirtualResources([
        { virtualPath: "Assets/withBaseUrl", path: "https://cdn.ali.com/real.json", type: AssetType.Texture }
      ]);
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.Texture], "load")
        .mockReturnValue(new AssetPromise(() => {}));
      resourceManager.baseUrl = "https://base.com/app/";

      try {
        resourceManager.load({ url: "Assets/withBaseUrl" });
        expect(loaderSpy).toHaveBeenCalled();
        expect(loaderSpy.mock.calls[0][0].type).equal(AssetType.Texture);
      } finally {
        resourceManager.baseUrl = null;
        loaderSpy.mockRestore();
      }
    });

    it("merges urls into a single url before parsing", () => {
      const resourceManager = engine.resourceManager;
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.KTXCube], "load")
        .mockReturnValue(new AssetPromise(() => {}));

      resourceManager.load({
        type: AssetType.KTXCube,
        urls: ["px.ktx", "nx.ktx", "py.ktx", "ny.ktx", "pz.ktx", "nz.ktx"]
      });

      expect(loaderSpy).toHaveBeenCalled();
      loaderSpy.mockRestore();
    });
  });
});
