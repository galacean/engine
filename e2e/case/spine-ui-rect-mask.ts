/**
 * @title Spine UI Rect Mask
 * @category Spine
 */
import { Camera, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "@galacean/engine-spine";
import "@galacean/engine-spine-core-4.2";
import { CanvasRenderMode, RectMask2D, UICanvas, UITransform } from "@galacean/engine-ui";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity();

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 20);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

  engine.resourceManager
    .load({
      urls: ["/spineboy.json", "/spineboy.atlas", "/spineboy.png"],
      type: "Spine"
    })
    .then((resource: any) => {
      const canvasEntity = root.createChild("canvas");
      const canvas = canvasEntity.addComponent(UICanvas);
      canvas.renderMode = CanvasRenderMode.WorldSpace;

      // Left: unmasked reference.
      const referenceEntity = resource.instantiate();
      referenceEntity.transform.setPosition(-4, -3.2, 0);
      canvasEntity.addChild(referenceEntity);
      referenceEntity.getComponent(SpineAnimationRenderer).state.setAnimation(0, "idle", true);

      // Right: the same skeleton clipped by a RectMask2D to a 8x4 window around the torso.
      const maskEntity = canvasEntity.createChild("mask");
      maskEntity.transform.setPosition(4, -1, 0);
      const maskTransform = maskEntity.transform as UITransform;
      maskTransform.size.set(8, 4);
      maskEntity.addComponent(RectMask2D);

      const maskedEntity = resource.instantiate();
      maskedEntity.transform.setPosition(0, -2.2, 0);
      maskEntity.addChild(maskedEntity);
      maskedEntity.getComponent(SpineAnimationRenderer).state.setAnimation(0, "idle", true);

      updateForE2E(engine);
      initScreenshot(engine, camera);
    })
    .catch((e) => console.error("CASE ERROR", e));
});
