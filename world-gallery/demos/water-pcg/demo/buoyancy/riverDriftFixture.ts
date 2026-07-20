/** Deterministic, demo-only fixtures and geometry helpers for the River drift stream. */
import { Vector3 } from "@galacean/engine-math";
import { RiverNodeKind } from "../../authoring/river/RiverAuthoringEnums";
import type { RiverCompiledNode, RiverCompiledReach, RiverCompiledSample } from "../../compiler/river/types";
import type { BuoyancyPontoon } from "../../runtime/buoyancy/types";
import {
  createWaterSurfaceSample,
  type WaterSurfaceProvider,
  type WaterSurfaceSample
} from "../../runtime/query/WaterSurfaceProvider";

export const RIVER_DRIFT_CUBE_SIZE = 0.7;
export const RIVER_DRIFT_BODY_MASS = 120;
export const RIVER_DRIFT_PONTOON_RADIUS = 0.24;
export const RIVER_DRIFT_SPAWN_INTERVAL_SECONDS = 3;
export const RIVER_DRIFT_MAX_ACTIVE_COUNT = 10;
export const RIVER_DRIFT_MAX_LIFETIME_SECONDS = 36;
export const RIVER_DRIFT_OFF_WATER_GRACE_SECONDS = 1.5;
export const RIVER_DRIFT_DOWNSTREAM_COMPLETION_RATIO = 0.9;
export const RIVER_DRIFT_SOURCE_MIN_RATIO = 0.12;
export const RIVER_DRIFT_SOURCE_MAX_RATIO = 0.28;
export const RIVER_DRIFT_MIN_HEIGHT = 2.5;
export const RIVER_DRIFT_MAX_HEIGHT = 5.5;
export const RIVER_DRIFT_DEFAULT_SEED = 0x6d2b79f5;
export const RIVER_DRIFT_RANDOM_VALUES_PER_SPAWN = 4;
export const RIVER_DRIFT_SPAWN_SNAPSHOT_CAPACITY = 12;

const PONTOON_LOCAL_OFFSET = 0.22;
const PONTOON_LOCAL_HEIGHT = -0.24;
const MAX_LATERAL_OFFSET = 0.8;
const LATERAL_WIDTH_RATIO = 0.15;
const MAX_ABSOLUTE_YAW_DEGREES = 22.5;
const MIN_RANDOM_STATE = 1;
const PROJECTION_EPSILON_SQUARED = 1e-12;

export type RiverDriftCompiledNode = Pick<RiverCompiledNode, "kind">;
export type RiverDriftCompiledReach = Pick<RiverCompiledReach, "fromNodeIndex"> & {
  readonly artifact: Pick<RiverCompiledReach["artifact"], "samples" | "totalLength">;
};

export interface RiverDriftCompiledData {
  readonly nodes: readonly RiverDriftCompiledNode[];
  readonly reaches: readonly RiverDriftCompiledReach[];
}

export interface RiverDriftSpawnPlan {
  readonly reach: RiverDriftCompiledReach;
  readonly reachIndex: number;
  readonly reachDistance: number;
  readonly reachRatio: number;
  readonly laneOffset: number;
  readonly heightOffset: number;
  readonly yawDegrees: number;
  readonly surfaceHeight: number;
  readonly position: Vector3;
}

export interface RiverDriftProjection {
  distance: number;
  normalizedDistance: number;
  squaredDistanceToCenterline: number;
}

export interface RiverDriftSpawnSchedulerSnapshot {
  readonly elapsedTime: number;
  readonly accumulator: number;
  readonly pendingSpawnCount: number;
  readonly nextSpawnIndex: number;
  readonly paused: boolean;
}

/** Stable xorshift32 stream. Seed zero is normalized so it cannot enter the all-zero lock state. */
export class RiverDriftRandom {
  private _initialSeed = RIVER_DRIFT_DEFAULT_SEED;
  private _state = RIVER_DRIFT_DEFAULT_SEED;
  private _consumedValueCount = 0;

  constructor(seed = RIVER_DRIFT_DEFAULT_SEED) {
    this.reset(seed);
  }

  get initialSeed(): number {
    return this._initialSeed;
  }

  get state(): number {
    return this._state;
  }

  get consumedValueCount(): number {
    return this._consumedValueCount;
  }

  reset(seed = this._initialSeed): void {
    const normalized = normalizeRiverDriftSeed(seed);
    this._initialSeed = normalized;
    this._state = normalized;
    this._consumedValueCount = 0;
  }

  nextUnit(): number {
    let value = this._state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this._state = value >>> 0;
    this._consumedValueCount++;
    return this._state / 0x1_0000_0000;
  }
}

/** Accumulator scheduler used by Script.onUpdate; it does not own or emulate a physics loop. */
export class RiverDriftSpawnScheduler {
  private _elapsedTime = 0;
  private _accumulator = 0;
  private _pendingSpawnCount = 0;
  private _nextSpawnIndex = 0;
  private _paused = true;
  private _immediateSpawnPending = true;

  get elapsedTime(): number {
    return this._elapsedTime;
  }

  get accumulator(): number {
    return this._accumulator;
  }

  get pendingSpawnCount(): number {
    return this._pendingSpawnCount;
  }

  get paused(): boolean {
    return this._paused;
  }

  start(): void {
    this._paused = false;
  }

  pause(): void {
    this._paused = true;
  }

  reset(paused = this._paused): void {
    this._elapsedTime = 0;
    this._accumulator = 0;
    this._pendingSpawnCount = 0;
    this._nextSpawnIndex = 0;
    this._paused = paused;
    this._immediateSpawnPending = true;
  }

  advance(deltaTime: number): void {
    if (this._paused || !Number.isFinite(deltaTime) || deltaTime < 0) return;
    if (this._immediateSpawnPending) {
      this._immediateSpawnPending = false;
      this._pendingSpawnCount++;
      // The stream clock starts when the first entity is actually created. The engine's first
      // update may include bootstrap time, which must not shorten the first real 3-second gap.
      return;
    }
    this._elapsedTime += deltaTime;
    this._accumulator += deltaTime;
    while (this._accumulator >= RIVER_DRIFT_SPAWN_INTERVAL_SECONDS) {
      this._accumulator -= RIVER_DRIFT_SPAWN_INTERVAL_SECONDS;
      this._pendingSpawnCount++;
    }
  }

  consumeNextScheduledTime(): number | undefined {
    if (this._pendingSpawnCount === 0) return undefined;
    this._pendingSpawnCount--;
    return this._nextSpawnIndex++ * RIVER_DRIFT_SPAWN_INTERVAL_SECONDS;
  }

  snapshot(): RiverDriftSpawnSchedulerSnapshot {
    return {
      elapsedTime: this._elapsedTime,
      accumulator: this._accumulator,
      pendingSpawnCount: this._pendingSpawnCount,
      nextSpawnIndex: this._nextSpawnIndex,
      paused: this._paused
    };
  }
}

export function normalizeRiverDriftSeed(value: number): number {
  if (!Number.isFinite(value)) return RIVER_DRIFT_DEFAULT_SEED;
  const normalized = Math.trunc(value) >>> 0;
  return normalized === 0 ? MIN_RANDOM_STATE : normalized;
}

export function parseRiverDriftSeed(value: string | null): number {
  if (value === null || value.trim() === "") return RIVER_DRIFT_DEFAULT_SEED;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? normalizeRiverDriftSeed(parsed) : RIVER_DRIFT_DEFAULT_SEED;
}

export function createRiverDriftPontoons(): BuoyancyPontoon[] {
  return [
    {
      localPosition: new Vector3(-PONTOON_LOCAL_OFFSET, PONTOON_LOCAL_HEIGHT, -PONTOON_LOCAL_OFFSET),
      radius: RIVER_DRIFT_PONTOON_RADIUS,
      enabled: true
    },
    {
      localPosition: new Vector3(PONTOON_LOCAL_OFFSET, PONTOON_LOCAL_HEIGHT, -PONTOON_LOCAL_OFFSET),
      radius: RIVER_DRIFT_PONTOON_RADIUS,
      enabled: true
    },
    {
      localPosition: new Vector3(-PONTOON_LOCAL_OFFSET, PONTOON_LOCAL_HEIGHT, PONTOON_LOCAL_OFFSET),
      radius: RIVER_DRIFT_PONTOON_RADIUS,
      enabled: true
    },
    {
      localPosition: new Vector3(PONTOON_LOCAL_OFFSET, PONTOON_LOCAL_HEIGHT, PONTOON_LOCAL_OFFSET),
      radius: RIVER_DRIFT_PONTOON_RADIUS,
      enabled: true
    }
  ];
}

export function findRiverDriftSourceReach(data: RiverDriftCompiledData): {
  readonly reach: RiverDriftCompiledReach;
  readonly reachIndex: number;
} | null {
  for (let reachIndex = 0; reachIndex < data.reaches.length; reachIndex++) {
    const reach = data.reaches[reachIndex];
    if (data.nodes[reach.fromNodeIndex]?.kind === RiverNodeKind.Source && reach.artifact.samples.length >= 2) {
      return { reach, reachIndex };
    }
  }
  return null;
}

/**
 * Builds one deterministic spawn plan and consumes exactly four random values, including rejected attempts.
 * Provider probes cover the center and the cardinal rim of every Pontoon footprint.
 */
export function createRiverDriftSpawnPlan(
  data: RiverDriftCompiledData,
  provider: WaterSurfaceProvider,
  random: RiverDriftRandom
): RiverDriftSpawnPlan | null {
  const reachRatioRandom = random.nextUnit();
  const laneRandom = random.nextUnit();
  const heightRandom = random.nextUnit();
  const yawRandom = random.nextUnit();
  const source = findRiverDriftSourceReach(data);
  if (!source) return null;

  const reachRatio = lerp(RIVER_DRIFT_SOURCE_MIN_RATIO, RIVER_DRIFT_SOURCE_MAX_RATIO, reachRatioRandom);
  const sample = interpolateReachSample(source.reach, reachRatio);
  if (!sample) return null;
  const tangentLength = Math.hypot(sample.tangentX, sample.tangentZ);
  if (!Number.isFinite(tangentLength) || tangentLength <= 1e-6) return null;
  const lateralX = -sample.tangentZ / tangentLength;
  const lateralZ = sample.tangentX / tangentLength;
  const laneLimit = Math.min(MAX_LATERAL_OFFSET, sample.width * LATERAL_WIDTH_RATIO);
  const laneOffset = lerp(-laneLimit, laneLimit, laneRandom);
  const centerX = sample.x + lateralX * laneOffset;
  const centerZ = sample.z + lateralZ * laneOffset;
  const heightOffset = lerp(RIVER_DRIFT_MIN_HEIGHT, RIVER_DRIFT_MAX_HEIGHT, heightRandom);
  const yawDegrees = lerp(-MAX_ABSOLUTE_YAW_DEGREES, MAX_ABSOLUTE_YAW_DEGREES, yawRandom);
  const surfaceSample = createWaterSurfaceSample();
  const queryPosition = new Vector3(centerX, sample.y, centerZ);
  let surfaceHeight = Number.NEGATIVE_INFINITY;
  if (
    !samplePontoonFootprint(provider, queryPosition, yawDegrees, surfaceSample, (height) => {
      surfaceHeight = Math.max(surfaceHeight, height);
    })
  ) {
    return null;
  }
  if (!Number.isFinite(surfaceHeight)) return null;

  return {
    reach: source.reach,
    reachIndex: source.reachIndex,
    reachDistance: sample.distance,
    reachRatio,
    laneOffset,
    heightOffset,
    yawDegrees,
    surfaceHeight,
    position: new Vector3(centerX, surfaceHeight + heightOffset, centerZ)
  };
}

export function createRiverDriftProjection(): RiverDriftProjection {
  return { distance: 0, normalizedDistance: 0, squaredDistanceToCenterline: Number.POSITIVE_INFINITY };
}

/** Projects an XZ point onto the nearest compiled centerline segment and reports cumulative reach distance. */
export function projectRiverDriftProgress(
  reach: RiverDriftCompiledReach,
  worldX: number,
  worldZ: number,
  outProjection: RiverDriftProjection
): boolean {
  const samples = reach.artifact.samples;
  if (samples.length < 2 || !Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
    resetProjection(outProjection);
    return false;
  }

  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestReachDistance = 0;
  for (let index = 0; index < samples.length - 1; index++) {
    const start = samples[index];
    const end = samples[index + 1];
    const segmentX = end.position[0] - start.position[0];
    const segmentZ = end.position[2] - start.position[2];
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    const rawT =
      segmentLengthSquared > PROJECTION_EPSILON_SQUARED
        ? ((worldX - start.position[0]) * segmentX + (worldZ - start.position[2]) * segmentZ) / segmentLengthSquared
        : 0;
    const t = Math.max(0, Math.min(1, rawT));
    const projectedX = start.position[0] + segmentX * t;
    const projectedZ = start.position[2] + segmentZ * t;
    const deltaX = worldX - projectedX;
    const deltaZ = worldZ - projectedZ;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestReachDistance = lerp(start.distance, end.distance, t);
    }
  }

  const totalLength = reach.artifact.totalLength;
  if (!Number.isFinite(bestReachDistance) || !Number.isFinite(bestDistanceSquared) || !(totalLength > 0)) {
    resetProjection(outProjection);
    return false;
  }
  outProjection.distance = bestReachDistance;
  outProjection.normalizedDistance = Math.max(0, Math.min(1, bestReachDistance / totalLength));
  outProjection.squaredDistanceToCenterline = bestDistanceSquared;
  return true;
}

interface InterpolatedReachSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly tangentX: number;
  readonly tangentZ: number;
  readonly width: number;
  readonly distance: number;
}

function interpolateReachSample(
  reach: RiverDriftCompiledReach,
  normalizedDistance: number
): InterpolatedReachSample | null {
  const samples = reach.artifact.samples;
  const totalLength = reach.artifact.totalLength;
  if (samples.length < 2 || !(totalLength > 0)) return null;
  const targetDistance = Math.max(0, Math.min(1, normalizedDistance)) * totalLength;
  let endIndex = 1;
  while (endIndex < samples.length - 1 && samples[endIndex].distance < targetDistance) endIndex++;
  const start = samples[endIndex - 1];
  const end = samples[endIndex];
  const distanceSpan = end.distance - start.distance;
  const t = distanceSpan > 1e-6 ? Math.max(0, Math.min(1, (targetDistance - start.distance) / distanceSpan)) : 0;
  return interpolateSample(start, end, t, targetDistance);
}

function interpolateSample(
  start: RiverCompiledSample,
  end: RiverCompiledSample,
  t: number,
  targetDistance: number
): InterpolatedReachSample {
  return {
    x: lerp(start.position[0], end.position[0], t),
    y: lerp(start.position[1], end.position[1], t),
    z: lerp(start.position[2], end.position[2], t),
    tangentX: lerp(start.tangent[0], end.tangent[0], t),
    tangentZ: lerp(start.tangent[2], end.tangent[2], t),
    width: lerp(start.width, end.width, t),
    distance: targetDistance
  };
}

function samplePontoonFootprint(
  provider: WaterSurfaceProvider,
  queryPosition: Vector3,
  yawDegrees: number,
  outSample: WaterSurfaceSample,
  recordHeight: (height: number) => void
): boolean {
  const radians = (yawDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const pontoons = createRiverDriftPontoons();
  for (const pontoon of pontoons) {
    const localX = pontoon.localPosition.x;
    const localZ = pontoon.localPosition.z;
    const pontoonX = queryPosition.x + localX * cosine + localZ * sine;
    const pontoonZ = queryPosition.z - localX * sine + localZ * cosine;
    if (!sampleFootprintPoint(provider, queryPosition, outSample, recordHeight, pontoonX, pontoonZ)) return false;
    if (
      !sampleFootprintPoint(
        provider,
        queryPosition,
        outSample,
        recordHeight,
        pontoonX + RIVER_DRIFT_PONTOON_RADIUS,
        pontoonZ
      ) ||
      !sampleFootprintPoint(
        provider,
        queryPosition,
        outSample,
        recordHeight,
        pontoonX - RIVER_DRIFT_PONTOON_RADIUS,
        pontoonZ
      ) ||
      !sampleFootprintPoint(
        provider,
        queryPosition,
        outSample,
        recordHeight,
        pontoonX,
        pontoonZ + RIVER_DRIFT_PONTOON_RADIUS
      ) ||
      !sampleFootprintPoint(
        provider,
        queryPosition,
        outSample,
        recordHeight,
        pontoonX,
        pontoonZ - RIVER_DRIFT_PONTOON_RADIUS
      )
    ) {
      return false;
    }
  }
  return true;
}

function sampleFootprintPoint(
  provider: WaterSurfaceProvider,
  queryPosition: Vector3,
  outSample: WaterSurfaceSample,
  recordHeight: (height: number) => void,
  x: number,
  z: number
): boolean {
  queryPosition.x = x;
  queryPosition.z = z;
  if (!provider.sampleSurface(queryPosition, outSample)) return false;
  const height = outSample.surfacePosition.y;
  if (!Number.isFinite(height)) return false;
  recordHeight(height);
  return true;
}

function resetProjection(projection: RiverDriftProjection): void {
  projection.distance = 0;
  projection.normalizedDistance = 0;
  projection.squaredDistanceToCenterline = Number.POSITIVE_INFINITY;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}
