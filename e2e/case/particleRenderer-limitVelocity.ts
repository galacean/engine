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
  Logger,
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

// Create engine
WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0, 0, 0, 1);

  // Camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(2, 1.43, 30);
  cameraEntity.transform.setRotation(0, 0, 0);
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

  engine.run();

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JPsCSK5LtYkAAAAAAAAAAAAADil6AQ/original",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      createScalarLimitParticle(engine, rootEntity, <Texture2D>texture);
    });
});

function createScalarLimitParticle(engine: Engine, rootEntity: Entity, texture: Texture2D): void {
  const particleEntity = rootEntity.createChild("ScalarLimit");
  particleEntity.transform.setPosition(2.006557, 1.43, 12.35);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(0.2, 0.6, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  material.baseTexture = texture;
  particleRenderer.setMaterial(material);

  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;

  const { main, emission, limitVelocityOverLifetime, colorOverLifetime, velocityOverLifetime } = generator;

  // Main module
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

  // Color over lifetime: fade in then fade out
  colorOverLifetime.enabled = true;
  colorOverLifetime.color.mode = ParticleGradientMode.Gradient;
  const gradient = colorOverLifetime.color.gradient;
  gradient.alphaKeys[0].alpha = 0;
  gradient.alphaKeys[1].alpha = 0;
  gradient.addAlphaKey(0.2, 1.0);
  gradient.addAlphaKey(0.8, 1.0);

  // Velocity over lifetime (delayed activation)
  setTimeout(() => {
    velocityOverLifetime.enabled = true;
    velocityOverLifetime.velocityX.constant = 1;
    velocityOverLifetime.velocityY.constant = 20;
    velocityOverLifetime.velocityZ.constant = 1;
    console.log("s");
  }, 3000);

  // Limit velocity over lifetime
  limitVelocityOverLifetime.enabled = true;
  limitVelocityOverLifetime.separateAxes = true;
  limitVelocityOverLifetime.limitX = new ParticleCompositeCurve(1);
  limitVelocityOverLifetime.limitY = new ParticleCompositeCurve(1);
  limitVelocityOverLifetime.limitZ = new ParticleCompositeCurve(0);
  //   limitVelocityOverLifetime.limit = new ParticleCompositeCurve(1);
  limitVelocityOverLifetime.space = ParticleSimulationSpace.World;
  limitVelocityOverLifetime.dampen = 0.25;
  limitVelocityOverLifetime.drag = new ParticleCompositeCurve(0.0);
  limitVelocityOverLifetime.multiplyDragByParticleSize = true;
  limitVelocityOverLifetime.multiplyDragByParticleVelocity = true;

  //   limitVelocityOverLifetime.enabled = true;
  // limitVelocityOverLifetime.separateAxes = false;
  // limitVelocityOverLifetime.limit = new ParticleCompositeCurve(0);
  // limitVelocityOverLifetime.dampen = 1;
}
