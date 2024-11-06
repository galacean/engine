/**
 * @title Sprite Flip
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*rJy-SY0iivEAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AssetType,
  Camera,
  Entity,
  Sprite,
  SpriteRenderer,
  Texture2D,
  WebGLEngine,
} from "@galacean/engine";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Create root entity.
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*KjnzTpE8LdAAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      // Create origin sprite entity.
      const spriteEntity = new Entity(engine, "spriteFlip");
      const spriteRenderer = spriteEntity.addComponent(SpriteRenderer);
      spriteRenderer.sprite = new Sprite(engine, texture);

      // Display normal.
      addFlipEntity(spriteEntity, -15, false, false);
      // Display flip x.
      addFlipEntity(spriteEntity.clone(), -5, true, false);
      // Display flip y.
      addFlipEntity(spriteEntity.clone(), 5, false, true);
      // Display flip x and y.
      addFlipEntity(spriteEntity.clone(), 15, true, true);
    });

  engine.run();

  /**
   * Add flip entity.
   */
  function addFlipEntity(
    entity: Entity,
    posX: number,
    flipX: boolean,
    flipY: boolean
  ): void {
    rootEntity.addChild(entity);
    entity.transform.setPosition(posX, 0, 0);
    const flipRenderer = entity.getComponent(SpriteRenderer);
    flipRenderer.flipX = flipX;
    flipRenderer.flipY = flipY;
  }
});
