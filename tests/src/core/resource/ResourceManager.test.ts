import { AssetPromise, AssetType, ResourceManager, Shader, Texture2D } from "@galacean/engine";
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
    it("resolves relative and complete references in the virtual file system", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.registerVirtualResources([
        {
          virtualPath: "Assets/Models/Hero.gltf",
          path: "https://cdn.ali.com/model-hash",
          type: AssetType.GLTF
        },
        {
          virtualPath: "Assets/Textures/Hero.png",
          path: "https://cdn.ali.com/texture-hash",
          type: AssetType.Texture
        }
      ]);

      // @ts-ignore
      expect(resourceManager._resolveDependencyPath("Assets/Models/Hero.gltf", "../Textures/Hero.png")).equal(
        "Assets/Textures/Hero.png"
      );
      // @ts-ignore
      expect(resourceManager._resolveDependencyPath("Assets/Models/Hero.gltf", "Assets/Textures/Hero.png")).equal(
        "Assets/Textures/Hero.png"
      );
      // @ts-ignore
      expect(
        resourceManager._resolveDependencyPath("https://cdn.ali.com/Models/Hero.gltf", "../Textures/Hero.png")
      ).equal("https://cdn.ali.com/Textures/Hero.png");
      // @ts-ignore
      expect(resourceManager._getRemoteUrl("Assets/Textures/Hero.png")).equal("https://cdn.ali.com/texture-hash");
      // @ts-ignore
      expect(resourceManager._getRemoteUrl("https://cdn.ali.com/direct.png")).equal("https://cdn.ali.com/direct.png");
    });

    it("infers loader type from virtualPathResourceMap when type is omitted", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.registerVirtualResources([
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

    it("detects precompiled shader content behind an opaque physical path", async () => {
      const resourceManager = engine.resourceManager;
      const physicalPath = "https://cdn.ali.com/assets/8fca12?version=1";
      resourceManager.registerVirtualResources([
        {
          virtualPath: "Shaders/custom.shader",
          path: physicalPath,
          type: AssetType.Shader
        }
      ]);
      // @ts-ignore
      const requestSpy = vi
        .spyOn(resourceManager, "_requestByRemoteUrl")
        .mockReturnValue(
          AssetPromise.resolve(JSON.stringify({ name: "custom", platformTarget: 0, subShaders: [] })) as any
        );
      // @ts-ignore
      const createSpy = vi.spyOn(Shader, "_createFromPrecompiled").mockReturnValue({ name: "custom" } as Shader);
      try {
        await resourceManager.load("Shaders/custom.shader");

        expect(requestSpy).toHaveBeenCalledWith(physicalPath, expect.objectContaining({ type: "text" }));
        expect(createSpy).toHaveBeenCalled();
      } finally {
        requestSpy.mockRestore();
        createSpy.mockRestore();
      }
    });

    it("keeps ordinary shader source on the source parser path", async () => {
      const resourceManager = engine.resourceManager;
      const physicalPath = "https://cdn.ali.com/assets/source-8fca12";
      const source = 'Shader "Custom/Source" {}';
      resourceManager.registerVirtualResources([
        {
          virtualPath: "Shaders/source.shader",
          path: physicalPath,
          type: AssetType.Shader
        }
      ]);
      // @ts-ignore
      const requestSpy = vi.spyOn(resourceManager, "_requestByRemoteUrl").mockReturnValue(AssetPromise.resolve(source));
      const createSpy = vi.spyOn(Shader, "create").mockReturnValue({ name: "source" } as Shader);

      try {
        await resourceManager.load("Shaders/source.shader");

        expect(requestSpy).toHaveBeenCalledWith(physicalPath, expect.objectContaining({ type: "text" }));
        expect(createSpy).toHaveBeenCalledWith(source, undefined, "Shaders/source.shader");
      } finally {
        requestSpy.mockRestore();
        createSpy.mockRestore();
      }
    });

    it("fills params from virtualPathResourceMap when params is omitted", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.registerVirtualResources([
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
      resourceManager.registerVirtualResources([
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

    it("resolves a sub-asset from the completed main asset when no eager callback arrives", async () => {
      const resourceManager = engine.resourceManager;
      const material = { name: "material" };
      const mainAsset = { instanceId: 987654321, materials: [material] };
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.GLTF], "load")
        .mockReturnValue(AssetPromise.resolve(mainAsset) as any);

      try {
        const loaded = await resourceManager.load("https://cdn.ali.com/sub-asset-fallback.glb?q=materials[0]");
        expect(loaded).equal(material);
      } finally {
        loaderSpy.mockRestore();
      }
    });

    it("rejects a missing sub-asset path from the completed main asset", async () => {
      const resourceManager = engine.resourceManager;
      const mainAsset = { instanceId: 987654322, materials: [] };
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.GLTF], "load")
        .mockReturnValue(AssetPromise.resolve(mainAsset) as any);

      try {
        await expect(
          resourceManager.load("https://cdn.ali.com/missing-sub-asset.glb?q=materials[0]")
        ).rejects.toThrow();
      } finally {
        loaderSpy.mockRestore();
      }
    });

    it("retries a sub-asset after its main asset initially fails", async () => {
      const resourceManager = engine.resourceManager;
      const material = { name: "material" };
      const mainAsset = { instanceId: 987654323, materials: [material] };
      // @ts-ignore
      const loaderSpy = vi
        .spyOn(ResourceManager._loaders[AssetType.GLTF], "load")
        .mockReturnValueOnce(new AssetPromise((_resolve, reject) => reject(new Error())) as any)
        .mockReturnValueOnce(AssetPromise.resolve(mainAsset) as any);
      const url = "https://cdn.ali.com/retry-sub-asset.glb?q=materials[0]";

      try {
        await expect(resourceManager.load(url)).rejects.toThrow();
        expect(await resourceManager.load(url)).equal(material);
        expect(loaderSpy).toHaveBeenCalledTimes(2);
      } finally {
        loaderSpy.mockRestore();
      }
    });

    it("prefers the virtualPath map type over an explicit type", () => {
      const resourceManager = engine.resourceManager;
      resourceManager.registerVirtualResources([
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
      resourceManager.registerVirtualResources([
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
      resourceManager.registerVirtualResources([
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
        expect(loaderSpy.mock.calls[0][0].url).equal("Assets/withBaseUrl");
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
