/**
 * @title Screen Space Ambient Occlusion
 * @category Camera
 */
import {
  AmbientLight,
  AmbientOcclusionQuality,
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
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

// Create engine
WebGLEngine.create({
  canvas: "canvas",
  shaderCompiler: new ShaderCompiler(),
  graphicDeviceOptions: { webGLMode: WebGLMode.WebGL1 }
}).then((engine) => {
  engine.canvas.setResolution(2400, 1600);

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0.8, 1, 3.5);
  const camera = cameraEntity.addComponent(Camera);

  scene.ambientOcclusion.enabled = true;
  scene.ambientOcclusion.quality = AmbientOcclusionQuality.High;

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).color = new Color(1, 1, 1);
  lightNode.transform.rotate(new Vector3(-45, 60, 0));

  const { background } = scene;
  const sky = background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  background.mode = BackgroundMode.Sky;
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  // Sphere
  const sphereMaterial = new PBRMaterial(engine);
  sphereMaterial.baseColor = new Color(1, 1, 1, 1);
  const sphere = rootEntity.createChild("sphere");
  sphere.transform.setPosition(0, 1, 0);
  sphere.transform.setRotation(45, 45, 0);
  const meshRenderer = sphere.addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createSubdivisionSurfaceSphere(engine);
  meshRenderer.setMaterial(sphereMaterial);

  // Box
  const boxMaterial = new PBRMaterial(engine);
  boxMaterial.baseColor = new Color(1, 1, 1, 1);
  const box = rootEntity.createChild("box");
  box.transform.setPosition(1, 0.9, 0.1);
  box.transform.setRotation(30, 30, 0);
  const boxMeshRenderer = box.addComponent(MeshRenderer);
  boxMeshRenderer.mesh = PrimitiveMesh.createCuboid(engine);
  boxMeshRenderer.setMaterial(boxMaterial);

  // Capsule (transparent)
  const capsuleMaterial = new PBRMaterial(engine);
  capsuleMaterial.baseColor = new Color(1, 1, 1, 0.5);
  capsuleMaterial.isTransparent = true;

  const capsule = rootEntity.createChild("capsule");
  capsule.transform.setPosition(1, 0.9, 0.1);
  capsule.transform.setRotation(30, 30, 0);
  const capsuleMeshRenderer = capsule.addComponent(MeshRenderer);
  capsuleMeshRenderer.mesh = PrimitiveMesh.createCapsule(engine);
  capsuleMeshRenderer.setMaterial(capsuleMaterial);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.AmbientLight,
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*eRJ8QKzf5zAAAAAAgBAAAAgAekp5AQ/ambient.ambLight"
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      skyMaterial.texture = ambientLight.specularTexture;
      ambientLight.diffuseIntensity = 1;
      ambientLight.specularIntensity = 1;
    })
    .then(() => {
      // engine.run();
      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
