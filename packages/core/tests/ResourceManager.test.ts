import { Loader } from "../src/asset/Loader";
import { LoadItem } from "../src/asset/LoadItem";
import { resourceLoader, ResourceManager } from "../src/asset/ResourceManager";
import { AssetType } from "../src/asset/AssetType";
import { Engine } from "../src";
import { AssetPromise } from "../src/asset/AssetPromise";
import { ReferenceObject } from "../src/asset/ReferenceObject";

@resourceLoader(AssetType.Text, ["txt"], false)
class TestLoader extends Loader<string> {
  load(item: LoadItem): AssetPromise<string> {
    return new AssetPromise((resolve) => {
      setTimeout(() => {
        resolve("test");
      }, 1000);
    });
  }
}

class TestRefObject extends ReferenceObject {
  constructor(engine: Engine) {
    super(engine);
  }
  onDestroy() {}
}

@resourceLoader(AssetType.JSON, ["json"])
class TestJsonLoader extends Loader<ReferenceObject> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<ReferenceObject> {
    return new AssetPromise((resolve) => {
      // console.log(resourceManager.engine.id)
      setTimeout(() => {
        resolve(new TestRefObject(resourceManager.engine));
      }, 300);
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
      return expect(engine.resourceManager.load({ url: "xx", type: AssetType.Text })).resolves.toEqual("test");
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

  const jsonEngine = new Engine(null, { init: () => {} });
  it("test delete object", () => {
    const path = "xaa.json";
    const promiseAA = jsonEngine.resourceManager.load<ReferenceObject>(path);
    return expect(
      promiseAA.then((obj) => {
        expect(jsonEngine.resourceManager.getAssetPath(obj.instanceId)).toEqual(path);
        jsonEngine.resourceManager._deleteAsset(obj);
        expect(jsonEngine.resourceManager.getAssetPath(obj.instanceId)).toBeUndefined();
        return {};
      })
    ).resolves.toEqual({});
  });

  it("test promise cache", () => {
    const promise = jsonEngine.resourceManager.load("xba.json");
    const promise1 = jsonEngine.resourceManager.load("xba.json");
    expect(promise === promise1).toBeTruthy();
  });

  it("test asset cache", () => {
    const promise = jsonEngine.resourceManager
      .load("xca.json")
      .then(() => {
        return jsonEngine.resourceManager.load("xca.json");
      })
      .then(() => {
        return {};
      });
    expect(promise).resolves.toEqual({});
  });

  it("test reference gc", () => {
    const engine = new Engine(null, { init: () => {} });
    return expect(
      engine.resourceManager.load<ReferenceObject>("xca.json").then((res) => {
        res._addReference(1);
        engine.resourceManager.gc();
        expect(res.destroyed).toBeFalsy();
        res._addReference(-1);
        engine.resourceManager.gc();
        return res.destroyed;
      })
    ).resolves.toBeTruthy();
  });

  // error 需要在最后抛出
  it("test all cancel", () => {
    const promise = engine.resourceManager.load({ url: "xna.txt" });
    promise.catch((e) => e);
    engine.resourceManager.cancelNotLoaded();
    return expect(promise).rejects.toEqual("Promise Canceled");
  });

  it("test specify cancel", () => {
    const promise = engine.resourceManager.load(["xaa.txt", "xab.txt"]);
    promise.catch((e) => e);
    engine.resourceManager.cancelNotLoaded("xaa.txt");
    return expect(promise).rejects.toEqual("Promise Canceled");
  });

  it("test specify cancel array", () => {
    const promise = engine.resourceManager.load(["xca.txt", "xcb.txt", "xcc.txt"]);
    promise.catch((e) => e);
    engine.resourceManager.cancelNotLoaded(["xca.txt", "xcb.txt"]);
    return expect(promise).rejects.toEqual("Promise Canceled");
  });
});
