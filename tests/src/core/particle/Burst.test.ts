import {
  Burst,
  Camera,
  Engine,
  ParticleCompositeCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleStopMode
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
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

describe("Burst", () => {
  let engine: Engine;

  beforeAll(async function () {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas")
    });

    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");
    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);

    engine.run();
  });

  it("Default constructor", () => {
    const burst = new Burst(0.5, new ParticleCompositeCurve(10), 1, 0.01);
    expect(burst.time).to.equal(0.5);
    expect(burst.count.evaluate(undefined, undefined)).to.equal(10);
    expect(burst.cycles).to.equal(1);
    expect(burst.repeatInterval).to.equal(0.01);
  });

  it("Constructor with cycles and repeatInterval", () => {
    const burst = new Burst(0.5, new ParticleCompositeCurve(10), 3, 0.2);
    expect(burst.time).to.equal(0.5);
    expect(burst.count.evaluate(undefined, undefined)).to.equal(10);
    expect(burst.cycles).to.equal(3);
    expect(burst.repeatInterval).to.equal(0.2);
  });

  it("Modify cycles and repeatInterval", () => {
    const burst = new Burst(0, new ParticleCompositeCurve(5), 1, 0.01);
    burst.cycles = 5;
    burst.repeatInterval = 0.1;
    expect(burst.cycles).to.equal(5);
    expect(burst.repeatInterval).to.equal(0.1);
  });

  it("Replace bursts through the serializable property contract", () => {
    const scene = engine.sceneManager.activeScene;
    const entity = scene.createRootEntity("ReplaceBursts");
    const emission = entity.addComponent(ParticleRenderer).generator.emission;
    const existing = new Burst(1, new ParticleCompositeCurve(1));
    const early = new Burst(0.25, new ParticleCompositeCurve(2));
    const late = new Burst(0.75, new ParticleCompositeCurve(3));
    emission.addBurst(existing);

    emission.bursts = [late, early];

    expect(emission.bursts).to.deep.equal([early, late]);
    entity.destroy();
  });

  it("Single cycle backward compatible", () => {
    const scene = engine.sceneManager.activeScene;
    const entity = scene.createRootEntity("SingleCycle");
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

    // Default cycles=1 should behave like original
    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(10), 1, 0.01));

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();

    // 20 frames at 100ms = 2s, burst at t=0 fires once
    updateEngine(engine, 20);
    expect(generator._getAliveParticleCount()).to.equal(10);

    entity.destroy();
  });

  it("Burst cycles emit multiple times", () => {
    const scene = engine.sceneManager.activeScene;
    const entity = scene.createRootEntity("BurstCycles");
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

    // Burst at t=0, count=10, cycles=3, interval=0.5 -> fires at 0s, 0.5s, 1.0s
    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(10), 3, 0.5));

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();

    // 15 frames at 100ms = 1.5s, all 3 cycles should have fired
    updateEngine(engine, 15);
    expect(generator._getAliveParticleCount()).to.equal(30);

    entity.destroy();
  });

  it("Burst cycles survive float drift (no skipped cycle)", () => {
    const scene = engine.sceneManager.activeScene;
    const entity = scene.createRootEntity("FloatDrift");
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

    // interval=0.1 triggers IEEE 754 drift (e.g. 0.1+0.2 != 0.3). Without tolerance in the
    // cycle-index math, `ceil((startTime - burstTime) / 0.1)` can land at cycle + 1 and
    // permanently skip a cycle at accumulated integer-multiple times.
    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 10, 0.1));

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();

    // 15 frames at 100ms = 1.5s, all 10 cycles (0, 0.1, 0.2, ..., 0.9) must have fired
    updateEngine(engine, 15);
    expect(generator._getAliveParticleCount()).to.equal(10);

    entity.destroy();
  });

  it("Burst cycles=Infinity emits infinitely within duration", () => {
    const scene = engine.sceneManager.activeScene;
    const entity = scene.createRootEntity("InfiniteCycles");
    const renderer = entity.addComponent(ParticleRenderer);
    const material = new ParticleMaterial(engine);
    material.baseColor = new Color(1, 1, 1, 1);
    renderer.setMaterial(material);

    const generator = renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.main.duration = 2;
    generator.main.isLoop = false;
    generator.main.maxParticles = 1000;
    generator.main.startLifetime.constant = 10;
    generator.emission.rateOverTime.constant = 0;

    // cycles=Infinity means unlimited, interval=0.5 -> fires at 0, 0.5, 1.0, 1.5 within duration=2
    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(5), Infinity, 0.5));

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();

    // 25 frames at 100ms = 2.5s, should fire 4 times (at 0, 0.5, 1.0, 1.5) = 20 particles
    updateEngine(engine, 25);
    expect(generator._getAliveParticleCount()).to.equal(20);

    entity.destroy();
  });
});
