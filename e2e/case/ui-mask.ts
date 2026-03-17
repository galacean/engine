/**
 * @title UI Mask
 * @category UI
 */
import {
  Camera,
  Color,
  Sprite,
  SpriteMaskInteraction,
  Texture2D,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import {
  CanvasRenderMode,
  Image,
  Mask,
  Text,
  UICanvas,
  UITransform
} from "../../packages/ui/dist/module.js";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

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
  uiCanvas.referenceResolutionPerUnit = 1;
  uiCanvas.referenceResolution.set(1200, 800);

  const solidSprite = createSolidSprite(engine);

  // --- Left group: VisibleInsideMask ---
  const leftGroupEntity = canvasEntity.createChild("LeftGroup");
  const leftGroupTransform = leftGroupEntity.transform as UITransform;
  leftGroupTransform.setPosition(-300, 0, 0);

  // Mask (stencil writer)
  const maskEntity = leftGroupEntity.createChild("Mask");
  const maskTransform = maskEntity.transform as UITransform;
  maskTransform.size.set(300, 300);
  const mask = maskEntity.addComponent(Mask);
  mask.sprite = solidSprite;

  // Image behind mask (VisibleInsideMask)
  const insideImageEntity = leftGroupEntity.createChild("InsideImage");
  const insideImageTransform = insideImageEntity.transform as UITransform;
  insideImageTransform.size.set(500, 500);
  const insideImage = insideImageEntity.addComponent(Image);
  insideImage.sprite = solidSprite;
  insideImage.color.set(0.91, 0.3, 0.24, 1);
  insideImage.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;

  // Label
  const leftLabelEntity = leftGroupEntity.createChild("Label");
  const leftLabelTransform = leftLabelEntity.transform as UITransform;
  leftLabelTransform.size.set(300, 60);
  leftLabelTransform.setPosition(0, -210, 0);
  const leftLabel = leftLabelEntity.addComponent(Text);
  leftLabel.text = "VisibleInsideMask";
  leftLabel.fontSize = 30;
  leftLabel.color.set(1, 1, 1, 1);

  // --- Right group: VisibleOutsideMask ---
  const rightGroupEntity = canvasEntity.createChild("RightGroup");
  const rightGroupTransform = rightGroupEntity.transform as UITransform;
  rightGroupTransform.setPosition(300, 0, 0);

  // Mask (stencil writer)
  const maskEntity2 = rightGroupEntity.createChild("Mask");
  const maskTransform2 = maskEntity2.transform as UITransform;
  maskTransform2.size.set(300, 300);
  const mask2 = maskEntity2.addComponent(Mask);
  mask2.sprite = solidSprite;

  // Image behind mask (VisibleOutsideMask)
  const outsideImageEntity = rightGroupEntity.createChild("OutsideImage");
  const outsideImageTransform = outsideImageEntity.transform as UITransform;
  outsideImageTransform.size.set(500, 500);
  const outsideImage = outsideImageEntity.addComponent(Image);
  outsideImage.sprite = solidSprite;
  outsideImage.color.set(0.16, 0.5, 0.73, 1);
  outsideImage.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;

  // Label
  const rightLabelEntity = rightGroupEntity.createChild("Label");
  const rightLabelTransform = rightLabelEntity.transform as UITransform;
  rightLabelTransform.size.set(300, 60);
  rightLabelTransform.setPosition(0, -210, 0);
  const rightLabel = rightLabelEntity.addComponent(Text);
  rightLabel.text = "VisibleOutsideMask";
  rightLabel.fontSize = 30;
  rightLabel.color.set(1, 1, 1, 1);

  updateForE2E(engine);
  initScreenshot(engine, camera);
});

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
