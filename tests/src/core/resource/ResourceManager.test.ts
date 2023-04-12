import { Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("ResourceManager", () => {
  const engine = new WebGLEngine(document.createElement("canvas"));
  const scene = engine.sceneManager.activeScene;
  engine.run();
  beforeEach(() => {
    scene.createRootEntity("root");
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
});
