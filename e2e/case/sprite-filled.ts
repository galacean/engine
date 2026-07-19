/**
 * @title SpriteFilled
 * @category Sprite
 */
import {
  AssetType,
  Camera,
  Sprite,
  SpriteDrawMode,
  SpriteFilledMode,
  SpriteRenderer,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// One baseline covering every fill mode (rows) across fill amounts 0/0.25/0.5/0.75/1 (columns).
// The amount steps hit the topology boundaries (45° quad↔triangle, 90° quadrant edges).
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;
  camera.orthographicSize = 9;

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*rgNGR4Vb7lQAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture
    })
    .then((texture) => {
      const sprite = new Sprite(engine, texture);
      const modes = [
        SpriteFilledMode.Horizontal,
        SpriteFilledMode.Vertical,
        SpriteFilledMode.Radial90,
        SpriteFilledMode.Radial180,
        SpriteFilledMode.Radial360
      ];
      const amounts = [0, 0.25, 0.5, 0.75, 1];

      modes.forEach((mode, row) => {
        amounts.forEach((amount, col) => {
          const entity = rootEntity.createChild(`filled-${row}-${col}`);
          entity.transform.setPosition((col - 2) * 3, (2 - row) * 3, 0);
          const renderer = entity.addComponent(SpriteRenderer);
          renderer.sprite = sprite;
          renderer.width = 2.4;
          renderer.height = 2.4;
          renderer.drawMode = SpriteDrawMode.Filled;
          renderer.filledMode = mode;
          renderer.filledAmount = amount;
        });
      });

      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
