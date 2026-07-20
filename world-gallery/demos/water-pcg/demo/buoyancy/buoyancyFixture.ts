/** Demo-only fixtures and profiling helpers for the water-pcg buoyancy validation page. */
import { Vector3 } from "@galacean/engine-math";
import type { BuoyancyPontoon } from "../../runtime/buoyancy/types";
import {
  resetWaterSurfaceSample,
  type WaterSurfaceProvider,
  type WaterSurfaceSample
} from "../../runtime/query/WaterSurfaceProvider";

export const BUOYANCY_SCENARIO_IDS = ["static-single", "river-four"] as const;
export type BuoyancyScenarioId = (typeof BUOYANCY_SCENARIO_IDS)[number];

export interface BuoyancyFixtureDefinition {
  readonly id: BuoyancyScenarioId;
  readonly label: string;
  readonly bodySize: readonly [number, number, number];
  readonly bodyMass: number;
  readonly initialPosition: readonly [number, number, number];
  readonly initialRotation: readonly [number, number, number];
  readonly buoyancyCoefficient: number;
  readonly verticalDamping: number;
  readonly maxForceMultiplier: number;
  createPontoons(): BuoyancyPontoon[];
}

export interface BuoyancyStageProfile {
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly sampleCount: number;
}

export interface BuoyancyPerformanceCaseResult {
  readonly surfaceKind: BuoyancyProfileSurfaceKind;
  readonly bodyCount: number;
  readonly pontoonCount: number;
  readonly horizontalDragEnabled: boolean;
  readonly queriesPerStep: number;
  readonly appliedForcesPerStep: number;
  readonly expectedQueriesPerStep: number;
  readonly preflightPontoonCount: number;
  readonly preflightAllInsideFootprint: boolean;
  readonly preflightAllExpectedSource: boolean;
  readonly fixedStepBudgetMs: number;
  readonly mainThreadBudgetShareP95: number;
  readonly query: BuoyancyStageProfile;
  readonly solver: BuoyancyStageProfile;
  readonly applyForce: BuoyancyStageProfile;
  readonly total: BuoyancyStageProfile;
}

export type BuoyancyProfileSurfaceKind = "reach" | "junction";

export const BUOYANCY_PERFORMANCE_BODY_COUNTS = [1, 20, 100] as const;
export const BUOYANCY_MAX_PONTOONS = 8;
export const BUOYANCY_PROFILE_SAMPLE_CAPACITY = 120;
export const STATIC_SINGLE_EXPECTED_BODY_HEIGHT = 0.48;

export const STATIC_SINGLE_FIXTURE: BuoyancyFixtureDefinition = {
  id: "static-single",
  label: "Static surface · one Pontoon",
  bodySize: [1.8, 1.1, 1.8],
  bodyMass: 8,
  initialPosition: [-7, 3.2, 0],
  initialRotation: [0, 0, 0],
  buoyancyCoefficient: 2,
  verticalDamping: 12,
  maxForceMultiplier: 4,
  createPontoons: () => [
    {
      localPosition: new Vector3(0, -0.48, 0),
      radius: 0.74,
      enabled: true
    }
  ]
};

export const RIVER_FOUR_FIXTURE: BuoyancyFixtureDefinition = {
  id: "river-four",
  label: "Dynamic River · four Pontoons",
  bodySize: [3.2, 1.05, 4.6],
  bodyMass: 46,
  initialPosition: [-4, 8.2, 6],
  initialRotation: [0, 75, 16],
  buoyancyCoefficient: 2.15,
  verticalDamping: 2.2,
  maxForceMultiplier: 4.5,
  createPontoons: () => [
    { localPosition: new Vector3(-1.18, -0.28, -1.72), radius: 0.68, enabled: true },
    { localPosition: new Vector3(1.18, -0.28, -1.72), radius: 0.68, enabled: true },
    { localPosition: new Vector3(-1.18, -0.28, 1.72), radius: 0.68, enabled: true },
    { localPosition: new Vector3(1.18, -0.28, 1.72), radius: 0.68, enabled: true }
  ]
};

export function getBuoyancyFixture(id: BuoyancyScenarioId): BuoyancyFixtureDefinition {
  return id === "static-single" ? STATIC_SINGLE_FIXTURE : RIVER_FOUR_FIXTURE;
}

export function parseBuoyancyScenario(value: string | null): BuoyancyScenarioId {
  return value === "static-single" ? "static-single" : "river-four";
}

/** Parses the optional fixed River surface clock used by deterministic browser validation. */
export function parseBuoyancySurfaceTime(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Creates fresh, symmetric probes for the repeatable W5 load matrix. */
export function createBuoyancyProfilePontoons(count: 4 | 8): BuoyancyPontoon[] {
  const positions: readonly (readonly [number, number])[] =
    count === 4
      ? [
          [-0.12, -0.12],
          [0.12, -0.12],
          [-0.12, 0.12],
          [0.12, 0.12]
        ]
      : [
          [-0.12, -0.12],
          [0, -0.12],
          [0.12, -0.12],
          [-0.12, 0],
          [0.12, 0],
          [-0.12, 0.12],
          [0, 0.12],
          [0.12, 0.12]
        ];
  return positions.map(([x, z]) => ({ localPosition: new Vector3(x, 0, z), radius: 0.16, enabled: true }));
}

/** Bounded world-space plane provider used by the one-Pontoon control scenario. */
export class FlatWaterSurfaceProvider implements WaterSurfaceProvider {
  sampleCount = 0;

  constructor(
    readonly surfaceHeight = 0,
    readonly halfExtent = 5.5,
    readonly waterBodyId = "buoyancy-static-surface"
  ) {}

  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    this.sampleCount++;
    resetWaterSurfaceSample(outSample);
    if (
      !Number.isFinite(worldPosition.x) ||
      !Number.isFinite(worldPosition.y) ||
      !Number.isFinite(worldPosition.z) ||
      Math.abs(worldPosition.x + 7) > this.halfExtent ||
      Math.abs(worldPosition.z) > this.halfExtent
    ) {
      return false;
    }

    outSample.waterBodyId = this.waterBodyId;
    outSample.surfacePosition.set(worldPosition.x, this.surfaceHeight, worldPosition.z);
    outSample.surfaceNormal.set(0, 1, 0);
    outSample.waterVelocity.set(0, 0, 0);
    outSample.waterDepth = 6;
    return true;
  }
}

export function summarizeProfile(
  samples: ArrayLike<number>,
  requestedSampleCount = samples.length
): BuoyancyStageProfile {
  const finiteRequestedCount = Number.isFinite(requestedSampleCount) ? Math.floor(requestedSampleCount) : 0;
  const sampleCount = Math.min(samples.length, Math.max(0, finiteRequestedCount));
  if (sampleCount === 0) return { p50Ms: 0, p95Ms: 0, maxMs: 0, sampleCount: 0 };
  const sorted = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index++) {
    const value = samples[index];
    sorted[index] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  sorted.sort();
  const p50Index = Math.min(sampleCount - 1, Math.max(0, Math.ceil(sampleCount * 0.5) - 1));
  const p95Index = Math.min(sampleCount - 1, Math.max(0, Math.ceil(sampleCount * 0.95) - 1));
  return {
    p50Ms: sorted[p50Index],
    p95Ms: sorted[p95Index],
    maxMs: sorted[sampleCount - 1],
    sampleCount
  };
}
