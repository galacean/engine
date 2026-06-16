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

function createParticleRenderer(engine: Engine, name: string): ParticleRenderer {
  const scene = engine.sceneManager.activeScene;
  const entity = scene.getRootEntity().createChild(name);
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

  it("Birth fires emitCount sub particles per parent event", () => {
    const parent = createParticleRenderer(engine, "Parent_Birth");
    const child = createParticleRenderer(engine, "Child_Birth");

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth, undefined, undefined, 2);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(5), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(5);
    expect(child.generator._getAliveParticleCount()).to.equal(10); // 5 events × emitCount 2

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Sub system's own EmissionModule does not double-fire when sub-emit drives it", () => {
    // The target renderer has its own t=0 burst AND is auto-playing on enable.
    // The slot must NOT read that burst and re-fire — sub system's own emission
    // and the sub-emit path are independent.
    const parent = createParticleRenderer(engine, "Parent_NoDouble");
    const child = createParticleRenderer(engine, "Child_NoDouble");

    // Child has its OWN t=0 burst of 4. With playOnEnabled=true (default),
    // child auto-plays and fires 4 from its own EmissionModule.
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(3), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();
    child.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(3);
    // Expected: 4 from child's own burst + 3 events × emitCount 1 = 7
    // If the slot wrongly re-read child's t=0 burst we'd see 3 events × 4 = 12 + 4 = 16
    expect(child.generator._getAliveParticleCount()).to.equal(7);

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

    updateEngine(engine, 3);
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

  it("Multi-level Birth chain A→B→C propagates synchronously", () => {
    const a = createParticleRenderer(engine, "Chain_A");
    const b = createParticleRenderer(engine, "Chain_B");
    const c = createParticleRenderer(engine, "Chain_C");

    a.generator.subEmitters.enabled = true;
    a.generator.subEmitters.addSubEmitter(b, ParticleSubEmitterType.Birth, undefined, undefined, 2);
    b.generator.subEmitters.enabled = true;
    b.generator.subEmitters.addSubEmitter(c, ParticleSubEmitterType.Birth, undefined, undefined, 1);

    a.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));
    a.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    b.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    c.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    a.generator.play();

    updateEngine(engine, 5);
    expect(a.generator._getAliveParticleCount()).to.equal(2);
    expect(b.generator._getAliveParticleCount()).to.equal(4); // 2 A births × 2
    expect(c.generator._getAliveParticleCount()).to.equal(4); // 4 B births × 1 (broken before this change)

    a.entity.destroy();
    b.entity.destroy();
    c.entity.destroy();
  });

  it("Multi-level Birth chain keeps each sibling's emission position (regression)", () => {
    const a = createParticleRenderer(engine, "Clobber_A");
    const b = createParticleRenderer(engine, "Clobber_B");
    const c = createParticleRenderer(engine, "Clobber_C");

    // B sits 10 units from A, so its sub particles land at local x = -10. A and C emit
    // at their own origins, so C's local x is 0 — a clear marker of cross-talk.
    b.entity.transform.setPosition(10, 0, 0);

    a.generator.subEmitters.enabled = true;
    a.generator.subEmitters.addSubEmitter(b, ParticleSubEmitterType.Birth, undefined, undefined, 2);
    b.generator.subEmitters.enabled = true;
    b.generator.subEmitters.addSubEmitter(c, ParticleSubEmitterType.Birth, undefined, undefined, 1);

    a.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    a.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    b.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    c.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    a.generator.play();

    updateEngine(engine, 5);

    const stride = 42; // ParticleBufferUtils.instanceVertexFloatStride
    const verts = (b.generator as any)._instanceVertices as Float32Array;
    expect(b.generator._getAliveParticleCount()).to.equal(2);
    expect(verts[0]).to.be.closeTo(-10, 1e-4); // B particle 1
    // Particle 1's Birth nested into C (origin) mid-loop; particle 2 must still read -10, not 0.
    expect(verts[stride]).to.be.closeTo(-10, 1e-4);

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

    updateEngine(engine, 3);
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

  it("Birth Velocity inherit emits along the parent's birth emission direction", () => {
    // Birth velocity is closed-form (the parent's emission direction at spawn), no transform
    // feedback needed. A cone aimed down -Z, rotated 90° about X, should make the sub particle
    // emit along +Y in world space (-Z → +Y under a 90° X rotation).
    function build(name: string, rotXDeg: number) {
      const parent = createParticleRenderer(engine, name + "_P");
      const child = createParticleRenderer(engine, name + "_C");
      parent.generator.main.startSpeed.constant = 2;
      const shape = new ConeShape();
      shape.angle = 0;
      shape.radius = 0;
      parent.generator.emission.shape = shape;
      parent.entity.transform.rotation = new Vector3(rotXDeg, 0, 0);
      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(
        child,
        ParticleSubEmitterType.Birth,
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
    const straight = build("BirthVelStraight", 0);
    const spun = build("BirthVelSpun", 90);
    updateEngine(engine, 5);

    // a_DirectionTime @ float offset 4..6 holds the child's (normalized) emission direction.
    const s = (straight.child.generator as any)._instanceVertices as Float32Array;
    expect(straight.child.generator._getAliveParticleCount()).to.equal(1);
    expect(s[4]).to.be.closeTo(0, 1e-4);
    expect(s[5]).to.be.closeTo(0, 1e-4);
    expect(s[6]).to.be.closeTo(-1, 1e-4);

    // 90° about X maps the cone's -Z emission to +Y; without Birth velocity it stayed -Z.
    const r = (spun.child.generator as any)._instanceVertices as Float32Array;
    expect(r[4]).to.be.closeTo(0, 1e-4);
    expect(r[5]).to.be.closeTo(1, 1e-4);
    expect(r[6]).to.be.closeTo(0, 1e-4);

    straight.parent.entity.destroy();
    straight.child.entity.destroy();
    spun.parent.entity.destroy();
    spun.child.entity.destroy();
  });
});
