/**
 * @title UI Button
 * @category UI
 */
import { AssetType, FontStyle, Sprite, SpriteDrawMode, Texture2D, WebGLEngine } from "@galacean/engine";
import {
  Button,
  CanvasRenderMode,
  ColorTransition,
  Image,
  ScaleTransition,
  Text,
  UICanvas,
  UITransform
} from "@galacean/engine-ui";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Add canvas
  const canvasEntity = rootEntity.createChild("canvas");
  const canvas = canvasEntity.addComponent(UICanvas);
  canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  canvas.referenceResolutionPerUnit = 50;

  // Add button
  const buttonEntity = canvasEntity.createChild("Image");
  const image = buttonEntity.addComponent(Image);
  image.drawMode = SpriteDrawMode.Sliced;
  (<UITransform>buttonEntity.transform).size.set(200, 70);
  const text = buttonEntity.createChild("Text").addComponent(Text);
  text.text = "Button";
  text.fontStyle |= FontStyle.Bold;
  text.color.set(0, 0, 0, 1);
  text.fontSize = 60;
  const button = buttonEntity.addComponent(Button);
  const scaleTransition = new ScaleTransition();
  scaleTransition.target = image;
  const colorTransition = new ColorTransition();
  colorTransition.target = image;
  button.addTransition(scaleTransition);
  button.addTransition(colorTransition);
  button.addClicked(() => {
    window.alert("button clicked");
  });

  engine.resourceManager
    .load<Texture2D>({
      url: "https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*mFpSS502qUYAAAAAAAAAAAAAehuCAQ/original",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const sprite = new Sprite(engine, texture);
      sprite.border.set(0.49, 0.49, 0.49, 0.49);
      image.sprite = sprite;
    });

  engine.run();
});
