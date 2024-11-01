import { expect } from "chai";
import { WebGLEngine, Script } from '@galacean/engine'
import { AssetType } from "@galacean/engine-core";

let engine: WebGLEngine;

interface ESModuleStructure {
  default?: Script;
  [key: string]: any;
}

before(async () => {
  const canvasDOM = document.createElement("canvas");
  canvasDOM.width = 1024;
  canvasDOM.height = 1024;
  engine = await WebGLEngine.create({ canvas: canvasDOM });
});

describe("ScriptLoader test", function () {
  it("loader from string url", async () => {
    engine.resourceManager.load<ESModuleStructure>({
      url: "https://cdn.jsdelivr.net/npm/colord@2.9.3/+esm",
      type: AssetType.Script
    })
    .then((script) => {
      expect(script).not.to.be.null;
      expect(script.default).not.to.be.null;
      expect(script.colord).not.to.be.null;
      expect(script.getFormat).not.to.be.null;
      expect(script.random).not.to.be.null;
    });
  });

  it("loader from blob raw script text", async () => {
    const esModuleString = `
      export const colord = "colord";
      export const getFormat = () => "getFormat";
      export default colord;
    `
    engine.resourceManager.load<ESModuleStructure>({
      url: URL.createObjectURL(new Blob([esModuleString], { type: "application/javascript" })),
      type: AssetType.Script
    })
    .then((script) => {
      expect(script).not.to.be.null;
      expect(script.colord).not.to.be.null;
      expect(script.getFormat).not.to.be.null;
      expect(script.default).not.to.be.null;
      expect(script.default).equal(script.colord)
    });
  });
});