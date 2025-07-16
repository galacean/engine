/**
 * @title PBR Specular
 * @category Material
 */
import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  Logger,
  MeshRenderer,
  PBRMaterial,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const directLightNode = rootEntity.createChild("dir_light");
  directLightNode.addComponent(DirectLight).color = new Color(2, 2, 2, 1);
  directLightNode.transform.setRotation(10, 20, 10);

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.setPosition(0, 0, 1.5);
  cameraNode.transform.lookAt(new Vector3());
  const camera = cameraNode.addComponent(Camera);

  Promise.all([
    engine.resourceManager
      .load<GLTFResource>(
        "https://mdn.alipayobjects.com/huamei_9ahbho/afts/file/A*NEFJQro2hFoAAAAATaAAAAgAegDwAQ/SpecularTest.glb"
      )
      .then((gltf) => {
        const { defaultSceneRoot } = gltf;
        const entity = rootEntity.createChild();
        entity.addChild(defaultSceneRoot);
      }),
    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
      })
  ]).then(() => {
    updateForE2E(engine);
    initScreenshot(engine, camera);
  });
});
