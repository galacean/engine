/**
 * @title Screen Space Ambient Occlusion
 * @category Camera
 */
import {
  AmbientLight,
  AmbientOcclusionQuality,
  AssetType,
  BackgroundMode,
  BlendFactor,
  Camera,
  Color,
  DirectLight,
  Logger,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderQueueType,
  Shader,
  SkyBoxMaterial,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { PBRSource, registerIncludes } from "@galacean/engine-shader";
import { ShaderLab } from "@galacean/engine-shaderlab";

Logger.enable();

registerIncludes();

// Create engine
WebGLEngine.create({
  canvas: "canvas",
  shaderLab: new ShaderLab(),
  graphicDeviceOptions: { webGLMode: WebGLMode.WebGL1 }
}).then((engine) => {
  engine.canvas.resizeByClientSize(2);

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const pbrShader = Shader.create(PBRSource);

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
  sphereMaterial.shader = pbrShader;
  sphereMaterial.shaderData.setInt("depthWriteEnabled", 1);
  const sphere = rootEntity.createChild("sphere");
  sphere.transform.setPosition(0, 1, 0);
  sphere.transform.setRotation(45, 45, 0);
  const meshRenderer = sphere.addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createSubdivisionSurfaceSphere(engine);
  meshRenderer.setMaterial(sphereMaterial);

  // Box
  const boxMaterial = new PBRMaterial(engine);
  boxMaterial.baseColor = new Color(1, 1, 1, 1);
  boxMaterial.shader = pbrShader;
  boxMaterial.shaderData.setInt("depthWriteEnabled", 1);
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
  capsuleMaterial.shader = pbrShader;
  {
    const shaderData = capsuleMaterial.shaderData;
    shaderData.setInt("depthWriteEnabled", 1);
    shaderData.setInt("blendEnabled", 1);
    shaderData.setInt("renderQueueType", RenderQueueType.Transparent);
    shaderData.enableMacro("MATERIAL_IS_TRANSPARENT");

    shaderData.setInt("sourceColorBlendFactor", BlendFactor.SourceAlpha);
    shaderData.setInt("destinationColorBlendFactor", BlendFactor.OneMinusSourceAlpha);
    shaderData.setInt("sourceAlphaBlendFactor", BlendFactor.One);
    shaderData.setInt("destinationAlphaBlendFactor", BlendFactor.OneMinusSourceAlpha);
  }

  const capsule = rootEntity.createChild("capsule");
  capsule.transform.setPosition(1, 0.9, 0.1);
  capsule.transform.setRotation(30, 30, 0);
  const capsuleMeshRenderer = capsule.addComponent(MeshRenderer);
  capsuleMeshRenderer.mesh = PrimitiveMesh.createCapsule(engine);
  capsuleMeshRenderer.setMaterial(capsuleMaterial);

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
      // engine.run();
      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
