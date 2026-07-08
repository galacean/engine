/**
 * @title Spine Otakugirl (3.8)
 * @category Spine
 * @remarks
 * A genuine spine 3.8.99 export (binary .skel), unlike the keli asset used in the 4.2 example —
 * this verifies the 3.8 backend against data it's actually meant to parse.
 */
import { Camera, Entity, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer, SpineResource } from "@galacean/engine-spine";
import "@galacean/engine-spine-core-3.8";
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
      urls: ["/spine/otakugirl/otakugirl.skel", "/spine/otakugirl/otakugirl.atlas", "/spine/otakugirl/otakugirl.png"],
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
      console.error("Failed to load otakugirl (3.8):", error);
    });
});
