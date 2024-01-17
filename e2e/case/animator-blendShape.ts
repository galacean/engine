/**
 * @title Animation BlendShape
 * @category Animation
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import {
  Animator,
  Camera,
  DirectLight,
  Logger,
  SkinnedMeshRenderer,
  Vector3,
  WebGLEngine,
  GLTFResource
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 1.0;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(-45, -135, 0));

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/746da3e3-fdc9-4155-8fee-0e2a97de4e72.glb")
    .then((asset) => {
      const { defaultSceneRoot } = asset;
      rootEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator);
      const skinMeshRenderer = defaultSceneRoot.getComponent(SkinnedMeshRenderer);

      skinMeshRenderer.blendShapeWeights[0] = 1.0;
      animator.play("TheWave");
      updateForE2E(engine);

      initScreenshot(engine, camera);
    });
});
