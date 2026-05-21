import {
  Camera,
  Engine,
  Entity,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
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

  it("distributes particles along the movement path in World space", () => {
    const { entity, renderer } = buildEmitter(engine, "world-space-distribution");
    const generator = renderer.generator;
    generator.main.simulationSpace = ParticleSimulationSpace.World;
    // 1 particle per unit; move 4 units → 4 particles spaced at world x = 1, 2, 3, 4
    generator.emission.rateOverDistance.constant = 1;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();

    tick(engine, elapsed); // baseline sync at (0,0,0)

    entity.transform.setPosition(4, 0, 0);
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(4);

    // Verify each particle's stored world position is along [0,4] on x axis, not all at x=4.
    // Particles are written sequentially starting at firstActiveElement=0.
    //@ts-ignore - test reaches into instance buffer to verify spatial distribution
    const verts = (generator as any)._instanceVertices as Float32Array;
    // Per-instance stride = 168 bytes / 4 = 42 floats; world position lives at offset 27.
    const stride = 42;
    const xs: number[] = [];
    for (let i = 0; i < 4; i++) {
      xs.push(verts[i * stride + 27]);
    }
    xs.sort((a, b) => a - b);
    // Expect roughly [1, 2, 3, 4] — accept loose tolerance for float ops.
    expect(xs[0]).to.be.closeTo(1, 1e-4);
    expect(xs[1]).to.be.closeTo(2, 1e-4);
    expect(xs[2]).to.be.closeTo(3, 1e-4);
    expect(xs[3]).to.be.closeTo(4, 1e-4);

    entity.destroy();
  });

  it("distributes emit time along the movement path in World space", () => {
    const { entity, renderer } = buildEmitter(engine, "world-space-time-distribution");
    const generator = renderer.generator;
    generator.main.simulationSpace = ParticleSimulationSpace.World;
    // 1 particle per unit; move 4 units across one 100ms tick → 4 particles,
    // each born at a sub-frame offset.
    generator.emission.rateOverDistance.constant = 1;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();

    tick(engine, elapsed); // baseline sync at (0,0,0)
    entity.transform.setPosition(4, 0, 0);
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(4);

    //@ts-ignore - reach into instance buffer to read per-particle emit time
    const verts = (generator as any)._instanceVertices as Float32Array;
    const stride = 42;
    // a_DirectionTime is at byte 16 → float 4; the .w slot (emit time) is float 4+3=7.
    const timeFloatOffset = 7;
    const times: number[] = [];
    for (let i = 0; i < 4; i++) {
      times.push(verts[i * stride + timeFloatOffset]);
    }
    times.sort((a, b) => a - b);

    // The 4 emit times must form an arithmetic sequence (constant step = sStep * dt),
    // and they must not all be equal — that's exactly the bug we're guarding against,
    // where COL / SOL / FOL would otherwise render them as a uniform stamp.
    const diff0 = times[1] - times[0];
    const diff1 = times[2] - times[1];
    const diff2 = times[3] - times[2];
    expect(diff0).to.be.greaterThan(1e-4);
    expect(diff1).to.be.closeTo(diff0, 1e-4);
    expect(diff2).to.be.closeTo(diff0, 1e-4);

    entity.destroy();
  });

  it("does not burst on play() after emitter moves while stopped", () => {
    const { entity, renderer } = buildEmitter(engine, "no-burst-on-replay");
    const generator = renderer.generator;
    generator.emission.rateOverDistance.constant = 10;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, elapsed); // baseline sync at (0,0,0)

    // Stop *without* clear — accumulator/baseline retained by the old impl.
    generator.stop(true, ParticleStopMode.StopEmitting);
    // Emitter teleports a few units while stopped (kept inside the camera frustum
    // so renderer culling doesn't mask the test).
    entity.transform.setPosition(3, 0, 0);
    generator.play();

    // First tick after play() must resync the baseline at the new position,
    // not diff (3 - 0) and dump 30 particles in one shot.
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(0);

    // Subsequent movement still emits normally — diffed against the resynced baseline.
    entity.transform.setPosition(4, 0, 0);
    tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(10);

    entity.destroy();
  });

  it("returns actual emitted count when buffer is full", () => {
    // Documents the `_emit` return-value contract that lets distance emission detect
    // mid-loop buffer exhaustion (and drop residual accumulator to avoid spinning
    // through millions of no-op iterations on a teleport).
    const { entity, renderer } = buildEmitter(engine, "emit-returns-actual");
    const generator = renderer.generator;
    generator.main.maxParticles = 10;
    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, elapsed);

    // Request 100, buffer only has 10 slots.
    //@ts-ignore — reach into the internal _emit contract
    const emitted = generator._emit(generator._playTime, 100);
    expect(emitted).to.eq(10);

    // Subsequent request returns 0 — buffer is saturated.
    //@ts-ignore
    expect(generator._emit(generator._playTime, 5)).to.eq(0);

    entity.destroy();
  });
});
