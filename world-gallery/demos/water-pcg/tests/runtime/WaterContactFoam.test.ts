import { describe, expect, it } from "vitest";
import type { WaterSurfaceFoamOctaves } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import {
  evaluateWaterContactFoam,
  evaluateWaterContactFoamDepthMask,
  evaluateWaterContactFoamF1Squared,
  evaluateWaterContactFoamVoronoi,
  hashWaterContactFoamCell,
  resolveWaterContactFoamOctaveCountForQuality,
  resolveWaterContactFoamPhase,
  WATER_CONTACT_FOAM_MAX_F1_SQUARED,
  WATER_CONTACT_FOAM_PHASE_PERIOD,
  type WaterContactFoamEvaluation,
  type WaterContactFoamParameters
} from "../../runtime/surface/WaterContactFoam";

const FROZEN_PARAMETERS = {
  worldScale: 2.5,
  timeRate: 1,
  opacity: 0.453,
  contactDistance: 0.1791,
  octaves: { count: 3, weights: [0.5, 0.25, 0.125] },
  lacunarity: 2
} as const satisfies WaterContactFoamParameters;

function withOctaves(octaves: WaterSurfaceFoamOctaves): WaterContactFoamParameters {
  return { ...FROZEN_PARAMETERS, octaves };
}

function createEvaluation(): WaterContactFoamEvaluation {
  return { phase: -1, depthMask: -1, voronoi: -1, contactMask: -1 };
}

describe("WaterContactFoam CPU reference", () => {
  it("freezes the strict three-layer parameter values without changing their owner semantics", () => {
    expect(FROZEN_PARAMETERS).toEqual({
      worldScale: 2.5,
      timeRate: 1,
      opacity: 0.453,
      contactDistance: 0.1791,
      octaves: { count: 3, weights: [0.5, 0.25, 0.125] },
      lacunarity: 2
    });
  });

  it("uses a deterministic bounded polynomial cell hash", () => {
    const first = { x: -1, y: -1 };
    const second = { x: -1, y: -1 };

    expect(hashWaterContactFoamCell(17, -23, first)).toBe(first);
    hashWaterContactFoamCell(17, -23, second);

    expect(first).toEqual(second);
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(first.x).toBeLessThan(1);
    expect(first.y).toBeGreaterThanOrEqual(0);
    expect(first.y).toBeLessThan(1);
    expect(hashWaterContactFoamCell(17 + 289, -23 - 289, second)).toEqual(first);
  });

  it("keeps squared 3x3 F1 in range and deterministic over positive and negative domains", () => {
    for (let y = -8; y <= 8; y++) {
      for (let x = -8; x <= 8; x++) {
        const positionX = x * 0.371 + 0.123;
        const positionY = y * 0.283 - 0.456;
        const first = evaluateWaterContactFoamF1Squared(positionX, positionY);
        const second = evaluateWaterContactFoamF1Squared(positionX, positionY);
        expect(first).toBe(second);
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThanOrEqual(WATER_CONTACT_FOAM_MAX_F1_SQUARED);
      }
    }
  });

  it("normalizes non-negative one-, two-, and three-octave combinations", () => {
    const one = evaluateWaterContactFoamVoronoi(1.75, -3.125, 12.5, withOctaves({ count: 1, weights: [0.5] }));
    const oneRescaled = evaluateWaterContactFoamVoronoi(1.75, -3.125, 12.5, withOctaves({ count: 1, weights: [50] }));
    const two = evaluateWaterContactFoamVoronoi(1.75, -3.125, 12.5, withOctaves({ count: 2, weights: [0.5, 0.25] }));
    const three = evaluateWaterContactFoamVoronoi(1.75, -3.125, 12.5, FROZEN_PARAMETERS);

    expect(one).toBe(oneRescaled);
    expect(one).toBeGreaterThanOrEqual(0);
    expect(one).toBeLessThanOrEqual(1);
    expect(two).toBeGreaterThanOrEqual(0);
    expect(two).toBeLessThanOrEqual(1);
    expect(three).toBeGreaterThanOrEqual(0);
    expect(three).toBeLessThanOrEqual(1);
    expect(one).toBeCloseTo(0.6245301756, 12);
    expect(two).toBeCloseTo(0.680287084267, 12);
    expect(three).toBeCloseTo(0.691571856671, 12);
    expect(new Set([one, two, three]).size).toBe(3);
  });

  it("selects Low off, Medium two octaves, and High three octaves", () => {
    expect(resolveWaterContactFoamOctaveCountForQuality("low")).toBe(0);
    expect(resolveWaterContactFoamOctaveCountForQuality("medium")).toBe(2);
    expect(resolveWaterContactFoamOctaveCountForQuality("high")).toBe(3);
  });

  it("uses raw Scene Depth and centered-behind validity with exact far-field zero", () => {
    expect(evaluateWaterContactFoamDepthMask(0, 0, 0.1791)).toBe(0);
    expect(evaluateWaterContactFoamDepthMask(0.0001, 1, 0.1791)).toBeGreaterThan(0.99);
    expect(evaluateWaterContactFoamDepthMask(0.08955, 1, 0.1791)).toBeCloseTo(0.5, 12);
    expect(evaluateWaterContactFoamDepthMask(0.1791, 1, 0.1791)).toBe(0);
    expect(evaluateWaterContactFoamDepthMask(4, 1, 0.1791)).toBe(0);
    expect(evaluateWaterContactFoamDepthMask(0.05, 0, 0.1791)).toBe(0);
    expect(evaluateWaterContactFoamDepthMask(-0.05, 1, 0.1791)).toBe(0);
  });

  it("writes one finite mask into caller-owned output and never leaks beyond contact distance", () => {
    const near = createEvaluation();
    const far = createEvaluation();

    expect(
      evaluateWaterContactFoam(
        {
          worldX: 2.25,
          worldZ: -1.75,
          surfaceTime: 12.5,
          rawSceneDepthDelta: 0.04,
          centeredDepthBehind: 1
        },
        FROZEN_PARAMETERS,
        near
      )
    ).toBe(near);
    evaluateWaterContactFoam(
      {
        worldX: 2.25,
        worldZ: -1.75,
        surfaceTime: 12.5,
        rawSceneDepthDelta: FROZEN_PARAMETERS.contactDistance,
        centeredDepthBehind: 1
      },
      FROZEN_PARAMETERS,
      far
    );

    expect(Object.values(near).every(Number.isFinite)).toBe(true);
    expect(near.depthMask).toBeCloseTo(0.776661083194, 12);
    expect(near.voronoi).toBeCloseTo(0.7628446666, 12);
    expect(near.contactMask).toBeCloseTo(0.268389709577, 12);
    expect(near.contactMask).toBeGreaterThan(0);
    expect(near.contactMask).toBeLessThanOrEqual(FROZEN_PARAMETERS.opacity);
    expect(far).toEqual({
      phase: 12.5,
      depthMask: 0,
      voronoi: 0,
      contactMask: 0
    });
  });

  it("has a bounded continuous 60-frame proxy, including the phase wrap", () => {
    const samples: number[] = [];
    const frameStep = 1 / 60;
    const start = WATER_CONTACT_FOAM_PHASE_PERIOD - frameStep * 30;
    for (let frame = 0; frame <= 60; frame++) {
      samples.push(evaluateWaterContactFoamVoronoi(0.75, -1.25, start + frame * frameStep, FROZEN_PARAMETERS));
    }
    const frameDeltas = samples.slice(1).map((value, index) => Math.abs(value - samples[index]));
    expect(Math.max(...frameDeltas)).toBeLessThan(0.08);
    expect(resolveWaterContactFoamPhase(WATER_CONTACT_FOAM_PHASE_PERIOD - 0.001, 1)).toBeCloseTo(
      WATER_CONTACT_FOAM_PHASE_PERIOD - 0.001,
      9
    );
    expect(resolveWaterContactFoamPhase(WATER_CONTACT_FOAM_PHASE_PERIOD + 0.001, 1)).toBeCloseTo(0.001, 9);
  });

  it("fails closed for invalid numbers, ranges, weights, and output-affecting inputs", () => {
    const invalidParameters: WaterContactFoamParameters[] = [
      { ...FROZEN_PARAMETERS, worldScale: Number.NaN },
      { ...FROZEN_PARAMETERS, timeRate: Number.POSITIVE_INFINITY },
      { ...FROZEN_PARAMETERS, opacity: 1.1 },
      { ...FROZEN_PARAMETERS, contactDistance: 0 },
      { ...FROZEN_PARAMETERS, lacunarity: -1 },
      withOctaves({ count: 1, weights: [0] }),
      withOctaves({ count: 2, weights: [0.5, Number.NaN] }),
      withOctaves({ count: 3, weights: [0.5, -0.25, 0.125] })
    ];
    for (const parameters of invalidParameters) {
      const output = createEvaluation();
      evaluateWaterContactFoam(
        {
          worldX: 1,
          worldZ: 2,
          surfaceTime: 3,
          rawSceneDepthDelta: 0.05,
          centeredDepthBehind: 1
        },
        parameters,
        output
      );
      expect(output.contactMask).toBe(0);
    }

    expect(evaluateWaterContactFoamF1Squared(Number.NaN, 0)).toBe(WATER_CONTACT_FOAM_MAX_F1_SQUARED);
    expect(evaluateWaterContactFoamVoronoi(Number.POSITIVE_INFINITY, 0, 0, FROZEN_PARAMETERS)).toBe(0);
    expect(evaluateWaterContactFoamDepthMask(Number.NaN, 1, 0.1791)).toBe(0);
    expect(resolveWaterContactFoamPhase(Number.NEGATIVE_INFINITY, 1)).toBe(0);
  });
});
