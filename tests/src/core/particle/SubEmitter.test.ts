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
  ParticleStopMode,
  ParticleSubEmitterInheritProperty,
  ParticleSubEmitterType,
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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Birth;
    sub.emitCount = 2;

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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Birth;
    sub.emitCount = 1;

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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Death;
    sub.emitCount = 3;

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

  it("emitProbability = 0 skips all events", () => {
    const parent = createParticleRenderer(engine, "Parent_Prob");
    const child = createParticleRenderer(engine, "Child_Prob");

    parent.generator.subEmitters.enabled = true;
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Birth;
    sub.emitProbability = 0;

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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Birth;

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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Birth;
    sub.inheritProperties = ParticleSubEmitterInheritProperty.Color;

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

  it("Self-reference does not infinite-recurse", () => {
    const parent = createParticleRenderer(engine, "Parent_Self");

    parent.generator.subEmitters.enabled = true;
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = parent;
    sub.type = ParticleSubEmitterType.Birth;

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(2);

    parent.entity.destroy();
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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Death;
    sub.inheritProperties = ParticleSubEmitterInheritProperty.Color;

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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Death;
    sub.inheritProperties = ParticleSubEmitterInheritProperty.Size;

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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Birth;
    sub.inheritProperties = ParticleSubEmitterInheritProperty.Rotation;

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
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Death;
    sub.inheritProperties = ParticleSubEmitterInheritProperty.Rotation;

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
});
