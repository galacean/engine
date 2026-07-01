/**
 * @title Particle Burst Cycles
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  Burst,
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
  SphereShape,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  engine.canvas.setResolution(1200, 800);

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0, 0, 0, 1);

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 2, 18);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JPsCSK5LtYkAAAAAAAAAAAAADil6AQ/original",
      type: AssetType.Texture
    })
    .then((texture) => {
      createBurstCyclesParticle(engine, rootEntity, <Texture2D>texture);
      updateForE2E(engine, 50);
      initScreenshot(engine, camera);
    });
});

function createBurstCyclesParticle(engine: Engine, rootEntity: Entity, texture: Texture2D): void {
  const particleEntity = new Entity(engine, "BurstCycles");
  particleEntity.transform.setPosition(0, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(0.4, 0.8, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);

  const { main, emission, colorOverLifetime, sizeOverLifetime } = generator;

  // Main
  main.duration = 3;
  main.isLoop = true;
  main.startLifetime.constantMin = 1;
  main.startLifetime.constantMax = 2;
  main.startLifetime.mode = ParticleCurveMode.TwoConstants;
  main.startSpeed.constantMin = 2;
  main.startSpeed.constantMax = 5;
  main.startSpeed.mode = ParticleCurveMode.TwoConstants;
  main.startSize.constantMin = 0.1;
  main.startSize.constantMax = 0.3;
  main.startSize.mode = ParticleCurveMode.TwoConstants;
  main.gravityModifier.constant = -0.5;
  main.simulationSpace = ParticleSimulationSpace.World;
  main.maxParticles = 500;

  // Emission with burst cycles
  emission.rateOverTime.constant = 0;

  // Burst at t=0, 20 particles, repeats 4 times every 0.3s -> fires at 0, 0.3, 0.6, 0.9
  emission.addBurst(new Burst(0, new ParticleCompositeCurve(20), 4, 0.3));

  const sphereShape = new SphereShape();
  sphereShape.radius = 0.5;
  emission.shape = sphereShape;

  // Color over lifetime
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;
  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.1, 1.0);
  gradient.addAlphaKey(0.7, 1.0);

  // Size over lifetime
  sizeOverLifetime.enabled = true;
  sizeOverLifetime.size.mode = ParticleCurveMode.Curve;
  const curve = sizeOverLifetime.size.curve;
  curve.keys[0].value = 1;
  curve.keys[1].value = 0;

  rootEntity.addChild(particleEntity);
}
