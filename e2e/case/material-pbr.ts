/**
 * @title PBR Base
 * @category Material
 */
import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const directLightNode = rootEntity.createChild("dir_light");
  const directLight = directLightNode.addComponent(DirectLight);
  directLight.color = new Color(0.21404114048223255, 0.21404114048223255, 0.21404114048223255, 1);
  directLightNode.transform.setPosition(5, 5, 5);
  directLightNode.transform.lookAt(new Vector3(0, 0, 0));

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.position = new Vector3(0, 5, 20);
  const camera = cameraNode.addComponent(Camera);

  Promise.all([
    engine.resourceManager
      .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/7c7b887c-05d6-43dd-b354-216e738e81ed.gltf")
      .then((gltf) => {
        const { defaultSceneRoot } = gltf;
        rootEntity.addChild(defaultSceneRoot);
      }),
    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.AmbientLight,
        url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*eRJ8QKzf5zAAAAAAgBAAAAgAekp5AQ/ambient.ambLight"
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
      })
  ]).then(() => {
    updateForE2E(engine);

    initScreenshot(engine, camera);
  });
});
