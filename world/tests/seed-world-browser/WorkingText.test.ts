import { Camera, Material, Matrix, RHIMode, Shader, Vector4 } from "@galacean/engine";
import { createWorldEngine } from "@galacean/engine-world-planning/rendering/createWorldEngine";
import { CanvasRenderMode, Text, UICanvas, UITransform } from "@galacean/engine-ui";
import { expect, it } from "vitest";
import workingTextSource from "../../demos/seed-world/assistant/shaders/SeedWorldWorkingText.shader?raw";

for (const rhi of [RHIMode.WebGL2, RHIMode.WebGPU]) {
  it(`preserves the font atlas glyph coverage in Seed chat on ${rhi}`, async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 64;
    const engine = await createWorldEngine({ canvas, rhi });
    try {
      const scene = engine.sceneManager.activeScene!;
      scene.background.solidColor.set(0, 0, 0, 1);
      scene.createRootEntity().addComponent(Camera).enableHDR = false;
      const overlay = scene.createRootEntity().addComponent(UICanvas);
      overlay.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
      overlay.referenceResolution.set(canvas.width, canvas.height);
      const label = overlay.entity.createChild().addComponent(Text);
      (label.entity.transform as UITransform).size.set(canvas.width, canvas.height);
      label.fontSize = 32;
      label.text = "时间 21";
      label.color.set(1, 1, 1, 1);

      const readCoverage = () => {
        engine.update();
        const target = document.createElement("canvas");
        target.width = canvas.width;
        target.height = canvas.height;
        const context = target.getContext("2d")!;
        context.drawImage(canvas, 0, 0);
        const { data } = context.getImageData(0, 0, target.width, target.height);
        return data.filter((_, index) => index % 4 === 0);
      };
      const reference = readCoverage();
      expect(reference.filter(value => value > 128).length).toBeGreaterThan(50);

      const material = new Material(engine, Shader.create(workingTextSource, engine));
      material.shaderData.setMatrix("material_SeedWorldTextClipMatrix", new Matrix());
      material.shaderData.setVector4("material_SeedWorldTextClipBounds", new Vector4(-1000, -1000, 1000, 1000));
      label.setMaterial(material);
      // The idle material uses the same glyph opacity as the built-in Text shader.
      const chat = readCoverage();
      const changed = chat.filter((value, index) => Math.abs(value - reference[index]) > 8);
      expect(changed.length).toBe(0);
    } finally {
      engine.destroy();
    }
  });
}
