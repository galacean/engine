import { describe, expect, it } from "vitest";
import {
  AnimalMotionPlayback,
  groundAnimalEffectiveSpeed
} from "../../../packages/animals/src/gameplay/animal/AnimalMotionPlayback";
import { GroundAnimalCrowd, type GroundAnimalBody } from "../../../packages/animals/src/gameplay/animal/GroundAnimalCrowd";

describe("AnimalMotionPlayback cadence coupling", () => {
  it("matches exact 1:1 baseRate at nominal cruise speed and scales along 3D slopes", () => {
    const playback = new AnimalMotionPlayback();
    playback.start(1.25, 1.5, "distance", 1);

    const flatFrac = playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 1.5, angularSpeed: 0 }, 3.0, true, 1);
    expect(flatFrac).toBe(1);
    expect(playback.rate).toBeCloseTo(1, 5);

    // On a ~26.6 deg slope (cos ≈ 0.8944 -> slopeScale ≈ 1.118), 3D surface arc is 11.8% longer.
    const slopeScale = 1 / Math.cos(Math.atan(0.5));
    for (let i = 0; i < 30; i++) {
      playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 1.5, angularSpeed: 0 }, 3.0, true, slopeScale);
    }
    expect(playback.rate).toBeCloseTo(slopeScale, 2);
  });

  it("eliminates the zero-speed cliff to 1.0x and clamps extreme slow-motion / runaway rates", () => {
    const playback = new AnimalMotionPlayback();
    playback.start(1.25, 5.6, "distance", 1);

    // Near-stop / blocked speed must stay at the bounded floor (0.35x), never jump to 1.0x or freeze at 0.02x.
    playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 0.05, angularSpeed: 0 }, 4.7, true, 1);
    expect(playback.rate).toBeCloseTo(0.35, 4);

    playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 }, 4.7, true, 1);
    expect(playback.rate).toBeCloseTo(0.35, 4);

    // Runaway speed spikes clamp at 1.45x baseRate instead of causing frantic leg twitching.
    for (let i = 0; i < 60; i++) {
      playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 15, angularSpeed: 2.4 }, 4.7, true, 1.25);
    }
    expect(playback.rate).toBeCloseTo(1.45, 2);
  });

  it("bounds turning cadence so large animals in tight turns do not foot-slip at ~1.0x", () => {
    // Reproduces live bison-01 tight turn: speed=0.507, nom=1.676, bodyL=3.52, ang=1.2 rad/s.
    const effective = groundAnimalEffectiveSpeed(0.507, 1.2, 3.52, 1.676, 1);
    const ratio = effective / 1.676;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.56);

    const playback = new AnimalMotionPlayback();
    playback.start(1.25, 1.676, "distance", 1);
    playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 0.507, angularSpeed: 1.2 }, 3.52, true, 1);
    expect(playback.rate).toBeCloseTo(ratio, 3);
  });

  it("smoothly damps abrupt speed transitions instead of snapping between frames", () => {
    const playback = new AnimalMotionPlayback();
    playback.start(2, 2, "distance", 1);
    playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 2, angularSpeed: 0 }, 2, true, 1);
    expect(playback.rate).toBeCloseTo(1, 5);

    // Sudden deceleration to 0.7 m/s (target rate 0.35) transitions smoothly rather than snapping in one 1/60s step.
    playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 0.7, angularSpeed: 0 }, 2, true, 1);
    expect(playback.rate).toBeLessThan(0.95);
    expect(playback.rate).toBeGreaterThan(0.75);

    for (let i = 0; i < 40; i++) {
      playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 0.7, angularSpeed: 0 }, 2, true, 1);
    }
    expect(playback.rate).toBeCloseTo(0.35, 2);
  });

  it("keeps time-cadence clips (e.g. flight/swim) fixed at baseRate", () => {
    const playback = new AnimalMotionPlayback();
    playback.start(3.33, 5.0, "time", 1.2);
    playback.prepare(1 / 60, { x: 0, z: 0, heading: 0, speed: 0.1, angularSpeed: 0 }, 1.1, true, 1);
    expect(playback.rate).toBeCloseTo(1.2, 5);
  });
});

describe("GroundAnimalCrowd post-contact animation cadence", () => {
  it("feeds post-contact clamped speed to motionFraction while still reporting blocked status", () => {
    const crowd = new GroundAnimalCrowd();
    const observedSpeeds: number[] = [];

    const blocker: GroundAnimalBody = {
      motion: { x: 0, z: 2.015, heading: 0, speed: 0, angularSpeed: 0 },
      radius: 1,
      bodyLength: 2,
      desiredSpeed: 0,
      target: [0, 2.015],
      arrived: false,
      blocked: false
    };
    const mover: GroundAnimalBody = {
      motion: { x: 0, z: 0, heading: 0, speed: 2, angularSpeed: 0 },
      radius: 1,
      bodyLength: 2,
      desiredSpeed: 2,
      target: [0, 10],
      arrived: false,
      blocked: false,
      motionFraction: (_dt, proposed) => {
        observedSpeeds.push(proposed.speed);
        return 1;
      }
    };

    crowd.add(blocker);
    crowd.add(mover);

    // Step 1: mover can only advance ~0.015m out of ~0.033m before contacting blocker; motionFraction sees reduced speed.
    crowd.advance(1 / 60);
    // Step 2: mover is flush against blocker (contact fraction === 0); motionFraction sees 0 speed and mover becomes blocked.
    crowd.advance(1 / 60);

    expect(observedSpeeds.length).toBe(2);
    expect(observedSpeeds[0]).toBeLessThan(1.5);
    expect(observedSpeeds[1]).toBeCloseTo(0, 5);
    expect(mover.blocked).toBe(true);
    expect(crowd.inspect().overlaps).toBe(0);
  });
});
