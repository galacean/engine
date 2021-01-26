import "../src/JSONLoader";
import { Engine } from "@oasis-engine/core";

describe("text loader test", () => {
  it("text loader test", () => {
    const engine = new Engine(null, { init: jest.fn(), canIUse: jest.fn() });
    const promise = engine.resourceManager.load(
      "https://gw.alipayobjects.com/os/bmw-prod/73cba7a4-221b-4e32-8db6-c87968cf7ce0.json"
    );
    return expect(promise).resolves.toEqual({
      info: "test request"
    });
  });
});
