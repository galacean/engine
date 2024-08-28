/**
 * @title Sprite Size
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*peiFQ6T-wN8AAAAAAAAAAAAADiR2AQ/original
 */
import * as dat from "dat.gui";
import {
  AssetType,
  Camera,
  Entity,
  Sprite,
  SpriteRenderer,
  Texture2D,
  WebGLEngine,
} from "@galacean/engine";

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
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      const entity = rootEntity.createChild("sprite");
      entity.addComponent(SpriteRenderer).sprite = new Sprite(engine, texture);
      addDataGUI(entity);
    });
  engine.run();

  /**
   * Add data GUI.
   */
  function addDataGUI(entity: Entity) {
    const spriteRenderer = entity.getComponent(SpriteRenderer);
    const sprite = spriteRenderer.sprite;
    const gui = new dat.GUI();
    const defaultWidth = sprite.width;
    const defaultHeight = sprite.height;
    const guiData = {
      width: defaultWidth,
      height: defaultHeight,
      reset: () => {
        spriteRenderer.width = guiData.width = defaultWidth;
        spriteRenderer.height = guiData.height = defaultHeight;
      },
    };

    gui
      .add(guiData, "width", 0, defaultWidth * 5, defaultWidth / 10)
      .onChange((value: number) => {
        spriteRenderer.width = value;
      })
      .listen();
    gui
      .add(guiData, "height", 0, defaultHeight * 5, defaultHeight / 10)
      .onChange((value: number) => {
        spriteRenderer.height = value;
      })
      .listen();
    gui.add(guiData, "reset").name("重置");

    return guiData;
  }
});
