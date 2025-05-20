/**
 * @title PBR Base
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*kXDCQpieYEEAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AmbientLight,
  AssetType,
  BackgroundMode,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  PrimitiveMesh,
  SkyBoxMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const gui = new dat.GUI();

  const directLightNode = rootEntity.createChild("dir_light");
  const directLight = directLightNode.addComponent(DirectLight);
  const dirFolder = gui.addFolder("DirectionalLight1");
  directLight.color = new Color(0.21404114048223255, 0.21404114048223255, 0.21404114048223255, 1);
  dirFolder.add(directLight, "enabled");
  dirFolder.add(directLight, "intensity", 0, 1);
  directLightNode.transform.setPosition(5, 5, 5);
  directLightNode.transform.lookAt(new Vector3(0, 0, 0));

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.position = new Vector3(0.25, 0.5, 1.5);
  cameraNode.addComponent(Camera);
  const control = cameraNode.addComponent(OrbitControl);
  control.target.set(0.25, 0.25, 0);

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
        url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
        skyMaterial.texture = ambientLight.specularTexture;
        skyMaterial.textureDecodeRGBM = true;

        const envFolder = gui.addFolder("EnvironmentMapLight");
        envFolder.add(ambientLight, "specularIntensity", 0, 1);
        envFolder.add(ambientLight, "diffuseIntensity", 0, 1);
      })
  ]).then(() => {
    engine.run();
  });
});
