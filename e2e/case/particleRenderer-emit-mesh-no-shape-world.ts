/**
 * @title Particle Enit Mesh No Shape World
 * @category Particle
 */
import {
  AssetType,
  Camera,
  Color,
  Engine,
  Entity,
  GLTFResource,
  Logger,
  MeshRenderer,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  PrimitiveMesh,
  Texture2D,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 1, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.nearClipPlane = 0.3;
  camera.farClipPlane = 1000;

  engine.resourceManager
    .load([
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*yu-DSb0surwAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D
      },
      {
        url: "https://gw.alipayobjects.com/os/OasisHub/267000040/9994/%25E5%25BD%2592%25E6%25A1%25A3.gltf",
        type: AssetType.GLTF
      }
    ])
    .then((resoueces) => {
      const particleEntity = createFireParticle(
        rootEntity,
        engine,
        <Texture2D>resoueces[0],
        <GLTFResource>resoueces[1]
      );
      rootEntity.addChild(particleEntity);

      updateForE2E(engine, 500);
      initScreenshot(engine, camera);
    });
});

function createFireParticle(rootEntity: Entity, engine: Engine, texture: Texture2D, glTFModel: GLTFResource): Entity {
  const meshRenderer = rootEntity.createChild("Mesh").addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createCylinder(engine);
  const unlitMaterial = new UnlitMaterial(engine);
  unlitMaterial.baseTexture = glTFModel.textures[0];
  meshRenderer.setMaterial(unlitMaterial);

  const particleEntity = new Entity(engine, "EmitMeshParticle");
  particleEntity.transform.rotation.set(90, -45, 30);
  particleEntity.transform.scale.set(6, 4, 12);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
  // material.blendMode = BlendMode.Additive;
  material.baseTexture = glTFModel.textures[0];
  particleRenderer.setMaterial(material);

  particleRenderer.renderMode = ParticleRenderMode.Mesh;
  // particleRenderer.mesh = glTFModel.meshes[0][0];
  particleRenderer.mesh = PrimitiveMesh.createCylinder(engine);

  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;
  const { main, emission, textureSheetAnimation, sizeOverLifetime, colorOverLifetime } = generator;

  // Main module
  const { startLifetime, startSpeed, startSize, startRotationZ } = main;
  startSpeed.constant = 1.0;
  startSize.constant = 0.2;

  main.simulationSpace = ParticleSimulationSpace.World;
  main.startRotationZ.constant = 90;

  return particleEntity;
}
