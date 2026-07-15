/**
 * @title Spine UI Canvas
 * @category Spine
 */
import { Camera, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "@galacean/engine-spine";
import "@galacean/engine-spine-core-4.2";
import { CanvasRenderMode, UICanvas, UIGroup } from "@galacean/engine-ui";
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
      // Left: world space — the renderer joins the camera pipeline.
      const worldEntity = resource.instantiate();
      worldEntity.transform.setPosition(-5, -3.2, 0);
      root.addChild(worldEntity);
      worldEntity.getComponent(SpineAnimationRenderer).state.setAnimation(0, "idle", true);

      // Middle & right: the same SpineAnimationRenderer hosted by a world-space UICanvas;
      // the right one is faded by a UIGroup.
      const canvasEntity = root.createChild("canvas");
      const canvas = canvasEntity.addComponent(UICanvas);
      canvas.renderMode = CanvasRenderMode.WorldSpace;

      const uiEntity = resource.instantiate();
      uiEntity.transform.setPosition(0, -3.2, 0);
      canvasEntity.addChild(uiEntity);
      uiEntity.getComponent(SpineAnimationRenderer).state.setAnimation(0, "idle", true);

      const groupEntity = canvasEntity.createChild("group");
      const group = groupEntity.addComponent(UIGroup);
      group.alpha = 0.5;
      const fadedEntity = resource.instantiate();
      fadedEntity.transform.setPosition(5, -3.2, 0);
      groupEntity.addChild(fadedEntity);
      fadedEntity.getComponent(SpineAnimationRenderer).state.setAnimation(0, "idle", true);

      updateForE2E(engine);
      initScreenshot(engine, camera);
    })
    .catch((e) => console.error("CASE ERROR", e));
});
