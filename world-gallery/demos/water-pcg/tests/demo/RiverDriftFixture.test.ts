import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import {
  RIVER_DRIFT_BODY_MASS,
  RIVER_DRIFT_CUBE_SIZE,
  RIVER_DRIFT_DEFAULT_SEED,
  RIVER_DRIFT_MAX_ACTIVE_COUNT,
  RIVER_DRIFT_MAX_HEIGHT,
  RIVER_DRIFT_MIN_HEIGHT,
  RIVER_DRIFT_PONTOON_RADIUS,
  RIVER_DRIFT_RANDOM_VALUES_PER_SPAWN,
  RIVER_DRIFT_SOURCE_MAX_RATIO,
  RIVER_DRIFT_SOURCE_MIN_RATIO,
  RiverDriftRandom,
  RiverDriftSpawnScheduler,
  createRiverDriftPontoons,
  createRiverDriftProjection,
  createRiverDriftSpawnPlan,
  findRiverDriftSourceReach,
  parseRiverDriftSeed,
  projectRiverDriftProgress
} from "../../demo/buoyancy/riverDriftFixture";
import { resetWaterSurfaceSample, type WaterSurfaceProvider } from "../../runtime/query/WaterSurfaceProvider";

const compiled = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor).data!;

function createAcceptingProvider(onQuery?: (queryIndex: number) => void): WaterSurfaceProvider {
  let queryCount = 0;
  return {
    sampleSurface(worldPosition, outSample): boolean {
      onQuery?.(++queryCount);
      resetWaterSurfaceSample(outSample);
      outSample.waterBodyId = "river-drift-test";
      outSample.surfacePosition.set(worldPosition.x, 4 + worldPosition.x * 0.001, worldPosition.z);
      outSample.surfaceNormal.set(0, 1, 0);
      outSample.waterVelocity.set(2, 0, 1);
      outSample.waterDepth = 2;
      return true;
    }
  };
}

describe("River drift fixture", () => {
  it("uses the documented cube, mass, and four independent Pontoon probes", () => {
    const first = createRiverDriftPontoons();
    const second = createRiverDriftPontoons();

    expect(RIVER_DRIFT_CUBE_SIZE).toBe(0.7);
    expect(RIVER_DRIFT_BODY_MASS).toBe(120);
    expect(RIVER_DRIFT_MAX_ACTIVE_COUNT).toBe(10);
    expect(first).toHaveLength(4);
    expect(first.every((pontoon) => pontoon.radius === RIVER_DRIFT_PONTOON_RADIUS && pontoon.enabled)).toBe(true);
    expect(first).not.toBe(second);
    expect(first[0].localPosition).not.toBe(second[0].localPosition);
  });

  it("replays xorshift32 exactly and normalizes invalid or locked seeds", () => {
    const first = new RiverDriftRandom(0x12345678);
    const values = [first.nextUnit(), first.nextUnit(), first.nextUnit(), first.nextUnit()];
    first.reset();

    expect([first.nextUnit(), first.nextUnit(), first.nextUnit(), first.nextUnit()]).toEqual(values);
    expect(first.consumedValueCount).toBe(4);
    expect(new RiverDriftRandom(0).initialSeed).toBe(1);
    expect(parseRiverDriftSeed(null)).toBe(RIVER_DRIFT_DEFAULT_SEED);
    expect(parseRiverDriftSeed("not-a-number")).toBe(RIVER_DRIFT_DEFAULT_SEED);
    expect(parseRiverDriftSeed("4294967297")).toBe(1);
  });

  it("creates deterministic source-reach plans with fixed random consumption and full footprint preflight", () => {
    let queryCount = 0;
    const provider = createAcceptingProvider((count) => {
      queryCount = count;
    });
    const firstRandom = new RiverDriftRandom(8128);
    const first = createRiverDriftSpawnPlan(compiled, provider, firstRandom)!;
    const secondRandom = new RiverDriftRandom(8128);
    const second = createRiverDriftSpawnPlan(compiled, createAcceptingProvider(), secondRandom)!;

    expect(firstRandom.consumedValueCount).toBe(RIVER_DRIFT_RANDOM_VALUES_PER_SPAWN);
    expect(queryCount).toBe(20);
    expect(first.reachIndex).toBe(0);
    expect(first.reachRatio).toBeGreaterThanOrEqual(RIVER_DRIFT_SOURCE_MIN_RATIO);
    expect(first.reachRatio).toBeLessThanOrEqual(RIVER_DRIFT_SOURCE_MAX_RATIO);
    expect(first.heightOffset).toBeGreaterThanOrEqual(RIVER_DRIFT_MIN_HEIGHT);
    expect(first.heightOffset).toBeLessThanOrEqual(RIVER_DRIFT_MAX_HEIGHT);
    expect(Math.abs(first.laneOffset)).toBeLessThanOrEqual(0.8);
    expect(first.position.y - first.surfaceHeight).toBeCloseTo(first.heightOffset, 8);
    expect({
      reachIndex: first.reachIndex,
      reachRatio: first.reachRatio,
      laneOffset: first.laneOffset,
      heightOffset: first.heightOffset,
      yawDegrees: first.yawDegrees,
      position: [first.position.x, first.position.y, first.position.z]
    }).toEqual({
      reachIndex: second.reachIndex,
      reachRatio: second.reachRatio,
      laneOffset: second.laneOffset,
      heightOffset: second.heightOffset,
      yawDegrees: second.yawDegrees,
      position: [second.position.x, second.position.y, second.position.z]
    });
  });

  it("still consumes the same four random values when Provider footprint preflight rejects", () => {
    let queryCount = 0;
    const provider: WaterSurfaceProvider = {
      sampleSurface(): boolean {
        queryCount++;
        return queryCount < 7;
      }
    };
    const random = new RiverDriftRandom(73);

    expect(createRiverDriftSpawnPlan(compiled, provider, random)).toBeNull();
    expect(queryCount).toBe(7);
    expect(random.consumedValueCount).toBe(RIVER_DRIFT_RANDOM_VALUES_PER_SPAWN);
  });

  it("schedules the first spawn immediately and later spawns at exact three-second accumulator intervals", () => {
    const scheduler = new RiverDriftSpawnScheduler();
    scheduler.start();
    scheduler.advance(0.016);
    expect(scheduler.consumeNextScheduledTime()).toBe(0);
    expect(scheduler.consumeNextScheduledTime()).toBeUndefined();

    scheduler.advance(2.999);
    expect(scheduler.consumeNextScheduledTime()).toBeUndefined();
    scheduler.advance(0.001);
    expect(scheduler.consumeNextScheduledTime()).toBe(3);

    scheduler.advance(6.2);
    expect(scheduler.consumeNextScheduledTime()).toBe(6);
    expect(scheduler.consumeNextScheduledTime()).toBe(9);
    expect(scheduler.consumeNextScheduledTime()).toBeUndefined();
    expect(scheduler.accumulator).toBeCloseTo(0.2, 8);

    scheduler.pause();
    const elapsedBeforePause = scheduler.elapsedTime;
    scheduler.advance(30);
    expect(scheduler.elapsedTime).toBe(elapsedBeforePause);
    expect(scheduler.consumeNextScheduledTime()).toBeUndefined();
  });

  it("reset restores immediate cadence and spawn index instead of retaining elapsed time", () => {
    const scheduler = new RiverDriftSpawnScheduler();
    scheduler.start();
    scheduler.advance(7);
    expect(scheduler.consumeNextScheduledTime()).toBe(0);
    expect(scheduler.consumeNextScheduledTime()).toBeUndefined();
    scheduler.advance(6.2);
    expect([scheduler.consumeNextScheduledTime(), scheduler.consumeNextScheduledTime()]).toEqual([3, 6]);

    scheduler.reset(false);
    scheduler.advance(0);
    expect(scheduler.snapshot()).toMatchObject({ elapsedTime: 0, accumulator: 0, nextSpawnIndex: 0 });
    expect(scheduler.consumeNextScheduledTime()).toBe(0);
  });

  it("projects progress onto compiled XZ segments and reports cumulative reach distance", () => {
    const source = findRiverDriftSourceReach(compiled)!;
    const samples = source.reach.artifact.samples;
    const sample = samples[Math.floor(samples.length * 0.64)];
    const projection = createRiverDriftProjection();

    expect(projectRiverDriftProgress(source.reach, sample.position[0], sample.position[2], projection)).toBe(true);
    expect(projection.distance).toBeCloseTo(sample.distance, 5);
    expect(projection.normalizedDistance).toBeCloseTo(sample.distance / source.reach.artifact.totalLength, 5);
    expect(projection.squaredDistanceToCenterline).toBeCloseTo(0, 8);

    const outputIdentity = projection;
    expect(projectRiverDriftProgress(source.reach, Number.NaN, sample.position[2], projection)).toBe(false);
    expect(projection).toBe(outputIdentity);
    expect(projection.squaredDistanceToCenterline).toBe(Number.POSITIVE_INFINITY);
  });
});
