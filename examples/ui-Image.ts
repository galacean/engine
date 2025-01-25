/**
 * @title UI Image
 * @category UI
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*t4cXTbFa6kkAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  AssetType,
  Camera,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Sprite,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import {
  UICanvas,
  Image,
  CanvasRenderMode,
  SpriteDrawMode,
} from "@galacean/engine-ui";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.farClipPlane = 200;
  camera.nearClipPlane = 0.3;
  camera.isOrthographic = true;

  // 添加 canvas
  const canvasEntity = rootEntity.createChild("canvas");
  const canvas = canvasEntity.addComponent(UICanvas);

  canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;

  // 添加按钮
  const buttonEntity = canvasEntity.createChild("Image");
  const image = buttonEntity.addComponent(Image);
  image.drawMode = SpriteDrawMode.Sliced;

  engine.resourceManager
    // @ts-ignore
    .load<[Texture2D, Texture2D, Texture2D]>([
      {
        url: "https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*mgwORIDzEGUAAAAAAAAAAAAADhuCAQ/original",
        type: AssetType.Texture2D,
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*bH8HRYxI0pEAAAAAAAAAAAAADhuCAQ/original",
        type: AssetType.Texture2D,
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*ehlWSJN0y6gAAAAAAAAAAAAADhuCAQ/original",
        type: AssetType.Texture2D,
      },
    ])
    .then(([normalTexture, pressedTexture, disableTexture]) => {
      const normalSprite = new Sprite(engine, normalTexture);
      const pressedSprite = new Sprite(engine, pressedTexture);
      const disableSprite = new Sprite(engine, disableTexture);
      normalSprite.border.set(0.3, 0.3, 0.3, 0.3);
      pressedSprite.border.set(0.3, 0.3, 0.3, 0.3);
      disableSprite.border.set(0.3, 0.3, 0.3, 0.3);
      image.sprite = normalSprite;
    });

  engine.run();
});
