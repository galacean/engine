import { describe, expect, it } from "vitest";
import type { WaterGpuTimer } from "../../runtime/optics/WaterGpuTimer";
import {
  createWaterOpticsPerformanceGate,
  WaterOpticsPerformanceSampler,
  waterOpticsNearestRankPercentile,
  type WaterOpticsPerformancePhaseMetrics,
  type WaterOpticsPerformanceSamplingProtocol,
  type WaterOpticsPerformanceSamplerDependencies,
  type WaterOpticsViewportDpr
} from "../../demo/examples/water-optics-lab/WaterOpticsPerformanceSampler";

class FakeFrameEnvironment {
  nowMs = 0;
  visible = true;
  viewport: WaterOpticsViewportDpr = { width: 1280, height: 720, devicePixelRatio: 1 };
  readonly opticsTransitions: boolean[] = [];
  opticsEnabled = false;
  stalePlanarResourceCount = 0;
  private _phaseIndex = -1;
  private _phaseFrameCount = 0;
  private _nextFrameId = 0;

  constructor(
    private readonly _phaseIntervals: readonly number[],
    private readonly _beforeFrame?: (environment: FakeFrameEnvironment) => void
  ) {}

  get phaseIndex(): number {
    return this._phaseIndex;
  }

  get phaseFrameCount(): number {
    return this._phaseFrameCount;
  }

  readonly dependencies: WaterOpticsPerformanceSamplerDependencies = {
    requestAnimationFrame: (callback): number => {
      const frameId = ++this._nextFrameId;
      queueMicrotask(() => {
        this._phaseFrameCount++;
        this._beforeFrame?.(this);
        this.nowMs += this._phaseIntervals[this._phaseIndex] ?? this._phaseIntervals[0] ?? 16;
        callback();
      });
      return frameId;
    },
    now: (): number => this.nowMs,
    isVisible: (): boolean => this.visible,
    getViewportDpr: (): WaterOpticsViewportDpr => ({ ...this.viewport }),
    getRuntimeEnvironment: () => ({
      capturedAtIso: "2026-07-22T00:00:00.000Z",
      browser: "Water Optics unit-test browser",
      graphicsApi: "webgl2",
      gpuRendererStatus: "available",
      gpuRenderer: "Water Optics fake GPU",
      headed: false,
      headedDetection: "query-parameter"
    }),
    getGateTarget: () => ({
      requestedTier: "medium",
      resolvedTier: "medium",
      reflectionSource: "sky",
      referenceDevice: "desktop"
    }),
    getMemorySnapshot: () => ({
      engineMemory: { textureBytes: 1000, bufferBytes: 2000, totalBytes: 3000 },
      waterMemory: {
        cameraFeatureBytes: 100,
        planarBytes: 0,
        probeBytes: 60,
        compositeBytes: 0,
        historyBytes: 0
      }
    }),
    getOpticsStateSnapshot: () => ({
      refractionEnabled: this.opticsEnabled,
      cameraDepthCopyPassCount: this.opticsEnabled ? 1 : 0,
      cameraOpaqueCopyPassCount: this.opticsEnabled ? 1 : 0,
      planarCameraCount: this.stalePlanarResourceCount,
      livePlanarRenderTargetCount: this.stalePlanarResourceCount
    }),
    setOpticsEnabled: async (enabled): Promise<void> => {
      this.opticsEnabled = enabled;
      this.opticsTransitions.push(enabled);
      this._phaseIndex = (this._phaseIndex + 1) % 3;
      this._phaseFrameCount = 0;
    }
  };
}

const FAST_SAMPLE_OPTIONS = {
  mode: "smoke",
  warmupDurationMs: 20,
  minimumFrameCount: 4,
  minimumSampleDurationMs: 40,
  longFrameThresholdMs: 15,
  phaseTimeoutMs: 1000
} as const;

describe("WaterOpticsPerformanceSampler", () => {
  it("uses nearest-rank percentiles and rejects invalid samples", () => {
    expect(waterOpticsNearestRankPercentile([4, 1, 3, 2], 0.5)).toBe(2);
    expect(waterOpticsNearestRankPercentile([4, 1, 3, 2], 0.95)).toBe(4);
    expect(() => waterOpticsNearestRankPercentile([], 0.5)).toThrow("at least one sample");
    expect(() => waterOpticsNearestRankPercentile([1], 0)).toThrow("within (0, 1]");
    expect(() => waterOpticsNearestRankPercentile([Number.NaN], 0.5)).toThrow("finite and non-negative");
  });

  it("collects OFF-before, ON, and OFF-after and can perform a complete fresh resample", async () => {
    const environment = new FakeFrameEnvironment([10, 20, 10]);
    const sampler = new WaterOpticsPerformanceSampler(environment.dependencies, FAST_SAMPLE_OPTIONS);

    const first = await sampler.resample();
    expect(first.valid).toBe(true);
    if (!first.valid) throw new Error(first.message);

    expect(environment.opticsTransitions).toEqual([false, true, false]);
    expect(first.instrumentation).toEqual({
      statsEnabled: false,
      statsRole: "display-only",
      frameSampler: "requestAnimationFrame",
      gpuTimerStatus: "unavailable",
      engineMemorySource: "engine.renderingStatistics",
      waterMemorySource: "water-runtime-metrics"
    });
    expect(first.environment).toMatchObject({
      width: 1280,
      height: 720,
      devicePixelRatio: 1,
      browser: "Water Optics unit-test browser",
      graphicsApi: "webgl2",
      gpuRenderer: "Water Optics fake GPU",
      headed: false
    });
    expect(first.phases["off-before"]).toMatchObject({
      opticsEnabled: false,
      frameCount: 4,
      fps: 100,
      frameP50Ms: 10,
      frameP95Ms: 10,
      frameMaxMs: 10,
      longFrameCount: 0,
      longFrameRatio: 0
    });
    expect(first.phases.on).toMatchObject({
      opticsEnabled: true,
      frameCount: 4,
      fps: 50,
      frameP50Ms: 20,
      frameP95Ms: 20,
      frameMaxMs: 20,
      longFrameCount: 4,
      longFrameRatio: 1
    });
    expect(first.comparison).toEqual({
      baselineFps: 100,
      baselineFrameP95Ms: 10,
      activeToBaselineFpsRatio: 0.5,
      activeToBaselineFrameP95Ratio: 2,
      activeFpsDelta: -50,
      activeFrameP95DeltaMs: 10
    });
    expect(first.engineMemory).toEqual({ textureBytes: 1000, bufferBytes: 2000, totalBytes: 3000 });
    expect(first.waterMemory).toEqual({
      cameraFeatureBytes: 100,
      planarBytes: 0,
      probeBytes: 60,
      compositeBytes: 0,
      historyBytes: 0,
      totalBytes: 160
    });
    expect(first.memorySampledAtPhase).toBe("on");
    expect(first.gpu).toEqual({ status: "unavailable", reason: "gpu-timer-not-integrated" });
    expect(first.gate).toMatchObject({
      profile: "medium-refraction",
      protocolStatus: "smoke-only",
      frameStatus: "fail",
      gpuStatus: "unavailable",
      overallStatus: "smoke-only",
      checks: { opticsGpuP95Ms: { status: "unavailable", measured: null, threshold: 2.5 } }
    });

    const second = await sampler.resample();
    expect(second.valid).toBe(true);
    expect(environment.opticsTransitions).toEqual([false, true, false, false, true, false]);
  });

  it("returns a typed invalid result and restores optics when visibility changes during ON", async () => {
    const environment = new FakeFrameEnvironment([10, 20, 10], (current) => {
      if (current.phaseIndex === 1 && current.phaseFrameCount === 3) current.visible = false;
    });
    const sampler = new WaterOpticsPerformanceSampler(environment.dependencies, FAST_SAMPLE_OPTIONS);

    const result = await sampler.resample();
    expect(result).toMatchObject({
      valid: false,
      reason: "hidden",
      failedPhase: "on",
      instrumentation: { statsEnabled: false, statsRole: "display-only", gpuTimerStatus: "unavailable" }
    });
    if (result.valid) throw new Error("Expected an invalid sample.");
    expect(result.completedPhases["off-before"]?.frameCount).toBe(4);
    expect(result.completedPhases.on).toBeUndefined();
    expect(environment.opticsTransitions).toEqual([false, true, false]);
  });

  it("invalidates the whole run when viewport or DPR changes", async () => {
    const environment = new FakeFrameEnvironment([10, 20, 10], (current) => {
      if (current.phaseIndex === 0 && current.phaseFrameCount === 3) {
        current.viewport = { ...current.viewport, devicePixelRatio: 2 };
      }
    });
    const sampler = new WaterOpticsPerformanceSampler(environment.dependencies, FAST_SAMPLE_OPTIONS);

    const result = await sampler.resample();
    expect(result).toMatchObject({ valid: false, reason: "viewport-changed", failedPhase: "off-before" });
  });

  it("fails closed when an OFF phase retains Camera or Planar resources", async () => {
    const environment = new FakeFrameEnvironment([10, 20, 10]);
    environment.stalePlanarResourceCount = 1;
    const sampler = new WaterOpticsPerformanceSampler(environment.dependencies, FAST_SAMPLE_OPTIONS);

    const result = await sampler.resample();
    expect(result).toMatchObject({ valid: false, reason: "phase-transition-failed", failedPhase: "off-before" });
    if (result.valid) throw new Error("Expected stale resources to invalidate the run.");
    expect(result.message).toContain('"planarCameraCount":1');
  });

  it("rejects configurations whose timeout cannot contain warmup and sampling", () => {
    const environment = new FakeFrameEnvironment([10, 20, 10]);
    expect(
      () =>
        new WaterOpticsPerformanceSampler(environment.dependencies, {
          warmupDurationMs: 20,
          minimumFrameCount: 4,
          minimumSampleDurationMs: 40,
          phaseTimeoutMs: 60,
          mode: "smoke"
        })
    ).toThrow("phaseTimeoutMs must exceed");
  });

  it("allows reduced E2E samples only when they are explicitly smoke-only", () => {
    const environment = new FakeFrameEnvironment([10, 20, 10]);
    expect(
      () =>
        new WaterOpticsPerformanceSampler(environment.dependencies, {
          warmupDurationMs: 20,
          minimumFrameCount: 4,
          minimumSampleDurationMs: 40,
          phaseTimeoutMs: 1000
        })
    ).toThrow("Formal capture requires at least 2000ms warmup, 300 frames, and 5000ms sampling per phase");
    expect(() => new WaterOpticsPerformanceSampler(environment.dependencies, FAST_SAMPLE_OPTIONS)).not.toThrow();
  });

  it("calculates a passing frame Gate but keeps the formal result incomplete when GPU timing is unavailable", () => {
    const createPhase = (
      phase: WaterOpticsPerformancePhaseMetrics["phase"],
      opticsEnabled: boolean,
      frameP95Ms: number,
      fps: number
    ): WaterOpticsPerformancePhaseMetrics => ({
      phase,
      opticsEnabled,
      warmupDurationMs: 2000,
      sampleDurationMs: 5000,
      frameCount: 300,
      fps,
      frameP50Ms: 15,
      frameP95Ms,
      frameMaxMs: 16.5,
      longFrameThresholdMs: 1000 / 60,
      longFrameCount: 0,
      longFrameRatio: 0,
      opticsState: {
        refractionEnabled: opticsEnabled,
        cameraDepthCopyPassCount: opticsEnabled ? 1 : 0,
        cameraOpaqueCopyPassCount: opticsEnabled ? 1 : 0,
        planarCameraCount: 0,
        livePlanarRenderTargetCount: 0
      }
    });
    const phases = Object.freeze({
      "off-before": createPhase("off-before", false, 16, 60),
      on: createPhase("on", true, 16.5, 57),
      "off-after": createPhase("off-after", false, 16.1, 59)
    });
    const sampling: WaterOpticsPerformanceSamplingProtocol = {
      mode: "formal",
      phaseSequence: ["off-before", "on", "off-after"],
      warmupDurationMs: 2000,
      minimumFrameCount: 300,
      minimumSampleDurationMs: 5000,
      longFrameThresholdMs: 1000 / 60,
      phaseTimeoutMs: 30_000,
      gpuTimerScope: "frame-envelope"
    };
    const comparison = {
      baselineFps: 59,
      baselineFrameP95Ms: 16.1,
      activeToBaselineFpsRatio: 57 / 59,
      activeToBaselineFrameP95Ratio: 16.5 / 16.1,
      activeFpsDelta: -2,
      activeFrameP95DeltaMs: 0.4
    };

    const gate = createWaterOpticsPerformanceGate(
      {
        requestedTier: "medium",
        resolvedTier: "medium",
        reflectionSource: "sky",
        referenceDevice: "desktop"
      },
      sampling,
      phases,
      comparison
    );

    expect(gate).toMatchObject({
      profile: "medium-refraction",
      protocolStatus: "pass",
      frameStatus: "pass",
      gpuStatus: "unavailable",
      overallStatus: "incomplete",
      checks: {
        activeToBaselineFpsRatio: { status: "pass", threshold: 0.9 },
        activeToBaselineFrameP95Ratio: { status: "pass", threshold: 1.2 },
        activeFrameP95Ms: { status: "pass", threshold: 16.7 },
        opticsGpuP95Ms: { status: "unavailable", measured: null }
      }
    });
    expect(gate.reasons).toContain("gpu-timer-unavailable-formal-gate-incomplete");
  });

  it.each([
    ["medium", "sky", "medium-refraction", 0.9, 1.2, 2.5],
    ["medium", "planar", "medium-refraction-planar", 0.8, 1.4, 2.5],
    ["high", "sky", "high-refraction", 0.85, 1.3, 4],
    ["high", "planar", "high-refraction-planar", 0.7, 1.65, 4]
  ] as const)(
    "keeps the %s %s profile, thresholds, and unavailable GPU result explicit",
    (tier, reflectionSource, profile, minimumFpsRatio, maximumP95Ratio, maximumGpuP95Ms) => {
      const createPhase = (
        phase: WaterOpticsPerformancePhaseMetrics["phase"],
        opticsEnabled: boolean
      ): WaterOpticsPerformancePhaseMetrics => ({
        phase,
        opticsEnabled,
        warmupDurationMs: 2000,
        sampleDurationMs: 5000,
        frameCount: 300,
        fps: 60,
        frameP50Ms: 8,
        frameP95Ms: 9,
        frameMaxMs: 10,
        longFrameThresholdMs: 1000 / 60,
        longFrameCount: 0,
        longFrameRatio: 0,
        opticsState: {
          refractionEnabled: opticsEnabled,
          cameraDepthCopyPassCount: opticsEnabled ? 1 : 0,
          cameraOpaqueCopyPassCount: opticsEnabled ? 1 : 0,
          planarCameraCount: opticsEnabled && reflectionSource === "planar" ? 1 : 0,
          livePlanarRenderTargetCount: opticsEnabled && reflectionSource === "planar" ? 1 : 0
        }
      });
      const phases = Object.freeze({
        "off-before": createPhase("off-before", false),
        on: createPhase("on", true),
        "off-after": createPhase("off-after", false)
      });
      const sampling: WaterOpticsPerformanceSamplingProtocol = {
        mode: "formal",
        phaseSequence: ["off-before", "on", "off-after"],
        warmupDurationMs: 2000,
        minimumFrameCount: 300,
        minimumSampleDurationMs: 5000,
        longFrameThresholdMs: 1000 / 60,
        phaseTimeoutMs: 30_000,
        gpuTimerScope: "frame-envelope"
      };
      const comparison = {
        baselineFps: 60,
        baselineFrameP95Ms: 9,
        activeToBaselineFpsRatio: 1,
        activeToBaselineFrameP95Ratio: 1,
        activeFpsDelta: 0,
        activeFrameP95DeltaMs: 0
      };

      const gate = createWaterOpticsPerformanceGate(
        {
          requestedTier: tier,
          resolvedTier: tier,
          reflectionSource,
          referenceDevice: "desktop"
        },
        sampling,
        phases,
        comparison
      );

      expect(gate).toMatchObject({
        profile,
        thresholds: {
          minimumActiveToBaselineFpsRatio: minimumFpsRatio,
          maximumActiveToBaselineFrameP95Ratio: maximumP95Ratio,
          maximumOpticsGpuP95Ms: maximumGpuP95Ms
        },
        gpuStatus: "unavailable",
        overallStatus: "incomplete",
        checks: { opticsGpuP95Ms: { status: "unavailable", measured: null } }
      });
      expect(gate.reasons).toContain("gpu-timer-unavailable-formal-gate-incomplete");
    }
  );

  it("passes or fails the formal Planar GPU Gate from a valid frame-envelope estimate", () => {
    const createPhase = (
      phase: WaterOpticsPerformancePhaseMetrics["phase"],
      opticsEnabled: boolean
    ): WaterOpticsPerformancePhaseMetrics => ({
      phase,
      opticsEnabled,
      warmupDurationMs: 2000,
      sampleDurationMs: 5000,
      frameCount: 300,
      fps: 60,
      frameP50Ms: 15,
      frameP95Ms: 16,
      frameMaxMs: 16.5,
      longFrameThresholdMs: 1000 / 60,
      longFrameCount: 0,
      longFrameRatio: 0,
      opticsState: {
        refractionEnabled: opticsEnabled,
        cameraDepthCopyPassCount: opticsEnabled ? 1 : 0,
        cameraOpaqueCopyPassCount: opticsEnabled ? 1 : 0,
        planarCameraCount: opticsEnabled ? 1 : 0,
        livePlanarRenderTargetCount: opticsEnabled ? 1 : 0
      }
    });
    const phases = Object.freeze({
      "off-before": createPhase("off-before", false),
      on: createPhase("on", true),
      "off-after": createPhase("off-after", false)
    });
    const sampling: WaterOpticsPerformanceSamplingProtocol = {
      mode: "formal",
      phaseSequence: ["off-before", "on", "off-after"],
      warmupDurationMs: 2000,
      minimumFrameCount: 300,
      minimumSampleDurationMs: 5000,
      longFrameThresholdMs: 1000 / 60,
      phaseTimeoutMs: 30_000,
      gpuTimerScope: "frame-envelope"
    };
    const comparison = {
      baselineFps: 60,
      baselineFrameP95Ms: 16,
      activeToBaselineFpsRatio: 1,
      activeToBaselineFrameP95Ratio: 1,
      activeFpsDelta: 0,
      activeFrameP95DeltaMs: 0
    };
    const createGpuResult = (incrementalGpuP95EstimateMs: number) => ({
      status: "valid" as const,
      source: "EXT_disjoint_timer_query_webgl2" as const,
      scope: "frame-envelope" as const,
      sampleCount: 900,
      phases: {
        "off-before": { sampleCount: 300, p50Ms: 4, p95Ms: 5, maxMs: 6, totalMs: 1200 },
        on: {
          sampleCount: 300,
          p50Ms: 5,
          p95Ms: 5 + incrementalGpuP95EstimateMs,
          maxMs: 8,
          totalMs: 1500
        },
        "off-after": { sampleCount: 300, p50Ms: 4, p95Ms: 5, maxMs: 6, totalMs: 1200 }
      },
      baselineGpuP95Ms: 5,
      incrementalGpuP95EstimateMs,
      droppedSampleCount: 0,
      pendingQueryCount: 0 as const
    });
    const target = {
      requestedTier: "medium" as const,
      resolvedTier: "medium" as const,
      reflectionSource: "planar" as const,
      referenceDevice: "desktop" as const
    };

    const pass = createWaterOpticsPerformanceGate(target, sampling, phases, comparison, createGpuResult(2.4));
    expect(pass).toMatchObject({
      kind: "formal-total-optics",
      gpuStatus: "pass",
      overallStatus: "pass",
      checks: { opticsGpuP95Ms: { status: "pass", measured: 2.4, threshold: 2.5 } }
    });

    const fail = createWaterOpticsPerformanceGate(target, sampling, phases, comparison, createGpuResult(2.6));
    expect(fail).toMatchObject({
      gpuStatus: "fail",
      overallStatus: "fail",
      checks: { opticsGpuP95Ms: { status: "fail", measured: 2.6, threshold: 2.5 } }
    });
    expect(fail.reasons).toContain("optics-gpu-p95-budget-failed");

    const insufficient = createGpuResult(2.4);
    insufficient.phases["off-before"].sampleCount = 299;
    const insufficientGate = createWaterOpticsPerformanceGate(target, sampling, phases, comparison, insufficient);
    expect(insufficientGate).toMatchObject({
      gpuStatus: "fail",
      overallStatus: "fail",
      checks: { opticsGpuP95Ms: { status: "fail", measured: null } }
    });
    expect(insufficientGate.reasons).toContain("gpu-sampling-protocol-failed");

    const dropped = { ...createGpuResult(2.4), droppedSampleCount: 1 };
    const droppedGate = createWaterOpticsPerformanceGate(target, sampling, phases, comparison, dropped);
    expect(droppedGate).toMatchObject({ gpuStatus: "fail", overallStatus: "fail" });
    expect(droppedGate.reasons).toContain("gpu-sampling-protocol-failed");
  });

  it("invalidates the complete run when the GPU timer reports disjoint", async () => {
    const environment = new FakeFrameEnvironment([10, 10, 10]);
    const gpuTimer = {
      pendingQueryCount: 0,
      beginCapture: () => undefined,
      beginPhaseSamples: () => undefined,
      endPhaseSamples: () => undefined,
      poll: () => undefined,
      finishCapture: () => ({
        status: "disjoint" as const,
        source: "EXT_disjoint_timer_query_webgl2" as const,
        scope: "frame-envelope" as const,
        reason: "gpu-disjoint" as const,
        discardedSampleCount: 3,
        droppedSampleCount: 0
      }),
      abortCapture: () => undefined
    } satisfies Pick<
      WaterGpuTimer,
      | "pendingQueryCount"
      | "beginCapture"
      | "beginPhaseSamples"
      | "endPhaseSamples"
      | "poll"
      | "finishCapture"
      | "abortCapture"
    >;
    const sampler = new WaterOpticsPerformanceSampler({ ...environment.dependencies, gpuTimer }, FAST_SAMPLE_OPTIONS);

    expect(await sampler.resample()).toMatchObject({
      valid: false,
      reason: "gpu-timer-disjoint",
      instrumentation: { gpuTimerStatus: "disjoint" }
    });
  });
});
