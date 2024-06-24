/**
 * @title Text Wrap And Alignment
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*E7dVT6Lfmx8AAAAAAAAAAAAADiR2AQ/original
 */

import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  Camera,
  Entity,
  TextHorizontalAlignment,
  TextRenderer,
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
  const text = "文字折行对齐示例，根据设置的宽自动换行";
  const textEntity = rootEntity.createChild("text");
  textEntity.addComponent(TextRenderer);

  // Text display no wrap, center align
  setTextRenderer(
    textEntity,
    2,
    `${text} (不换行，居中对齐)`,
    2,
    false,
    TextHorizontalAlignment.Center
  );
  // Text display with wrap, center align
  setTextRenderer(
    textEntity.clone(),
    1,
    `${text}\n(换行，居中对齐)`,
    2,
    true,
    TextHorizontalAlignment.Center
  );
  // Text display with wrap, left align
  setTextRenderer(
    textEntity.clone(),
    0,
    `${text}\n(换行，左对齐)`,
    2,
    true,
    TextHorizontalAlignment.Left
  );
  // Text display with wrap, right align
  setTextRenderer(
    textEntity.clone(),
    -1,
    `${text}\n(换行，右对齐)`,
    2,
    true,
    TextHorizontalAlignment.Right
  );

  engine.run();

  function setTextRenderer(
    entity: Entity,
    posY: number,
    text: string,
    width: number,
    wrap: boolean,
    hAlign: TextHorizontalAlignment
  ): void {
    rootEntity.addChild(entity);
    entity.transform.position.y = posY;
    // Get the text renderer
    const renderer = entity.getComponent(TextRenderer);
    renderer.text = text;
    renderer.width = width;
    // Set whether wrap
    renderer.enableWrapping = wrap;
    // Set horizontal alignment
    renderer.horizontalAlignment = hAlign;
  }
});
