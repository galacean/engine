/**
 * @title PBR Base
 * @category Material
 */
import {
  AmbientLight,
  AssetType,
  BackgroundMode,
  Camera,
  DirectLight,
  GLTFResource,
  PrimitiveMesh,
  SkyBoxMaterial,
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
  directLight.intensity = 0.5;
  directLightNode.transform.setPosition(5, 5, 5);
  directLightNode.transform.lookAt(new Vector3(0, 0, 0));

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.position = new Vector3(0.25, 0.25, 1.5);
  const camera = cameraNode.addComponent(Camera);

  // Create sky
  const sky = scene.background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  scene.background.mode = BackgroundMode.Sky;
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  Promise.all([
    engine.resourceManager
      .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/477b0093-7ee8-41af-a0dd-836608a4f130.gltf")
      .then((gltf) => {
        const { defaultSceneRoot } = gltf;
        rootEntity.addChild(defaultSceneRoot);
        defaultSceneRoot.transform.setScale(100, 100, 100);
      }),
    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/f369110c-0e33-47eb-8296-756e9c80f254.bin"
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
        skyMaterial.texture = ambientLight.specularTexture;
        skyMaterial.textureDecodeRGBM = true;
      })
  ]).then(() => {
    updateForE2E(engine);
    const category = "Material";
    const name = "material-pbr";
    initScreenshot(category, name, engine, camera);
  });
});
