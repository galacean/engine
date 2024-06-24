/**
 * @title Spine Change Skin
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*6RVDRrZkOlgAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Logger, Vector3, WebGLEngine, Entity } from "@galacean/engine";
import { SpineRenderer } from "@galacean/engine-spine";
import * as dat from "dat.gui";

Logger.enable();

const gui = new dat.GUI();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 60);

  engine.resourceManager
    .load({
      urls: [
        "https://gw.alipayobjects.com/os/OasisHub/c51a45ef-f248-4835-b601-6d31a901f298/1629713824525.json",
        "https://gw.alipayobjects.com/os/OasisHub/b016738d-173a-4506-9112-045ebba84d82/1629713824527.atlas",
        "https://gw.alipayobjects.com/zos/OasisHub/747a94f3-8734-47b3-92b3-2d7fe2d36e58/1629713824527.png",
      ],
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = rootEntity.createChild("spine");
      rootEntity.addChild(spineEntity);
      const spineRenderer = spineEntity.addComponent(SpineRenderer);
      spineRenderer.resource = spineResource;
      const spineAnimation = spineRenderer.spineAnimation;
      const { skeleton, state } = spineAnimation;
      spineEntity.transform.setPosition(0, -18, 0);
      state.setAnimation(0, "dance", true);
      skeleton.setSkinByName("girl"); // 1. Set the active skin
      skeleton.setSlotsToSetupPose(); // 2. Use setup pose to set base attachments.
      state.apply(skeleton);
      spineAnimation.scale = 0.05;
      const info = {
        skin: "girl",
      };
      gui
        .add(info, "skin", [
          "girl",
          "girl-blue-cape",
          "girl-spring-dress",
          "boy",
        ])
        .onChange((skinName) => {
          skeleton.setSkinByName(skinName); // 1. Set the active skin
          skeleton.setSlotsToSetupPose(); // 2. Use setup pose to set base attachments.
          state.apply(skeleton);
        });
    });

  engine.run();
});
