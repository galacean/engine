import {
  Camera,
  CurveKey,
  Engine,
  Entity,
  ParticleCurve,
  ParticleCurveMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleStopMode
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function tick(engine: Engine, times: { value: number }, deltaMs: number = 100): void {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  // Anchor the last system time to the current mocked clock so each tick
  // advances exactly `deltaMs` (avoids the 0.333s maximumDeltaTime clamp)
  //@ts-ignore
  engine._time._lastSystemTime = times.value / 1000;
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
  generator.main.maxParticles = 1000;
  generator.main.startLifetime.constant = 100;
  generator.main.duration = 1;
  generator.emission.rateOverTime.constant = 0;
  generator.emission.rateOverDistance.constant = 0;
  return { entity, renderer };
}

describe("EmissionModule rate curve modes", () => {
  let engine: Engine;
  let elapsed: { value: number };

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
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

  it("rateOverTime flat curve matches constant rate", () => {
    const { renderer: constantRenderer } = buildEmitter(engine, "rot-constant");
    const constantGenerator = constantRenderer.generator;
    constantGenerator.emission.rateOverTime.constant = 10;

    const { renderer: curveRenderer } = buildEmitter(engine, "rot-flat-curve");
    const curveGenerator = curveRenderer.generator;
    const rateOverTime = curveGenerator.emission.rateOverTime;
    rateOverTime.curve = new ParticleCurve(new CurveKey(0, 10), new CurveKey(1, 10));
    rateOverTime.mode = ParticleCurveMode.Curve;

    constantGenerator.stop(true, ParticleStopMode.StopEmittingAndClear);
    curveGenerator.stop(true, ParticleStopMode.StopEmittingAndClear);
    constantGenerator.play();
    curveGenerator.play();

    for (let i = 0; i < 10; i++) tick(engine, elapsed);

    const constantCount = constantGenerator._getAliveParticleCount();
    const curveCount = curveGenerator._getAliveParticleCount();
    expect(constantCount).to.be.greaterThan(0);
    expect(curveCount).to.eq(constantCount);

    constantGenerator.stop(true, ParticleStopMode.StopEmittingAndClear);
    curveGenerator.stop(true, ParticleStopMode.StopEmittingAndClear);
  });

  it("rateOverTime ramp curve emits between zero and peak rate", () => {
    const { renderer } = buildEmitter(engine, "rot-ramp-curve");
    const generator = renderer.generator;
    const rateOverTime = generator.emission.rateOverTime;
    rateOverTime.curve = new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 20));
    rateOverTime.mode = ParticleCurveMode.Curve;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    // One full cycle (duration = 1s)
    for (let i = 0; i < 10; i++) tick(engine, elapsed);

    const count = generator._getAliveParticleCount();
    // Integral of a 0→20 ramp over one cycle is ~10. Without curve-shape support the
    // last key's value (20) would be treated as a constant and emit ~20.
    expect(count).to.be.greaterThan(0);
    expect(count).to.be.lessThanOrEqual(15);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
  });

  it("rateOverTime curve respects curve shape over the cycle", () => {
    const { renderer } = buildEmitter(engine, "rot-shape-curve");
    const generator = renderer.generator;
    const rateOverTime = generator.emission.rateOverTime;
    // All emission packed into the first half of the cycle; last key is 0
    rateOverTime.curve = new ParticleCurve(new CurveKey(0, 20), new CurveKey(0.5, 0), new CurveKey(1, 0));
    rateOverTime.mode = ParticleCurveMode.Curve;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    for (let i = 0; i < 10; i++) tick(engine, elapsed);

    const count = generator._getAliveParticleCount();
    // Integral of the curve is ~5. Sampling the last key as a constant would emit 0
    expect(count).to.be.greaterThan(0);
    expect(count).to.be.lessThan(10);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
  });

  it("rateOverTime two-constants emits within min/max bounds", () => {
    const { renderer } = buildEmitter(engine, "rot-two-constants");
    const generator = renderer.generator;
    const rateOverTime = generator.emission.rateOverTime;
    rateOverTime.constantMin = 5;
    rateOverTime.constantMax = 15;
    rateOverTime.mode = ParticleCurveMode.TwoConstants;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    for (let i = 0; i < 10; i++) tick(engine, elapsed);

    const count = generator._getAliveParticleCount();
    // Emission intervals are bounded by [1/15, 1/5], so one second yields between ~5 and ~15 particles
    expect(count).to.be.greaterThanOrEqual(4);
    expect(count).to.be.lessThanOrEqual(16);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
  });

  it("rateOverTime two-curves emits within min/max curve bounds", () => {
    const { renderer } = buildEmitter(engine, "rot-two-curves");
    const generator = renderer.generator;
    const rateOverTime = generator.emission.rateOverTime;
    rateOverTime.curveMin = new ParticleCurve(new CurveKey(0, 5), new CurveKey(1, 5));
    rateOverTime.curveMax = new ParticleCurve(new CurveKey(0, 15), new CurveKey(1, 15));
    rateOverTime.mode = ParticleCurveMode.TwoCurves;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    for (let i = 0; i < 10; i++) tick(engine, elapsed);

    const count = generator._getAliveParticleCount();
    expect(count).to.be.greaterThanOrEqual(4);
    expect(count).to.be.lessThanOrEqual(16);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
  });

  it("rateOverDistance flat curve matches constant rate", () => {
    const { entity: constantEntity, renderer: constantRenderer } = buildEmitter(engine, "rod-constant");
    const constantGenerator = constantRenderer.generator;
    constantGenerator.emission.rateOverDistance.constant = 10;

    const { entity: curveEntity, renderer: curveRenderer } = buildEmitter(engine, "rod-flat-curve");
    const curveGenerator = curveRenderer.generator;
    const rateOverDistance = curveGenerator.emission.rateOverDistance;
    rateOverDistance.curve = new ParticleCurve(new CurveKey(0, 10), new CurveKey(1, 10));
    rateOverDistance.mode = ParticleCurveMode.Curve;

    constantGenerator.stop(true, ParticleStopMode.StopEmittingAndClear);
    curveGenerator.stop(true, ParticleStopMode.StopEmittingAndClear);
    constantGenerator.play();
    curveGenerator.play();
    // First tick records the start position
    tick(engine, elapsed);

    for (let i = 1; i <= 5; i++) {
      constantEntity.transform.setPosition(i, 0, 0);
      curveEntity.transform.setPosition(i, 0, 0);
      tick(engine, elapsed);
    }

    const constantCount = constantGenerator._getAliveParticleCount();
    const curveCount = curveGenerator._getAliveParticleCount();
    expect(constantCount).to.be.greaterThan(0);
    expect(curveCount).to.eq(constantCount);

    constantGenerator.stop(true, ParticleStopMode.StopEmittingAndClear);
    curveGenerator.stop(true, ParticleStopMode.StopEmittingAndClear);
  });

  it("rateOverDistance curve respects cycle position", () => {
    const { entity, renderer } = buildEmitter(engine, "rod-shape-curve");
    const generator = renderer.generator;
    const rateOverDistance = generator.emission.rateOverDistance;
    // Rate is zero through the first half of the cycle, ramps up afterwards
    rateOverDistance.curve = new ParticleCurve(new CurveKey(0, 0), new CurveKey(0.5, 0), new CurveKey(1, 10));
    rateOverDistance.mode = ParticleCurveMode.Curve;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    // Move only during the first half of the cycle, where the sampled rate is zero
    for (let i = 1; i <= 5; i++) {
      entity.transform.setPosition(i, 0, 0);
      tick(engine, elapsed);
    }

    // Correctly sampling the curve at the cycle position emits nothing here;
    // falling back to the last key (10) as a constant would emit ~10 per unit moved
    expect(generator._getAliveParticleCount()).to.eq(0);

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
  });
});
