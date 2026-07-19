/**
 * @title Spine TintBlack
 * @category Spine
 */
import { Camera, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "@galacean/engine-spine";
import "@galacean/engine-spine-core-4.2";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity();

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 60);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

  engine.resourceManager
    .load({
      urls: ["/tank-pro.json", "/tank-pro.atlas", "/tank-pro.png"],
      type: "Spine"
    })
    .then((resource: any) => {
      const spineEntity = resource.instantiate();
      const spine = spineEntity.getComponent(SpineAnimationRenderer);
      // tank-pro ships with per-slot darkColor; tintBlack renders the two-color tint.
      spine.tintBlack = true;
      spineEntity.transform.setPosition(3, -5, 0);
      root.addChild(spineEntity);
      spine.state.setAnimation(0, "shoot", true);

      // Sample ~0.4s into "shoot": the muzzle-smoke darkColor makes the two-color tint
      // clearly visible (tintBlack on/off differs ~7% here, vs ~0.01% on a static frame).
      updateForE2E(engine, 40, 10);
      initScreenshot(engine, camera);
    });
});
