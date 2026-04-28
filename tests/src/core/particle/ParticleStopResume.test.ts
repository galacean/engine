import {
  Burst,
  Camera,
  ParticleCompositeCurve,
  ParticleRenderer,
  ParticleStopMode,
  Scene
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeAll, describe, expect, it } from "vitest";

describe("ParticleGenerator stop/resume timeline", () => {
  let engine: WebGLEngine;
  let scene: Scene;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("root");
    const camera = root.createChild("Camera");
    camera.addComponent(Camera);
    camera.transform.setPosition(0, 0, 10);
  });

  /**
   * Drive `generator._update(dt)` directly so we control the timeline.
   * `ParticleRenderer._update` would call this with `engine.time.deltaTime`,
   * which is wall-clock and not reproducible.
   */
  function tick(generator: any, frames: number, dt: number): void {
    for (let i = 0; i < frames; i++) {
      generator._update(dt);
    }
  }

  it("rate-over-time: stop -> idle -> play emits a catch-up batch in one frame", () => {
    const entity = scene.createRootEntity("rate");
    const renderer = entity.addComponent(ParticleRenderer);
    const generator = renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.main.duration = 1;
    generator.main.startLifetime.constant = 1;
    generator.main.maxParticles = 10000;
    generator.emission.rateOverTime.constant = 100;

    let totalEmitted = 0;
    const origEmit = (generator as any)._emit.bind(generator);
    (generator as any)._emit = (playTime: number, count: number) => {
      totalEmitted += count;
      origEmit(playTime, count);
    };

    generator.play();
    // Run 0.5s at 60fps -> ~50 particles
    tick(generator, 30, 1 / 60);
    const emittedDuringPlay = totalEmitted;
    const playTimeAfterPlay = generator._playTime;

    generator.stop(true, ParticleStopMode.StopEmitting);
    const playTimeAtStop = generator._playTime;
    const emittedAtStop = totalEmitted;

    // Idle 4.5s while stopped -> _emit must not run, but _playTime drifts
    tick(generator, 270, 1 / 60);
    const playTimeAfterIdle = generator._playTime;
    const emittedDuringIdle = totalEmitted - emittedAtStop;

    generator.play();
    // Single frame after resume
    tick(generator, 1, 1 / 60);
    const emittedFirstFrameAfterResume = totalEmitted - emittedAtStop;

    entity.destroy();

    // eslint-disable-next-line no-console
    console.log("[bug-repro/rate]", {
      emittedDuringPlay,
      playTimeAfterPlay,
      playTimeAtStop,
      playTimeAfterIdle,
      emittedDuringIdle,
      emittedFirstFrameAfterResume
    });

    expect(emittedDuringIdle).toBe(0);
    // Buggy behavior: emits a large catch-up batch (~ idleSeconds * rate).
    expect(emittedFirstFrameAfterResume).toBeGreaterThan(100);
    expect(playTimeAfterIdle - playTimeAtStop).toBeGreaterThan(4);
  });

  it("burst: stop -> idle -> play replays multiple cycles of bursts", () => {
    const entity = scene.createRootEntity("burst");
    const renderer = entity.addComponent(ParticleRenderer);
    const generator = renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.main.duration = 1;
    generator.main.isLoop = true;
    generator.main.startLifetime.constant = 1;
    generator.main.maxParticles = 10000;
    generator.emission.rateOverTime.constant = 0;
    generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(10)));

    let totalEmitted = 0;
    const origEmit = (generator as any)._emit.bind(generator);
    (generator as any)._emit = (playTime: number, count: number) => {
      totalEmitted += count;
      origEmit(playTime, count);
    };

    generator.play();
    // 1 full cycle -> burst at t=0 fires once (10 particles at frame 0)
    tick(generator, 60, 1 / 60);
    const emittedAfterOneSecond = totalEmitted;

    generator.stop(true, ParticleStopMode.StopEmitting);
    const playTimeAtStop = generator._playTime;
    const emittedAtStop = totalEmitted;

    // Idle 4 cycles
    tick(generator, 240, 1 / 60);
    const playTimeAfterIdle = generator._playTime;

    generator.play();
    tick(generator, 1, 1 / 60); // first frame after resume
    const emittedFirstFrameAfterResume = totalEmitted - emittedAtStop;

    entity.destroy();

    // eslint-disable-next-line no-console
    console.log("[bug-repro/burst]", {
      emittedAfterOneSecond,
      playTimeAtStop,
      playTimeAfterIdle,
      emittedFirstFrameAfterResume
    });

    // After fix this should be 0 (next burst at t=0 of the new cycle hasn't reached yet).
    // Buggy behavior: replays the burst once because `_currentBurstIndex` is 0 and
    // `_emitBySubBurst(lastPlayTime, playTime, ...)` sees burst.time === startTime.
    expect(emittedFirstFrameAfterResume).toBe(10);
  });
});
