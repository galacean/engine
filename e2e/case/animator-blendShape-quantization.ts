/**
 * @title Animation BlendShape Quantization
 * @category Animation
 */
import {
  Animator,
  Camera,
  Color,
  DirectLight,
  Entity,
  GLTFResource,
  SkinnedMeshRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({
  canvas: "canvas"
}).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootNode = scene.createRootEntity();
  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
  const directLightEntity = rootNode.createChild("light");
  directLightEntity.transform.setPosition(-9, 15, 17);
  directLightEntity.transform.lookAt(new Vector3(0, 0, 0));
  const directLightComp = directLightEntity.addComponent(DirectLight);
  directLightComp.color = new Color(1, 1, 1, 1);
  directLightComp.intensity = 1;

  // Create camera
  const cameraNode = new Entity(engine, "camera_node");
  cameraNode.transform.position = new Vector3(0, 0, 30);
  const camera = cameraNode.addComponent(Camera);
  camera.nearClipPlane = 0.1;
  camera.farClipPlane = 1000;
  scene.addRootEntity(cameraNode);
  cameraNode.transform.lookAt(new Vector3());

  engine.resourceManager
    .load<GLTFResource>(
      "https://mdn.alipayobjects.com/oasis_be/afts/file/A*9eZ0SJBf8ZsAAAAAAAAAAAAADkp5AQ/0312Ani_12FPS_tex.glb"
    )
    .then((gltf) => {
      const gltfEntity = gltf.defaultSceneRoot;
      gltfEntity.getComponent(Animator)!;
      rootNode.addChild(gltfEntity);

      const animator = gltfEntity.getComponentsIncludeChildren(SkinnedMeshRenderer, []);
      animator.forEach((item) => {
        item.blendShapeWeights[3] = 1.0;
      });

      updateForE2E(engine);
      const category = "Animator";
      const name = "animator-blendShape-quantization";
      initScreenshot(category, name, engine, camera);
    });
});
