/**
 * @title Particle Sub Emitter
 * @category Particle
 */
import {
  AssetType,
  BlendMode,
  Burst,
  Camera,
  Color,
  ConeEmitType,
  ConeShape,
  CurveKey,
  Engine,
  Entity,
  GradientAlphaKey,
  GradientColorKey,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleCurveMode,
  ParticleGradient,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  ParticleSubEmitterInheritProperty,
  ParticleSubEmitterType,
  SphereShape,
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
  cameraEntity.transform.setPosition(0, 1, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JPsCSK5LtYkAAAAAAAAAAAAADil6AQ/original",
      type: AssetType.Texture
    })
    .then(async (texture) => {
      createSubEmitterScene(engine, rootEntity, <Texture2D>texture);
      await updateForE2E(engine, 50, 14, true);
      initScreenshot(engine, camera);
    });
});

function createSubEmitterScene(engine: Engine, rootEntity: Entity, texture: Texture2D): void {
  const sceneRoot = new Entity(engine, "SubEmitterScene");

  const subEntity = sceneRoot.createChild("Sub");
  const subRenderer = subEntity.addComponent(ParticleRenderer);
  const subGenerator = subRenderer.generator;
  subGenerator.useAutoRandomSeed = false;

  const subMaterial = new ParticleMaterial(engine);
  subMaterial.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
  subMaterial.blendMode = BlendMode.Additive;
  subMaterial.baseTexture = texture;
  subRenderer.setMaterial(subMaterial);

  const subMain = subGenerator.main;
  subMain.duration = 1;
  subMain.isLoop = false;
  subMain.maxParticles = 500;
  subMain.startLifetime.constant = 0.8;
  subMain.startSpeed.mode = ParticleCurveMode.TwoConstants;
  subMain.startSpeed.constantMin = 0.8;
  subMain.startSpeed.constantMax = 2.5;
  subMain.startSize.constant = 0.15;
  subMain.startColor.constant = new Color(1, 1, 1, 1);
  subMain.gravityModifier.constant = 0.3;
  subMain.simulationSpace = ParticleSimulationSpace.World;
  subMain.playOnEnabled = false;
  subGenerator.emission.rateOverTime.constant = 0;

  const subShape = new ConeShape();
  subShape.angle = 35;
  subShape.radius = 0.05;
  subShape.emitType = ConeEmitType.Base;
  subGenerator.emission.shape = subShape;

  const parentEntity = sceneRoot.createChild("Parent");
  parentEntity.transform.setPosition(0, 1.2, 0);
  const parentRenderer = parentEntity.addComponent(ParticleRenderer);
  const parentGenerator = parentRenderer.generator;
  parentGenerator.useAutoRandomSeed = false;

  const parentMaterial = new ParticleMaterial(engine);
  parentMaterial.baseColor = new Color(1.0, 0.45, 0.15, 1.0);
  parentMaterial.blendMode = BlendMode.Additive;
  parentMaterial.baseTexture = texture;
  parentRenderer.setMaterial(parentMaterial);

  const parentMain = parentGenerator.main;
  parentMain.duration = 1;
  parentMain.isLoop = false;
  parentMain.maxParticles = 100;
  parentMain.startLifetime.constant = 0.3;
  parentMain.startSpeed.mode = ParticleCurveMode.TwoConstants;
  parentMain.startSpeed.constantMin = 3.0;
  parentMain.startSpeed.constantMax = 4.5;
  parentMain.startSize.constant = 0.5;
  parentMain.startColor.constant = new Color(1, 0.45, 0.15, 1);
  parentMain.gravityModifier.constant = 0;
  parentMain.simulationSpace = ParticleSimulationSpace.World;

  parentGenerator.emission.rateOverTime.constant = 0;
  parentGenerator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(10)));

  const parentShape = new SphereShape();
  parentShape.radius = 0.2;
  parentGenerator.emission.shape = parentShape;

  const parentCOL = parentGenerator.colorOverLifetime;
  parentCOL.enabled = true;
  parentCOL.color.mode = ParticleGradientMode.Gradient;
  (parentCOL.color as any).gradient = new ParticleGradient(
    [new GradientColorKey(0, new Color(1, 1, 1, 1)), new GradientColorKey(1, new Color(0.5, 0.3, 0.2, 1))],
    [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)]
  );

  const parentSOL = parentGenerator.sizeOverLifetime;
  parentSOL.enabled = true;
  parentSOL.size.mode = ParticleCurveMode.Curve;
  (parentSOL.size as any).curve = new ParticleCurve(new CurveKey(0, 1.0), new CurveKey(1, 0.6));

  parentGenerator.subEmitters.enabled = true;
  parentGenerator.subEmitters.addSubEmitter(
    subRenderer,
    ParticleSubEmitterType.Death,
    ParticleSubEmitterInheritProperty.Color |
      ParticleSubEmitterInheritProperty.Size |
      ParticleSubEmitterInheritProperty.Velocity,
    undefined,
    4
  );

  rootEntity.addChild(sceneRoot);
  parentGenerator.play();
}
