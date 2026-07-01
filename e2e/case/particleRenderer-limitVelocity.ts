/**
 * @title Particle Limit Velocity Over Lifetime
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
  SphereShape,
  ParticleCompositeCurve,
  ParticleCurveMode,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  PostProcess,
  BloomEffect,
  TonemappingEffect,
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
  cameraEntity.transform.setPosition(2, 1.43, 30);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.enableHDR = true;
  camera.enablePostProcess = true;

  // Post process
  const postProcess = rootEntity.addComponent(PostProcess);
  const bloom = postProcess.addEffect(BloomEffect);
  bloom.intensity.value = 1;
  bloom.threshold.value = 0.8;
  postProcess.addEffect(TonemappingEffect);

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JPsCSK5LtYkAAAAAAAAAAAAADil6AQ/original",
      type: AssetType.Texture
    })
    .then((texture) => {
      createParticle(engine, rootEntity, <Texture2D>texture);

      updateForE2E(engine, 30);
      initScreenshot(engine, camera);
    });
});

function createParticle(engine: Engine, rootEntity: Entity, texture: Texture2D): void {
  const particleEntity = new Entity(engine, "LimitVelocity");
  particleEntity.transform.setPosition(2.006557, 1.43, 12.35);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(0.2, 0.6, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);

  const { main, emission, limitVelocityOverLifetime, colorOverLifetime, velocityOverLifetime } = generator;

  // Main
  main.duration = 2;
  main.isLoop = true;
  main.startDelay.constant = 0;
  main.startLifetime.constantMin = 0.6;
  main.startLifetime.constantMax = 1;
  main.startLifetime.mode = ParticleCurveMode.TwoConstants;
  main.startSpeed.constantMin = 20;
  main.startSpeed.constantMax = 40;
  main.startSpeed.mode = ParticleCurveMode.TwoConstants;
  main.startSize.constantMin = 0.05;
  main.startSize.constantMax = 0.15;
  main.startSize.mode = ParticleCurveMode.TwoConstants;
  main.startColor.constantMin.set(280 / 255, 670 / 255, 2550 / 255, 1);
  main.startColor.constantMax.set(1130 / 255, 740 / 255, 2550 / 255, 1);
  main.startColor.mode = ParticleGradientMode.TwoConstants;
  main.gravityModifier.constant = 0;
  main.simulationSpace = ParticleSimulationSpace.Local;
  main.maxParticles = 100;

  // Emission
  emission.rateOverTime.constant = 0;
  emission.addBurst(new Burst(0, new ParticleCompositeCurve(10, 30)));
  const sphereShape = new SphereShape();
  sphereShape.radius = 0.8;
  emission.shape = sphereShape;

  // Color over lifetime
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;
  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.2, 1.0);
  gradient.addAlphaKey(0.8, 1.0);

  velocityOverLifetime.enabled = true;
  velocityOverLifetime.velocityX.constant = 1;
  velocityOverLifetime.velocityY.constant = 20;
  velocityOverLifetime.velocityZ.constant = 1;

  // Limit velocity over lifetime
  limitVelocityOverLifetime.enabled = true;
  limitVelocityOverLifetime.separateAxes = true;
  limitVelocityOverLifetime.speedX = new ParticleCompositeCurve(1);
  limitVelocityOverLifetime.speedY = new ParticleCompositeCurve(1);
  limitVelocityOverLifetime.speedZ = new ParticleCompositeCurve(0);
  limitVelocityOverLifetime.space = ParticleSimulationSpace.World;
  limitVelocityOverLifetime.dampen = 0.25;
  limitVelocityOverLifetime.drag = new ParticleCompositeCurve(0.0);
  limitVelocityOverLifetime.multiplyDragByParticleSize = true;
  limitVelocityOverLifetime.multiplyDragByParticleVelocity = true;

  rootEntity.addChild(particleEntity);
}
