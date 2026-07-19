/**
 * @title Particle Emit Mesh Size Over Lifetime
 * @category Particle
 */
import {
  Burst,
  Camera,
  Color,
  CurveKey,
  Engine,
  Entity,
  Logger,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  PrimitiveMesh,
  SphereShape,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

window.addEventListener("error", (e) => console.log("P-ERR", e.message));
window.addEventListener("unhandledrejection", (e: any) => console.log("P-REJ", String(e.reason)));

// Create engine
WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 12);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.nearClipPlane = 0.3;
  camera.farClipPlane = 1000;

  const particleEntity = createSizeOverLifetimeParticle(engine);
  rootEntity.addChild(particleEntity);

  console.log("P5 before update");
  updateForE2E(engine, 300);
  console.log("P6 updated");
  initScreenshot(engine, camera);
});

function createSizeOverLifetimeParticle(engine: Engine): Entity {
  const particleEntity = new Entity(engine, "MeshSizeOverLifetimeParticle");

  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 0.5, 0.2, 1.0);
  particleRenderer.setMaterial(material);

  particleRenderer.renderMode = ParticleRenderMode.Mesh;
  particleRenderer.mesh = PrimitiveMesh.createCuboid(engine);

  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;
  const { main, emission, sizeOverLifetime } = generator;

  main.startLifetime.constant = 10;
  main.startSpeed.constant = 0.5;
  main.startSize.constant = 0.7;

  emission.rateOverTime.constant = 0;
  emission.addBurst(new Burst(0, new ParticleCompositeCurve(16)));
  const shape = new SphereShape();
  shape.radius = 2.5;
  emission.shape = shape;

  sizeOverLifetime.enabled = true;
  sizeOverLifetime.separateAxes = true;
  sizeOverLifetime.sizeX = new ParticleCompositeCurve(
    new ParticleCurve(new CurveKey(0, 0.3), new CurveKey(1, 0.5)),
    new ParticleCurve(new CurveKey(0, 1.2), new CurveKey(1, 2.0))
  );
  sizeOverLifetime.sizeY = new ParticleCompositeCurve(
    new ParticleCurve(new CurveKey(0, 0.35), new CurveKey(1, 0.2)),
    new ParticleCurve(new CurveKey(0, 1.0), new CurveKey(1, 3.0))
  );
  sizeOverLifetime.sizeZ = new ParticleCompositeCurve(
    new ParticleCurve(new CurveKey(0, 0.4), new CurveKey(1, 0.3)),
    new ParticleCurve(new CurveKey(0, 0.9), new CurveKey(1, 1.5))
  );

  return particleEntity;
}
