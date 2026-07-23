import { describe, expect, it } from "vitest";
import { TemporalFoamField } from "../../runtime/interaction/TemporalFoamField";
import { createUniformWaterCurrentFieldSnapshot } from "../../runtime/interaction/WaterCurrentFieldSnapshot";

function createField(decayRatePerSecond = 0): TemporalFoamField {
  return new TemporalFoamField({
    centerX: 0,
    centerZ: 0,
    length: 16,
    width: 8,
    resolutionX: 16,
    resolutionZ: 8,
    decayRatePerSecond
  });
}

describe("TemporalFoamField", () => {
  it("uses R8 ping-pong source/history, decays to idle, and skips inactive updates", () => {
    const field = createField(10);
    expect(field.step(0.1)).toBe(false);
    expect(field.metrics.idleSkipCount).toBe(1);
    expect(field.addSourceWorld(0, 0, 1.5, 1)).toBe(true);
    expect(field.step(0.1)).toBe(true);
    expect(field.historyBuffer.some((value) => value > 0)).toBe(true);
    expect(field.sampleWorld(0, 0)).toBeGreaterThan(0);
    expect(field.metrics.activeLifetimeSeconds).toBeCloseTo(0.1);
    expect(field.metrics.historyEnergy).toBeGreaterThan(0);
    for (let index = 0; index < 20 && !field.isIdle; index++) field.step(0.1);
    expect(field.isIdle).toBe(true);
    expect(field.metrics.sourceInjectionCount).toBe(1);
    expect(field.metrics.lastLifetimeSeconds).toBeGreaterThan(0.1);
    expect(field.metrics.maximumLifetimeSeconds).toBeGreaterThanOrEqual(field.metrics.lastLifetimeSeconds);
  });

  it("retains sub-byte decay and reaches idle at the demo rate under 60 FPS stepping", () => {
    const field = createField(0.8);
    field.addSourceWorld(0, 0, 1.5, 1);
    field.step(1 / 60);

    let decayFrameCount = 0;
    while (!field.isIdle && decayFrameCount < 720) {
      field.step(1 / 60);
      decayFrameCount++;
    }

    expect(field.isIdle).toBe(true);
    expect(decayFrameCount).toBeGreaterThan(60);
    expect(decayFrameCount).toBeLessThan(720);
    expect(field.historyBuffer.every((value) => value === 0)).toBe(true);
    const updateCount = field.metrics.updateCount;
    expect(field.step(1 / 60)).toBe(false);
    expect(field.metrics.updateCount).toBe(updateCount);
    expect(field.metrics.idleSkipCount).toBe(1);
  });

  it("semi-Lagrangian advects with local current and preserves history across texel-snapped region moves", () => {
    const field = createField();
    const current = createUniformWaterCurrentFieldSnapshot({ revision: 2, currentX: 1, currentZ: 0 });
    field.addSourceWorld(-2, 0, 0.8, 1);
    field.step(0.1);
    field.step(1, current);
    expect(field.sampleWorld(-1, 0)).toBeGreaterThan(field.sampleWorld(-2, 0));
    expect(field.metrics.centroidWorldX).toBeGreaterThan(-2);
    expect(field.metrics.centroidDriftDistance).toBeGreaterThan(0.5);
    const beforeShift = field.sampleWorld(-1, 0);
    expect(field.setRegionCenter(1.2, 0)).toBe(true);
    expect(field.centerX).toBe(1);
    expect(field.sampleWorld(-1, 0)).toBeCloseTo(beforeShift, 2);
    expect(field.setRegionCenter(1.4, 0)).toBe(false);
    expect(field.metrics.regionShiftCount).toBe(1);
    expect(field.metrics).toMatchObject({
      currentSnapshotKind: "uniform",
      currentSnapshotRevision: 2,
      currentLookupCount: 1,
      currentSurfaceQueryCount: 0
    });
  });
});
