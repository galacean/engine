/**
 * @title HDR Background
 * @category Scene
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*28IwT4efgy8AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AssetType,
  BackgroundMode,
  Camera,
  Logger,
  PrimitiveMesh,
  SkyBoxMaterial,
  TextureCube,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.position = new Vector3(-3, 0, 3);
  const camera = cameraNode.addComponent(Camera);
  cameraNode.addComponent(OrbitControl);
  camera.fieldOfView = 65;

  // Create sky
  const sky = scene.background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  scene.background.mode = BackgroundMode.Sky;
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  engine.resourceManager
    .load<TextureCube>({
      type: AssetType.HDR,
      url: "https://gw.alipayobjects.com/os/bmw-prod/b578946a-8a25-4543-8161-fa92f92ae1ac.bin",
    })
    .then((texture) => {
      skyMaterial.texture = texture;
      // HDR output is in RGBM format.
      skyMaterial.textureDecodeRGBM = true;
      engine.run();
    });
});
