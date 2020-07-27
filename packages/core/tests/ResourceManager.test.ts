import { Loader } from "../src/asset/Loader";
import { LoadItem } from "../src/asset/LoadItem";
import { resourceLoader } from "../src/asset/ResourceManager";
import { LoaderType } from "../src/asset/LoaderType";
import { Engine } from "../src";
import { AssetPromise } from "../src/asset/AssetPromise";

@resourceLoader(LoaderType.Text, ["txt"])
class TestLoader extends Loader<string> {
  load(item: LoadItem): AssetPromise<string> {
    return new AssetPromise((resolve) => {
      setTimeout(() => {
        resolve("test");
      }, 1000);
    });
  }
}

describe("test resource manager", () => {
  const engine = new Engine(null, { init: () => {} });
  describe("Add Loader Test", function () {
    it("load custom loader url", () => {
      return expect(engine.resourceManager.load("xx.txt")).resolves.toEqual("test");
    });
    it("load custom loader object", () => {
      return expect(engine.resourceManager.load({ url: "xx.txt" })).resolves.toEqual("test");
    });
    it("load custom loader specify type", () => {
      return expect(engine.resourceManager.load({ url: "xx", type: LoaderType.Text })).resolves.toEqual("test");
    });
    it("load url loader type undefined", () => {
      return expect(() => {
        engine.resourceManager.load({ url: "xx" });
      }).toThrow();
    });
    it(`load all test`, () => {
      return expect(engine.resourceManager.load(["xx.txt", "xx.txt"])).resolves.toEqual(["test", "test"]);
    });
  });

  it("test cache", () => {
    const promise = engine.resourceManager.load("xba.txt");
    const promise1 = engine.resourceManager.load("xba.txt");
    expect(promise === promise1).toBeTruthy();
  });

  it("test all cancel", () => {
    const promise = engine.resourceManager.load({ url: "xna.txt" });
    engine.resourceManager.cancelNotLoaded();
    return expect(promise).rejects.toEqual("Promise Canceled");
  });

  it("test specify cancel", () => {
    const promise = engine.resourceManager.load(["xaa.txt", "xab.txt"]);
    engine.resourceManager.cancelNotLoaded("xaa.txt");
    return expect(promise).rejects.toEqual("Promise Canceled");
  });

  it("test specify cancel array", () => {
    const promise = engine.resourceManager.load(["xca.txt", "xcb.txt", "xcc.txt"]);
    engine.resourceManager.cancelNotLoaded(["xaa.txt", "xcb.txt"]);
    return expect(promise).rejects.toEqual("Promise Canceled");
  });
});
