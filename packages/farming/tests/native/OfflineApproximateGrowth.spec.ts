import { describe, expect, it, vi } from "vitest";
import {
  FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS,
  FarmingService,
  ManualFarmClock,
  createInitialFarmSnapshot,
  integrateSoilEvaporation,
  settleFarmTime,
  settleFarmTimeApproximate
} from "../../src/farming/index";
import { resolveSimulationConfig } from "../../src/farming/config/FarmingSimulationConfig";
import { FARM_DEFINITIONS } from "../../src/farming/content/DefaultFarmingDefinitions";
import { validateConfiguredFarmSnapshot } from "../../src/farming/domain/FarmValidation";
import { MemoryFarmRepository } from "../../src/farming/persistence/MemoryFarmRepository";
import { TEST_FARMING_DEFINITIONS, TEST_GROUND_PROVIDER } from "../fixtures/fixtures";

describe("approximate offline settlement", () => {
  const config = resolveSimulationConfig(FARM_DEFINITIONS.soilProfile);

  it("matches exact 3-second stepping for isolated-plot pure evaporation and crop growth", () => {
    const startMs = 1_700_000_000_000;
    const base = createInitialFarmSnapshot({
      farmId: "offline-parity",
      layoutId: "parity-v1",
      layoutVersion: 1,
      definitions: FARM_DEFINITIONS,
      plots: [{ id: "plot-1", label: "Plot 1", target: { groundId: "soil", cellX: 0, cellZ: 0 } }],
      systemTimeMs: startMs,
      simulationConfig: config,
      groundView: TEST_GROUND_PROVIDER.capture()
    });
    const crop = FARM_DEFINITIONS.catalog.getCrop("tomato");
    const planted = {
      ...base,
      plantingSequence: 1,
      plots: [
        {
          ...base.plots[0],
          soil: { ...base.plots[0].soil, moistureUnits: 38 },
          occupantId: "tomato-1"
        }
      ],
      crops: {
        "tomato-1": {
          instanceId: "tomato-1",
          cropId: crop.id,
          cropDefinitionVersion: crop.version,
          cycleId: crop.cycle.id,
          cycleRevision: crop.cycle.revision,
          plantDefinitionId: crop.appearance.plantId,
          plantDefinitionRevision: crop.appearance.plantRevision,
          recipeRevision: crop.appearance.recipeRevision,
          shape: { leafSpread: 1, stemBend: 1, fruitScale: 1 },
          anchorPlotId: "plot-1",
          plantedOrder: 1,
          plantedAtSimulationMs: 0,
          lastEvaluatedSimulationMs: 0,
          growthUnits: 0,
          growthRemainderPermille: 0,
          healthPermille: 1_000,
          pestPressureUnits: 0
        }
      }
    };

    // 90 seconds spans linear drying (38 -> 36.2) and partial tomato growth.
    const target90s = startMs + 90_000;
    const exact90 = settleFarmTime(planted, target90s, FARM_DEFINITIONS, { simulationConfig: config });
    const approx90 = settleFarmTimeApproximate(planted, target90s, FARM_DEFINITIONS, { simulationConfig: config });
    expect(approx90.snapshot.plots[0].soil.moistureUnits).toBeCloseTo(exact90.snapshot.plots[0].soil.moistureUnits, 8);
    const growthErrorRatio =
      Math.abs(approx90.snapshot.crops["tomato-1"].growthUnits - exact90.snapshot.crops["tomato-1"].growthUnits) /
      crop.cycle.growthTarget;
    expect(growthErrorRatio).toBeLessThan(0.01);

    // 30 minutes crosses slowdown threshold (22%) into exponential drying and matures tomato.
    const target30m = startMs + 30 * 60_000;
    const exact30m = settleFarmTime(planted, target30m, FARM_DEFINITIONS, { simulationConfig: config });
    const approx30m = settleFarmTimeApproximate(planted, target30m, FARM_DEFINITIONS, { simulationConfig: config });
    expect(approx30m.snapshot.plots[0].soil.moistureUnits).toBeCloseTo(
      exact30m.snapshot.plots[0].soil.moistureUnits,
      8
    );
    expect(approx30m.snapshot.crops["tomato-1"].growthUnits).toBe(crop.cycle.growthTarget);
    expect(approx30m.changes.some((change) => change.kind === "crop-matured")).toBe(true);
    expect(() =>
      validateConfiguredFarmSnapshot(
        approx30m.snapshot,
        {
          farmId: "offline-parity",
          layoutId: "parity-v1",
          layoutVersion: 1,
          definitions: FARM_DEFINITIONS,
          plots: [],
          grid: approx30m.snapshot.grid,
          validatePlacement: false
        },
        config
      )
    ).not.toThrow();
  });

  it("integrates soil evaporation analytically across wet, exponential, and clamped bounds", () => {
    const res = integrateSoilEvaporation(40, config.water, 24 * 60);
    expect(res.endMoisture).toBeCloseTo(config.water.minimumMoisture, 6);
    expect(res.averageMoisture).toBeGreaterThan(config.water.minimumMoisture);
    expect(res.averageMoisture).toBeLessThan(40);

    const zeroRate = integrateSoilEvaporation(30, { ...config.water, evaporationPerMinute: 0 }, 120);
    expect(zeroRate).toEqual({ endMoisture: 30, averageMoisture: 30 });
  });

  it("handles 24-hour offline catch-up across 50 plots in O(plots) without overflow or slow looping", () => {
    const startMs = 1_700_000_000_000;
    const plotDefs = Array.from({ length: 50 }, (_, index) => ({
      id: `plot-${index}`,
      label: `Plot ${index}`,
      target: { groundId: "soil", cellX: index % 10, cellZ: Math.floor(index / 10) }
    }));
    const base = createInitialFarmSnapshot({
      farmId: "offline-scale",
      layoutId: "scale-v1",
      layoutVersion: 1,
      definitions: FARM_DEFINITIONS,
      plots: plotDefs,
      systemTimeMs: startMs,
      simulationConfig: config,
      groundView: TEST_GROUND_PROVIDER.capture()
    });
    const crop = FARM_DEFINITIONS.catalog.getCrop("grapevine");
    const crops: Record<string, (typeof base.crops)[string]> = {};
    const plots = base.plots.map((plot, index) => {
      const id = `crop-${index}`;
      crops[id] = {
        instanceId: id,
        cropId: crop.id,
        cropDefinitionVersion: crop.version,
        cycleId: crop.cycle.id,
        cycleRevision: crop.cycle.revision,
        plantDefinitionId: crop.appearance.plantId,
        plantDefinitionRevision: crop.appearance.plantRevision,
        recipeRevision: crop.appearance.recipeRevision,
        shape: { leafSpread: 1, stemBend: 1, fruitScale: 1 },
        anchorPlotId: plot.plotId,
        plantedOrder: index + 1,
        plantedAtSimulationMs: 0,
        lastEvaluatedSimulationMs: 0,
        growthUnits: 0,
        growthRemainderPermille: 0,
        healthPermille: 1_000,
        pestPressureUnits: 0
      };
      return { ...plot, occupantId: id };
    });
    const snapshot = { ...base, plantingSequence: 50, plots, crops };

    const t0 = performance.now();
    const settled = settleFarmTimeApproximate(
      snapshot,
      startMs + FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS * 2,
      FARM_DEFINITIONS,
      {
        simulationConfig: config,
        maximumCatchUpMs: FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS
      }
    );
    const elapsedMs = performance.now() - t0;

    expect(elapsedMs).toBeLessThan(50);
    expect(settled.capped).toBe(true);
    expect(settled.simulatedElapsedMs).toBe(FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS);
    for (const id of Object.keys(crops)) {
      expect(settled.snapshot.crops[id].growthUnits).toBe(crop.cycle.growthTarget);
      expect(settled.snapshot.crops[id].growthRemainderPermille).toBe(0);
      expect(settled.snapshot.crops[id].lastEvaluatedSimulationMs).toBe(FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS);
    }
    expect(() =>
      validateConfiguredFarmSnapshot(
        settled.snapshot,
        {
          farmId: "offline-scale",
          layoutId: "scale-v1",
          layoutVersion: 1,
          definitions: FARM_DEFINITIONS,
          plots: [],
          grid: settled.snapshot.grid,
          validatePlacement: false
        },
        config
      )
    ).not.toThrow();
  });

  it("preserves saved environment during approximate offline catch-up when reopening during snow", async () => {
    const repository = new MemoryFarmRepository();
    const clock = new ManualFarmClock(10_000);
    let snowing = false;
    const makeService = () =>
      new FarmingService({
        repository,
        groundProvider: TEST_GROUND_PROVIDER,
        definitions: TEST_FARMING_DEFINITIONS,
        farmId: "snow-farm",
        layoutId: "snow-v1",
        layoutVersion: 1,
        plots: [{ id: "plot-1", label: "Plot 1", target: { groundId: "soil", cellX: 0, cellZ: 0 } }],
        clock,
        createCropInstanceId: () => "crop-1",
        sampleEnvironment: () => ({
          availability: "live",
          season: snowing ? "winter" : "spring",
          baseTemperatureCelsius: snowing ? 0 : 20,
          snowing,
          airTemperatureTenths: snowing ? 0 : 200,
          lightUnits: snowing ? 20 : 90,
          dayFactor: snowing ? 0 : 1,
          cloudCoverage: 0,
          rainRate: 0,
          rainWaterPerMinute: 0
        }),
        offlineCatchUp: {
          mode: "approximate",
          maximumCatchUpMs: FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS,
          preserveSavedEnvironment: true,
          backgroundApproximateThresholdMs: 120_000
        }
      });

    const first = makeService();
    await first.initialize();
    const planted = await first.execute({
      type: "plant",
      farmId: "snow-farm",
      plotId: "plot-1",
      seedId: "berry-seed",
      commandId: "plant-1",
      expectedRevision: first.getSnapshot().revision
    });
    expect(planted.ok).toBe(true);
    first.dispose();
    await first.whenIdle();

    // Simulate closing the page for 10 minutes and reopening in freezing snow.
    snowing = true;
    clock.advanceBy(10 * 60_000);
    const reopened = makeService();
    const restored = await reopened.initialize();
    expect(restored.crops["crop-1"].growthUnits).toBeGreaterThan(0);
    expect(reopened.getLastCatchUpSummary().simulatedElapsedMs).toBe(10 * 60_000);
    reopened.dispose();
    await reopened.whenIdle();
    repository.dispose();
  });

  it("respects resumedAtSystemTimeMs so paused intervals are not credited", () => {
    const startMs = 1_000;
    const base = createInitialFarmSnapshot({
      farmId: "offline-resume",
      layoutId: "resume-v1",
      layoutVersion: 1,
      definitions: FARM_DEFINITIONS,
      plots: [{ id: "plot-1", label: "Plot 1", target: { groundId: "soil", cellX: 0, cellZ: 0 } }],
      systemTimeMs: startMs,
      simulationConfig: config,
      groundView: TEST_GROUND_PROVIDER.capture()
    });
    const crop = FARM_DEFINITIONS.catalog.getCrop("tomato");
    const snapshot = {
      ...base,
      simulation: { ...base.simulation, remainderMs: 1_000 },
      plantingSequence: 1,
      plots: [
        {
          ...base.plots[0],
          ground: { ...base.plots[0].ground, resumedAtSystemTimeMs: 4_000 },
          occupantId: "tomato-1"
        }
      ],
      crops: {
        "tomato-1": {
          instanceId: "tomato-1",
          cropId: crop.id,
          cropDefinitionVersion: crop.version,
          cycleId: crop.cycle.id,
          cycleRevision: crop.cycle.revision,
          plantDefinitionId: crop.appearance.plantId,
          plantDefinitionRevision: crop.appearance.plantRevision,
          recipeRevision: crop.appearance.recipeRevision,
          shape: { leafSpread: 1, stemBend: 1, fruitScale: 1 },
          anchorPlotId: "plot-1",
          plantedOrder: 1,
          plantedAtSimulationMs: 0,
          lastEvaluatedSimulationMs: 0,
          growthUnits: 0,
          growthRemainderPermille: 0,
          healthPermille: 1_000,
          pestPressureUnits: 0
        }
      }
    };
    // Window starts at 0; step 0 is [0,3000) (skipped), step 1 is [3000,6000) (skipped since 3000 < 4000),
    // step 2 is [6000,9000) (eligible).
    const exact = settleFarmTime(snapshot, 9_000, FARM_DEFINITIONS, { simulationConfig: config });
    const approx = settleFarmTimeApproximate(snapshot, 9_000, FARM_DEFINITIONS, { simulationConfig: config });
    expect(approx.snapshot.crops["tomato-1"].growthUnits).toBeGreaterThan(0);
    expect(approx.snapshot.crops["tomato-1"].growthUnits).toBeCloseTo(exact.snapshot.crops["tomato-1"].growthUnits, -2);
  });

  it("uses O(1) approximate catch-up for long background tab sleep above backgroundApproximateThresholdMs", async () => {
    const repository = new MemoryFarmRepository();
    const clock = new ManualFarmClock(1_700_000_000_000);
    vi.useFakeTimers({ toFake: ["clearInterval", "setInterval"] });
    vi.stubGlobal("window", { setInterval, clearInterval });
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("document", doc);
    try {
      const service = new FarmingService({
        repository,
        groundProvider: TEST_GROUND_PROVIDER,
        definitions: TEST_FARMING_DEFINITIONS,
        farmId: "bg-farm",
        layoutId: "bg-v1",
        layoutVersion: 1,
        plots: [{ id: "plot-1", label: "Plot 1", target: { groundId: "soil", cellX: 0, cellZ: 0 } }],
        clock,
        autoAdvance: true,
        createCropInstanceId: () => "crop-1",
        offlineCatchUp: {
          mode: "approximate",
          maximumCatchUpMs: FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS,
          preserveSavedEnvironment: true,
          backgroundApproximateThresholdMs: 120_000
        }
      });
      await service.initialize();
      const planted = await service.execute({
        type: "plant",
        farmId: "bg-farm",
        plotId: "plot-1",
        seedId: "berry-seed",
        commandId: "plant-bg",
        expectedRevision: service.getSnapshot().revision
      });
      expect(planted.ok).toBe(true);

      // Hide tab, sleep 6 hours (beyond 1h exact cap and above 2m threshold), then return to foreground.
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      await service.whenIdle();

      clock.advanceBy(6 * 60 * 60_000);
      const t0 = performance.now();
      doc.visibilityState = "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
      await service.whenIdle();
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(50);
      const target = TEST_FARMING_DEFINITIONS.catalog.getCrop("berry").cycle.growthTarget;
      expect(service.getSnapshot().crops["crop-1"].growthUnits).toBe(target);
      expect(service.getSnapshot().simulation.simulatedTimeMs).toBe(6 * 60 * 60_000);
      service.dispose();
      await service.whenIdle();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      repository.dispose();
    }
  });

  it("uses O(1) approximate catch-up for commands and ground refreshes arriving right after a long sleep", async () => {
    const repository = new MemoryFarmRepository();
    const clock = new ManualFarmClock(1_700_000_000_000);
    let snowing = false;
    const listeners = new Set<(change: { readonly groundId: string; readonly revision: number }) => void>();
    let groundRevision = 1;
    const groundProvider = {
      capture: () => ({ ...TEST_GROUND_PROVIDER.capture(), revision: groundRevision }),
      subscribe: (listener: (change: { readonly groundId: string; readonly revision: number }) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    const service = new FarmingService({
      repository,
      groundProvider,
      definitions: TEST_FARMING_DEFINITIONS,
      farmId: "cmd-sleep-farm",
      layoutId: "cmd-sleep-v1",
      layoutVersion: 1,
      plots: [{ id: "plot-1", label: "Plot 1", target: { groundId: "soil", cellX: 0, cellZ: 0 } }],
      clock,
      createCropInstanceId: () => "crop-1",
      sampleEnvironment: () => ({
        availability: "live",
        season: snowing ? "winter" : "spring",
        baseTemperatureCelsius: snowing ? 0 : 20,
        snowing,
        airTemperatureTenths: snowing ? 0 : 200,
        lightUnits: snowing ? 20 : 90,
        dayFactor: snowing ? 0 : 1,
        cloudCoverage: 0,
        rainRate: 0,
        rainWaterPerMinute: 0
      }),
      offlineCatchUp: {
        mode: "approximate",
        maximumCatchUpMs: FARM_APPROXIMATE_OFFLINE_MAX_CATCH_UP_MS,
        preserveSavedEnvironment: true,
        backgroundApproximateThresholdMs: 120_000
      }
    });
    try {
      await service.initialize();
      const planted = await service.execute({
        type: "plant",
        farmId: "cmd-sleep-farm",
        plotId: "plot-1",
        seedId: "berry-seed",
        commandId: "plant-sleep",
        expectedRevision: service.getSnapshot().revision
      });
      expect(planted.ok).toBe(true);

      // Sleep 6 hours (beyond 1h exact cap) while snow starts on wake, then issue a command BEFORE any tickNow.
      snowing = true;
      clock.advanceBy(6 * 60 * 60_000);
      const t0 = performance.now();
      const irrigated = await service.execute({
        type: "irrigate",
        farmId: "cmd-sleep-farm",
        plotId: "plot-1",
        commandId: "irrigate-after-sleep",
        expectedRevision: service.getSnapshot().revision
      });
      expect(performance.now() - t0).toBeLessThan(50);
      expect(irrigated.ok).toBe(true);
      const target = TEST_FARMING_DEFINITIONS.catalog.getCrop("berry").cycle.growthTarget;
      expect(service.getSnapshot().crops["crop-1"].growthUnits).toBe(target);
      expect(service.getSnapshot().simulation.simulatedTimeMs).toBe(6 * 60 * 60_000);

      // Sleep another 5 hours and trigger a ground publication BEFORE any tickNow.
      clock.advanceBy(5 * 60 * 60_000);
      groundRevision++;
      const t1 = performance.now();
      for (const listener of listeners) listener({ groundId: "soil", revision: groundRevision });
      await service.whenIdle();
      expect(performance.now() - t1).toBeLessThan(50);
      expect(service.getSnapshot().simulation.simulatedTimeMs).toBe(11 * 60 * 60_000);
    } finally {
      service.dispose();
      await service.whenIdle();
      repository.dispose();
    }
  });
});
