/**
 * @title Spine Change Attachment
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*VUeSSbViZe8AAAAAAAAAAAAADiR2AQ/original
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
        "https://gw.alipayobjects.com/os/OasisHub/01c23386-ae6d-41b3-ab51-08b023a0dc3f/1629864253199.json",
        "https://gw.alipayobjects.com/os/OasisHub/27b76dd2-01b3-4282-83e8-17be20b910ae/1629864253200.atlas",
        "https://gw.alipayobjects.com/zos/OasisHub/99bc4468-02c6-4f35-8fef-ac5a711fc641/1629864253200.png",
      ],
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = rootEntity.createChild("spine");
      rootEntity.addChild(spineEntity);
      const spineRenderer = spineEntity.addComponent(SpineRenderer);
      spineRenderer.scale = 0.05;
      spineRenderer.animationName = "walk";
      spineRenderer.resource = spineResource;
      const { skeleton, state, skeletonData } = spineRenderer.spineAnimation;
      spineEntity.transform.setPosition(0, -10, 0);
      state.setAnimation(0, "sneering", true);
      skeleton.setSkinByName("fullskin/0101"); // 1. Set the active skin
      skeleton.setSlotsToSetupPose(); // 2. Use setup pose to set base attachments.
      state.apply(skeleton);
      const slotName = "fBody";
      const info = {
        更换衣服部件: "fullskin/0101",
      };
      gui
        .add(info, "更换衣服部件", [
          "fullskin/0101",
          "fullskin/autumn",
          "fullskin/carnival",
          "fullskin/fishing",
          "fullskin/football",
          "fullskin/newyear",
          "fullskin/painter",
          "fullskin/snowman",
        ])
        .onChange((skinName) => {
          const currentSkin = skeleton.skin;
          const slotIndex = skeleton.findSlotIndex(slotName);
          const changeSkin = skeletonData.findSkin(skinName);
          const changeAttachment = changeSkin.getAttachment(
            slotIndex,
            slotName
          );
          if (changeAttachment) {
            currentSkin.removeAttachment(slotIndex, slotName);
            currentSkin.setAttachment(slotIndex, slotName, changeAttachment);
          }
        });
    });

  engine.run();
});
