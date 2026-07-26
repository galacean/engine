import type {
  WaterGpuTimerCaptureResult,
  WaterGpuTimerCaptureUnavailable,
  WaterGpuTimer,
  WaterGpuTimerScope
} from "../../../runtime/optics/WaterGpuTimer";

export const WATER_OPTICS_PERFORMANCE_PHASES = ["off-before", "on", "off-after"] as const;

export const WATER_OPTICS_FORMAL_SAMPLING_MINIMUMS = Object.freeze({
  warmupDurationMs: 2000,
  minimumFrameCount: 300,
  minimumSampleDurationMs: 5000
});

export type WaterOpticsPerformancePhase = (typeof WATER_OPTICS_PERFORMANCE_PHASES)[number];

export type WaterOpticsPerformanceSamplingMode = "formal" | "smoke";

export type WaterOpticsPerformanceReferenceDevice = "desktop" | "mobile";

export type WaterOpticsPerformanceGateTier = "medium" | "high" | "experimental";

export type WaterOpticsPerformanceReflectionSource = "sky" | "probe" | "planar";

export interface WaterOpticsViewportDpr {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

export interface WaterOpticsRuntimeEnvironmentDetails {
  readonly capturedAtIso: string;
  readonly browser: string;
  readonly graphicsApi: "webgl2" | "webgl1" | "unknown";
  readonly gpuRendererStatus: "available" | "unavailable";
  readonly gpuRenderer?: string;
  /** `null` means the browser could not prove whether it is headed. */
  readonly headed: boolean | null;
  readonly headedDetection: "query-parameter" | "headless-user-agent" | "unavailable";
}

export interface WaterOpticsPerformanceEnvironment
  extends WaterOpticsViewportDpr,
    WaterOpticsRuntimeEnvironmentDetails {
  /** Monotonic timestamp used only to identify the start of this capture. */
  readonly sampledAtMs: number;
}

export interface WaterOpticsPerformanceGateTarget {
  readonly requestedTier: WaterOpticsPerformanceGateTier;
  readonly resolvedTier: WaterOpticsPerformanceGateTier;
  readonly reflectionSource: WaterOpticsPerformanceReflectionSource;
  readonly referenceDevice: WaterOpticsPerformanceReferenceDevice;
}

export interface WaterOpticsEngineMemorySnapshot {
  readonly textureBytes: number;
  readonly bufferBytes: number;
  readonly totalBytes: number;
}

export interface WaterOpticsWaterMemorySnapshot {
  readonly cameraFeatureBytes: number;
  readonly planarBytes: number;
  readonly probeBytes: number;
  readonly compositeBytes: number;
  readonly historyBytes: number;
}

export interface WaterOpticsPerformanceMemoryInput {
  readonly engineMemory: WaterOpticsEngineMemorySnapshot;
  readonly waterMemory: WaterOpticsWaterMemorySnapshot;
}

export interface WaterOpticsPerformanceMemorySnapshot {
  readonly sampledAtPhase: "on";
  readonly engineMemory: WaterOpticsEngineMemorySnapshot;
  readonly waterMemory: WaterOpticsWaterMemorySnapshot & { readonly totalBytes: number };
}

export interface WaterOpticsPerformanceSamplerDependencies {
  readonly requestAnimationFrame: (callback: () => void) => number;
  readonly now: () => number;
  readonly isVisible: () => boolean;
  readonly getViewportDpr: () => WaterOpticsViewportDpr;
  readonly getRuntimeEnvironment: () => WaterOpticsRuntimeEnvironmentDetails;
  readonly getGateTarget: () => WaterOpticsPerformanceGateTarget;
  readonly getMemorySnapshot: () => WaterOpticsPerformanceMemoryInput;
  readonly getOpticsStateSnapshot: () => WaterOpticsPerformanceOpticsState;
  readonly setOpticsEnabled: (enabled: boolean) => void | Promise<void>;
  readonly gpuTimer?: Pick<
    WaterGpuTimer,
    | "beginCapture"
    | "beginPhaseSamples"
    | "endPhaseSamples"
    | "poll"
    | "pendingQueryCount"
    | "finishCapture"
    | "abortCapture"
  >;
}

export interface WaterOpticsPerformanceSamplerOptions {
  /** Defaults to `formal`. Reduced values are accepted only in explicit smoke mode. */
  readonly mode?: WaterOpticsPerformanceSamplingMode;
  readonly warmupDurationMs?: number;
  readonly minimumFrameCount?: number;
  readonly minimumSampleDurationMs?: number;
  readonly longFrameThresholdMs?: number;
  readonly phaseTimeoutMs?: number;
  /** `frame-envelope` is the formal total-optics Gate; `planar-pass` is a separate diagnostic run. */
  readonly gpuTimerScope?: WaterGpuTimerScope;
}

/** Public capture options consumed by the Water Optics Lab API. */
export type WaterOpticsPerformanceCaptureOptions = WaterOpticsPerformanceSamplerOptions;

export interface WaterOpticsPerformanceSamplingProtocol {
  readonly mode: WaterOpticsPerformanceSamplingMode;
  readonly phaseSequence: typeof WATER_OPTICS_PERFORMANCE_PHASES;
  readonly warmupDurationMs: number;
  readonly minimumFrameCount: number;
  readonly minimumSampleDurationMs: number;
  readonly longFrameThresholdMs: number;
  readonly phaseTimeoutMs: number;
  readonly gpuTimerScope: WaterGpuTimerScope;
}

export interface WaterOpticsPerformancePhaseMetrics {
  readonly phase: WaterOpticsPerformancePhase;
  readonly opticsEnabled: boolean;
  readonly warmupDurationMs: number;
  readonly sampleDurationMs: number;
  readonly frameCount: number;
  readonly fps: number;
  readonly frameP50Ms: number;
  readonly frameP95Ms: number;
  readonly frameMaxMs: number;
  readonly longFrameThresholdMs: number;
  readonly longFrameCount: number;
  readonly longFrameRatio: number;
  readonly opticsState: WaterOpticsPerformanceOpticsState;
}

export interface WaterOpticsPerformanceOpticsState {
  readonly refractionEnabled: boolean;
  readonly cameraDepthCopyPassCount: number;
  readonly cameraOpaqueCopyPassCount: number;
  readonly planarCameraCount: number;
  readonly livePlanarRenderTargetCount: number;
}

export interface WaterOpticsPerformanceComparison {
  /** Conservative baseline: the smaller FPS from the two OFF phases. */
  readonly baselineFps: number;
  /** Conservative baseline: the larger frame P95 from the two OFF phases. */
  readonly baselineFrameP95Ms: number;
  readonly activeToBaselineFpsRatio: number;
  readonly activeToBaselineFrameP95Ratio: number;
  readonly activeFpsDelta: number;
  readonly activeFrameP95DeltaMs: number;
}

export interface WaterOpticsPerformanceInstrumentation {
  readonly statsEnabled: false;
  readonly statsRole: "display-only";
  readonly frameSampler: "requestAnimationFrame";
  readonly gpuTimerStatus: "valid" | "unavailable" | "disjoint";
  readonly engineMemorySource: "engine.renderingStatistics";
  readonly waterMemorySource: "water-runtime-metrics";
}

export type WaterOpticsPerformanceGpuUnavailable = WaterGpuTimerCaptureUnavailable;

export type WaterOpticsPerformanceGpu = WaterGpuTimerCaptureResult;

export type WaterOpticsPerformanceGateProfile =
  | "medium-refraction"
  | "medium-refraction-planar"
  | "high-refraction"
  | "high-refraction-planar"
  | "experimental-composite-ssr";

export type WaterOpticsPerformanceGateKind = "formal-total-optics" | "planar-pass-sub-gate";

export interface WaterOpticsPerformanceGateThresholds {
  readonly minimumActiveToBaselineFpsRatio: number;
  readonly maximumActiveToBaselineFrameP95Ratio: number;
  readonly maximumActiveFrameP95Ms: number;
  /** `null` means this profile rolls GPU cost into a downstream total budget. */
  readonly maximumOpticsGpuP95Ms: number | null;
  readonly referenceFps: number;
}

export interface WaterOpticsPerformanceGateCheck {
  readonly status: "pass" | "fail" | "unavailable";
  readonly measured: number | null;
  readonly threshold: number | null;
  readonly comparison: ">=" | "<=";
}

export interface WaterOpticsPerformanceGate {
  /** The Planar sub-gate is additional evidence and cannot substitute for the total-optics frame-envelope Gate. */
  readonly kind: WaterOpticsPerformanceGateKind;
  readonly profile: WaterOpticsPerformanceGateProfile;
  readonly target: WaterOpticsPerformanceGateTarget;
  readonly thresholds: WaterOpticsPerformanceGateThresholds;
  readonly checks: {
    readonly activeToBaselineFpsRatio: WaterOpticsPerformanceGateCheck;
    readonly activeToBaselineFrameP95Ratio: WaterOpticsPerformanceGateCheck;
    readonly activeFrameP95Ms: WaterOpticsPerformanceGateCheck;
    /** A missing measurement is represented by `null`, never zero. */
    readonly opticsGpuP95Ms: WaterOpticsPerformanceGateCheck;
  };
  readonly protocolStatus: "pass" | "fail" | "smoke-only";
  readonly frameStatus: "pass" | "fail";
  readonly gpuStatus: "pass" | "fail" | "unavailable";
  readonly overallStatus: "pass" | "fail" | "incomplete" | "smoke-only";
  readonly reasons: readonly string[];
}

export type WaterOpticsPerformanceInvalidReason =
  | "concurrent-run"
  | "environment-read-failed"
  | "invalid-clock"
  | "invalid-viewport"
  | "hidden"
  | "viewport-changed"
  | "phase-transition-failed"
  | "phase-timeout"
  | "non-monotonic-frame"
  | "animation-frame-failed"
  | "memory-read-failed"
  | "gpu-timer-disjoint"
  | "gpu-timer-context-lost"
  | "gpu-timer-invalid-result"
  | "gpu-query-timeout"
  | "cleanup-failed";

export type WaterOpticsCompletedPhaseMetrics = Partial<
  Readonly<Record<WaterOpticsPerformancePhase, WaterOpticsPerformancePhaseMetrics>>
>;

export interface WaterOpticsPerformanceValidResult {
  readonly valid: true;
  readonly environment: WaterOpticsPerformanceEnvironment;
  readonly instrumentation: WaterOpticsPerformanceInstrumentation;
  readonly sampling: WaterOpticsPerformanceSamplingProtocol;
  readonly phases: Readonly<Record<WaterOpticsPerformancePhase, WaterOpticsPerformancePhaseMetrics>>;
  readonly comparison: WaterOpticsPerformanceComparison;
  readonly gpu: WaterOpticsPerformanceGpu;
  readonly engineMemory: WaterOpticsEngineMemorySnapshot;
  readonly waterMemory: WaterOpticsWaterMemorySnapshot & { readonly totalBytes: number };
  readonly memorySampledAtPhase: "on";
  readonly gate: WaterOpticsPerformanceGate;
}

export interface WaterOpticsPerformanceInvalidResult {
  readonly valid: false;
  readonly reason: WaterOpticsPerformanceInvalidReason;
  readonly message: string;
  readonly failedPhase?: WaterOpticsPerformancePhase;
  readonly environment?: WaterOpticsPerformanceEnvironment;
  readonly instrumentation: WaterOpticsPerformanceInstrumentation;
  readonly sampling: WaterOpticsPerformanceSamplingProtocol;
  readonly completedPhases: WaterOpticsCompletedPhaseMetrics;
}

export type WaterOpticsPerformanceResult = WaterOpticsPerformanceValidResult | WaterOpticsPerformanceInvalidResult;

/** Structured report returned by one complete performance capture. */
export type WaterOpticsPerformanceReport = WaterOpticsPerformanceResult;

interface ResolvedWaterOpticsPerformanceSamplerOptions {
  readonly mode: WaterOpticsPerformanceSamplingMode;
  readonly warmupDurationMs: number;
  readonly minimumFrameCount: number;
  readonly minimumSampleDurationMs: number;
  readonly longFrameThresholdMs: number;
  readonly phaseTimeoutMs: number;
  readonly gpuTimerScope: WaterGpuTimerScope;
}

interface WaterOpticsPerformancePhaseValidOutcome {
  readonly valid: true;
  readonly metrics: WaterOpticsPerformancePhaseMetrics;
}

interface WaterOpticsPerformancePhaseInvalidOutcome {
  readonly valid: false;
  readonly reason: WaterOpticsPerformanceInvalidReason;
  readonly message: string;
}

type WaterOpticsPerformancePhaseOutcome =
  | WaterOpticsPerformancePhaseValidOutcome
  | WaterOpticsPerformancePhaseInvalidOutcome;

const DEFAULT_OPTIONS: ResolvedWaterOpticsPerformanceSamplerOptions = Object.freeze({
  mode: "formal",
  ...WATER_OPTICS_FORMAL_SAMPLING_MINIMUMS,
  longFrameThresholdMs: 1000 / 60,
  phaseTimeoutMs: 30_000,
  gpuTimerScope: "frame-envelope"
});

const GPU_UNAVAILABLE: WaterOpticsPerformanceGpuUnavailable = Object.freeze({
  status: "unavailable",
  reason: "gpu-timer-not-integrated"
});
const GPU_QUERY_DRAIN_TIMEOUT_MS = 5000;
const GPU_QUERY_DRAIN_MAXIMUM_FRAME_COUNT = 300;

function createInstrumentation(
  gpuTimerStatus: WaterOpticsPerformanceInstrumentation["gpuTimerStatus"]
): WaterOpticsPerformanceInstrumentation {
  return Object.freeze({
    statsEnabled: false,
    statsRole: "display-only",
    frameSampler: "requestAnimationFrame",
    gpuTimerStatus,
    engineMemorySource: "engine.renderingStatistics",
    waterMemorySource: "water-runtime-metrics"
  });
}

function assertFiniteNumber(value: number, name: string, minimum: number, inclusive: boolean): void {
  const validBoundary = inclusive ? value >= minimum : value > minimum;
  if (!Number.isFinite(value) || !validBoundary) {
    const operator = inclusive ? ">=" : ">";
    throw new Error(`${name} must be finite and ${operator} ${minimum}.`);
  }
}

function resolveOptions(options: WaterOpticsPerformanceSamplerOptions): ResolvedWaterOpticsPerformanceSamplerOptions {
  const resolved = {
    mode: options.mode ?? DEFAULT_OPTIONS.mode,
    warmupDurationMs: options.warmupDurationMs ?? DEFAULT_OPTIONS.warmupDurationMs,
    minimumFrameCount: options.minimumFrameCount ?? DEFAULT_OPTIONS.minimumFrameCount,
    minimumSampleDurationMs: options.minimumSampleDurationMs ?? DEFAULT_OPTIONS.minimumSampleDurationMs,
    longFrameThresholdMs: options.longFrameThresholdMs ?? DEFAULT_OPTIONS.longFrameThresholdMs,
    phaseTimeoutMs: options.phaseTimeoutMs ?? DEFAULT_OPTIONS.phaseTimeoutMs,
    gpuTimerScope: options.gpuTimerScope ?? DEFAULT_OPTIONS.gpuTimerScope
  };
  assertFiniteNumber(resolved.warmupDurationMs, "warmupDurationMs", 0, true);
  assertFiniteNumber(resolved.minimumFrameCount, "minimumFrameCount", 0, false);
  if (!Number.isInteger(resolved.minimumFrameCount)) throw new Error("minimumFrameCount must be an integer.");
  assertFiniteNumber(resolved.minimumSampleDurationMs, "minimumSampleDurationMs", 0, true);
  assertFiniteNumber(resolved.longFrameThresholdMs, "longFrameThresholdMs", 0, false);
  assertFiniteNumber(resolved.phaseTimeoutMs, "phaseTimeoutMs", 0, false);
  if (resolved.gpuTimerScope !== "frame-envelope" && resolved.gpuTimerScope !== "planar-pass") {
    throw new Error(`Unsupported gpuTimerScope ${String(resolved.gpuTimerScope)}.`);
  }
  if (resolved.phaseTimeoutMs <= resolved.warmupDurationMs + resolved.minimumSampleDurationMs) {
    throw new Error("phaseTimeoutMs must exceed warmupDurationMs + minimumSampleDurationMs.");
  }
  if (resolved.mode === "formal") {
    const minimums = WATER_OPTICS_FORMAL_SAMPLING_MINIMUMS;
    if (
      resolved.warmupDurationMs < minimums.warmupDurationMs ||
      resolved.minimumFrameCount < minimums.minimumFrameCount ||
      resolved.minimumSampleDurationMs < minimums.minimumSampleDurationMs
    ) {
      throw new Error(
        "Formal capture requires at least 2000ms warmup, 300 frames, and 5000ms sampling per phase; use mode=smoke only for E2E plumbing checks."
      );
    }
  }
  return Object.freeze(resolved);
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isValidViewportDpr(viewport: WaterOpticsViewportDpr): boolean {
  return (
    Number.isFinite(viewport.width) &&
    viewport.width > 0 &&
    Number.isFinite(viewport.height) &&
    viewport.height > 0 &&
    Number.isFinite(viewport.devicePixelRatio) &&
    viewport.devicePixelRatio > 0
  );
}

function viewportDprEquals(left: WaterOpticsViewportDpr, right: WaterOpticsViewportDpr): boolean {
  return left.width === right.width && left.height === right.height && left.devicePixelRatio === right.devicePixelRatio;
}

function isFiniteNonNegativeMemory(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function freezeMemorySnapshot(input: WaterOpticsPerformanceMemoryInput): WaterOpticsPerformanceMemorySnapshot {
  const engineValues = [input.engineMemory.textureBytes, input.engineMemory.bufferBytes, input.engineMemory.totalBytes];
  const waterValues = [
    input.waterMemory.cameraFeatureBytes,
    input.waterMemory.planarBytes,
    input.waterMemory.probeBytes,
    input.waterMemory.compositeBytes,
    input.waterMemory.historyBytes
  ];
  if (![...engineValues, ...waterValues].every(isFiniteNonNegativeMemory)) {
    throw new Error("Engine and water memory values must be finite, non-negative byte counts.");
  }
  const engineMemory = Object.freeze({ ...input.engineMemory });
  const waterMemory = Object.freeze({
    ...input.waterMemory,
    totalBytes: waterValues.reduce((total, value) => total + value, 0)
  });
  return Object.freeze({ sampledAtPhase: "on", engineMemory, waterMemory });
}

function resolveGateProfile(target: WaterOpticsPerformanceGateTarget): WaterOpticsPerformanceGateProfile {
  if (target.resolvedTier === "experimental") return "experimental-composite-ssr";
  const planarSuffix = target.reflectionSource === "planar" ? "-planar" : "";
  return `${target.resolvedTier}-refraction${planarSuffix}` as WaterOpticsPerformanceGateProfile;
}

function resolveGateThresholds(
  profile: WaterOpticsPerformanceGateProfile,
  target: WaterOpticsPerformanceGateTarget
): WaterOpticsPerformanceGateThresholds {
  const maximumActiveFrameP95Ms =
    profile === "experimental-composite-ssr" ||
    (target.resolvedTier === "medium" && target.referenceDevice === "mobile")
      ? 33.3
      : 16.7;
  switch (profile) {
    case "medium-refraction":
      return Object.freeze({
        minimumActiveToBaselineFpsRatio: 0.9,
        maximumActiveToBaselineFrameP95Ratio: 1.2,
        maximumActiveFrameP95Ms,
        maximumOpticsGpuP95Ms: 2.5,
        referenceFps: target.referenceDevice === "mobile" ? 30 : 60
      });
    case "medium-refraction-planar":
      return Object.freeze({
        minimumActiveToBaselineFpsRatio: 0.8,
        maximumActiveToBaselineFrameP95Ratio: 1.4,
        maximumActiveFrameP95Ms,
        maximumOpticsGpuP95Ms: 2.5,
        referenceFps: target.referenceDevice === "mobile" ? 30 : 60
      });
    case "high-refraction":
      return Object.freeze({
        minimumActiveToBaselineFpsRatio: 0.85,
        maximumActiveToBaselineFrameP95Ratio: 1.3,
        maximumActiveFrameP95Ms,
        maximumOpticsGpuP95Ms: 4,
        referenceFps: 60
      });
    case "high-refraction-planar":
      return Object.freeze({
        minimumActiveToBaselineFpsRatio: 0.7,
        maximumActiveToBaselineFrameP95Ratio: 1.65,
        maximumActiveFrameP95Ms,
        maximumOpticsGpuP95Ms: 4,
        referenceFps: 60
      });
    case "experimental-composite-ssr":
      return Object.freeze({
        minimumActiveToBaselineFpsRatio: 0.6,
        maximumActiveToBaselineFrameP95Ratio: 2,
        maximumActiveFrameP95Ms,
        maximumOpticsGpuP95Ms: 6,
        referenceFps: 30
      });
  }
}

function createNumericGateCheck(
  measured: number,
  threshold: number,
  comparison: ">=" | "<="
): WaterOpticsPerformanceGateCheck {
  const passed = comparison === ">=" ? measured >= threshold : measured <= threshold;
  return Object.freeze({ status: passed ? "pass" : "fail", measured, threshold, comparison });
}

function gpuCaptureMeetsSamplingProtocol(
  gpu: WaterOpticsPerformanceGpu,
  sampling: WaterOpticsPerformanceSamplingProtocol,
  target: WaterOpticsPerformanceGateTarget
): boolean {
  if (gpu.status !== "valid" || gpu.scope !== sampling.gpuTimerScope) return false;
  if (gpu.droppedSampleCount !== 0 || gpu.pendingQueryCount !== 0 || gpu.sampleCount <= 0) return false;
  if (sampling.mode === "smoke") return true;
  if (gpu.scope === "frame-envelope") {
    return WATER_OPTICS_PERFORMANCE_PHASES.every(
      (phase) => gpu.phases[phase].sampleCount >= WATER_OPTICS_FORMAL_SAMPLING_MINIMUMS.minimumFrameCount
    );
  }
  const minimumPlanarSampleCount = target.resolvedTier === "medium" ? 120 : 250;
  return gpu.sampleCount >= minimumPlanarSampleCount;
}

export function createWaterOpticsPerformanceGate(
  target: WaterOpticsPerformanceGateTarget,
  sampling: WaterOpticsPerformanceSamplingProtocol,
  phases: Readonly<Record<WaterOpticsPerformancePhase, WaterOpticsPerformancePhaseMetrics>>,
  comparison: WaterOpticsPerformanceComparison,
  gpu: WaterOpticsPerformanceGpu = GPU_UNAVAILABLE
): WaterOpticsPerformanceGate {
  const kind: WaterOpticsPerformanceGateKind =
    sampling.gpuTimerScope === "frame-envelope" ? "formal-total-optics" : "planar-pass-sub-gate";
  const profile = resolveGateProfile(target);
  const thresholds = resolveGateThresholds(profile, target);
  const gpuSamplingProtocolValid = gpuCaptureMeetsSamplingProtocol(gpu, sampling, target);
  const measuredGpuP95Ms =
    gpu.status === "valid" && gpuSamplingProtocolValid
      ? gpu.scope === "frame-envelope"
        ? gpu.incrementalGpuP95EstimateMs
        : gpu.planarP95Ms
      : undefined;
  const gpuCheck =
    measuredGpuP95Ms !== undefined
      ? thresholds.maximumOpticsGpuP95Ms === null
        ? (Object.freeze({
            status: "pass",
            measured: measuredGpuP95Ms,
            threshold: null,
            comparison: "<="
          }) satisfies WaterOpticsPerformanceGateCheck)
        : createNumericGateCheck(measuredGpuP95Ms, thresholds.maximumOpticsGpuP95Ms, "<=")
      : gpu.status === "valid"
        ? (Object.freeze({
            status: "fail",
            measured: null,
            threshold: thresholds.maximumOpticsGpuP95Ms,
            comparison: "<="
          }) satisfies WaterOpticsPerformanceGateCheck)
        : (Object.freeze({
            status: "unavailable",
            measured: null,
            threshold: thresholds.maximumOpticsGpuP95Ms,
            comparison: "<="
          }) satisfies WaterOpticsPerformanceGateCheck);
  const checks = Object.freeze({
    activeToBaselineFpsRatio: createNumericGateCheck(
      comparison.activeToBaselineFpsRatio,
      thresholds.minimumActiveToBaselineFpsRatio,
      ">="
    ),
    activeToBaselineFrameP95Ratio: createNumericGateCheck(
      comparison.activeToBaselineFrameP95Ratio,
      thresholds.maximumActiveToBaselineFrameP95Ratio,
      "<="
    ),
    activeFrameP95Ms: createNumericGateCheck(phases.on.frameP95Ms, thresholds.maximumActiveFrameP95Ms, "<="),
    opticsGpuP95Ms: gpuCheck
  });
  const frameStatus =
    checks.activeToBaselineFpsRatio.status === "pass" &&
    checks.activeToBaselineFrameP95Ratio.status === "pass" &&
    checks.activeFrameP95Ms.status === "pass"
      ? "pass"
      : "fail";
  const formalMinimums = WATER_OPTICS_FORMAL_SAMPLING_MINIMUMS;
  const protocolMeetsFormalMinimums = WATER_OPTICS_PERFORMANCE_PHASES.every((phase) => {
    const metrics = phases[phase];
    return (
      metrics.warmupDurationMs >= formalMinimums.warmupDurationMs &&
      metrics.frameCount >= formalMinimums.minimumFrameCount &&
      metrics.sampleDurationMs >= formalMinimums.minimumSampleDurationMs
    );
  });
  const protocolStatus = sampling.mode === "smoke" ? "smoke-only" : protocolMeetsFormalMinimums ? "pass" : "fail";
  const reasons: string[] = [];
  if (checks.activeToBaselineFpsRatio.status === "fail") reasons.push("active-to-baseline-fps-ratio-failed");
  if (checks.activeToBaselineFrameP95Ratio.status === "fail") reasons.push("active-to-baseline-p95-ratio-failed");
  if (checks.activeFrameP95Ms.status === "fail") reasons.push("active-frame-p95-budget-failed");
  if (checks.opticsGpuP95Ms.status === "fail") reasons.push("optics-gpu-p95-budget-failed");
  if (gpu.status === "valid" && !gpuSamplingProtocolValid) reasons.push("gpu-sampling-protocol-failed");
  if (protocolStatus === "smoke-only") reasons.push("smoke-sampling-cannot-satisfy-formal-gate");
  if (protocolStatus === "fail") reasons.push("formal-sampling-minimums-not-met");
  if (checks.opticsGpuP95Ms.status === "unavailable") reasons.push("gpu-timer-unavailable-formal-gate-incomplete");
  const gpuStatus =
    checks.opticsGpuP95Ms.status === "pass" ? "pass" : checks.opticsGpuP95Ms.status === "fail" ? "fail" : "unavailable";
  const overallStatus =
    protocolStatus === "smoke-only"
      ? "smoke-only"
      : frameStatus === "fail" || protocolStatus === "fail" || gpuStatus === "fail"
        ? "fail"
        : gpuStatus === "unavailable"
          ? "incomplete"
          : "pass";
  return Object.freeze({
    kind,
    profile,
    target: Object.freeze({ ...target }),
    thresholds,
    checks,
    protocolStatus,
    frameStatus,
    gpuStatus,
    overallStatus,
    reasons: Object.freeze(reasons)
  });
}

/** Nearest-rank percentile shared by Water Optics frame reports. */
export function waterOpticsNearestRankPercentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) throw new Error("Percentile requires at least one sample.");
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
    throw new Error("Percentile ratio must be within (0, 1].");
  }
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) throw new Error("Percentile samples must be finite and non-negative.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

/**
 * Runs one complete OFF-before -> ON -> OFF-after sample. Every call to
 * `resample` starts a fresh run; an interrupted environment returns a typed
 * invalid result instead of silently discarding frames.
 */
export class WaterOpticsPerformanceSampler {
  private readonly _options: ResolvedWaterOpticsPerformanceSamplerOptions;
  private readonly _sampling: WaterOpticsPerformanceSamplingProtocol;
  private _running = false;

  constructor(
    private readonly _dependencies: WaterOpticsPerformanceSamplerDependencies,
    options: WaterOpticsPerformanceSamplerOptions = {}
  ) {
    this._options = resolveOptions(options);
    this._sampling = Object.freeze({
      mode: this._options.mode,
      phaseSequence: WATER_OPTICS_PERFORMANCE_PHASES,
      warmupDurationMs: this._options.warmupDurationMs,
      minimumFrameCount: this._options.minimumFrameCount,
      minimumSampleDurationMs: this._options.minimumSampleDurationMs,
      longFrameThresholdMs: this._options.longFrameThresholdMs,
      phaseTimeoutMs: this._options.phaseTimeoutMs,
      gpuTimerScope: this._options.gpuTimerScope
    });
  }

  async resample(): Promise<WaterOpticsPerformanceResult> {
    if (this._running) {
      return this._createInvalidResult(
        "concurrent-run",
        "A Water Optics performance sample is already running.",
        Object.freeze({})
      );
    }

    this._running = true;
    try {
      return await this._runCompleteSample();
    } finally {
      this._running = false;
    }
  }

  private async _runCompleteSample(): Promise<WaterOpticsPerformanceResult> {
    const completedPhases: Partial<Record<WaterOpticsPerformancePhase, WaterOpticsPerformancePhaseMetrics>> = {};
    const gpuTimer = this._dependencies.gpuTimer;
    let gpuCaptureStarted = false;
    let environment: WaterOpticsPerformanceEnvironment;
    let target: WaterOpticsPerformanceGateTarget;
    try {
      environment = this._captureEnvironment();
      target = Object.freeze({ ...this._dependencies.getGateTarget() });
    } catch (error) {
      const message = readErrorMessage(error);
      const reason = message.includes("clock") ? "invalid-clock" : "environment-read-failed";
      return this._createInvalidResult(reason, message, completedPhases);
    }
    if (!isValidViewportDpr(environment)) {
      return this._createInvalidResult(
        "invalid-viewport",
        "Viewport width, height, and devicePixelRatio must be finite and positive.",
        completedPhases,
        undefined,
        environment
      );
    }
    let initiallyVisible: boolean;
    try {
      initiallyVisible = this._dependencies.isVisible();
    } catch (error) {
      return this._createInvalidResult(
        "environment-read-failed",
        `Failed to read initial visibility: ${readErrorMessage(error)}`,
        completedPhases,
        undefined,
        environment
      );
    }
    if (!initiallyVisible) {
      return this._createInvalidResult(
        "hidden",
        "The document was hidden before sampling started.",
        completedPhases,
        undefined,
        environment
      );
    }

    let opticsEnabled = false;
    let memory: WaterOpticsPerformanceMemorySnapshot | undefined;
    let result: WaterOpticsPerformanceResult | undefined;
    for (const phase of WATER_OPTICS_PERFORMANCE_PHASES) {
      const nextOpticsEnabled = phase === "on";
      try {
        await this._dependencies.setOpticsEnabled(nextOpticsEnabled);
        opticsEnabled = nextOpticsEnabled;
        if (phase === "off-before" && gpuTimer) {
          gpuTimer.beginCapture(this._options.gpuTimerScope);
          gpuCaptureStarted = true;
        }
      } catch (error) {
        result = this._createInvalidResult(
          "phase-transition-failed",
          `Failed to enter ${phase}: ${readErrorMessage(error)}`,
          completedPhases,
          phase,
          environment
        );
        break;
      }

      const outcome = await this._samplePhase(phase, nextOpticsEnabled, environment, target);
      if (!outcome.valid) {
        result = this._createInvalidResult(outcome.reason, outcome.message, completedPhases, phase, environment);
        break;
      }
      completedPhases[phase] = outcome.metrics;
      if (phase === "on") {
        try {
          memory = freezeMemorySnapshot(this._dependencies.getMemorySnapshot());
        } catch (error) {
          result = this._createInvalidResult(
            "memory-read-failed",
            `Failed to capture ON-phase memory: ${readErrorMessage(error)}`,
            completedPhases,
            phase,
            environment
          );
          break;
        }
      }
    }

    if (opticsEnabled) {
      try {
        await this._dependencies.setOpticsEnabled(false);
      } catch (error) {
        if (gpuCaptureStarted) gpuTimer?.abortCapture();
        return this._createInvalidResult(
          "cleanup-failed",
          `Failed to restore optics-off state: ${readErrorMessage(error)}`,
          completedPhases,
          undefined,
          environment
        );
      }
    }

    if (result) {
      if (gpuCaptureStarted) gpuTimer?.abortCapture();
      return result;
    }
    const offBefore = completedPhases["off-before"];
    const active = completedPhases.on;
    const offAfter = completedPhases["off-after"];
    if (!offBefore || !active || !offAfter || !memory) {
      if (gpuCaptureStarted) gpuTimer?.abortCapture();
      return this._createInvalidResult(
        "environment-read-failed",
        "The complete performance phase sequence or ON-phase memory snapshot was not collected.",
        completedPhases,
        undefined,
        environment
      );
    }

    const baselineFps = Math.min(offBefore.fps, offAfter.fps);
    const baselineFrameP95Ms = Math.max(offBefore.frameP95Ms, offAfter.frameP95Ms);
    const phases = Object.freeze({
      "off-before": offBefore,
      on: active,
      "off-after": offAfter
    });
    const comparison = Object.freeze({
      baselineFps,
      baselineFrameP95Ms,
      activeToBaselineFpsRatio: active.fps / baselineFps,
      activeToBaselineFrameP95Ratio: active.frameP95Ms / baselineFrameP95Ms,
      activeFpsDelta: active.fps - baselineFps,
      activeFrameP95DeltaMs: active.frameP95Ms - baselineFrameP95Ms
    });
    let gpu: WaterOpticsPerformanceGpu = GPU_UNAVAILABLE;
    if (gpuCaptureStarted && gpuTimer) {
      const drained = await this._drainGpuTimer(gpuTimer);
      if (!drained) {
        gpuTimer.abortCapture();
        return this._createInvalidResult(
          "gpu-query-timeout",
          `WebGL GPU timer queries did not resolve within ${GPU_QUERY_DRAIN_TIMEOUT_MS}ms / ${GPU_QUERY_DRAIN_MAXIMUM_FRAME_COUNT} frames.`,
          completedPhases,
          undefined,
          environment
        );
      }
      gpuTimer.poll();
      gpu = gpuTimer.finishCapture();
      if (gpu.status === "disjoint") {
        return this._createInvalidResult(
          "gpu-timer-disjoint",
          "The WebGL GPU timer reported a disjoint interval; the complete performance run is invalid.",
          completedPhases,
          undefined,
          environment,
          "disjoint"
        );
      }
      if (gpu.status === "unavailable" && gpu.reason === "context-lost") {
        return this._createInvalidResult(
          "gpu-timer-context-lost",
          "The WebGL context was lost while GPU timing was active.",
          completedPhases,
          undefined,
          environment
        );
      }
      if (
        gpu.status === "unavailable" &&
        (gpu.reason === "query-result-invalid" || gpu.reason === "query-create-failed")
      ) {
        return this._createInvalidResult(
          "gpu-timer-invalid-result",
          `The WebGL GPU timer failed with ${gpu.reason}.`,
          completedPhases,
          undefined,
          environment
        );
      }
    }
    return Object.freeze({
      valid: true,
      environment,
      instrumentation: createInstrumentation(gpu.status),
      sampling: this._sampling,
      phases,
      comparison,
      gpu,
      engineMemory: memory.engineMemory,
      waterMemory: memory.waterMemory,
      memorySampledAtPhase: memory.sampledAtPhase,
      gate: createWaterOpticsPerformanceGate(target, this._sampling, phases, comparison, gpu)
    });
  }

  private _samplePhase(
    phase: WaterOpticsPerformancePhase,
    opticsEnabled: boolean,
    expectedEnvironment: WaterOpticsPerformanceEnvironment,
    target: WaterOpticsPerformanceGateTarget
  ): Promise<WaterOpticsPerformancePhaseOutcome> {
    const { warmupDurationMs, minimumFrameCount, minimumSampleDurationMs, longFrameThresholdMs, phaseTimeoutMs } =
      this._options;
    let phaseStartedAtMs: number;
    try {
      phaseStartedAtMs = this._dependencies.now();
    } catch (error) {
      return Promise.resolve({
        valid: false,
        reason: "invalid-clock",
        message: `Failed to read the injected clock during ${phase}: ${readErrorMessage(error)}`
      });
    }
    if (!Number.isFinite(phaseStartedAtMs)) {
      return Promise.resolve({
        valid: false,
        reason: "invalid-clock",
        message: `The injected clock returned a non-finite value before ${phase}.`
      });
    }
    const frameIntervals: number[] = [];
    let sampleStartedAtMs: number | undefined;
    let previousFrameAtMs: number | undefined;
    let gpuPhaseSampling = false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: WaterOpticsPerformancePhaseOutcome): void => {
        if (settled) return;
        settled = true;
        if (gpuPhaseSampling) {
          this._dependencies.gpuTimer?.endPhaseSamples(phase);
          gpuPhaseSampling = false;
        }
        resolve(outcome);
      };
      const fail = (reason: WaterOpticsPerformanceInvalidReason, message: string): void => {
        finish({ valid: false, reason, message });
      };
      const scheduleNextFrame = (): void => {
        try {
          this._dependencies.requestAnimationFrame(sampleFrame);
        } catch (error) {
          fail("animation-frame-failed", `requestAnimationFrame failed during ${phase}: ${readErrorMessage(error)}`);
        }
      };
      const sampleFrame = (): void => {
        try {
          if (!this._dependencies.isVisible()) {
            fail("hidden", `The document became hidden during ${phase}.`);
            return;
          }
          const viewport = this._dependencies.getViewportDpr();
          if (!isValidViewportDpr(viewport)) {
            fail("invalid-viewport", `Viewport or devicePixelRatio became invalid during ${phase}.`);
            return;
          }
          if (!viewportDprEquals(viewport, expectedEnvironment)) {
            fail("viewport-changed", `Viewport or devicePixelRatio changed during ${phase}.`);
            return;
          }
          this._dependencies.gpuTimer?.poll();

          const currentTimeMs = this._dependencies.now();
          if (!Number.isFinite(currentTimeMs)) {
            fail("invalid-clock", `The injected clock returned a non-finite value during ${phase}.`);
            return;
          }
          if (currentTimeMs < phaseStartedAtMs) {
            fail("non-monotonic-frame", `The injected clock moved backwards during ${phase}.`);
            return;
          }
          if (currentTimeMs - phaseStartedAtMs > phaseTimeoutMs) {
            fail("phase-timeout", `${phase} exceeded the ${phaseTimeoutMs}ms phase timeout.`);
            return;
          }

          if (sampleStartedAtMs === undefined) {
            if (currentTimeMs - phaseStartedAtMs < warmupDurationMs) {
              scheduleNextFrame();
              return;
            }
            sampleStartedAtMs = currentTimeMs;
            previousFrameAtMs = currentTimeMs;
            this._dependencies.gpuTimer?.beginPhaseSamples(phase);
            gpuPhaseSampling = true;
            scheduleNextFrame();
            return;
          }

          const frameIntervalMs = currentTimeMs - (previousFrameAtMs ?? currentTimeMs);
          if (!Number.isFinite(frameIntervalMs) || frameIntervalMs <= 0) {
            fail("non-monotonic-frame", `Frame timestamps did not advance during ${phase}.`);
            return;
          }
          frameIntervals.push(frameIntervalMs);
          previousFrameAtMs = currentTimeMs;
          const sampleDurationMs = currentTimeMs - sampleStartedAtMs;
          if (frameIntervals.length < minimumFrameCount || sampleDurationMs < minimumSampleDurationMs) {
            scheduleNextFrame();
            return;
          }

          const opticsState = this._dependencies.getOpticsStateSnapshot();
          const counts = [
            opticsState.cameraDepthCopyPassCount,
            opticsState.cameraOpaqueCopyPassCount,
            opticsState.planarCameraCount,
            opticsState.livePlanarRenderTargetCount
          ];
          const expectedCameraCopyPassCount = opticsEnabled ? 1 : 0;
          const expectedPlanarResourceCount = opticsEnabled && target.reflectionSource === "planar" ? 1 : 0;
          if (
            opticsState.refractionEnabled !== opticsEnabled ||
            counts.some((value) => !Number.isInteger(value) || value < 0) ||
            opticsState.cameraDepthCopyPassCount !== expectedCameraCopyPassCount ||
            opticsState.cameraOpaqueCopyPassCount !== expectedCameraCopyPassCount ||
            opticsState.planarCameraCount !== expectedPlanarResourceCount ||
            opticsState.livePlanarRenderTargetCount !== expectedPlanarResourceCount
          ) {
            fail(
              "phase-transition-failed",
              `${phase} runtime state did not match the requested optics state: ${JSON.stringify(opticsState)}.`
            );
            return;
          }
          const longFrameCount = frameIntervals.filter((interval) => interval > longFrameThresholdMs).length;
          finish({
            valid: true,
            metrics: Object.freeze({
              phase,
              opticsEnabled,
              warmupDurationMs: sampleStartedAtMs - phaseStartedAtMs,
              sampleDurationMs,
              frameCount: frameIntervals.length,
              fps: (frameIntervals.length * 1000) / sampleDurationMs,
              frameP50Ms: waterOpticsNearestRankPercentile(frameIntervals, 0.5),
              frameP95Ms: waterOpticsNearestRankPercentile(frameIntervals, 0.95),
              frameMaxMs: Math.max(...frameIntervals),
              longFrameThresholdMs,
              longFrameCount,
              longFrameRatio: longFrameCount / frameIntervals.length,
              opticsState: Object.freeze({ ...opticsState })
            })
          });
        } catch (error) {
          fail("environment-read-failed", `Failed to sample ${phase}: ${readErrorMessage(error)}`);
        }
      };

      scheduleNextFrame();
    });
  }

  private _drainGpuTimer(gpuTimer: Pick<WaterGpuTimer, "pendingQueryCount" | "poll">): Promise<boolean> {
    if (gpuTimer.pendingQueryCount === 0) return Promise.resolve(true);
    let frameCount = 0;
    const startedAtMs = this._dependencies.now();
    return new Promise((resolve) => {
      const poll = (): void => {
        gpuTimer.poll();
        if (gpuTimer.pendingQueryCount === 0) {
          resolve(true);
          return;
        }
        frameCount++;
        const elapsedMs = this._dependencies.now() - startedAtMs;
        if (frameCount >= GPU_QUERY_DRAIN_MAXIMUM_FRAME_COUNT || elapsedMs >= GPU_QUERY_DRAIN_TIMEOUT_MS) {
          resolve(false);
          return;
        }
        try {
          this._dependencies.requestAnimationFrame(poll);
        } catch {
          resolve(false);
        }
      };
      poll();
    });
  }

  private _captureEnvironment(): WaterOpticsPerformanceEnvironment {
    const sampledAtMs = this._dependencies.now();
    if (!Number.isFinite(sampledAtMs)) throw new Error("The injected clock must return a finite value.");
    const viewport = this._dependencies.getViewportDpr();
    const runtime = this._dependencies.getRuntimeEnvironment();
    if (!runtime.browser.trim()) throw new Error("The browser environment description must not be empty.");
    if (!runtime.capturedAtIso.trim()) throw new Error("The environment capture timestamp must not be empty.");
    if (runtime.gpuRendererStatus === "available" && !runtime.gpuRenderer?.trim()) {
      throw new Error("An available GPU renderer must include a non-empty renderer string.");
    }
    return Object.freeze({ ...viewport, ...runtime, sampledAtMs });
  }

  private _createInvalidResult(
    reason: WaterOpticsPerformanceInvalidReason,
    message: string,
    completedPhases: WaterOpticsCompletedPhaseMetrics,
    failedPhase?: WaterOpticsPerformancePhase,
    environment?: WaterOpticsPerformanceEnvironment,
    gpuTimerStatus: WaterOpticsPerformanceInstrumentation["gpuTimerStatus"] = "unavailable"
  ): WaterOpticsPerformanceInvalidResult {
    return Object.freeze({
      valid: false,
      reason,
      message,
      failedPhase,
      environment,
      instrumentation: createInstrumentation(gpuTimerStatus),
      sampling: this._sampling,
      completedPhases: Object.freeze({ ...completedPhases })
    });
  }
}
