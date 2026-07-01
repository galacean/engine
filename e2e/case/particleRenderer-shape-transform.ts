/**
 * @title Particle Shape Transform
 * @category Particle
 */
import {
  Camera,
  Color,
  ConeShape,
  BoxShape,
  Engine,
  Entity,
  Logger,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.setResolution(1200, 800);

  const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");

  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 30);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.nearClipPlane = 0.3;
  camera.farClipPlane = 1000;

  // Cone with shape position offset
  createParticle(rootEntity, engine, -6, () => {
    const shape = new ConeShape();
    shape.position.set(0, 3, 0);
    return shape;
  });

  // Cone with shape rotation
  createParticle(rootEntity, engine, -2, () => {
    const shape = new ConeShape();
    shape.rotation.set(0, 0, 90);
    return shape;
  });

  // Box with shape scale
  createParticle(rootEntity, engine, 2, () => {
    const shape = new BoxShape();
    shape.scale.set(3, 1, 1);
    return shape;
  });

  // Cone with combined transform
  createParticle(rootEntity, engine, 6, () => {
    const shape = new ConeShape();
    shape.position.set(0, 2, 0);
    shape.rotation.set(0, 0, 45);
    shape.scale.set(2, 1, 1);
    return shape;
  });

  updateForE2E(engine, 500);
  initScreenshot(engine, camera);
});

function createParticle(rootEntity: Entity, engine: Engine, xPos: number, createShape: () => any): void {
  // Entity stays detached during configuration. Adding it to the tree triggers
  // _onEnable → play(), which only honors useAutoRandomSeed=false if we set it
  // before the entity becomes active. Otherwise play() would seed the
  // generator with Math.random(), producing a different screenshot every run.
  const particleEntity = new Entity(engine, "Particle");
  particleEntity.transform.position.set(xPos, 0, 0);

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
  particleRenderer.setMaterial(material);

  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;

  const { main, emission } = generator;
  main.startSpeed.constant = 3;
  main.startSize.constant = 0.15;
  main.simulationSpace = ParticleSimulationSpace.Local;

  emission.shape = createShape();

  rootEntity.addChild(particleEntity);
}
