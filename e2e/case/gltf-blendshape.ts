/**
 * @title Animation BlendShape
 * @category Animation
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import * as dat from "dat.gui";

import {
  Animator,
  Camera,
  DirectLight,
  Logger,
  SkinnedMeshRenderer,
  SystemInfo,
  Vector3,
  WebGLEngine,
  GLTFResource
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.width = window.innerWidth * SystemInfo.devicePixelRatio;
  engine.canvas.height = window.innerHeight * SystemInfo.devicePixelRatio;
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(-30, 1, 0);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 1.0;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(-45, -135, 0));

  engine.resourceManager
    .load<GLTFResource>(
      "https://mdn.alipayobjects.com/oasis_be/afts/file/A*IEO8T642jMkAAAAAAAAAAAAADkp5AQ/0318导出.glb"
    )
    .then((asset) => {
      const { defaultSceneRoot } = asset;
      rootEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator)!;

      animator.play("Right");
      const state = animator.getCurrentAnimatorState(0);
      state.clipStartTime = 1;
      state.clipEndTime = 1;

      updateForE2E(engine);

      const category = "GLTF";
      const name = "gltf-blendshape";
      initScreenshot(category, name, engine, camera);
    });
});
