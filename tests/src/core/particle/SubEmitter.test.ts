import {
  Burst,
  Camera,
  Engine,
  ParticleCompositeCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleStopMode,
  ParticleSubEmitterProperty,
  ParticleSubEmitterType
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
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

  it("Birth emits 1 sub particle per parent event by default (no t=0 burst on sub)", () => {
    const parent = createParticleRenderer(engine, "Parent_Birth_Default");
    const child = createParticleRenderer(engine, "Child_Birth_Default");

    parent.generator.subEmitters.enabled = true;
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Birth;

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(5), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(5);
    expect(child.generator._getAliveParticleCount()).to.equal(5); // 5 events × 1

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Sub system t=0 burst count drives per-event emit count", () => {
    const parent = createParticleRenderer(engine, "Parent_Birth_Burst");
    const child = createParticleRenderer(engine, "Child_Birth_Burst");

    // Sub system has its own t=0 burst of 4 — each parent Birth event triggers 4 sub particles
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));

    parent.generator.subEmitters.enabled = true;
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Birth;

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(3), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(3);
    expect(child.generator._getAliveParticleCount()).to.equal(12); // 3 events × 4

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death fires sub-emitter when parent particles age out", () => {
    const parent = createParticleRenderer(engine, "Parent_Death");
    const child = createParticleRenderer(engine, "Child_Death");
    parent.generator.main.startLifetime.constant = 0.5;

    // Sub burst: 3 per event
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(3), 1, 0.01));

    parent.generator.subEmitters.enabled = true;
    const sub = parent.generator.subEmitters.addSubEmitter();
    sub.emitter = child;
    sub.type = ParticleSubEmitterType.Death;

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(parent.generator._getAliveParticleCount()).to.equal(0);
    expect(child.generator._getAliveParticleCount()).to.equal(12); // 4 deaths × 3

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
    sub.inheritProperties = ParticleSubEmitterProperty.Color;

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 3);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    //@ts-ignore
    const buf: Float32Array = child.generator._instanceVertices;
    expect(buf[8]).to.be.closeTo(0.5, 1e-4);
    expect(buf[9]).to.be.closeTo(0.25, 1e-4);
    expect(buf[10]).to.be.closeTo(1.0, 1e-4);

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
});
