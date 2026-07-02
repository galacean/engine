/**
 * @title Particle Noise
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  Engine,
  Entity,
  ParticleCompositeCurve,
  ParticleCurveMode,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  ConeShape,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0, 0, 0, 1);

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 0);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JPsCSK5LtYkAAAAAAAAAAAAADil6AQ/original",
      type: AssetType.Texture
    })
    .then((texture) => {
      createNoiseParticle(engine, rootEntity, <Texture2D>texture);

      updateForE2E(engine, 200);
      initScreenshot(engine, camera);
    });
});

function createNoiseParticle(engine: Engine, rootEntity: Entity, texture: Texture2D): void {
  const particleEntity = new Entity(engine, "Noise");
  particleEntity.transform.setPosition(0, 0, -2);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(0.4, 0.8, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);

  const { main, emission, noise, colorOverLifetime } = generator;

  // Main
  main.duration = 3;
  main.isLoop = true;
  main.startLifetime.constantMin = 0.3;
  main.startLifetime.constantMax = 0.6;
  main.startLifetime.mode = ParticleCurveMode.TwoConstants;
  main.startSpeed.constantMin = 4;
  main.startSpeed.constantMax = 4;
  main.startSpeed.mode = ParticleCurveMode.TwoConstants;
  main.startSize.constantMin = 0.05;
  main.startSize.constantMax = 0.1;
  main.startSize.mode = ParticleCurveMode.TwoConstants;
  main.gravityModifier.constant = -0.5;
  main.simulationSpace = ParticleSimulationSpace.Local;
  main.maxParticles = 200;

  // Emission
  emission.rateOverTime.constant = 40;
  const coneShape = new ConeShape();
  coneShape.angle = 25;
  coneShape.radius = 0.00001;
  emission.shape = coneShape;

  // Color over lifetime
  // colorOverLifetime.enabled = true;
  // colorOverLifetime.color.mode = ParticleGradientMode.Gradient;
  // const gradient = colorOverLifetime.color.gradient;
  // gradient.alphaKeys[0].alpha = 0;
  // gradient.alphaKeys[1].alpha = 0;
  // gradient.addAlphaKey(0.1, 1.0);
  // gradient.addAlphaKey(0.8, 1.0);

  // Noise
  noise.enabled = true;
  noise.strengthX = new ParticleCompositeCurve(1);
  noise.strengthY = new ParticleCompositeCurve(1);
  noise.strengthZ = new ParticleCompositeCurve(1);
  noise.frequency = 1;
  noise.scrollSpeed = 0;
  noise.octaveCount = 1;
  noise.octaveIntensityMultiplier = 0.5;
  noise.octaveFrequencyMultiplier = 2.0;

  rootEntity.addChild(particleEntity);
}
