import { Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("ResourceManager", () => {
  let engine: WebGLEngine;
  before(async function () {
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
      expect(textures.length).equal(6);
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
});
