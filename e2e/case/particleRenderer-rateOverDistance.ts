/**
 * @title Particle Rate Over Distance
 * @category Particle
 */
import {
  BlendMode,
  Camera,
  Color,
  Engine,
  Entity,
  ParticleCompositeCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  Script,
  SphereShape,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0, 0, 0, 1);

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 12);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  const particleEntity = buildRateOverDistanceParticle(engine);
  particleEntity.addComponent(SweepScript);
  rootEntity.addChild(particleEntity);

  updateForE2E(engine, 50);
  initScreenshot(engine, camera);
});

function buildRateOverDistanceParticle(engine: Engine): Entity {
  const particleEntity = new Entity(engine, "RateOverDistance");
  particleEntity.transform.setPosition(-5, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(0.4, 0.8, 1.0, 1.0);
  material.blendMode = BlendMode.Additive;
  particleRenderer.setMaterial(material);

  const { main, emission } = generator;

  // Long lifetime so the trail stays visible end-to-end in the screenshot.
  main.duration = 3;
  main.isLoop = true;
  main.startLifetime.constant = 3;
  // No initial velocity — particles stay where they were emitted so the
  // emitter's path is what we see in the capture.
  main.startSpeed.constant = 0;
  main.startSize.constant = 0.2;
  main.gravityModifier.constant = 0;
  // World space so particles do NOT follow the moving emitter; the trail
  // marks the path.
  main.simulationSpace = ParticleSimulationSpace.World;
  main.maxParticles = 500;

  // Only distance-driven emission for this case.
  emission.rateOverTime = new ParticleCompositeCurve(0);
  emission.rateOverDistance = new ParticleCompositeCurve(2);

  // Small point-ish source so the trail reads as a line, not a cloud.
  const sphereShape = new SphereShape();
  sphereShape.radius = 0.01;
  emission.shape = sphereShape;

  return particleEntity;
}

class SweepScript extends Script {
  private _x: number = -5;
  // Constant horizontal velocity so the emitter sweeps across the view in
  // the deterministic ~0.5s the e2e drives, regardless of frame count.
  private readonly _speed: number = 20.0;

  onUpdate(deltaTime: number): void {
    this._x += this._speed * deltaTime;
    this.entity.transform.setPosition(this._x, 0, 0);
  }
}
