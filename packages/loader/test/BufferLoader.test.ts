import "../src/BufferLoader";
import { Engine } from "@alipay/o3-core";

describe("text loader test", () => {
  it("text loader test", () => {
    const engine = new Engine();
    const promise = engine.resourceManager.load(
      "https://gw.alipayobjects.com/os/bmw-prod/ebe92dc1-3074-42d6-90c8-6255552c3c6e.bin"
    );
    return expect(promise).resolves.toEqual(Float32Array.from([1, 2, 3]).buffer);
  });
});
