/**
 * @title Spine
 * @category Benchmark
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*6xrGR6nr1c0AAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineRenderer } from "@galacean/engine-spine";
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
      urls: [
        "https://gw.alipayobjects.com/os/OasisHub/a66ef194-6bc8-4325-9a59-6ea9097225b1/1620888427489.json",
        "https://gw.alipayobjects.com/os/OasisHub/a1e3e67b-a783-4832-ba1b-37a95bd55291/1620888427490.atlas",
        "https://gw.alipayobjects.com/zos/OasisHub/a3ca8f62-1068-43a5-bb64-5c9a0f823dde/1620888427490.png",
      ],
      type: "spine",
    })
    .then((spineResouce: any) => {
      const spineEntity = rootEntity.createChild("spine");
      const spineRenderer = spineEntity.addComponent(SpineRenderer);
      spineRenderer.resource = spineResouce;
      spineRenderer.scale = 0.01;
      spineRenderer.animationName = "walk";
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
