/**
 * @title Particle Velocity Orbital Constant
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  ConeShape,
  Engine,
  Entity,
  ParticleCompositeCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  Texture2D,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
}).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0.01, 0.01, 0.012, 1);

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(30.8, 40.8, -49.3);
  cameraEntity.transform.lookAt(new Vector3(5.8, 7.7, 7.1));
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 38;

  engine.resourceManager
    .load<Texture2D>({
      url: "https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*OiP_RLwuFqAAAAAAQBAAAAgAegDwAQ/original",
      type: AssetType.Texture
    })
    .then((texture) => {
      createOrbitalConstantParticle(engine, rootEntity, texture);

      updateForE2E(engine, 160, 31);
      initScreenshot(engine, camera);
    });
});

function createOrbitalConstantParticle(engine: Engine, rootEntity: Entity, texture: Texture2D): void {
  const particleEntity = new Entity(engine, "VelocityOrbitalConstant");

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  const generator = particleRenderer.generator;
  generator.randomSeed = 0;

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(0.35, 0.8, 1.0, 0.72);
  material.baseTexture = texture;
  material.blendMode = BlendMode.Additive;
  particleRenderer.setMaterial(material);

  const { main, emission, velocityOverLifetime } = generator;

  main.duration = 5;
  main.isLoop = true;
  main.startLifetime.constant = 5;
  main.startSpeed.constant = 5;
  main.startSize.constant = 0.7;
  main.gravityModifier.constant = 0;
  main.simulationSpace = ParticleSimulationSpace.Local;
  main.maxParticles = 1000;

  emission.rateOverTime.constant = 10;
  const shape = new ConeShape();
  shape.radius = 1;
  shape.angle = 25;
  shape.randomDirectionAmount = 0;
  shape.rotation.set(90, 0, 0);
  emission.shape = shape;

  velocityOverLifetime.enabled = true;
  velocityOverLifetime.space = ParticleSimulationSpace.Local;
  velocityOverLifetime.velocityX = new ParticleCompositeCurve(1);
  velocityOverLifetime.velocityY = new ParticleCompositeCurve(10);
  velocityOverLifetime.velocityZ = new ParticleCompositeCurve(1);
  velocityOverLifetime.orbitalX = new ParticleCompositeCurve(1);
  velocityOverLifetime.orbitalY = new ParticleCompositeCurve(1);
  velocityOverLifetime.orbitalZ = new ParticleCompositeCurve(1);
  velocityOverLifetime.centerOffset = new Vector3(2, 0, 0);
  velocityOverLifetime.radial = new ParticleCompositeCurve(5);

  rootEntity.addChild(particleEntity);
}
