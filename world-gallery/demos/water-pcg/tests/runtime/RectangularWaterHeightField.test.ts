import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import {
  RectangularWaterHeightField,
  type RectangularWaterHeightFieldSample
} from "../../runtime/interaction/RectangularWaterHeightField";

const FIXED_STEP = 1 / 60;

function createField(): RectangularWaterHeightField {
  return new RectangularWaterHeightField({
    centerX: 0,
    centerZ: 0,
    lengthAxisX: 1,
    lengthAxisZ: 0,
    length: 16,
    width: 8,
    resolutionX: 33,
    resolutionZ: 17,
    waveSpeed: 4,
    damping: 0.55,
    maxDisplacement: 0.25
  });
}

function registerCenterEntry(field: RectangularWaterHeightField): void {
  expect(
    field.registerInteraction(new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(0, -6, 0), 0.72, 0.1, true)
  ).toBe(true);
}

function mean(values: Float32Array): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function stateHash(field: RectangularWaterHeightField): string {
  let hash = 2166136261;
  for (const array of [field.heightCurrent, field.verticalVelocity]) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (const value of bytes) {
      hash ^= value;
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16);
}

describe("RectangularWaterHeightField", () => {
  it("keeps still water exactly still and reports a safe CFL at 60 Hz", () => {
    const field = createField();
    expect(field.computeCfl(FIXED_STEP)).toBeLessThanOrEqual(field.maximumCfl);
    for (let step = 0; step < 240; step++) expect(field.step(FIXED_STEP)).toBe(true);
    expect(field.heightCurrent.every((value) => value === 0)).toBe(true);
    expect(field.verticalVelocity.every((value) => value === 0)).toBe(true);
    expect(field.maximumAbsHeight).toBe(0);
    expect(field.diagnostic).toBe("none");
  });

  it("turns a signed entry impact into a bounded expanding wave with zero mean", () => {
    const field = createField();
    const sample: RectangularWaterHeightFieldSample = {
      height: 0,
      verticalVelocity: 0,
      gradientLocalX: 0,
      gradientLocalZ: 0
    };
    registerCenterEntry(field);
    expect(field.entryInteractionCount).toBe(1);
    expect(field.pendingInteractionCount).toBe(1);
    field.step(FIXED_STEP);
    expect(field.sampleLocal(0, 0, sample)).toBe(true);
    expect(sample.height).toBeLessThan(0);
    const earlyRadius = field.measureActiveRadius(0, 0);
    for (let step = 0; step < 45; step++) field.step(FIXED_STEP);
    const laterRadius = field.measureActiveRadius(0, 0);

    expect(laterRadius).toBeGreaterThan(earlyRadius + 1);
    expect(Math.abs(mean(field.heightCurrent))).toBeLessThan(1e-5);
    expect(field.maximumAbsHeight).toBeGreaterThan(0.001);
    expect(field.maximumAbsHeight).toBeLessThanOrEqual(0.25);
    expect(field.heightCurrent.every(Number.isFinite)).toBe(true);
    expect(field.verticalVelocity.every(Number.isFinite)).toBe(true);
  });

  it("reaches the reflective boundary and loses energy under damping", () => {
    const field = createField();
    registerCenterEntry(field);
    let earlyEnergy = 0;
    let peakBoundary = 0;
    for (let step = 0; step < 300; step++) {
      field.step(FIXED_STEP);
      if (step === 20) {
        earlyEnergy =
          field.heightCurrent.reduce((sum, value) => sum + value * value, 0) +
          field.verticalVelocity.reduce((sum, value) => sum + value * value * 0.01, 0);
      }
      peakBoundary = Math.max(peakBoundary, field.maximumBoundaryAbsHeight);
    }
    const lateEnergy =
      field.heightCurrent.reduce((sum, value) => sum + value * value, 0) +
      field.verticalVelocity.reduce((sum, value) => sum + value * value * 0.01, 0);

    expect(peakBoundary).toBeGreaterThan(0.0005);
    expect(lateEnergy).toBeLessThan(earlyEnergy);
    expect(Math.abs(mean(field.heightCurrent))).toBeLessThan(1e-5);
  });

  it("holds a locally compensated depression under stationary contact and releases it back into waves", () => {
    const field = createField();
    const position = new Vector3(0, 0, 0);
    const normal = new Vector3(0, 1, 0);
    const stationary = new Vector3();
    for (let step = 0; step < 180; step++) {
      expect(field.registerInteraction(position, normal, stationary, 0.72, 0.5, false)).toBe(true);
      expect(field.step(FIXED_STEP)).toBe(true);
    }

    expect(field.contactInteractionCount).toBe(180);
    expect(field.continuousInteractionCount).toBe(0);
    expect(field.currentContactDepression).toBeGreaterThan(0.08);
    expect(field.currentContactDepression).toBeLessThanOrEqual(0.23);
    expect(field.currentContactRimHeight).toBeGreaterThan(0.002);
    expect(field.maximumContactRimHeight).toBeGreaterThanOrEqual(field.currentContactRimHeight);
    expect(Math.abs(mean(field.heightCurrent))).toBeLessThan(1e-5);

    const heldDepression = field.currentContactDepression;
    for (let step = 0; step < 240; step++) expect(field.step(FIXED_STEP)).toBe(true);
    const releasedCenterHeight = Math.abs(field.readHeight(field.resolutionX >> 1, field.resolutionZ >> 1));
    expect(releasedCenterHeight).toBeLessThan(heldDepression * 0.25);
    expect(field.heightCurrent.every(Number.isFinite)).toBe(true);
    expect(field.verticalVelocity.every(Number.isFinite)).toBe(true);
  });

  it("is deterministic, bounds its queue, rejects unsafe CFL, and resets non-finite state", () => {
    const hashes = new Set<string>();
    for (let run = 0; run < 10; run++) {
      const field = createField();
      registerCenterEntry(field);
      for (let step = 0; step < 100; step++) field.step(FIXED_STEP);
      hashes.add(stateHash(field));
    }
    expect(hashes.size).toBe(1);

    const field = createField();
    for (let index = 0; index < 12; index++) {
      field.registerInteraction(
        new Vector3((index - 6) * 0.2, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, -1 - index, 0),
        0.72,
        0.5,
        true
      );
    }
    expect(field.pendingInteractionCount).toBe(8);
    expect(field.droppedInteractionCount).toBe(4);
    expect(field.step(1)).toBe(false);
    expect(field.diagnostic).toBe("cfl-unsafe");

    field.heightCurrent[0] = Number.NaN;
    expect(field.step(FIXED_STEP)).toBe(false);
    expect(field.diagnostic).toBe("non-finite-state");
    expect(field.heightCurrent.every((value) => value === 0)).toBe(true);
    expect(field.verticalVelocity.every((value) => value === 0)).toBe(true);
  });
});
