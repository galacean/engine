import { AssetType, AssetPromise } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

let engine: WebGLEngine;
before(async () => {
  const canvasDOM = document.createElement("canvas");
  canvasDOM.width = 1024;
  canvasDOM.height = 1024;
  engine = await WebGLEngine.create({ canvas: canvasDOM });
});

describe("custom requester", function () {
  it("invoke json loader", async () => {
    const mockReturn = { result: "123" };
    const ret: any = await engine.resourceManager.load({
      type: AssetType.JSON,
      url: "/not/relevant",
      params: {
        requester: (url) => {
          return new AssetPromise((resolve, reject, setProgress) => {
            setTimeout(() => {
              resolve(mockReturn);
            }, 1000);

            setTimeout(() => {
              setProgress(0.5);
            }, 500);
          });
        }
      }
    });

    expect(ret).to.equal(mockReturn);
  });
});
