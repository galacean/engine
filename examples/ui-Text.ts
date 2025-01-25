/**
 * @title UI Text
 * @category UI
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*t4cXTbFa6kkAAAAAAAAAAAAADiR2AQ/original
 */

import { Color, Entity, Font, FontStyle, Vector3, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Text, UICanvas } from "@galacean/engine-ui";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const rootEntity = engine.sceneManager.scenes[0].createRootEntity();

  // Add canvas
  const canvasEntity = rootEntity.createChild("canvas");
  const canvas = canvasEntity.addComponent(UICanvas);

  canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;

  // The position of text
  const pos = new Vector3();
  // The color of text
  const color = new Color();

  // Create text with default params
  pos.set(0, 125, 0);
  color.set(1, 1, 1, 1);
  createText();
  // Create text with cursive font family
  pos.set(0, 75, 0);
  color.set(1, 1, 1, 1);
  const entity = createText("cursive");
  for (let i = 0; i < 10; i++) {
    entity.clone();
  }
  // Create text with font size 36
  pos.set(0, 25, 0);
  color.set(1, 0.5, 0.5, 1);
  createText("Arial", 36);
  // Create text with bold
  pos.set(0, -25, 0);
  color.set(1, 1, 1, 1);
  createText("Arial", 26, true);
  // Create text with italic
  pos.set(0, -75, 0);
  color.set(1, 1, 1, 1);
  createText("Arial", 26, false, true);
  // Create text with bold and italic
  pos.set(0, -125, 0);
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
  ): Entity {
    // Create text entity
    const entity = canvasEntity.createChild("text");
    entity.transform.position = pos;
    // Add text renderer for text entity
    const text = entity.addComponent(Text);
    // Set text color
    text.color = color;
    // Set text to render
    text.text = "The quick brown fox jumps over the lazy dog";
    // Set font with font family
    text.font = Font.createFromOS(entity.engine, fontFamily);
    // Set font size
    text.fontSize = fontSize;
    // Set font whether bold
    bold && (text.fontStyle |= FontStyle.Bold);
    // Set font whether italic
    italic && (text.fontStyle |= FontStyle.Italic);
    return entity;
  }
});
