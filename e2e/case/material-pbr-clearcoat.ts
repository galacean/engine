/**
 * @title PBR Clearcoat
 * @category Material
 */
import {
  AmbientLight,
  AssetType,
  Camera,
  DirectLight,
  GLTFResource,
  Logger,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const { background } = scene;
  const rootEntity = scene.createRootEntity();

  const directLightNode = rootEntity.createChild("dir_light");
  directLightNode.addComponent(DirectLight);
  directLightNode.transform.setRotation(30, 0, 0);

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.setPosition(1, 0, 17);
  cameraNode.transform.lookAt(new Vector3());
  const camera = cameraNode.addComponent(Camera);

  Promise.all([
    engine.resourceManager
      .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/16875768-21cf-481f-b05f-454c17866ba0.glb")
      .then((gltf) => {
        const { defaultSceneRoot } = gltf;
        const entity = rootEntity.createChild();
        entity.addChild(defaultSceneRoot);
      }),
    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*KabxT4d8GHcAAAAAgEAAAAgAekp5AQ/Internal/Bake/ambient.env"
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
      })
  ]).then(() => {
    updateForE2E(engine);

    initScreenshot(engine, camera);
  });
});
