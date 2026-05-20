import {
  Camera,
  Engine,
  Entity,
  ParticleMaterial,
  ParticleRenderer,
  ParticleStopMode
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function tick(engine: Engine, times: { value: number }, deltaMs: number = 100): void {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  //@ts-ignore
  engine._time._lastSystemTime = 0;
  performance.now = function () {
    times.value += deltaMs;
    return times.value;
  };
  engine.update();
}

function buildEmitter(engine: Engine, name: string): { entity: Entity; renderer: ParticleRenderer } {
  const scene = engine.sceneManager.activeScene;
  const entity = scene.createRootEntity(name);
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
  // Zero out the time-based path so only rateOverDistance contributes.
  generator.emission.rateOverTime.constant = 0;
  return { entity, renderer };
}

describe("EmissionModule rateOverDistance", () => {
  let engine: Engine;
  let elapsed: { value: number };

  beforeAll(async function () {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas")
    });

    const scene = engine.sceneManager.activeScene;
    const cameraEntity = scene.createRootEntity("Camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);

    engine.run();
    elapsed = { value: 0 };
  });

  afterAll(function () {
    engine.destroy();
  });

  it("defaults to 0 (no emission triggered by movement)", () => {
    const { entity, renderer } = buildEmitter(engine, "default-zero");
    const generator = renderer.generator;
    expect(generator.emission.rateOverDistance.evaluate(undefined, undefined)).to.eq(0);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();

    tick(engine, elapsed);
    entity.transform.setPosition(10, 0, 0);
    tick(engine, elapsed);

    expect(generator._getAliveParticleCount()).to.eq(0);
    entity.destroy();
  });

  it("emits ratePerUnit × distance particles", () => {
    const { entity, renderer } = buildEmitter(engine, "rate-times-distance");
    const generator = renderer.generator;
    generator.emission.rateOverDistance.constant = 10;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();

    // First tick syncs the baseline position.
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(0);

    // Move 2 units → 10 * 2 = 20 particles.
    entity.transform.setPosition(2, 0, 0);
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(20);

    entity.destroy();
  });

  it("accumulates sub-interval movement across frames", () => {
    const { entity, renderer } = buildEmitter(engine, "subinterval-carry");
    const generator = renderer.generator;
    // 1 particle per 0.5 units → 2 particles per unit.
    generator.emission.rateOverDistance.constant = 2;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, elapsed); // baseline sync

    // 3 moves of 0.3 units each = 0.9 total. With interval 0.5, that's
    // exactly 1 emission (at 0.5) plus 0.4 carried forward.
    entity.transform.setPosition(0.3, 0, 0);
    tick(engine, elapsed);
    entity.transform.setPosition(0.6, 0, 0);
    tick(engine, elapsed);
    entity.transform.setPosition(0.9, 0, 0);
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(1);

    // Move another 0.6 units → accumulator hits 1.0, then 0 carried fwd. Emit 2 more.
    entity.transform.setPosition(1.5, 0, 0);
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(3);

    entity.destroy();
  });

  it("static emitter never emits via distance", () => {
    const { entity, renderer } = buildEmitter(engine, "static-emitter");
    const generator = renderer.generator;
    generator.emission.rateOverDistance.constant = 100;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, elapsed);
    tick(engine, elapsed);
    tick(engine, elapsed);

    expect(generator._getAliveParticleCount()).to.eq(0);
    entity.destroy();
  });

  it("stop+clear resets the distance accumulator", () => {
    const { entity, renderer } = buildEmitter(engine, "reset-on-clear");
    const generator = renderer.generator;
    generator.emission.rateOverDistance.constant = 10;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, elapsed);
    entity.transform.setPosition(0.5, 0, 0);
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(5);

    // After clear+play, the next tick must re-sync from the *current* position,
    // not diff against the pre-clear baseline — so jumping back to origin
    // should not emit anything until the next move.
    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    entity.transform.setPosition(0, 0, 0);
    generator.play();
    tick(engine, elapsed);
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(0);

    entity.destroy();
  });
});
