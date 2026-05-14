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
  ParticleSubEmitterProperty,
  ParticleSubEmitterType,
  SphereShape,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  engine.canvas.resizeByClientSize();

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
    .then((texture) => {
      createSubEmitterScene(engine, rootEntity, <Texture2D>texture);
      // 50ms × 14 frames = 0.7s total.
      // Parent burst at t=0, lifetime 0.3s → all retire around t=0.3s, Death events
      // spawn sub particles. Sub lifetime 0.8s → at snapshot (t=0.7s) sub particles
      // are roughly half-way through their life — visibly distinct, color & size
      // inherited from parent.
      updateForE2E(engine, 50, 14);
      initScreenshot(engine, camera);
    });
});

function createSubEmitterScene(engine: Engine, rootEntity: Entity, texture: Texture2D): void {
  // ── Sub particle target: each parent Death spawns a small splash here, inheriting
  //    parent's Color and Size. Sub particles fan out via cone shape.
  const subEntity = rootEntity.createChild("Sub");
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
  // Don't auto-play sub renderer; parent Death event drives it.
  subMain.playOnEnabled = false;
  subGenerator.emission.rateOverTime.constant = 0;

  // Cone shape so sub particles spray outward.
  const subShape = new ConeShape();
  subShape.angle = 35;
  subShape.radius = 0.05;
  subShape.emitType = ConeEmitType.Base;
  subGenerator.emission.shape = subShape;

  // ── Parent: bursts a fan of bright particles from a sphere shape, dies after a
  //    short lifetime, triggering sub-emitter Death event.
  const parentEntity = rootEntity.createChild("Parent");
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

  // Sphere shape spreads parent particles outward in all directions.
  const parentShape = new SphereShape();
  parentShape.radius = 0.2;
  parentGenerator.emission.shape = parentShape;

  // Parent COL: orange-tinted multiplier fades from white (no tint at t=0) to a
  // dim warm color at t=1. At Death, the parent's visible color is
  // startColor × COL(1) — children inherit that, not the raw startColor.
  const parentCOL = parentGenerator.colorOverLifetime;
  parentCOL.enabled = true;
  parentCOL.color.mode = ParticleGradientMode.Gradient;
  (parentCOL.color as any).gradient = new ParticleGradient(
    [new GradientColorKey(0, new Color(1, 1, 1, 1)), new GradientColorKey(1, new Color(0.5, 0.3, 0.2, 1))],
    [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)]
  );

  // Parent SOL: shrink to 60% of start over lifetime. Sub spawns at Death pick
  // up parent's visible (shrunk) size, not the raw startSize.
  const parentSOL = parentGenerator.sizeOverLifetime;
  parentSOL.enabled = true;
  parentSOL.size.mode = ParticleCurveMode.Curve;
  (parentSOL.size as any).curve = new ParticleCurve(new CurveKey(0, 1.0), new CurveKey(1, 0.6));

  // Sub-emitter slot: parent's Death → 4 sub particles at each parent's last
  // position. Inherit chain (matches what's visible at Death):
  //   sub.color = sub.startColor × (parent.startColor × COL(1))
  //   sub.size  = sub.startSize  × (parent.startSize  × SOL(1))
  parentGenerator.subEmitters.enabled = true;
  const slot = parentGenerator.subEmitters.addSubEmitter();
  slot.emitter = subRenderer;
  slot.type = ParticleSubEmitterType.Death;
  slot.emitCount = 4;
  slot.inheritProperties = ParticleSubEmitterProperty.Color | ParticleSubEmitterProperty.Size;

  parentGenerator.play();
}
