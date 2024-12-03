/**
 * @title Text Renderer Font
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*7xc-QKMlMwkAAAAAAAAAAAAADiR2AQ/original
 */

import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  Camera,
  Color,
  Font,
  TextRenderer,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.transform.setPosition(0, 0, 10);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  // The position of text
  const pos = new Vector3();
  // Create text with cursive font family
  pos.set(0, 0.75, 0);
  createText("Galacean system font: Hello World");
  // Create text with font size 36
  pos.set(0, 0.25, 0);
  createText(
    "Galacean custom font: Hello World",
    "https://lg-2fw0hhsc-1256786476.cos.ap-shanghai.myqcloud.com/Avelia.otf"
  );

  engine.run();

  /**
   * Create text to display by params.
   * @param text - The text to render
   * @param fontUrl - The url of font, if not, use system font
   */
  async function createText(text: string, fontUrl: string = ""): Promise<void> {
    // Create text entity
    const entity = rootEntity.createChild("text");
    entity.transform.position = pos;
    // Add text renderer for text entity
    const renderer = entity.addComponent(TextRenderer);
    // Set text color
    renderer.color = new Color(1, 0, 0, 1);
    // Set text to render
    renderer.text = text;
    // Set font
    if (fontUrl) {
      renderer.font = await engine.resourceManager.load({ url: fontUrl });
    } else {
      renderer.font = Font.createFromOS(engine, "Arial");
    }
    // Set font size
    renderer.fontSize = 30;
  }
});
