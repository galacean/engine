/**
 * @title Ortho Controls
 * @category Camera
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*I4x0Qrp0mUcAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  Camera,
  Sprite,
  SpriteRenderer,
  TextRenderer,
  Texture2D,
  WebGLEngine,
} from "@galacean/engine";
import { OrthoControl } from "@galacean/engine-toolkit-controls";

// Create engine object

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;

  // Add  tip
  const tipEntity = rootEntity.createChild("Tip");
  tipEntity.transform.setPosition(0, 5, 0);
  const textRenderer = tipEntity.addComponent(TextRenderer);
  textRenderer.text = "Hold right button and drag";
  textRenderer.fontSize = 50;

  // Add camera control.
  cameraEntity.addComponent(OrthoControl);
  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*KjnzTpE8LdAAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      // Create sprite entity.
      const spriteEntity = rootEntity.createChild("sprite");
      const spriteRenderer = spriteEntity.addComponent(SpriteRenderer);
      spriteRenderer.sprite = new Sprite(engine, texture);
    });

  engine.run();
});
