/**
 * @title Sprite Color
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*7alGRZp4EusAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AssetType,
  Camera,
  Color,
  Entity,
  Sprite,
  SpriteRenderer,
  Texture2D,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 50);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*KjnzTpE8LdAAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      // Create origin sprite entity.
      const spriteEntity = new Entity(engine, "spriteColor");
      const spriteRenderer = spriteEntity.addComponent(SpriteRenderer);
      spriteRenderer.sprite = new Sprite(engine, texture);
      const color = new Color();
      // Display normal
      addColorEntity(spriteEntity, -20, color.set(1, 1, 1, 1));
      // Display red
      addColorEntity(spriteEntity.clone(), -10, color.set(1, 0, 0, 1));
      // Display green
      addColorEntity(spriteEntity.clone(), 0, color.set(0, 1, 0, 1));
      // Display blue
      addColorEntity(spriteEntity.clone(), 10, color.set(0, 0, 1, 1));
      // Display alpha
      addColorEntity(spriteEntity.clone(), 20, color.set(1, 1, 1, 0.2));
    });

  engine.run();

  function addColorEntity(entity: Entity, posX: number, color: Color): void {
    rootEntity.addChild(entity);
    entity.transform.setPosition(posX, 0, 0);
    entity.getComponent(SpriteRenderer).color = color;
  }
});
