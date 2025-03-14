/**
 * @title Particle Shape Mesh
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  Engine,
  Entity,
  GLTFResource,
  Logger,
  MeshShape,
  ParticleCurveMode,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderer,
  Texture2D,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: { webGLMode: WebGLMode.Auto }
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(15 / 255, 15 / 255, 15 / 255, 1);

  // Create camera
  const cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.transform.position = new Vector3(0, 1, 2.5);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  engine.run();

  engine.resourceManager
    .load([
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JPsCSK5LtYkAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture2D
      },
      {
        url: "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb",
        type: AssetType.GLTF
        // params: { keepMeshData: true },
      }
    ])
    .then((resources) => {
      const fireEntity = createDebrisParticle(engine, <Texture2D>resources[0], <GLTFResource>resources[1]);
      scene.addRootEntity(fireEntity);

      updateForE2E(engine, 500);
      initScreenshot(engine, camera);
    });
});

function createDebrisParticle(engine: Engine, texture: Texture2D, glTFResource: GLTFResource): Entity {
  const particleEntity = new Entity(engine, "Debris");

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);
  particleRenderer.priority = 2;

  particleRenderer.generator.useAutoRandomSeed = false;

  const { main, emission, sizeOverLifetime, colorOverLifetime, velocityOverLifetime } = particleRenderer.generator;

  // Main module
  main.startSpeed.constant = 0.05;

  main.startSize.constantMin = 0.1;
  main.startSize.constantMax = 0.2;
  main.startSize.mode = ParticleCurveMode.TwoConstants;

  main.startRotationZ.constantMin = 0;
  main.startRotationZ.constantMax = 360;
  main.startRotationZ.mode = ParticleCurveMode.TwoConstants;

  main.startColor.constantMin.set(255 / 255, 255 / 255, 255 / 255, 1.0);
  main.startColor.constantMax.set(13 / 255, 255 / 255, 0 / 255, 1.0);
  main.startColor.mode = ParticleGradientMode.TwoConstants;

  // Emission module
  emission.rateOverTime.constant = 100;

  const meshShape = new MeshShape();
  emission.shape = meshShape;
  meshShape.mesh = glTFResource.meshes![0][0];

  // Color over lifetime module
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;

  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.2, 1.0);
  gradient.addAlphaKey(0.8, 1.0);

  // Size over lifetime module
  // sizeOverLifetime.enabled = true;
  // const keys = sizeOverLifetime.size.curve.keys;
  // keys[0].value = 1;
  // keys[1].value = 0;

  return particleEntity;
}
