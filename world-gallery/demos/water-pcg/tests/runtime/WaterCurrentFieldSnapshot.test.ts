import { describe, expect, it } from "vitest";
import {
  createGridWaterCurrentFieldSnapshot,
  createUniformWaterCurrentFieldSnapshot,
  createWaterCurrentFieldSample,
  sampleWaterCurrentFieldSnapshot
} from "../../runtime/interaction/WaterCurrentFieldSnapshot";

describe("WaterCurrentFieldSnapshot", () => {
  it("creates a data-only uniform current with an explicit source revision", () => {
    const snapshot = createUniformWaterCurrentFieldSnapshot({ revision: 3, currentX: 0.04, currentZ: -0.02 });
    const sample = createWaterCurrentFieldSample();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).toMatchObject({ kind: "uniform", revision: 3, currentX: 0.04, currentZ: -0.02 });
    expect(sampleWaterCurrentFieldSnapshot(snapshot, 100, -200, sample)).toBe(true);
    expect(sample).toEqual({ currentX: 0.04, currentZ: -0.02 });
  });

  it("owns and bilinearly samples a bounded XZ current grid", () => {
    const source = new Float32Array([0, 0, 2, 0, 0, 2, 2, 2]);
    const snapshot = createGridWaterCurrentFieldSnapshot({
      revision: 7,
      centerX: 0,
      centerZ: 0,
      length: 2,
      width: 2,
      resolutionX: 2,
      resolutionZ: 2,
      currentVectorsXZ: source
    });
    source.fill(99);
    const sample = createWaterCurrentFieldSample();

    expect(snapshot.kind).toBe("grid");
    expect(snapshot.revision).toBe(7);
    expect(sampleWaterCurrentFieldSnapshot(snapshot, 0, 0, sample)).toBe(true);
    expect(sample.currentX).toBeCloseTo(1);
    expect(sample.currentZ).toBeCloseTo(1);
    expect(sampleWaterCurrentFieldSnapshot(snapshot, -1, -1, sample)).toBe(true);
    expect(sample).toEqual({ currentX: 0, currentZ: 0 });
    expect(sampleWaterCurrentFieldSnapshot(snapshot, 1.01, 0, sample)).toBe(false);
    expect(sample).toEqual({ currentX: 0, currentZ: 0 });
  });

  it("rejects invalid revisions, regions, and non-finite current data", () => {
    expect(() => createUniformWaterCurrentFieldSnapshot({ revision: -1, currentX: 0, currentZ: 0 })).toThrow(
      /revision/
    );
    expect(() => createUniformWaterCurrentFieldSnapshot({ revision: 0, currentX: Number.NaN, currentZ: 0 })).toThrow(
      /finite/
    );
    expect(() =>
      createGridWaterCurrentFieldSnapshot({
        revision: 0,
        centerX: 0,
        centerZ: 0,
        length: 0,
        width: 1,
        resolutionX: 2,
        resolutionZ: 2,
        currentVectorsXZ: new Float32Array(8)
      })
    ).toThrow(/region/);
    expect(() =>
      createGridWaterCurrentFieldSnapshot({
        revision: 0,
        centerX: 0,
        centerZ: 0,
        length: 1,
        width: 1,
        resolutionX: 2,
        resolutionZ: 2,
        currentVectorsXZ: new Float32Array(7)
      })
    ).toThrow(/8 XZ values/);
  });
});
