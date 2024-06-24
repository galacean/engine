/**
 * @title Sprite Pivot
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*0irsTpRlOLAAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  AssetType,
  Camera,
  Entity,
  Script,
  Sprite,
  SpriteRenderer,
  Texture2D,
  Vector2,
  WebGLEngine,
} from "@galacean/engine";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Create root entity
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*d3N9RYpcKncAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      // Create origin sprite entity.
      const spriteEntity = new Entity(engine, "spritePivot");
      const { transform } = spriteEntity;
      transform.setScale(3, 3, 3);
      transform.setPosition(0, 5, 0);
      spriteEntity.addComponent(SpriteRenderer);

      // Display normal.
      addPivotEntity(spriteEntity, texture, 8);
      // Display pivot entity
      const pivotEntity = spriteEntity.clone();
      pivotEntity.addComponent(RotateScript);
      addPivotEntity(pivotEntity, texture, -8);
      addDataGUI(pivotEntity);
    });

  engine.run();

  /**
   * Add flip entity.
   */
  function addPivotEntity(
    entity: Entity,
    texture: Texture2D,
    posY: number
  ): void {
    rootEntity.addChild(entity);
    entity.transform.setPosition(0, posY, 0);
    entity.getComponent(SpriteRenderer).sprite = new Sprite(
      entity.engine,
      texture
    );
  }

  /**
   * Add data GUI.
   */
  function addDataGUI(entity: Entity) {
    const sprite = entity.getComponent(SpriteRenderer).sprite;
    const pivot = new Vector2(0.5, 0.5);
    const gui = new dat.GUI();
    const guiData = {
      pivotX: 0.5,
      pivotY: 0.5,
      reset: () => {
        guiData.pivotX = 0.5;
        guiData.pivotY = 0.5;
        pivot.set(0.5, 0.5);
        sprite.pivot = pivot;
      },
    };

    gui
      .add(guiData, "pivotX", 0.0, 1.0, 0.01)
      .onChange((value: number) => {
        pivot.x = value;
        sprite.pivot = pivot;
      })
      .listen();
    gui
      .add(guiData, "pivotY", 0.0, 1.0, 0.01)
      .onChange((value: number) => {
        pivot.y = value;
        sprite.pivot = pivot;
      })
      .listen();
    gui.add(guiData, "reset").name("重置");

    return guiData;
  }

  class RotateScript extends Script {
    onUpdate(dt: number) {
      this.entity.transform.rotate(0, 0, 1);
    }
  }
});
