import { describe, expect, it } from "vitest";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import {
  createOceanNearshoreStateSample,
  OceanNearshoreStateField
} from "../../runtime/ocean/OceanNearshoreStateField";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import {
  createWaterCurrentFieldSample,
  sampleWaterCurrentFieldSnapshot
} from "../../runtime/interaction/WaterCurrentFieldSnapshot";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

function createField(): {
  readonly resource: OceanNearshoreFieldResource;
  readonly field: OceanNearshoreStateField;
} {
  const compiled = OceanNearshoreCompiler.compile(
    createOceanNearshoreFixture()
  );
  if (!compiled.valid || !compiled.data) {
    throw new Error("Nearshore fixture did not compile.");
  }
  const resource = OceanNearshoreFieldResource.create(compiled.data);
  return {
    resource,
    field: new OceanNearshoreStateField(resource, {
      swashPeriodSeconds: 4,
      minimumRunupDistance: 0,
      maximumRunupDistance: 2
    })
  };
}

describe("OceanNearshoreStateField", () => {
  it("advances at a fixed rate no faster than 30 Hz and freezes at fixed time", () => {
    const { field } = createField();
    expect(field.update(1 / 120)).toBe(false);
    expect(field.metrics.fixedStepCount).toBe(0);
    expect(field.update(1 / 120)).toBe(false);
    expect(field.update(1 / 120)).toBe(false);
    expect(field.update(1 / 120)).toBe(true);
    expect(field.metrics.fixedStepCount).toBe(1);
    expect(field.metrics.fixedStepRateHz).toBe(30);

    expect(field.seek(2)).toBe(true);
    const revision = field.metrics.revision;
    const state = new Uint8Array(field.stateUploadBuffer);
    expect(field.seek(2)).toBe(false);
    expect(field.metrics.revision).toBe(revision);
    expect(field.stateUploadBuffer).toEqual(state);
  });

  it("uses hysteretic thin-film occupancy and keeps the surface on bed plus film", () => {
    const { resource, field } = createField();
    const sample = createOceanNearshoreStateSample();
    // Positive-Z dry row is reached during high runup.
    field.seek(2);
    expect(field.sample(0, 2, sample)).toBe(true);
    expect(sample.occupied).toBe(true);
    expect(sample.surfaceHeight).toBeGreaterThan(
      resource.bedHeightAt(4 * 5 + 2)
    );
    expect(sample.surfaceHeight).toBeLessThan(
      resource.bedHeightAt(4 * 5 + 2) + 0.1
    );

    field.seek(3.8);
    expect(field.sample(0, 2, sample)).toBe(true);
    expect(sample.wetness).toBeGreaterThan(0);
  });

  it("publishes seaward backwash through a data-only grid snapshot", () => {
    const { field } = createField();
    field.seek(3);
    const state = createOceanNearshoreStateSample();
    expect(field.sample(0, 0, state)).toBe(true);
    expect(state.swashVelocity).toBeLessThan(0);
    const current = createWaterCurrentFieldSample();
    expect(
      sampleWaterCurrentFieldSnapshot(
        field.currentSnapshot,
        0,
        0,
        current
      )
    ).toBe(true);
    // Fixture shore normal points +Z; negative dynamic velocity is seaward.
    expect(current.currentZ).toBeLessThan(-0.2);
    expect(field.metrics.maximumBackwashSpeed).toBeGreaterThan(0);
  });

  it("lets wetness outlive swash, decay to exact zero, and reset immediately", () => {
    const { field } = createField();
    const sample = createOceanNearshoreStateSample();
    field.seek(2);
    field.seek(3.9);
    field.sample(0, 2, sample);
    expect(sample.occupied).toBe(false);
    expect(sample.wetness).toBeGreaterThan(0);

    field.setEnabled(false, false);
    for (let index = 0; index < 800; index++) field.update(1 / 30);
    field.sample(0, 2, sample);
    expect(sample.wetness).toBe(0);
    expect(field.metrics.activeWetnessTexelCount).toBe(0);

    field.setEnabled(true);
    field.seek(2);
    expect(field.metrics.activeThinFilmTexelCount).toBeGreaterThan(0);
    field.reset();
    expect(field.metrics.activeThinFilmTexelCount).toBe(0);
    expect(field.metrics.activeWetnessTexelCount).toBe(0);
    expect(field.wetnessUploadBuffer.every((value) => value === 0)).toBe(
      true
    );
  });

  it("releases its retained resource and all owned buffers", () => {
    const { resource, field } = createField();
    expect(resource.referenceCount).toBe(1);
    expect(field.metrics.stateByteLength).toBeGreaterThan(0);
    field.destroy();
    expect(resource.referenceCount).toBe(0);
    expect(field.metrics.stateByteLength).toBe(0);
    expect(() => field.update(1 / 30)).toThrow(/destroyed/);
    resource.dispose();
    expect(resource.isDisposed).toBe(true);
  });
});
