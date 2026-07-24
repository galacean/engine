import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import { TemporalFoamField } from "../../runtime/interaction/TemporalFoamField";
import {
  createWaterInteractionEvent,
  WaterInteractionEventKind,
  WaterInteractionEventQueue
} from "../../runtime/interaction/WaterInteractionEventQueue";
import { OceanFoamSourceSystem } from "../../runtime/ocean/OceanFoamSourceSystem";
import { OceanNearshoreFieldProvider } from "../../runtime/ocean/OceanNearshoreFieldProvider";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import { OceanNearshoreStateField } from "../../runtime/ocean/OceanNearshoreStateField";
import { OceanObstacleContactSystem } from "../../runtime/ocean/OceanObstacleContactSystem";
import { OceanObstacleFieldResource } from "../../runtime/ocean/OceanObstacleFieldResource";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";
import { directionalWaterWaveFixture } from "../fixtures/waterWaveFixtures";

function createContactRuntime(): {
  readonly resource: OceanNearshoreFieldResource;
  readonly provider: OceanNearshoreFieldProvider;
  readonly state: OceanNearshoreStateField;
  readonly obstacles: OceanObstacleFieldResource;
  readonly foam: TemporalFoamField;
  readonly sources: OceanFoamSourceSystem;
  readonly queue: WaterInteractionEventQueue;
} {
  const compiled = OceanNearshoreCompiler.compile(
    createOceanNearshoreFixture()
  );
  if (!compiled.valid || !compiled.data) {
    throw new Error("Nearshore fixture did not compile.");
  }
  const resource = OceanNearshoreFieldResource.create(compiled.data);
  const provider = new OceanNearshoreFieldProvider(resource);
  const state = new OceanNearshoreStateField(resource);
  const obstacles = new OceanObstacleFieldResource(compiled.data.obstacles);
  const foam = new TemporalFoamField({
    centerX: 0,
    centerZ: 0,
    length: 5,
    width: 5,
    resolutionX: 10,
    resolutionZ: 10,
    decayRatePerSecond: 1
  });
  const sources = new OceanFoamSourceSystem(resource, state, foam, {
    bodyId: "contact-ocean"
  });
  return {
    resource,
    provider,
    state,
    obstacles,
    foam,
    sources,
    queue: new WaterInteractionEventQueue(4)
  };
}

describe("OceanObstacleContactSystem", () => {
  it("emits finite Impact and foam with cooldown aggregation at a fixed budget", () => {
    const runtime = createContactRuntime();
    const waveSet = compileWaterWaveAsset(
      directionalWaterWaveFixture,
      WaterQualityTier.Medium
    );
    let elapsedTime = 0;
    const contact = new OceanObstacleContactSystem(
      runtime.obstacles,
      runtime.provider,
      runtime.state,
      runtime.sources,
      runtime.queue,
      waveSet,
      0,
      1,
      {
        fixedStepRateHz: 30,
        samplesPerObstacle: 4,
        foamEnergyThreshold: 0,
        impactEnergyThreshold: 0,
        impactCooldownSeconds: 0.5,
        getElapsedTime: () => elapsedTime
      }
    );

    expect(contact.update(1 / 30)).toBe(true);
    expect(contact.metrics.evaluatedSampleCount).toBe(4);
    expect(contact.metrics.fixedSamplingBudget).toBe(4);
    expect(contact.metrics.currentSurfaceQueryCount).toBe(0);
    expect(contact.metrics.obstacleFoamSourceCount).toBeGreaterThan(1);
    expect(runtime.sources.metrics.queuedPointSourceCount).toBeLessThanOrEqual(
      runtime.sources.metrics.pointSourceCapacity
    );
    expect(runtime.queue.count).toBe(1);
    const event = createWaterInteractionEvent();
    expect(runtime.queue.read(0, event)).toBe(true);
    expect(event.kind).toBe(WaterInteractionEventKind.Impact);
    expect(
      [
        event.worldX,
        event.worldY,
        event.worldZ,
        event.velocityX,
        event.velocityY,
        event.velocityZ,
        event.strength
      ].every(Number.isFinite)
    ).toBe(true);
    expect(
      Math.hypot(
        contact.metrics.lastImpactNormalX,
        contact.metrics.lastImpactNormalZ
      )
    ).toBeCloseTo(1, 5);
    runtime.queue.clearEvents();

    elapsedTime = 0.1;
    expect(contact.update(1 / 30)).toBe(true);
    expect(runtime.queue.count).toBe(0);
    expect(contact.metrics.impactCooldownSuppressedCount).toBe(1);
    expect(contact.metrics.aggregatedImpactCount).toBe(1);

    elapsedTime = 0.7;
    expect(contact.update(1 / 30)).toBe(true);
    expect(runtime.queue.count).toBe(1);
    expect(contact.metrics.impactAcceptedCount).toBe(2);
    expect(runtime.sources.update()).toBe(true);
    expect(runtime.foam.sourceBuffer.some((value) => value > 0)).toBe(
      true
    );
    expect(runtime.foam.metrics.sourcePixelCount).toBeLessThan(
      runtime.foam.resolutionX * runtime.foam.resolutionZ
    );

    expect(contact.update(0, 2)).toBe(true);
    expect(contact.update(0, 2)).toBe(false);
    contact.reset();
    expect(runtime.queue.count).toBe(0);
    expect(runtime.foam.isIdle).toBe(true);
    contact.destroy();
    expect(contact.metrics.resourceBytes).toBe(0);
    expect(() => contact.update(1 / 30)).toThrow(/destroyed/);

    runtime.sources.destroy();
    runtime.obstacles.dispose();
    runtime.state.destroy();
    runtime.provider.destroy();
    runtime.resource.dispose();
  });

  it("stops all event and source signals when disabled", () => {
    const runtime = createContactRuntime();
    const contact = new OceanObstacleContactSystem(
      runtime.obstacles,
      runtime.provider,
      runtime.state,
      runtime.sources,
      runtime.queue,
      compileWaterWaveAsset(
        directionalWaterWaveFixture,
        WaterQualityTier.Low
      ),
      0,
      1,
      {
        foamEnergyThreshold: 0,
        impactEnergyThreshold: 0,
        getElapsedTime: () => 0
      }
    );
    contact.setEnabled(false);

    expect(contact.update(1)).toBe(false);
    expect(runtime.queue.count).toBe(0);
    expect(runtime.foam.isIdle).toBe(true);
    expect(contact.metrics.activeContactCount).toBe(0);

    contact.destroy();
    runtime.sources.destroy();
    runtime.obstacles.dispose();
    runtime.state.destroy();
    runtime.provider.destroy();
    runtime.resource.dispose();
  });
});
