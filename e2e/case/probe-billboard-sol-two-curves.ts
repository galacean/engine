/**
 * @title SOL probe probe-billboard-sol-two-curves
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

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();
  const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 12);
  const camera = cameraEntity.addComponent(Camera);

  const particleEntity = new Entity(engine, "Probe");
  const particleRenderer = particleEntity.addComponent(ParticleRenderer);
  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1.0, 0.5, 0.2, 1.0);
  particleRenderer.setMaterial(material);

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
  sizeOverLifetime.size = new ParticleCompositeCurve(
    new ParticleCurve(new CurveKey(0, 0.3), new CurveKey(1, 0.5)),
    new ParticleCurve(new CurveKey(0, 1.2), new CurveKey(1, 2.0))
  );

  rootEntity.addChild(particleEntity);
  updateForE2E(engine, 300);
  initScreenshot(engine, camera);
});
