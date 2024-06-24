/**
 * @title Text Renderer
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*g-oMQas6VsMAAAAAAAAAAAAADiR2AQ/original
 */

import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  Camera,
  Color,
  Font,
  FontStyle,
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

  // The text to display
  const text = "Galacean 文字系统来啦～";
  // The position of text
  const pos = new Vector3();
  // The color of text
  const color = new Color();

  // Create text with default params
  pos.set(0, 1.25, 0);
  color.set(1, 1, 1, 1);
  createText();
  // Create text with cursive font family
  pos.set(0, 0.75, 0);
  color.set(1, 1, 1, 1);
  createText("cursive");
  // Create text with font size 36
  pos.set(0, 0.25, 0);
  color.set(1, 0.5, 0.5, 1);
  createText("Arial", 36);
  // Create text with bold
  pos.set(0, -0.25, 0);
  color.set(1, 1, 1, 1);
  createText("Arial", 26, true);
  // Create text with italic
  pos.set(0, -0.75, 0);
  color.set(1, 1, 1, 1);
  createText("Arial", 26, false, true);
  // Create text with bold and italic
  pos.set(0, -1.25, 0);
  color.set(1, 1, 1, 1);
  createText("Arial", 26, true, true);

  engine.run();

  /**
   * Create text to display by params.
   * @param fontFamily - The font family
   * @param fontSize - The size of font
   * @param bold - The text whether bold
   * @param italic - The text whether italic
   */
  function createText(
    fontFamily: string = "Arial",
    fontSize: number = 26,
    bold: boolean = false,
    italic: boolean = false
  ): void {
    // Create text entity
    const entity = rootEntity.createChild("text");
    entity.transform.position = pos;
    // Add text renderer for text entity
    const renderer = entity.addComponent(TextRenderer);
    // Set text color
    renderer.color = color;
    // Set text to render
    renderer.text = text;
    // Set font with font family
    renderer.font = Font.createFromOS(entity.engine, fontFamily);
    // Set font size
    renderer.fontSize = fontSize;
    // Set font whether bold
    bold && (renderer.fontStyle |= FontStyle.Bold);
    // Set font whether italic
    italic && (renderer.fontStyle |= FontStyle.Italic);
  }
});
