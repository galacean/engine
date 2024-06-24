/**
 * @title Skeleton Viewer
 * @category Toolkit
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*p-stTqq5NkEAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Animator,
  Camera,
  GLTFResource,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { SkeletonViewer } from "@galacean/engine-toolkit-skeleton-viewer";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootNode = scene.createRootEntity();
  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);

  // Create camera
  const cameraEntity = rootNode.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(10, 10, 30);
  cameraEntity.addComponent(Camera);
  const control = cameraEntity.addComponent(OrbitControl);
  control.target.set(0, 3, 0);

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/f40ef8dd-4c94-41d4-8fac-c1d2301b6e47.glb"
    )
    .then((gltf) => {
      const { defaultSceneRoot, animations } = gltf;
      const animator = defaultSceneRoot.getComponent(Animator);
      defaultSceneRoot.transform.setScale(0.1, 0.1, 0.1);
      rootNode.addChild(defaultSceneRoot);
      animator.play(animations[1].name);

      defaultSceneRoot.addComponent(SkeletonViewer);
    });

  // Run
  engine.run();
});
