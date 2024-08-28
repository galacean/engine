/**
 * @title Spine
 * @category Benchmark
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*6xrGR6nr1c0AAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Entity, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "@galacean/engine-spine";
import { Stats } from "@galacean/engine-toolkit-stats";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 110);
  camera.farClipPlane = 200;
  cameraEntity.addComponent(Stats);

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_kz4wfo/uri/file/as/2/kz4wfo/4/mp/qGISZ7QTJFkEL0Qx/spineboy/spineboy.json",
      type: "spine",
    })
    .then((resource: any) => {
      const spineEntity = new Entity(engine);
      const spine = spineEntity.addComponent(SpineAnimationRenderer);
      spine.resource = resource;
      spine.defaultState.scale = 0.02;
      spine.defaultState.animationName = "walk";
      for (let i = -5; i < 5; i++) {
        for (let j = -5; j < 5; j++) {
          const clone = spineEntity.clone();
          clone.transform.setPosition(8 * i, 8 * j, 0);
          rootEntity.addChild(clone);
        }
      }
    });

  engine.run();
});
