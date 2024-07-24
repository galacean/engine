/**
 * @title Spine Full Skin Change
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*IALeTYOXMXwAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Entity, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "@galacean/engine-spine";
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
  cameraEntity.transform.position = new Vector3(0, 0, 100);
  camera.nearClipPlane = 0.001;
  camera.farClipPlane = 20000;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_kz4wfo/uri/file/as/2/kz4wfo/4/mp/24ejL92gvbWxsXRi/mix-and-match/mix-and-match.json",
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = new Entity(engine);
      spineEntity.transform.setPosition(0, -18, 0);
      const spine = spineEntity.addComponent(SpineAnimationRenderer);
      spine.resource = spineResource;
      spine.defaultState.scale = 0.05;
      spine.defaultState.skinName = 'full-skins/girl';
      spine.defaultState.animationName = 'idle';
      rootEntity.addChild(spineEntity);
      const { skeleton, state } = spine;
      const info = {
        skin: "full-skins/girl",
      };
      gui
        .add(info, "skin", [
          "full-skins/girl",
          "full-skins/girl-blue-cape",
          "full-skins/girl-spring-dress",
          "full-skins/boy",
        ])
        .onChange((skinName) => {
          skeleton.setSkinByName(skinName);
          skeleton.setSlotsToSetupPose();
          state.data.defaultMix = 0.2;
          state.setAnimation(0, 'dress-up', false);
          state.addAnimation(0, 'idle', true, 0);
        });
      
    });

  engine.run();
});
