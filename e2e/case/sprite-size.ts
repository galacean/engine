/**
 * @title Sprite Size
 * @category 2D
 */
import * as dat from "dat.gui";
import { AssetType, Camera, Entity, Sprite, SpriteRenderer, Texture2D, WebGLEngine } from "@galacean/engine";
import { e2eReady, updateForE2E } from "./.mockForE2E";

// Create engine object.
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Create root entity.
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;
  camera.orthographicSize = 5;

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*d3N9RYpcKncAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const entity = rootEntity.createChild("sprite");
      entity.addComponent(SpriteRenderer).sprite = new Sprite(engine, texture);
      updateForE2E(engine);
      e2eReady();
    });
});
