/**
 * @title PBR Helmet
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*qbWBT62EnaAAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AmbientLight,
  AssetType,
  BackgroundMode,
  Camera,
  DirectLight,
  GLTFResource,
  Logger,
  PrimitiveMesh,
  SkyBoxMaterial,
  WebGLEngine,
} from "@galacean/engine";
Logger.enable();
// Create engine object
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const { ambientLight, background } = scene;
  const rootEntity = scene.createRootEntity();

  const directLightNode = rootEntity.createChild("dir_light");
  const directLightNode2 = rootEntity.createChild("dir_light2");
  directLightNode.addComponent(DirectLight);
  directLightNode2.addComponent(DirectLight);
  directLightNode.transform.setRotation(30, 0, 0);
  directLightNode2.transform.setRotation(-30, 180, 0);

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.setPosition(0, 0, 5);
  cameraNode.addComponent(Camera);
  cameraNode.addComponent(OrbitControl);

  // Create sky
  const sky = background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  background.mode = BackgroundMode.Sky;

  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  Promise.all([
    engine.resourceManager
      .load<GLTFResource>(
        "https://gw.alipayobjects.com/os/bmw-prod/150e44f6-7810-4c45-8029-3575d36aff30.gltf"
      )
      .then((gltf) => {
        const entity = rootEntity.createChild("");
        entity.addChild(gltf.defaultSceneRoot);
      }),
    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/f369110c-0e33-47eb-8296-756e9c80f254.bin",
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
        skyMaterial.texture = ambientLight.specularTexture;
        skyMaterial.textureDecodeRGBM = true;
      }),
  ]).then(() => {
    engine.run();
  });
});
