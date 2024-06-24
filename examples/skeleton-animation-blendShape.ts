/**
 * @title Animation BlendShape
 * @category Animation
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*wn9UQ5ystoYAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  Animator,
  Camera,
  DirectLight,
  Logger,
  SkinnedMeshRenderer,
  SystemInfo,
  Vector3,
  WebGLEngine,
  GLTFResource,
} from "@galacean/engine";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.width = window.innerWidth * SystemInfo.devicePixelRatio;
  engine.canvas.height = window.innerHeight * SystemInfo.devicePixelRatio;
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 1.0;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(-45, -135, 0));

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/746da3e3-fdc9-4155-8fee-0e2a97de4e72.glb"
    )
    .then((asset) => {
      const { defaultSceneRoot } = asset;
      rootEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator);
      const skinMeshRenderer =
        defaultSceneRoot.getComponent(SkinnedMeshRenderer);

      skinMeshRenderer.blendShapeWeights[0] = 1.0;

      animator.play("TheWave");
    });

  engine.run();
});
