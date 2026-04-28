/**
 * @title UI Mask
 * @category UI
 */
import { Camera, Color, Sprite, SpriteMaskInteraction, Texture2D, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, Mask, Text, UICanvas, UITransform } from "@galacean/engine-ui";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.03, 0.04, 0.07, 1);
  const root = scene.createRootEntity("Root");

  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);

  const canvasEntity = root.createChild("UICanvas");
  const uiCanvas = canvasEntity.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
  uiCanvas.camera = camera;
  uiCanvas.referenceResolutionPerUnit = 100;
  uiCanvas.referenceResolution.set(1200, 800);

  const solidSprite = createSolidSprite(engine);

  // --- Left group: VisibleInsideMask ---
  const leftGroupEntity = canvasEntity.createChild("LeftGroup");
  (<UITransform>leftGroupEntity.transform).setPosition(-300, 0, 0);

  // Square mask
  const leftMaskEntity = leftGroupEntity.createChild("Mask");
  (<UITransform>leftMaskEntity.transform).size.set(300, 300);
  const leftMask = leftMaskEntity.addComponent(Mask);
  leftMask.sprite = solidSprite;

  // Image clipped to inside the mask
  const insideImageEntity = leftGroupEntity.createChild("InsideImage");
  (<UITransform>insideImageEntity.transform).size.set(500, 500);
  const insideImage = insideImageEntity.addComponent(Image);
  insideImage.sprite = solidSprite;
  insideImage.color.set(0.91, 0.3, 0.24, 1);
  insideImage.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;

  const leftLabelEntity = leftGroupEntity.createChild("Label");
  (<UITransform>leftLabelEntity.transform).size.set(300, 60);
  (<UITransform>leftLabelEntity.transform).setPosition(0, -210, 0);
  const leftLabel = leftLabelEntity.addComponent(Text);
  leftLabel.text = "VisibleInsideMask";
  leftLabel.fontSize = 30;
  leftLabel.color.set(1, 1, 1, 1);

  // --- Right group: VisibleOutsideMask ---
  const rightGroupEntity = canvasEntity.createChild("RightGroup");
  (<UITransform>rightGroupEntity.transform).setPosition(300, 0, 0);

  const rightMaskEntity = rightGroupEntity.createChild("Mask");
  (<UITransform>rightMaskEntity.transform).size.set(300, 300);
  const rightMask = rightMaskEntity.addComponent(Mask);
  rightMask.sprite = solidSprite;

  const outsideImageEntity = rightGroupEntity.createChild("OutsideImage");
  (<UITransform>outsideImageEntity.transform).size.set(500, 500);
  const outsideImage = outsideImageEntity.addComponent(Image);
  outsideImage.sprite = solidSprite;
  outsideImage.color.set(0.16, 0.5, 0.73, 1);
  outsideImage.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;

  const rightLabelEntity = rightGroupEntity.createChild("Label");
  (<UITransform>rightLabelEntity.transform).size.set(300, 60);
  (<UITransform>rightLabelEntity.transform).setPosition(0, -210, 0);
  const rightLabel = rightLabelEntity.addComponent(Text);
  rightLabel.text = "VisibleOutsideMask";
  rightLabel.fontSize = 30;
  rightLabel.color.set(1, 1, 1, 1);

  engine.run();
});

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
