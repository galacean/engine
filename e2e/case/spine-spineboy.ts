/**
 * @title Spine Spineboy
 * @category Spine
 */
import { Camera, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer, SpineResource } from "@galacean/engine-spine";
import { Spine42Runtime } from "@galacean/engine-spine-core-4.2";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

WebGLEngine.create({ canvas: "canvas", spine: new Spine42Runtime() }).then((engine) => {
  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity();

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 20);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

  engine.resourceManager
    .load<SpineResource>({
      urls: ["/spineboy.json", "/spineboy.atlas", "/spineboy.png"],
      type: "Spine"
    })
    .then((resource) => {
      const spineEntity = resource.instantiate();
      spineEntity.transform.setPosition(-0.5, -3.2, 0);
      root.addChild(spineEntity);
      spineEntity.getComponent(SpineAnimationRenderer).state.setAnimation(0, "idle", true);

      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
