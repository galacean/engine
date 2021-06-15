import { WebGLEngine } from "../../rhi-webgl/src/WebGLEngine";
import "../src/TextLoader";

describe("text loader test", () => {
  it("text loader test", () => {
    const engine = new WebGLEngine(document.createElement("canvas"));
    const promise = engine.resourceManager.load(
      "https://gw.alipayobjects.com/os/bmw-prod/d64cb568-bf86-41f0-8c9e-d1be9424bd98.txt"
    );
    return expect(promise).resolves.toEqual("test request");
  });
});
