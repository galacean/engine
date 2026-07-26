import { describe, expect, it } from "vitest";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import { TemporalFoamField } from "../../runtime/interaction/TemporalFoamField";
import {
  WaterFoamBlendMode,
  WaterFoamSourceKind
} from "../../runtime/interaction/WaterFoamTypes";
import { OceanFoamSourceSystem } from "../../runtime/ocean/OceanFoamSourceSystem";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import { OceanNearshoreStateField } from "../../runtime/ocean/OceanNearshoreStateField";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";
import { createOceanBeachNearshoreDescriptor } from "../../demo/ocean/OceanBeachShowcasePreset";

function createRuntime(): {
  readonly resource: OceanNearshoreFieldResource;
  readonly state: OceanNearshoreStateField;
  readonly foam: TemporalFoamField;
  readonly sources: OceanFoamSourceSystem;
} {
  const compiled = OceanNearshoreCompiler.compile(
    createOceanNearshoreFixture()
  );
  if (!compiled.valid || !compiled.data) {
    throw new Error("Nearshore fixture did not compile.");
  }
  const resource = OceanNearshoreFieldResource.create(compiled.data);
  const state = new OceanNearshoreStateField(resource, {
    swashPeriodSeconds: 4,
    minimumRunupDistance: 0,
    maximumRunupDistance: 2
  });
  const foam = new TemporalFoamField({
    centerX: 0,
    centerZ: 0,
    length: 5,
    width: 5,
    resolutionX: 5,
    resolutionZ: 5,
    decayRatePerSecond: 1
  });
  return {
    resource,
    state,
    foam,
    sources: new OceanFoamSourceSystem(resource, state, foam, {
      bodyId: "test-ocean",
      pointSourceCapacity: 2
    })
  };
}

describe("OceanFoamSourceSystem", () => {
  it("merges bounded breaker and waterline sources without Surface Query", () => {
    const { resource, state, foam, sources } = createRuntime();
    state.seek(1);

    expect(sources.update()).toBe(true);
    expect(foam.sourceBuffer.some((value) => value > 0)).toBe(true);
    expect(sources.metrics.shoreSourcePixelCount).toBeGreaterThan(0);
    expect(sources.metrics.currentSurfaceQueryCount).toBe(0);
    expect(sources.update()).toBe(false);
    expect(sources.metrics.idleSkipCount).toBe(1);

    sources.destroy();
    state.destroy();
    resource.dispose();
  });

  it("reinjects persistent sources only when fixed-time prewarm forces them", () => {
    const { resource, state, foam, sources } = createRuntime();
    state.seek(1);

    expect(sources.update()).toBe(true);
    expect(foam.step(1 / 30)).toBe(true);
    expect(foam.sourceBuffer.every((value) => value === 0)).toBe(
      true
    );
    expect(sources.update()).toBe(false);
    expect(sources.update(true)).toBe(true);
    expect(foam.sourceBuffer.some((value) => value > 0)).toBe(
      true
    );

    sources.destroy();
    state.destroy();
    resource.dispose();
  });

  it("applies finite per-body Breaker and shore tuning without changing sparse sources", () => {
    const { resource, state, foam, sources } =
      createRuntime();
    sources.destroy();
    state.seek(1);
    const tuned = new OceanFoamSourceSystem(
      resource,
      state,
      foam,
      {
        bodyId: "tuned-ocean",
        breakerIntensity: 0.3,
        breakerMinimumActivation: 0.4,
        breakerFullActivation: 0.8,
        shoreIntensity: 0.2,
        shoreBandWidth: 0.8,
        shoreSeawardOffset: 1
      }
    );

    expect(tuned.update()).toBe(true);
    expect(tuned.metrics.sourcePeak).toBeGreaterThan(0);
    expect(tuned.metrics.sourcePeak).toBeLessThanOrEqual(
      0.3
    );
    expect(() =>
      new OceanFoamSourceSystem(
        resource,
        state,
        foam,
        {
          bodyId: "invalid-ocean",
          breakerMinimumActivation: 0.8,
          breakerFullActivation: 0.4
        }
      )
    ).toThrow(/options are invalid/);

    tuned.destroy();
    state.destroy();
    resource.dispose();
  });

  it("keeps canonical breaker and shore sources local to the nearshore band", () => {
    const compiled = OceanNearshoreCompiler.compile(
      createOceanBeachNearshoreDescriptor()
    );
    if (!compiled.valid || !compiled.data) {
      throw new Error("Canonical nearshore field did not compile.");
    }
    const resource = OceanNearshoreFieldResource.create(compiled.data);
    const state = new OceanNearshoreStateField(resource);
    state.seek(12.5);
    const foam = new TemporalFoamField({
      centerX: 0,
      centerZ: -40,
      length: 320,
      width: 160,
      resolutionX: 128,
      resolutionZ: 64,
      decayRatePerSecond: 0.8
    });
    const sources = new OceanFoamSourceSystem(resource, state, foam, {
      bodyId: "canonical-ocean"
    });

    expect(sources.update()).toBe(true);
    expect(sources.metrics.breakerSourcePixelCount).toBeGreaterThan(0);
    expect(sources.metrics.shoreSourcePixelCount).toBeGreaterThan(0);
    expect(sources.metrics.sourcePeak).toBeGreaterThan(0.5);
    expect(foam.sourceBuffer[64]).toBe(0);
    expect(foam.sourceBuffer[63 * 128 + 64]).toBe(0);

    sources.destroy();
    state.destroy();
    resource.dispose();
  });

  it("applies deterministic priority overflow to typed sparse sources", () => {
    const { resource, state, foam, sources } = createRuntime();
    expect(
      sources.enqueueBounded(
        WaterFoamSourceKind.Obstacle,
        0,
        -1,
        0.8,
        0.5,
        2,
        1,
        WaterFoamBlendMode.Maximum
      )
    ).toBe(true);
    expect(
      sources.enqueueBounded(
        WaterFoamSourceKind.Wake,
        1,
        -1,
        0.8,
        0.5,
        1,
        2,
        WaterFoamBlendMode.Add
      )
    ).toBe(true);
    expect(
      sources.enqueueBounded(
        WaterFoamSourceKind.Impact,
        0,
        0,
        1,
        1,
        2,
        0,
        WaterFoamBlendMode.Add
      )
    ).toBe(false);
    expect(
      sources.enqueueBounded(
        WaterFoamSourceKind.Impact,
        0,
        0,
        1,
        1,
        2,
        4,
        WaterFoamBlendMode.Add
      )
    ).toBe(true);

    expect(sources.update()).toBe(true);
    expect(sources.metrics).toMatchObject({
      overflowCount: 2,
      droppedPointSourceCount: 2,
      replacedCount: 1,
      queuedPointSourceCount: 0,
      consumedPointSourceCount: 2,
      impactInjectionCount: 1,
      wakeInjectionCount: 1
    });
    expect(foam.sourceBuffer.some((value) => value > 0)).toBe(true);

    sources.reset();
    expect(sources.metrics).toMatchObject({
      obstacleInjectionCount: 0,
      impactInjectionCount: 0,
      wakeInjectionCount: 0
    });

    sources.setEnabled(false);
    expect(foam.isIdle).toBe(true);
    expect(sources.metrics.sourcePeak).toBe(0);
    sources.destroy();
    expect(sources.metrics.resourceBytes).toBe(0);
    expect(() => sources.update()).toThrow(/destroyed/);
    state.destroy();
    resource.dispose();
  });
});
