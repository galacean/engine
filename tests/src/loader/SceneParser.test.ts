import { registerGUI } from "@galacean/engine-ui";
registerGUI();
import "@galacean/engine-loader";
import { AssetType } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { describe, beforeAll, afterAll, expect, it } from "vitest";

let engine: WebGLEngine;

beforeAll(async function () {
  const canvasDOM = document.createElement("canvas");
  canvasDOM.width = 1024;
  canvasDOM.height = 1024;
  engine = await WebGLEngine.create({ canvas: canvasDOM });
});

afterAll(() => {
  engine?.destroy();
});

describe("ProjectLoader Component Reference Tests", function () {
  it("should load project successfully with component be deleted", async () => {
    await engine.resourceManager.load({
      type: AssetType.Project,
      // button.Color.target be deleted
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*hPs1Q4KdkBsAAAAAQNAAAAgAekp5AQ/project.json"
    });
    const scene = engine.sceneManager.scenes[0];

    const entities = scene.rootEntities;
    expect(entities.length).eq(5);
  });
});
