/**
 * @title UI Image
 * @category UI
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*t4cXTbFa6kkAAAAAAAAAAAAADiR2AQ/original
 */

import { AssetType, Sprite, SpriteDrawMode, Texture2D, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, Text, UICanvas, UITransform } from "@galacean/engine-ui";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const rootEntity = engine.sceneManager.scenes[0].createRootEntity();

  // Add canvas
  const canvasEntity = rootEntity.createChild("canvas");
  const canvas = canvasEntity.addComponent(UICanvas);

  canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  canvas.referenceResolutionPerUnit = 50;

  // Add Image
  const simpleImageEntity = canvasEntity.createChild("Image");
  const simpleImage = simpleImageEntity.addComponent(Image);
  simpleImage.drawMode = SpriteDrawMode.Simple;
  const simpleImageTransform = <UITransform>simpleImageEntity.transform;
  simpleImageTransform.position.set(-300, 0, 0);
  simpleImageTransform.size.set(200, 70);

  const simpleTextEntity = canvasEntity.createChild("Text");
  simpleTextEntity.transform.setPosition(-300, 70, 0);
  const simpleText = simpleTextEntity.addComponent(Text);
  simpleText.text = "Simple Image";

  const slicedImageEntity = canvasEntity.createChild("Image");
  const slicedImage = slicedImageEntity.addComponent(Image);
  slicedImage.drawMode = SpriteDrawMode.Sliced;
  const slicedImageTransform = <UITransform>slicedImageEntity.transform;
  slicedImageTransform.size.set(200, 70);

  const slicedTextEntity = canvasEntity.createChild("Text");
  slicedTextEntity.transform.setPosition(0, 70, 0);
  const slicedText = slicedTextEntity.addComponent(Text);
  slicedText.text = "Sliced Image";

  const tiledImageEntity = canvasEntity.createChild("Image");
  const tiledImage = tiledImageEntity.addComponent(Image);
  tiledImage.drawMode = SpriteDrawMode.Tiled;
  const tiledImageTransform = <UITransform>tiledImageEntity.transform;
  tiledImageTransform.position.set(300, 0, 0);
  tiledImageTransform.size.set(200, 70);

  const tiledTextEntity = canvasEntity.createChild("Text");
  tiledTextEntity.transform.setPosition(300, 70, 0);
  const tiledText = tiledTextEntity.addComponent(Text);
  tiledText.text = "Tiled Image";

  engine.resourceManager
    .load<Texture2D>({
      url: "https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*mFpSS502qUYAAAAAAAAAAAAAehuCAQ/original",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const simpleSprite = new Sprite(engine, texture);
      const slicedSprite = new Sprite(engine, texture);
      slicedSprite.border.set(0.49, 0.49, 0.49, 0.49);
      const tiledSprite = new Sprite(engine, texture);
      simpleImage.sprite = simpleSprite;
      slicedImage.sprite = slicedSprite;
      tiledImage.sprite = tiledSprite;
    });

  engine.run();
});
