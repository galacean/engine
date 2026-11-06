import { Vector3, WeatherPresets, createWindSample, type WeatherWindState, type WindSample } from "@galacean/engine";
import {
  WindAcceptanceRecorder,
  type WindAcceptanceRecording,
  type WindAcceptanceSummary
} from "@galacean/engine-environment/wind/WindAcceptanceRecorder";
import {
  STANDARD_WIND_ACCEPTANCE_RECORDER_CAPACITY,
  WindStandardAcceptanceScenario,
  type WindStandardAcceptancePhaseId,
  type WindStandardAcceptanceResult,
  type WindStandardAcceptanceScenarioSnapshot
} from "@galacean/engine-environment/wind/WindStandardAcceptanceScenario";
import type { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { TerrainWindRuntime, TerrainWindRuntimeSnapshot } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import type { SeedWorldWaterRuntime, SeedWorldWaterRuntimeDiagnostics } from "@galacean/engine-world-planning/runtime/SeedWorldWaterRuntime";

export type SeedWorldWindConsumerId = "tree" | "grass" | "flower" | "shrub" | "cloud" | "rain" | "snow" | "water";

export interface SeedWorldWindConsumerContract {
  readonly layer: "ground" | "canopy" | "cloud";
  readonly response: string;
  readonly lod: string;
  readonly frameVerification: "gpu-field-plus-visual" | "runtime-response" | "scene-uniform-plus-visual";
}

/** Final consumer inventory. The browser acceptance API returns this verbatim as its coverage proof. */
export const SEED_WORLD_WIND_CONSUMER_CONTRACTS: Readonly<
  Record<SeedWorldWindConsumerId, Readonly<SeedWorldWindConsumerContract>>
> = Object.freeze({
  tree: Object.freeze({
    layer: "canopy",
    response: "shared GPU two-band second-order tree state + .treewind hierarchy + pinned leaf aerodynamics",
    lod: "LOD0 full hierarchy; LOD1 retained primary/branch/leaf low band; LOD2 retained crown/leaf cluster mode; billboard aggregate bend",
    frameVerification: "gpu-field-plus-visual"
  }),
  grass: Object.freeze({
    layer: "ground",
    response: "shared retained high-frequency ground response + cantilever root-tip bend + advected wheat-wave band",
    lod: "screen-distance removal of micro then meso motion; mean lodging remains until vegetation fade",
    frameVerification: "gpu-field-plus-visual"
  }),
  flower: Object.freeze({
    layer: "ground",
    response: "shared retained ground response + stem bend + terminal flower-head mass and elastic recovery",
    lod: "same continuous vegetation wind LOD with flower-head response removed before mean stem bend",
    frameVerification: "gpu-field-plus-visual"
  }),
  shrub: Object.freeze({
    layer: "ground",
    response: "shared retained ground response + baked implicit branch compliance",
    lod: "mesh LOD keeps low structural response; fine card motion fades by screen distance",
    frameVerification: "gpu-field-plus-visual"
  }),
  cloud: Object.freeze({
    layer: "cloud",
    response: "critically damped low-frequency advection at cloud-base altitude",
    lod: "one global atmospheric state; cloud raymarch quality changes without changing transport",
    frameVerification: "runtime-response"
  }),
  rain: Object.freeze({
    layer: "canopy",
    response: "fast damped relaxation toward a horizontal air-velocity target for ballistic particles",
    lod: "emission/particle budget scales independently; target velocity remains continuous while rain particles live",
    frameVerification: "runtime-response"
  }),
  snow: Object.freeze({
    layer: "canopy",
    response: "high-drag relaxation toward a horizontal air-velocity target with slower directional recovery",
    lod: "emission/particle budget scales independently; target velocity remains continuous while snow particles live",
    frameVerification: "runtime-response"
  }),
  water: Object.freeze({
    layer: "ground",
    response:
      "scene wind advects authoritative Lake capillary/micro normals; Ocean retains its authored wave transport",
    lod: "Lake quality selects existing detail layers without adding a pass or texture sample",
    frameVerification: "scene-uniform-plus-visual"
  })
});

export interface SeedWorldWindPopulationDiagnostics {
  readonly resident: Readonly<Record<"tree" | "shrub" | "flower" | "grass", number>>;
  readonly submitted: Readonly<Record<"tree" | "shrub" | "flower" | "grass", number>>;
  readonly treeLods: readonly [number, number, number, number];
  readonly shrubLods: readonly [number, number];
  readonly detailBatchCount: number;
}

export interface SeedWorldWindFieldFrame {
  readonly index: number;
  readonly timeSeconds: number;
  readonly deltaTimeSeconds: number;
  readonly phase: WindStandardAcceptancePhaseId | null;
  readonly speedMps: number;
  readonly targetSpeedMps: number;
  readonly activeGustCount: number;
  readonly localFieldRevision: number;
  readonly localFieldTemporalBlend: number;
  readonly rasterBackend: "cpu" | "gpu" | "off";
  readonly cloudResponseSpeed: number;
  readonly rainWindActive: boolean;
  readonly rainResponseSpeed: number;
  readonly snowWindActive: boolean;
  readonly snowResponseSpeed: number;
}

export interface SeedWorldWindAcceptanceResult {
  readonly standard: WindStandardAcceptanceResult;
  readonly consumers: Readonly<Record<SeedWorldWindConsumerId, WindAcceptanceRecording>>;
  readonly fieldFrames: readonly SeedWorldWindFieldFrame[];
  /** Physics/signal verdict with the whole-scene frame-time budget evaluated separately. */
  readonly responseContinuityPassed: boolean;
  /** Null means the GPU/scene-uniform consumer still requires visual output verification. */
  readonly consumerResponseContinuity: Readonly<Record<SeedWorldWindConsumerId, boolean | null>>;
  readonly visualVerificationRequired: readonly SeedWorldWindConsumerId[];
  readonly visualVerificationPassed: boolean | null;
  readonly performancePassed: boolean;
  readonly passed: boolean;
}

export interface SeedWorldWindAcceptanceDiagnostics {
  readonly ready: true;
  readonly contracts: typeof SEED_WORLD_WIND_CONSUMER_CONTRACTS;
  readonly wind: TerrainWindRuntimeSnapshot;
  readonly environment: ReturnType<WorldEnvironmentRuntime["getSnapshot"]>;
  readonly water: SeedWorldWaterRuntimeDiagnostics;
  readonly population: SeedWorldWindPopulationDiagnostics | null;
  readonly scenario: WindStandardAcceptanceScenarioSnapshot;
  readonly consumerSummaries: Readonly<Record<SeedWorldWindConsumerId, WindAcceptanceSummary>>;
  readonly fieldFrameCount: number;
  readonly lastResult: SeedWorldWindAcceptanceResult | null;
}

export interface SeedWorldWindAcceptanceApi {
  readonly ready: true;
  getDiagnostics(): SeedWorldWindAcceptanceDiagnostics;
  getRecordings(): Readonly<Record<SeedWorldWindConsumerId, WindAcceptanceRecording>>;
  runStandardAcceptance(): Promise<SeedWorldWindAcceptanceResult>;
  cancelAcceptance(): SeedWorldWindAcceptanceResult | null;
  setWindPreset(preset: "breeze" | "gale", reversed?: boolean, transitionSeconds?: number): void;
  triggerGust(amplitude?: number): void;
  completeVisualVerification(passed: boolean): SeedWorldWindAcceptanceResult;
}

const ACCEPTANCE_THRESHOLDS = Object.freeze({
  gpu: Object.freeze({
    maximumResponseRate: 40,
    maximumDirectionChangeDegrees: 28,
    directionSpeedFloor: 0.08,
    minimumPeakResponseSpeed: 0.25,
    minimumResponseSpeedRange: 0.12,
    minimumCumulativeDirectionChangeDegrees: 90
  }),
  cloud: Object.freeze({
    maximumResponseRate: 16,
    maximumDirectionChangeDegrees: 12,
    directionSpeedFloor: 0.08,
    minimumPeakResponseSpeed: 0.2,
    minimumResponseSpeedRange: 0.1,
    minimumCumulativeDirectionChangeDegrees: 70
  }),
  rain: Object.freeze({
    maximumResponseRate: 80,
    maximumDirectionChangeDegrees: 30,
    directionSpeedFloor: 0.08,
    minimumPeakResponseSpeed: 0.15,
    minimumResponseSpeedRange: 0.08,
    minimumCumulativeDirectionChangeDegrees: 80
  }),
  snow: Object.freeze({
    maximumResponseRate: 36,
    maximumDirectionChangeDegrees: 18,
    directionSpeedFloor: 0.08,
    minimumPeakResponseSpeed: 0.15,
    minimumResponseSpeedRange: 0.08,
    minimumCumulativeDirectionChangeDegrees: 70
  })
});

const CONSUMER_IDS = Object.freeze(Object.keys(SEED_WORLD_WIND_CONSUMER_CONTRACTS) as SeedWorldWindConsumerId[]);
const VISUAL_RESPONSE_CONSUMER_IDS = Object.freeze(
  CONSUMER_IDS.filter((id) => SEED_WORLD_WIND_CONSUMER_CONTRACTS[id].frameVerification !== "runtime-response")
);

/**
 * Opt-in, bounded acceptance owner for the final Seed World scene.
 *
 * GPU-resident vegetation/tree/water deformation is deliberately not read back: a synchronous
 * readback would serialize the renderer and invalidate the performance result. Those channels
 * retain every physical field frame here and are paired with visual motion capture. Atmospheric
 * channels record the exact response values applied to their runtime consumers.
 */
export class SeedWorldWindAcceptanceRuntime {
  private readonly _recorders: Record<SeedWorldWindConsumerId, WindAcceptanceRecorder> = {
    tree: createRecorder(ACCEPTANCE_THRESHOLDS.gpu),
    grass: createRecorder(ACCEPTANCE_THRESHOLDS.gpu),
    flower: createRecorder(ACCEPTANCE_THRESHOLDS.gpu),
    shrub: createRecorder(ACCEPTANCE_THRESHOLDS.gpu),
    cloud: createRecorder(ACCEPTANCE_THRESHOLDS.cloud),
    rain: createRecorder(ACCEPTANCE_THRESHOLDS.rain),
    snow: createRecorder(ACCEPTANCE_THRESHOLDS.snow),
    water: createRecorder(ACCEPTANCE_THRESHOLDS.gpu)
  };
  private readonly _scenario: WindStandardAcceptanceScenario;
  private readonly _groundSample: WindSample = createWindSample();
  private readonly _canopySample: WindSample = createWindSample();
  private readonly _cloudSample: WindSample = createWindSample();
  private readonly _groundPosition = new Vector3();
  private readonly _canopyPosition = new Vector3();
  private readonly _cloudPosition = new Vector3();
  private readonly _fieldFrames: SeedWorldWindFieldFrame[] = [];
  private _elapsedSeconds = 0;
  private _frameIndex = 0;
  private _completion: Promise<SeedWorldWindAcceptanceResult> | null = null;
  private _lastResult: SeedWorldWindAcceptanceResult | null = null;

  constructor(
    private readonly _wind: TerrainWindRuntime,
    private readonly _environment: WorldEnvironmentRuntime,
    private readonly _water: SeedWorldWaterRuntime,
    private readonly _getPopulation: () => SeedWorldWindPopulationDiagnostics | null
  ) {
    this._scenario = new WindStandardAcceptanceScenario(this._recorders.tree, {
      applyWindState: (preset, reversed, transitionSeconds) => this.setWindPreset(preset, reversed, transitionSeconds),
      triggerGust: (amplitude) => this._wind.triggerGust(amplitude)
    });
  }

  readonly api: SeedWorldWindAcceptanceApi = {
    ready: true,
    getDiagnostics: () => this.getDiagnostics(),
    getRecordings: () => this.getRecordings(),
    runStandardAcceptance: () => this.runStandardAcceptance(),
    cancelAcceptance: () => this.cancelAcceptance(),
    setWindPreset: (preset, reversed = false, transitionSeconds = 5) =>
      this.setWindPreset(preset, reversed, transitionSeconds),
    triggerGust: (amplitude = 0.72) => this._wind.triggerGust(amplitude),
    completeVisualVerification: (passed) => this.completeVisualVerification(passed)
  };

  update(deltaTimeSeconds: number): void {
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      throw new RangeError("Seed World wind acceptance delta time must be finite and non-negative");
    }
    this._elapsedSeconds += deltaTimeSeconds;
    this._scenario.update(deltaTimeSeconds);
    if (this._recorders.tree.state !== "recording") return;
    this._recordFrame(deltaTimeSeconds);
  }

  runStandardAcceptance(): Promise<SeedWorldWindAcceptanceResult> {
    if (this._scenario.getSnapshot().state === "running" && this._completion) return this._completion;
    this._fieldFrames.length = 0;
    this._frameIndex = 0;
    for (const id of CONSUMER_IDS) {
      if (id !== "tree") this._recorders[id].start();
    }
    this._completion = this._scenario.start().then((standard) => this._finish(standard));
    return this._completion;
  }

  cancelAcceptance(): SeedWorldWindAcceptanceResult | null {
    if (this._scenario.getSnapshot().state !== "running") return this._lastResult;
    const standard = this._scenario.cancel();
    return this._finish(standard);
  }

  completeVisualVerification(passed: boolean): SeedWorldWindAcceptanceResult {
    if (!this._lastResult) throw new Error("Run wind acceptance before submitting visual verification");
    const automated = this._lastResult;
    const result = Object.freeze({
      ...automated,
      visualVerificationPassed: passed,
      passed:
        this._wind.getSnapshot().renderingActive &&
        automated.responseContinuityPassed &&
        automated.performancePassed &&
        passed
    });
    this._lastResult = result;
    return result;
  }

  setWindPreset(preset: "breeze" | "gale", reversed = false, transitionSeconds = 5): void {
    if (!Number.isFinite(transitionSeconds) || transitionSeconds < 0) {
      throw new RangeError("Seed World wind transition must be finite and non-negative");
    }
    const authored = WeatherPresets.wind[preset];
    const state: WeatherWindState = {
      ...authored,
      directionOffsetDegrees: authored.directionOffsetDegrees + (reversed ? 180 : 0)
    };
    this._environment.setTransitionDuration(transitionSeconds);
    this._environment.setWind(state);
  }

  getRecordings(): Readonly<Record<SeedWorldWindConsumerId, WindAcceptanceRecording>> {
    return freezeConsumerRecord((id) => this._recorders[id].getRecording());
  }

  getDiagnostics(): SeedWorldWindAcceptanceDiagnostics {
    return Object.freeze({
      ready: true,
      contracts: SEED_WORLD_WIND_CONSUMER_CONTRACTS,
      wind: this._wind.getSnapshot(),
      environment: this._environment.getSnapshot(),
      water: this._water.getDiagnostics(),
      population: this._getPopulation(),
      scenario: this._scenario.getSnapshot(),
      consumerSummaries: freezeConsumerRecord((id) => this._recorders[id].getSummary()),
      fieldFrameCount: this._fieldFrames.length,
      lastResult: this._lastResult
    });
  }

  destroy(): void {
    if (this._scenario.getSnapshot().state === "running") this._scenario.cancel();
    this._completion = null;
  }

  private _recordFrame(deltaTimeSeconds: number): void {
    const wind = this._wind.getSnapshot();
    const bridge = wind.bridge;
    const environment = this._environment.getSnapshot();
    const fallbackCenter = this._wind.entity.transform.worldPosition;
    const centerX = bridge?.localFieldCenterWS[0] ?? fallbackCenter.x;
    const centerY = bridge?.localFieldCenterWS[1] ?? fallbackCenter.y;
    const centerZ = bridge?.localFieldCenterWS[2] ?? fallbackCenter.z;
    this._groundPosition.set(centerX, centerY + 1, centerZ);
    this._canopyPosition.set(centerX, centerY + 8, centerZ);
    this._cloudPosition.set(centerX, environment.clouds.scaleSettings.baseAltitude, centerZ);
    this._wind.sample(this._groundPosition, "ground", undefined, this._groundSample);
    this._wind.sample(this._canopyPosition, "canopy", undefined, this._canopySample);
    this._wind.sample(this._cloudPosition, "cloud", undefined, this._cloudSample);
    const atmospheric = environment.atmosphericWind;
    const precipitation = environment.precipitation;
    const phase = this._scenario.currentPhaseId;
    const label = phase ?? "manual";
    const canopyInput = tuple(this._canopySample.velocityWS);
    const groundInput = tuple(this._groundSample.velocityWS);
    const cloudInput = tuple(this._cloudSample.velocityWS);
    const sceneWind = tuple(wind.velocityWS);
    const cloudResponse = tuple(atmospheric.cloudVelocityWS);
    const rainResponse = tuple(precipitation.rainTargetVelocityWS);
    const snowResponse = tuple(precipitation.snowTargetVelocityWS);
    record(this._recorders.tree, this._elapsedSeconds, deltaTimeSeconds, canopyInput, canopyInput, label);
    record(this._recorders.grass, this._elapsedSeconds, deltaTimeSeconds, groundInput, groundInput, label);
    record(this._recorders.flower, this._elapsedSeconds, deltaTimeSeconds, groundInput, groundInput, label);
    record(this._recorders.shrub, this._elapsedSeconds, deltaTimeSeconds, groundInput, groundInput, label);
    record(this._recorders.cloud, this._elapsedSeconds, deltaTimeSeconds, cloudInput, cloudResponse, label);
    if (precipitation.rainWindActive) {
      record(this._recorders.rain, this._elapsedSeconds, deltaTimeSeconds, canopyInput, rainResponse, label);
    }
    if (precipitation.snowWindActive) {
      record(this._recorders.snow, this._elapsedSeconds, deltaTimeSeconds, canopyInput, snowResponse, label);
    }
    record(this._recorders.water, this._elapsedSeconds, deltaTimeSeconds, sceneWind, sceneWind, label);
    this._fieldFrames.push(
      Object.freeze({
        index: this._frameIndex++,
        timeSeconds: this._elapsedSeconds,
        deltaTimeSeconds,
        phase,
        speedMps: wind.speedMps,
        targetSpeedMps: Math.hypot(...wind.targetVelocityWS),
        activeGustCount: wind.activeGustCount,
        localFieldRevision: bridge?.localFieldRevision ?? 0,
        localFieldTemporalBlend: bridge?.localFieldTemporalBlend ?? 0,
        rasterBackend: bridge?.rasterBackend ?? "off",
        cloudResponseSpeed: Math.hypot(...cloudResponse),
        rainWindActive: precipitation.rainWindActive,
        rainResponseSpeed: Math.hypot(...rainResponse),
        snowWindActive: precipitation.snowWindActive,
        snowResponseSpeed: Math.hypot(...snowResponse)
      })
    );
    if (this._fieldFrames.length > STANDARD_WIND_ACCEPTANCE_RECORDER_CAPACITY) this._fieldFrames.shift();
  }

  private _finish(standard: WindStandardAcceptanceResult): SeedWorldWindAcceptanceResult {
    if (this._lastResult?.standard === standard) return this._lastResult;
    for (const id of CONSUMER_IDS) {
      if (id !== "tree" && this._recorders[id].state === "recording") this._recorders[id].stop();
    }
    const consumers = this.getRecordings();
    const consumerResponseContinuity = freezeConsumerRecord((id) =>
      SEED_WORLD_WIND_CONSUMER_CONTRACTS[id].frameVerification === "runtime-response"
        ? passesResponseContinuity(consumers[id].summary)
        : null
    );
    const responseContinuityPassed =
      standard.phaseCoveragePassed &&
      CONSUMER_IDS.every((id) => consumerResponseContinuity[id] === null || consumerResponseContinuity[id] === true);
    const performancePassed = CONSUMER_IDS.every((id) => consumers[id].summary.checks.frameTime.passed);
    const result = Object.freeze({
      standard,
      consumers,
      fieldFrames: Object.freeze([...this._fieldFrames]),
      responseContinuityPassed,
      consumerResponseContinuity,
      visualVerificationRequired: VISUAL_RESPONSE_CONSUMER_IDS,
      visualVerificationPassed: null,
      performancePassed,
      passed: false
    });
    this._lastResult = result;
    this._completion = null;
    return result;
  }
}

function passesResponseContinuity(summary: WindAcceptanceSummary): boolean {
  const checks = summary.checks;
  return (
    checks.sampleCount.passed &&
    checks.responseRate.passed &&
    checks.directionContinuity.passed &&
    checks.responseActivity.passed &&
    checks.responseDynamicRange.passed &&
    checks.directionalTravel.passed &&
    checks.finiteValues.passed &&
    (checks.poseStep?.passed ?? true) &&
    (checks.poseRate?.passed ?? true) &&
    (checks.poseAcceleration?.passed ?? true)
  );
}

function createRecorder(thresholds: ConstructorParameters<typeof WindAcceptanceRecorder>[0]): WindAcceptanceRecorder {
  return new WindAcceptanceRecorder(thresholds, STANDARD_WIND_ACCEPTANCE_RECORDER_CAPACITY);
}

function record(
  recorder: WindAcceptanceRecorder,
  timeSeconds: number,
  deltaTimeSeconds: number,
  inputVelocityWS: readonly [number, number, number],
  responseVelocityWS: readonly [number, number, number],
  label: string
): void {
  recorder.record({ timeSeconds, deltaTimeSeconds, inputVelocityWS, responseVelocityWS, label });
}

function tuple(value: readonly number[]): readonly [number, number, number] {
  return Object.freeze([value[0] ?? 0, value[1] ?? 0, value[2] ?? 0]);
}

function freezeConsumerRecord<T>(
  factory: (id: SeedWorldWindConsumerId) => T
): Readonly<Record<SeedWorldWindConsumerId, T>> {
  return Object.freeze(
    Object.fromEntries(CONSUMER_IDS.map((id) => [id, factory(id)])) as Record<SeedWorldWindConsumerId, T>
  );
}
