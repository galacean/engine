import { Camera, Entity, TextRenderer, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Text, UICanvas } from "@galacean/engine-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Text batching and pooled draw data", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let canvas: HTMLCanvasElement;

  beforeEach(async () => {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    engine = await WebGLEngine.create({ canvas });
    root = engine.sceneManager.activeScene.createRootEntity();
    const cameraEntity = root.createChild();
    cameraEntity.transform.setPosition(0, 0, 10);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 5;
    camera.enableHDR = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    engine.destroy();
  });

  for (const mode of ["world", "ui"]) {
    it(`${mode}: batches labels using the same atlas and reuses their data across frames`, () => {
      let parent = root;
      if (mode === "ui") {
        parent = root.createChild();
        parent.addComponent(UICanvas).renderMode = CanvasRenderMode.ScreenSpaceOverlay;
      }
      const spacing = mode === "ui" ? 40 : 0.7;
      for (let i = 0; i < 32; i++) {
        const entity = parent.createChild();
        const text = mode === "ui" ? entity.addComponent(Text) : entity.addComponent(TextRenderer);
        text.text = "A";
        entity.transform.setPosition(((i % 8) - 3.5) * spacing, (Math.floor(i / 8) - 1.5) * spacing, 0);
      }
      engine.update();

      const elements = (engine._textRenderElementPool as any)._elements;
      expect(elements).to.have.length(32);
      expect(new Set(elements.map((element) => element.texture)).size).to.equal(1);
      expect(new Set(elements.map((element) => element.material)).size).to.equal(1);
      const data = elements.map((element) => element.shaderData);
      const draws = vi.spyOn(canvas.getContext("webgl2")!, "drawElements");
      for (let frame = 0; frame < 3; frame++) {
        draws.mockClear();
        engine.update();
        expect.soft(draws).toHaveBeenCalledTimes(1);
        const reusedCount = elements.filter((element, i) => element.shaderData === data[i]).length;
        expect.soft(reusedCount).to.equal(32);
      }
    });
  }
});
