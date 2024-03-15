/**
 * @title AnimatorStateScript
 * @category Animation
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import { Camera, DirectLight, GLTFResource, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 0, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 0, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 0.6;
  lightNode.transform.lookAt(new Vector3(0, 0, 0));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  engine.resourceManager
    .load<GLTFResource>(
      "https://mdn.alipayobjects.com/rms/afts/file/A*fdYSRrN2gzwAAAAAAAAAAAAAARQnAQ/helmet-meshopt.glb"
    )
    .then((gltfResource) => {
      const { defaultSceneRoot } = gltfResource;

      rootEntity.addChild(defaultSceneRoot);

      updateForE2E(engine, 30);
      // animator.crossFade("run", 0.5, 0, 0);
      updateForE2E(engine, 100);

      initScreenshot(engine, camera);
    });
});
