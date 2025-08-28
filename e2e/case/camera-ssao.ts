/**
 * @title Screen Space Ambient Occlusion
 * @category Camera
 */
import {
  AmbientLight,
  AssetType,
  BackgroundMode,
  Camera,
  Color,
  DirectLight,
  Logger,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  SkyBoxMaterial,
  SSAOQuality,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  const { ambientLight, background } = scene;

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0.8, 1, 3.5);
  const camera = cameraEntity.addComponent(Camera);

  scene.ssao.enabled = true;
  scene.ssao.radius = 0.4;
  scene.ssao.intensity = 3;
  scene.ssao.power = 1.0;
  scene.ssao.bias = 0.0005;
  scene.ssao.bilateralThreshold = 0.01;
  scene.ssao.quality = SSAOQuality.High;

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).color = new Color(1, 1, 1);
  lightNode.transform.rotate(new Vector3(-45, 60, 0));

  const sky = background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  background.mode = BackgroundMode.Sky;
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  const sphereMaterial = new PBRMaterial(engine);
  sphereMaterial.baseColor = new Color(1, 1, 1, 1);
  const sphere = rootEntity.createChild("sphere");
  const { transform } = sphere;
  transform.setPosition(0, 1, 0);
  transform.setRotation(45, 45, 0);
  const meshRenderer = sphere.addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createSubdivisionSurfaceSphere(engine);
  meshRenderer.setMaterial(sphereMaterial);

  const box = rootEntity.createChild("box");
  const boxMaterial = new PBRMaterial(engine);
  boxMaterial.baseColor = new Color(1, 1, 1, 1);
  box.transform.setPosition(1, 0.9, 0.1);
  box.transform.setRotation(30, 30, 0);
  const boxMeshRenderer = box.addComponent(MeshRenderer);
  boxMeshRenderer.mesh = PrimitiveMesh.createCuboid(engine);
  boxMeshRenderer.setMaterial(boxMaterial);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      skyMaterial.texture = ambientLight.specularTexture;
      skyMaterial.textureDecodeRGBM = true;
      ambientLight.diffuseIntensity = 1;
      ambientLight.specularIntensity = 1;
    })
    .then(() => {
      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
