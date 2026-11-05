/**
 * @title Particle Inherit Velocity Stretched
 * @category Particle
 */
import {
  BlendMode,
  Burst,
  Camera,
  CircleShape,
  Color,
  CurveKey,
  Engine,
  Entity,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleInheritVelocityMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  Script,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
}).then((engine) => {
  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.01, 0.01, 0.015, 1);
  const root = scene.createRootEntity("Root");

  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;
  camera.orthographicSize = 6;
  camera.enableFrustumCulling = false;

  createCurrentSystem(engine, root);
  createInitialOrbitalSystem(engine, root);

  updateForE2E(engine, 100, 12);
  initScreenshot(engine, camera);
});

function createCurrentSystem(engine: Engine, root: Entity): void {
  const renderer = createMovingSystem(engine, "Current", 1.5, new Color(0.2, 0.8, 1, 1));
  const generator = renderer.generator;
  generator.inheritVelocity.mode = ParticleInheritVelocityMode.Current;
  generator.inheritVelocity.curve.constant = 1;
  root.addChild(renderer.entity);
}

function createInitialOrbitalSystem(engine: Engine, root: Entity): void {
  const renderer = createMovingSystem(engine, "InitialOrbital", -1.5, new Color(1, 0.45, 0.15, 1));
  const generator = renderer.generator;
  generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
  generator.inheritVelocity.curve = new ParticleCompositeCurve(
    new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 1))
  );

  const shape = new CircleShape();
  shape.radius = 0;
  shape.position.set(1, 0, 0);
  generator.emission.shape = shape;
  generator.velocityOverLifetime.enabled = true;
  generator.velocityOverLifetime.orbitalZ = new ParticleCompositeCurve(2);
  root.addChild(renderer.entity);
}

function createMovingSystem(engine: Engine, name: string, y: number, color: Color): ParticleRenderer {
  const entity = new Entity(engine, name);
  entity.transform.setPosition(-2.5, y, 0);
  entity.addComponent(LinearMoveScript);

  const renderer = entity.addComponent(ParticleRenderer);
  renderer.renderMode = ParticleRenderMode.StretchBillboard;
  renderer.velocityScale = 0.6;
  renderer.lengthScale = 1;

  const material = new ParticleMaterial(engine);
  material.baseColor = color;
  material.blendMode = BlendMode.Additive;
  renderer.setMaterial(material);

  const generator = renderer.generator;
  generator.useAutoRandomSeed = false;
  generator.randomSeed = 0;
  generator.main.duration = 3;
  generator.main.isLoop = false;
  generator.main.maxParticles = 4;
  generator.main.startLifetime.constant = 3;
  generator.main.startSpeed.constant = 0;
  generator.main.startSize.constant = 0.5;
  generator.main.simulationSpace = ParticleSimulationSpace.World;
  generator.emission.rateOverTime.constant = 0;
  generator.emission.addBurst(new Burst(0.25, new ParticleCompositeCurve(1)));
  generator.inheritVelocity.enabled = true;
  return renderer;
}

class LinearMoveScript extends Script {
  onUpdate(deltaTime: number): void {
    const position = this.entity.transform.position;
    this.entity.transform.setPosition(position.x + deltaTime * 2, position.y, position.z);
  }
}
