/**
 * @title Spine Keli (4.2)
 * @category Spine
 */
import { Camera, Entity, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer, SpineResource } from "@galacean/engine-spine";
import "@galacean/engine-spine-core-4.2";
import * as dat from "dat.gui";

Logger.enable();

const gui = new dat.GUI();
const state = { animation: "" };

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity();

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 2, 10);
  cameraEntity.transform.lookAt(new Vector3(0, 2, 0));

  engine.run();

  engine.resourceManager
    .load<SpineResource>({
      urls: [
        "/spine/keli/keli.json",
        "/spine/keli/keli.atlas",
        "/spine/keli/images/arm_l.png",
        "/spine/keli/images/arm_r.png",
        "/spine/keli/images/head.png",
        "/spine/keli/images/legs.png",
        "/spine/keli/images/torso.png"
      ],
      type: "Spine"
    })
    .then((resource) => {
      const spineEntity: Entity = resource.instantiate();
      root.addChild(spineEntity);

      const animator = spineEntity.getComponent(SpineAnimationRenderer);
      const animationNames = resource.skeletonData.animations.map((animation) => animation.name);

      state.animation = animationNames[0];
      animator.state.setAnimation(0, state.animation, true);

      gui
        .add(state, "animation", animationNames)
        .name("Animation")
        .onChange((name: string) => {
          animator.state.setAnimation(0, name, true);
        });
    })
    .catch((error) => {
      console.error("Failed to load keli (4.2):", error);
    });
});
