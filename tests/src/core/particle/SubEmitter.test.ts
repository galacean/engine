import {
  Burst,
  Camera,
  Color,
  CurveKey,
  Engine,
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
  ParticleStopMode,
  ParticleSubEmitterInheritProperty,
  ParticleSubEmitterType,
  Scene,
  ConeShape,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

function updateEngine(engine: Engine, frames: number, deltaTime = 100) {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  //@ts-ignore
  engine._time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < frames; i++) {
    engine.update();
  }
}

function createParticleRenderer(
  engine: Engine,
  name: string,
  scene = engine.sceneManager.activeScene
): ParticleRenderer {
  const root = scene.getRootEntity() ?? scene.createRootEntity();
  const entity = root.createChild(name);
  const renderer = entity.addComponent(ParticleRenderer);
  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1, 1, 1, 1);
  renderer.setMaterial(material);

  const generator = renderer.generator;
  generator.useAutoRandomSeed = false;
  generator.main.duration = 5;
  generator.main.isLoop = false;
  generator.main.maxParticles = 1000;
  generator.main.startLifetime.constant = 10;
  generator.emission.rateOverTime.constant = 0;

  return renderer;
}

describe("SubEmitter", () => {
  let engine: Engine;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");
    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);
    engine.run();
  });

  it("Birth runs the target EmissionModule for every live parent", () => {
    const parent = createParticleRenderer(engine, "Parent_Birth");
    const child = createParticleRenderer(engine, "Child_Birth");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth, undefined, undefined, 99);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(5), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(5);
    expect(child.generator._getAliveParticleCount()).to.equal(25); // 5 parents × 10/s × 0.5s; emitCount is ignored

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth evaluates the target Burst separately for every parent", () => {
    const parent = createParticleRenderer(engine, "Parent_NoDouble");
    const child = createParticleRenderer(engine, "Child_NoDouble");

    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(3), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(3);
    expect(child.generator._getAliveParticleCount()).to.equal(12); // 3 parents × Burst 4

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth runs the target Rate Over Time independently for every live parent", () => {
    const child = createParticleRenderer(engine, "SystemRate_Child");
    const parent = createParticleRenderer(engine, "SystemRate_Parent");
    parent.generator.main.startLifetime.constant = 1;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      99
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(2);
    expect(child.generator._getAliveParticleCount()).to.equal(10); // 2 parents × 10/s × 0.5s

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth follows the TF position and keeps full parent speed for Inherit Velocity", () => {
    const child = createParticleRenderer(engine, "SystemVelocity_Child");
    const parent = createParticleRenderer(engine, "SystemVelocity_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 4;
    child.generator.main.startSpeed.constant = 1;
    child.generator.emission.rateOverTime.constant = 10;
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve.constant = 0.5;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[2]).to.be.closeTo(-0.4, 1e-4); // current TF parent position
    expect(vertices[6]).to.be.closeTo(-1, 1e-4);
    expect(vertices[18]).to.be.closeTo(3, 1e-4); // child 1 + complete parent speed 4 × 0.5

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth consumes the post-orbital TF position and finite-difference trajectory velocity", () => {
    const child = createParticleRenderer(engine, "SystemOrbital_Child");
    const parent = createParticleRenderer(engine, "SystemOrbital_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.velocityOverLifetime.enabled = true;
    parent.generator.velocityOverLifetime.orbitalY = new ParticleCompositeCurve(Math.PI / 2);
    parent.generator.velocityOverLifetime.centerOffset.set(-1, 0, 0);

    child.generator.main.startSpeed.constant = 0;
    child.generator.emission.rateOverTime.constant = 10;
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve.constant = 1;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const parentFeedback = new Float32Array(6);
    parent.generator._feedbackSimulator.readBinding.buffer.getData(parentFeedback, 0, 0, parentFeedback.length);
    const childVertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(childVertices[0]).to.be.closeTo(parentFeedback[0], 1e-5);
    expect(childVertices[1]).to.be.closeTo(parentFeedback[1], 1e-5);
    expect(childVertices[2]).to.be.closeTo(parentFeedback[2], 1e-5);

    const childSpeed = childVertices[18];
    expect(childVertices[4] * childSpeed).to.be.closeTo(parentFeedback[0] / 0.1, 1e-4);
    expect(childVertices[5] * childSpeed).to.be.closeTo(parentFeedback[1] / 0.1, 1e-4);
    expect(childVertices[6] * childSpeed).to.be.closeTo(parentFeedback[2] / 0.1, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth is topologically scheduled and updates while outside every camera", () => {
    const child = createParticleRenderer(engine, "SystemOrder_Child");
    const parent = createParticleRenderer(engine, "SystemOrder_Parent");
    parent.entity.transform.setPosition(100000, 0, 0);
    parent.generator.main.startLifetime.constant = 1;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 2);
    expect(parent.generator._getAliveParticleCount()).to.equal(1);
    expect(child.generator._getAliveParticleCount()).to.equal(2);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth evaluates target Start Delay, Burst, and Rate Over Distance", () => {
    const child = createParticleRenderer(engine, "SystemEmission_Child");
    const parent = createParticleRenderer(engine, "SystemEmission_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 1;
    child.generator.main.startDelay.constant = 0.2;
    child.generator.emission.rateOverDistance.constant = 10;
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 2);
    expect(child.generator._getAliveParticleCount()).to.equal(0);
    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(3);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth runtime state follows parent slots through ring-buffer growth", () => {
    const child = createParticleRenderer(engine, "SystemResize_Child");
    const parent = createParticleRenderer(engine, "SystemResize_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.maxParticles = 256;
    child.generator.main.maxParticles = 256;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(130), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(parent.generator._getAliveParticleCount()).to.equal(130);
    expect(child.generator._getAliveParticleCount()).to.equal(130);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death fires sub-emitter when parent particles age out", () => {
    const parent = createParticleRenderer(engine, "Parent_Death");
    const child = createParticleRenderer(engine, "Child_Death");
    parent.generator.main.startLifetime.constant = 0.5;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death, undefined, undefined, 3);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(parent.generator._getAliveParticleCount()).to.equal(0);
    expect(child.generator._getAliveParticleCount()).to.equal(12); // 4 deaths × emitCount 3

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death consumes the current transform-feedback position at the particle lifetime", () => {
    const parent = createParticleRenderer(engine, "Parent_DeathCurrentPosition");
    const child = createParticleRenderer(engine, "Child_DeathCurrentPosition");
    parent.generator.main.startLifetime.constant = 0.25;
    parent.generator.main.startSpeed.constant = 2;
    parent.generator.main.gravityModifier.constant = 0;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[0]).to.be.closeTo(0, 1e-5);
    expect(vertices[1]).to.be.closeTo(0, 1e-5);
    expect(vertices[2]).to.be.closeTo(-0.5, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death timestamps child particles at the parent lifetime boundary", () => {
    const parent = createParticleRenderer(engine, "Parent_DeathTimestamp");
    const child = createParticleRenderer(engine, "Child_DeathTimestamp");
    parent.generator.main.startLifetime.constant = 0.25;
    parent.generator.main.gravityModifier.constant = 0;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 3);
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[7]).to.be.closeTo(0.25, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("preserves surviving feedback when current-frame emissions use a partial second pass", () => {
    const parent = createParticleRenderer(engine, "Parent_DeathPartialFeedback");
    const child = createParticleRenderer(engine, "Child_DeathPartialFeedback");
    parent.generator.main.startLifetime.constant = 10;
    parent.generator.main.startSpeed.constant = 2;
    parent.generator.main.gravityModifier.constant = 0;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.emission.addBurst(new Burst(0.15, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 2);
    expect(parent.generator._getAliveParticleCount()).to.equal(2);

    const feedback = new Float32Array(12);
    parent.generator._feedbackSimulator.readBinding.buffer.getData(feedback, 0, 0, feedback.length);
    expect(feedback[2]).to.be.closeTo(-0.4, 1e-5);
    expect(feedback[8]).to.be.closeTo(-0.1, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death slot reconciles transform-feedback on enable (deserialize path)", () => {
    const parent = createParticleRenderer(engine, "Parent_Reconcile");
    const child = createParticleRenderer(engine, "Child_Reconcile");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death, undefined, undefined, 3);

    // Mimic deserialization: a Death slot is present but transform-feedback was never set up
    // (config restored without going through the setters that call _setTransformFeedback).
    (parent.generator as any)._useTransformFeedback = false;
    (parent.generator as any)._feedbackSimulator = null;

    // Re-enable runs _onEnable, which reconciles transform-feedback from the current config.
    parent.entity.isActive = false;
    parent.entity.isActive = true;

    expect((parent.generator as any)._useTransformFeedback).to.equal(true);
    expect((parent.generator as any)._feedbackSimulator).to.not.equal(null);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("emitProbability = 0 skips all events", () => {
    const parent = createParticleRenderer(engine, "Parent_Prob");
    const child = createParticleRenderer(engine, "Child_Prob");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth, undefined, 0);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(20), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(20);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Disabled module does not dispatch", () => {
    const parent = createParticleRenderer(engine, "Parent_Disabled");
    const child = createParticleRenderer(engine, "Child_Disabled");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = false;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(3), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(3);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Color inherit multiplies parent start color into child", () => {
    const parent = createParticleRenderer(engine, "Parent_Color");
    const child = createParticleRenderer(engine, "Child_Color");
    parent.generator.main.startColor.constant = new Color(0.5, 0.25, 1.0, 1.0);
    child.generator.main.startColor.constant = new Color(1.0, 1.0, 1.0, 1.0);
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.Color
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // a_StartColor @ float offsets 8..11 (slot 0 = first emitted slot)
    expect(verts[8]).to.be.closeTo(0.5, 1e-4); // r
    expect(verts[9]).to.be.closeTo(0.25, 1e-4); // g
    expect(verts[10]).to.be.closeTo(1.0, 1e-4); // b

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Self-reference throws at configuration time", () => {
    const parent = createParticleRenderer(engine, "Parent_Self");

    parent.generator.subEmitters.enabled = true;
    expect(() => parent.generator.subEmitters.addSubEmitter(parent, ParticleSubEmitterType.Birth)).to.throw(
      "Sub-emitter would create a cycle"
    );

    parent.entity.destroy();
  });

  it("rejects sub-emitters from another scene at configuration time", () => {
    const parent = createParticleRenderer(engine, "CrossScene_Parent");
    const secondScene = new Scene(engine, "CrossScene_Target");
    engine.sceneManager.addScene(secondScene);
    const child = createParticleRenderer(engine, "CrossScene_Child", secondScene);
    expect(parent.entity.scene).not.to.equal(child.entity.scene);

    expect(() => parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth)).to.throw(
      "Sub-emitter target must belong to the same scene as its parent particle system"
    );

    parent.entity.destroy();
    child.entity.destroy();
    secondScene.destroy();
  });

  it("rejects assigning an existing sub-emitter to another scene", () => {
    const parent = createParticleRenderer(engine, "CrossSceneAssignment_Parent");
    const child = createParticleRenderer(engine, "CrossSceneAssignment_Child");
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    const secondScene = new Scene(engine, "CrossSceneAssignment_Target");
    engine.sceneManager.addScene(secondScene);
    const target = createParticleRenderer(engine, "CrossSceneAssignment_Target", secondScene);

    expect(() => (parent.generator.subEmitters.subEmitters[0].emitter = target)).to.throw(
      "Sub-emitter target must belong to the same scene as its parent particle system"
    );
    expect(parent.generator.subEmitters.subEmitters[0].emitter).to.equal(child);

    parent.entity.destroy();
    child.entity.destroy();
    target.entity.destroy();
    secondScene.destroy();
  });

  it("rejects sub-emitters after their target moves to another scene", () => {
    const parent = createParticleRenderer(engine, "MovedTarget_Parent");
    const child = createParticleRenderer(engine, "MovedTarget_Child");
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.subEmitters.enabled = true;

    const secondScene = new Scene(engine, "MovedTarget_Scene");
    engine.sceneManager.addScene(secondScene);
    secondScene.addRootEntity(child.entity);
    expect(parent.entity.scene).not.to.equal(child.entity.scene);

    expect(() => (parent.entity.scene as any)._componentsManager._particleSystemManager.update(0.1)).to.throw(
      "Sub-emitter target must belong to the same scene as its parent particle system"
    );

    parent.entity.destroy();
    child.entity.destroy();
    secondScene.destroy();
  });

  it("Indirect cycle A→B→A throws at configuration time", () => {
    const a = createParticleRenderer(engine, "Cycle_A");
    const b = createParticleRenderer(engine, "Cycle_B");

    // A → B is fine.
    a.generator.subEmitters.enabled = true;
    a.generator.subEmitters.addSubEmitter(b, ParticleSubEmitterType.Birth);

    // B → A would close the cycle A→B→A.
    b.generator.subEmitters.enabled = true;
    expect(() => b.generator.subEmitters.addSubEmitter(a, ParticleSubEmitterType.Birth)).to.throw(
      "Sub-emitter would create a cycle"
    );

    a.entity.destroy();
    b.entity.destroy();
  });

  it("Multi-level Birth chain consumes each target EmissionModule in topological order", () => {
    const c = createParticleRenderer(engine, "Chain_C");
    const b = createParticleRenderer(engine, "Chain_B");
    const a = createParticleRenderer(engine, "Chain_A");
    b.generator.emission.rateOverTime.constant = 10;
    c.generator.emission.rateOverTime.constant = 10;

    a.generator.subEmitters.enabled = true;
    a.generator.subEmitters.addSubEmitter(b, ParticleSubEmitterType.Birth);
    b.generator.subEmitters.enabled = true;
    b.generator.subEmitters.addSubEmitter(c, ParticleSubEmitterType.Birth);

    a.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    a.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    b.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    c.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    a.generator.play(false);

    updateEngine(engine, 3);
    expect(a.generator._getAliveParticleCount()).to.equal(1);
    expect(b.generator._getAliveParticleCount()).to.equal(3);
    expect(c.generator._getAliveParticleCount()).to.equal(3);

    a.entity.destroy();
    b.entity.destroy();
    c.entity.destroy();
  });

  it("Color inherit at Death uses parent's COL-modulated value (matches visible color)", () => {
    // Parent: startColor white, COL fades to (0.5, 0.5, 0.5, 1) at t=1.
    // Child:  startColor white.
    // Death inherit Color → child.a_StartColor = parent.startColor × COL(1) × child.startColor
    //   = (1,1,1,1) × (0.5,0.5,0.5,1) × (1,1,1,1) = (0.5, 0.5, 0.5, 1).
    // Inheriting the visible color (not the raw start color) keeps children
    // consistent with what the parent looked like the moment it died.
    const parent = createParticleRenderer(engine, "Parent_ColorCOL");
    const child = createParticleRenderer(engine, "Child_ColorCOL");

    parent.generator.main.startLifetime.constant = 0.5;
    parent.generator.main.startColor.constant = new Color(1, 1, 1, 1);
    child.generator.main.startColor.constant = new Color(1, 1, 1, 1);

    // Parent COL: white at t=0 → half-grey at t=1.
    const colorKeys = [
      new GradientColorKey(0, new Color(1, 1, 1, 1)),
      new GradientColorKey(1, new Color(0.5, 0.5, 0.5, 1))
    ];
    const alphaKeys = [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)];
    const parentCOL = parent.generator.colorOverLifetime;
    parentCOL.enabled = true;
    parentCOL.color.mode = ParticleGradientMode.Gradient;
    (parentCOL.color as any).gradient = new ParticleGradient(colorKeys, alphaKeys);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Death,
      ParticleSubEmitterInheritProperty.Color
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // a_StartColor @ float offsets 8..11
    expect(verts[8]).to.be.closeTo(0.5, 1e-3); // r
    expect(verts[9]).to.be.closeTo(0.5, 1e-3); // g
    expect(verts[10]).to.be.closeTo(0.5, 1e-3); // b
    expect(verts[11]).to.be.closeTo(1.0, 1e-3); // a

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Size inherit at Death uses parent's SOL-modulated value (matches visible size)", () => {
    // Parent: startSize 1, SOL Curve ramps 1 → 0.5 across lifetime.
    // Child:  startSize 2.
    // Death inherit Size → child.a_StartSize = parent.startSize × SOL(1) × child.startSize
    //                                        = 1 × 0.5 × 2 = 1.0.
    const parent = createParticleRenderer(engine, "Parent_SizeSOL");
    const child = createParticleRenderer(engine, "Child_SizeSOL");

    parent.generator.main.startLifetime.constant = 0.5;
    parent.generator.main.startSize.constant = 1;
    child.generator.main.startSize.constant = 2;

    const sizeCurve = new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 0.5));
    const parentSOL = parent.generator.sizeOverLifetime;
    parentSOL.enabled = true;
    parentSOL.size.mode = ParticleCurveMode.Curve;
    (parentSOL.size as any).curve = sizeCurve;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Death,
      ParticleSubEmitterInheritProperty.Size
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // a_StartSize @ float offsets 12..14
    expect(verts[12]).to.be.closeTo(1.0, 1e-3); // x
    expect(verts[13]).to.be.closeTo(1.0, 1e-3); // y
    expect(verts[14]).to.be.closeTo(1.0, 1e-3); // z

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Rotation inherit adds parent start rotation onto child start rotation", () => {
    // Parent: startRotationZ 0.5 rad. Child: startRotationZ 0.25 rad.
    // Birth inherit Rotation → child.a_StartRotation = child.startRotation + parent.startRotation
    //                                                = 0.25 + 0.5 = 0.75 rad.
    const parent = createParticleRenderer(engine, "Parent_Rotation");
    const child = createParticleRenderer(engine, "Child_Rotation");

    parent.generator.main.startRotationZ.constant = 0.5;
    child.generator.main.startRotationZ.constant = 0.25;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.Rotation
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // 2D rotation mode (default) stores Z rotation in the X slot of a_StartRotation0 (float offset 15).
    expect(verts[15]).to.be.closeTo(0.75, 1e-3);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Rotation inherit at Death adds parent's ROL-accumulated rotation", () => {
    // Parent: startRotationZ 0, ROL.rotationZ rate 2 per second, lifetime 0.5s.
    //   Accumulated rotation at Death (normalizedAge=1) = 2 × 0.5 = 1.0.
    // Child:  startRotationZ 0.25.
    // Death inherit Rotation → child.a_StartRotation
    //   = child.startRotation + (parent.startRotation + cumulative ROL)
    //   = 0.25 + (0 + 1.0) = 1.25.
    const parent = createParticleRenderer(engine, "Parent_RotationROL");
    const child = createParticleRenderer(engine, "Child_RotationROL");

    parent.generator.main.startLifetime.constant = 0.5;
    parent.generator.main.startRotationZ.constant = 0;
    child.generator.main.startRotationZ.constant = 0.25;

    const parentROL = parent.generator.rotationOverLifetime;
    parentROL.enabled = true;
    parentROL.rotationZ.mode = ParticleCurveMode.Constant;
    parentROL.rotationZ.constant = 2;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Death,
      ParticleSubEmitterInheritProperty.Rotation
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // a_StartRotation0.x @ float offset 15 (2D mode stores Z rotation here)
    expect(verts[15]).to.be.closeTo(1.25, 1e-3);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("World-space Velocity inherit rotates feedback velocity by the spawn rotation (regression)", () => {
    // World sim, gravity off, cone angle 0 → feedback velocity is exactly (0,0,-1) in the
    // spawn-local frame. That frame persists in the feedback buffer regardless of sim space,
    // so converting to world must use the emitter's spawn rotation, not identity.
    function build(name: string, rotXDeg: number) {
      const parent = createParticleRenderer(engine, name + "_P");
      const child = createParticleRenderer(engine, name + "_C");
      parent.generator.main.simulationSpace = ParticleSimulationSpace.World;
      parent.generator.main.gravityModifier.constant = 0;
      parent.generator.main.startLifetime.constant = 0.5;
      parent.generator.main.startSpeed.constant = 2;
      const shape = new ConeShape();
      shape.angle = 0;
      shape.radius = 0;
      parent.generator.emission.shape = shape;
      parent.entity.transform.rotation = new Vector3(rotXDeg, 0, 0);
      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(
        child,
        ParticleSubEmitterType.Death,
        ParticleSubEmitterInheritProperty.Velocity,
        undefined,
        1
      );
      parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
      parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
      child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
      parent.generator.play();
      return { parent, child };
    }
    const straight = build("VelStraight", 0);
    const spun = build("VelSpun", 90);
    updateEngine(engine, 10);

    // a_DirectionTime @ float offset 4..6 holds the child's (normalized) emission direction.
    const s = (straight.child.generator as any)._instanceVertices as Float32Array;
    expect(straight.child.generator._getAliveParticleCount()).to.equal(1);
    expect(s[4]).to.be.closeTo(0, 1e-4);
    expect(s[5]).to.be.closeTo(0, 1e-4);
    expect(s[6]).to.be.closeTo(-1, 1e-4);

    // Spawn rotation 90° about X maps (0,0,-1) → (0,1,0); under the bug it stayed (0,0,-1).
    const r = (spun.child.generator as any)._instanceVertices as Float32Array;
    expect(r[4]).to.be.closeTo(0, 1e-4);
    expect(r[5]).to.be.closeTo(1, 1e-4);
    expect(r[6]).to.be.closeTo(0, 1e-4);

    straight.parent.entity.destroy();
    straight.child.entity.destroy();
    spun.parent.entity.destroy();
    spun.child.entity.destroy();
  });

  it("Birth Inherit Velocity uses the parent world trajectory", () => {
    function build(name: string, rotXDeg: number) {
      const parent = createParticleRenderer(engine, name + "_P");
      const child = createParticleRenderer(engine, name + "_C");
      parent.generator.main.startSpeed.constant = 2;
      child.generator.main.startSpeed.constant = 0;
      child.generator.emission.rateOverTime.constant = 10;
      child.generator.inheritVelocity.enabled = true;
      child.generator.inheritVelocity.curve.constant = 1;
      const shape = new ConeShape();
      shape.angle = 0;
      shape.radius = 0;
      parent.generator.emission.shape = shape;
      parent.entity.transform.rotation = new Vector3(rotXDeg, 0, 0);
      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
      parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
      parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      parent.generator.play(false);
      return { parent, child };
    }
    const straight = build("BirthVelStraight", 0);
    const spun = build("BirthVelSpun", 90);
    updateEngine(engine, 1);

    const s = (straight.child.generator as any)._instanceVertices as Float32Array;
    expect(straight.child.generator._getAliveParticleCount()).to.equal(1);
    expect(s[4]).to.be.closeTo(0, 1e-4);
    expect(s[5]).to.be.closeTo(0, 1e-4);
    expect(s[6]).to.be.closeTo(-1, 1e-4);
    expect(s[18]).to.be.closeTo(2, 1e-4);

    const r = (spun.child.generator as any)._instanceVertices as Float32Array;
    expect(r[4]).to.be.closeTo(0, 1e-4);
    expect(r[5]).to.be.closeTo(1, 1e-4);
    expect(r[6]).to.be.closeTo(0, 1e-4);
    expect(r[18]).to.be.closeTo(2, 1e-4);

    straight.parent.entity.destroy();
    straight.child.entity.destroy();
    spun.parent.entity.destroy();
    spun.child.entity.destroy();
  });

  it("Birth enables transform-feedback to sample the parent trajectory", () => {
    const parent = createParticleRenderer(engine, "Encap_TypeParent");
    const child = createParticleRenderer(engine, "Encap_TypeChild");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    expect((parent.generator as any)._useTransformFeedback).to.equal(true);
    expect((parent.generator as any)._feedbackSimulator).to.not.equal(null);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Changing a slot's emitter to form a cycle throws", () => {
    const a = createParticleRenderer(engine, "Encap_CycleA");
    const b = createParticleRenderer(engine, "Encap_CycleB");
    const c = createParticleRenderer(engine, "Encap_CycleC");
    a.generator.subEmitters.enabled = true;
    b.generator.subEmitters.enabled = true;
    a.generator.subEmitters.addSubEmitter(b, ParticleSubEmitterType.Birth); // A → B
    b.generator.subEmitters.addSubEmitter(c, ParticleSubEmitterType.Birth); // B → C

    // Redirect B's slot from C to A — that closes A → B → A. The setter must reject it.
    const slot = b.generator.subEmitters.subEmitters[0];
    expect(() => {
      slot.emitter = a;
    }).to.throw("Sub-emitter would create a cycle");
    expect(slot.emitter).to.equal(c); // value left unchanged on rejection

    a.entity.destroy();
    b.entity.destroy();
    c.entity.destroy();
  });

  it("Sub-emitter stays inert on WebGL1 instead of crashing on Death", () => {
    const parent = createParticleRenderer(engine, "WebGL1_Parent");
    const child = createParticleRenderer(engine, "WebGL1_Child");
    parent.generator.main.startLifetime.constant = 0.5;

    // Pretend WebGL1 from the start: the whole module must be inert (enabled → false),
    // and no transform-feedback buffer is built, so a parent death never reads a null buffer.
    const hardwareRenderer = (engine as any)._hardwareRenderer;
    const realIsWebGL2 = hardwareRenderer._isWebGL2;
    hardwareRenderer._isWebGL2 = false;
    try {
      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death, undefined, undefined, 3);

      expect(parent.generator.subEmitters.enabled).to.equal(false);
      expect((parent.generator as any)._useTransformFeedback).to.equal(false);
      expect((parent.generator as any)._feedbackSimulator).to.not.exist;

      parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));
      parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
      child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
      parent.generator.play();
      expect(() => updateEngine(engine, 10)).to.not.throw(); // parent death must not crash
      expect(child.generator._getAliveParticleCount()).to.equal(0); // Death inert on WebGL1
    } finally {
      hardwareRenderer._isWebGL2 = realIsWebGL2;
    }

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Cloned sub-emitter slots re-link to the cloned module", () => {
    const parent = createParticleRenderer(engine, "CloneParent");
    const child = createParticleRenderer(engine, "CloneChild");
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    const cloneEntity = parent.entity.clone();
    engine.sceneManager.activeScene.addRootEntity(cloneEntity);
    const cloneRenderer = cloneEntity.getComponent(ParticleRenderer);
    const cloneSlot = cloneRenderer.generator.subEmitters.subEmitters[0];

    // The cloned slot's back-pointer must target the cloned module, not the source or null
    expect((cloneSlot as any)._module).to.equal(cloneRenderer.generator.subEmitters);
    expect((cloneSlot as any)._module).to.not.equal(parent.generator.subEmitters);

    // And it must be functional: changing the cloned slot's type drives the cloned generator's
    // transform feedback without dereferencing a null module
    expect(() => (cloneSlot.type = ParticleSubEmitterType.Death)).to.not.throw();

    cloneEntity.destroy();
    parent.entity.destroy();
    child.entity.destroy();
  });
});
