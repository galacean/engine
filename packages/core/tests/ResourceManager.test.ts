import { Loader } from "../src/AssetDesign/Loader";
import { LoadItem } from "../src/AssetDesign/LoadItem";
import { resourceLoader, ResourceManager } from "../src/AssetDesign/ResourceManager";
import { AssetType } from "../src/AssetDesign/AssetType";
import { Engine } from "../src";
import { AssetPromise } from "../src/AssetDesign/AssetPromise";

@resourceLoader(AssetType.Text, ["txt"])
class TestLoader implements Loader<string> {
  load(item: LoadItem): AssetPromise<string> {
    return new AssetPromise((resolve) => {
      resolve("test");
    });
  }
}

describe("Add Loader Test", function () {
  const engine = new Engine();
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
