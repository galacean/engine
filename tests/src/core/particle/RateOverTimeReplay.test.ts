import { Camera, Engine, Entity, ParticleMaterial, ParticleRenderer, ParticleStopMode } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
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
  generator.main.maxParticles = 1000;
  generator.main.startLifetime.constant = 100;
  generator.emission.rateOverTime.constant = 0;
  generator.emission.rateOverDistance.constant = 0;
  return { entity, renderer };
}

describe("EmissionModule rateOverTime replay/resume", () => {
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

  it("does not catch-up burst on play() after non-loop auto-stop", () => {
    // _update advances _playTime every frame regardless of _isPlaying (the
    // particle-retire path needs it). _frameRateTime was only reset by _reset
    // (= stop(Clear)) before this fix. So auto-stop + waiting + bare play()
    // used to unwind the entire stopped interval into a single-frame catch-up.
    const { entity, renderer } = buildEmitter(engine, "rot-autostop-replay");
    const generator = renderer.generator;
    generator.main.duration = 0.05;
    generator.main.isLoop = false;
    generator.emission.rateOverTime.constant = 10; // 10/sec

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, elapsed); // first play; _playTime=0.1 > duration → auto-stops
    const baseline = generator._getAliveParticleCount();
    //@ts-ignore
    expect((generator as any)._isPlaying).to.eq(false);

    // 3 seconds of idle frames — _playTime keeps growing, _frameRateTime stuck.
    for (let i = 0; i < 30; i++) tick(engine, elapsed);

    generator.play();
    tick(engine, elapsed);

    // Without the fix this dumps ~30 catch-up particles in one frame.
    const delta = generator._getAliveParticleCount() - baseline;
    expect(delta, "auto-stop replay must not catch up the stopped interval").to.be.lessThan(5);

    entity.destroy();
  });

  it("does not catch-up burst when rateOverTime flips 0 → N mid-play", () => {
    // rate=0 for an interval: _emitByRateOverTime used to return without
    // touching _frameRateTime. When rate flips back positive, cumulativeTime =
    // playTime - _frameRateTime spans the rate-0 interval and unwinds it.
    const { entity, renderer } = buildEmitter(engine, "rot-rate-transition");
    const generator = renderer.generator;
    generator.main.duration = 100;
    generator.main.isLoop = true;
    generator.emission.rateOverTime.constant = 10;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, elapsed); // emit ~1 particle
    const baseline = generator._getAliveParticleCount();

    // Drop rate to 0 for ~3 seconds.
    generator.emission.rateOverTime.constant = 0;
    for (let i = 0; i < 30; i++) tick(engine, elapsed);
    expect(generator._getAliveParticleCount()).to.eq(baseline);

    // Restore rate. The next tick must only contribute its own ~0.1s worth (~1 particle),
    // not ~30 catch-up particles from the rate-0 interval.
    generator.emission.rateOverTime.constant = 10;
    tick(engine, elapsed);
    const delta = generator._getAliveParticleCount() - baseline;
    expect(delta, "rate 0→N must not unwind the rate-0 interval").to.be.lessThan(5);

    entity.destroy();
  });

  it("does not catch-up burst when emission.enabled is toggled off → on", () => {
    // Same root: emission.enabled=false skips _emit; toggling back to true
    // must drop the stale _frameRateTime cursor too, not just the distance baseline.
    const { entity, renderer } = buildEmitter(engine, "rot-enabled-toggle");
    const generator = renderer.generator;
    generator.main.duration = 100;
    generator.main.isLoop = true;
    generator.emission.rateOverTime.constant = 10;

    generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    generator.play();
    tick(engine, elapsed);
    const baseline = generator._getAliveParticleCount();

    generator.emission.enabled = false;
    for (let i = 0; i < 30; i++) tick(engine, elapsed);
    generator.emission.enabled = true;

    tick(engine, elapsed);
    const delta = generator._getAliveParticleCount() - baseline;
    expect(delta, "enabled toggle must not unwind the disabled interval").to.be.lessThan(5);

    entity.destroy();
  });
});
