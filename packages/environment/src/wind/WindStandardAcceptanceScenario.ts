import { WindAcceptanceRecorder, type WindAcceptanceRecording } from "./WindAcceptanceRecorder";

export type WindStandardAcceptancePhaseId =
  | "breeze-baseline"
  | "gale-ramp"
  | "travelling-gust"
  | "direction-reversal"
  | "breeze-recovery";

export interface WindStandardAcceptancePhase {
  readonly id: WindStandardAcceptancePhaseId;
  readonly durationSeconds: number;
  readonly preset: "breeze" | "gale";
  readonly reversed: boolean;
  readonly transitionSeconds: number;
  readonly gustAmplitude?: number;
}

export interface WindStandardAcceptanceControls {
  applyWindState(preset: "breeze" | "gale", reversed: boolean, transitionSeconds: number): void;
  triggerGust(amplitude: number): void;
}

export interface WindStandardAcceptanceScenarioSnapshot {
  readonly state: "idle" | "running" | "complete" | "cancelled";
  readonly phase: WindStandardAcceptancePhaseId | null;
  readonly phaseIndex: number;
  readonly phaseCount: number;
  readonly phaseProgress: number;
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly phaseCoveragePassed: boolean | null;
  readonly passed: boolean | null;
}

export interface WindStandardAcceptanceResult {
  readonly recording: WindAcceptanceRecording;
  readonly phaseFrameCounts: Readonly<Record<WindStandardAcceptancePhaseId, number>>;
  readonly phaseCoveragePassed: boolean;
  readonly passed: boolean;
}

export const STANDARD_WIND_ACCEPTANCE_PHASES: readonly WindStandardAcceptancePhase[] = Object.freeze([
  Object.freeze({
    id: "breeze-baseline",
    durationSeconds: 2,
    preset: "breeze",
    reversed: false,
    transitionSeconds: 0.8
  }),
  Object.freeze({
    id: "gale-ramp",
    durationSeconds: 5,
    preset: "gale",
    reversed: false,
    transitionSeconds: 5
  }),
  Object.freeze({
    id: "travelling-gust",
    durationSeconds: 2,
    preset: "gale",
    reversed: false,
    transitionSeconds: 0,
    gustAmplitude: 0.72
  }),
  Object.freeze({
    id: "direction-reversal",
    durationSeconds: 6,
    preset: "gale",
    reversed: true,
    transitionSeconds: 5
  }),
  Object.freeze({
    id: "breeze-recovery",
    durationSeconds: 6,
    preset: "breeze",
    reversed: false,
    transitionSeconds: 5
  })
]);

/** Retains the entire 21-second protocol through 120 Hz mobile/high-refresh capture. */
export const STANDARD_WIND_ACCEPTANCE_RECORDER_CAPACITY = 3600;

const PHASE_EPSILON_SECONDS = 1e-7;

/**
 * Deterministic, engine-time-driven naturalness protocol shared by every wind consumer scene.
 * It never relies on wall-clock timers, so background throttling cannot change phase coverage.
 */
export class WindStandardAcceptanceScenario {
  private readonly _durationSeconds: number;
  private _state: WindStandardAcceptanceScenarioSnapshot["state"] = "idle";
  private _phaseIndex = -1;
  private _phaseElapsedSeconds = 0;
  private _elapsedSeconds = 0;
  private _completion: Promise<WindStandardAcceptanceResult> | null = null;
  private _resolveCompletion: ((result: WindStandardAcceptanceResult) => void) | null = null;
  private _lastResult: WindStandardAcceptanceResult | null = null;

  constructor(
    private readonly _recorder: WindAcceptanceRecorder,
    private readonly _controls: WindStandardAcceptanceControls,
    private readonly _onChange: (() => void) | null = null,
    private readonly _phases: readonly WindStandardAcceptancePhase[] = STANDARD_WIND_ACCEPTANCE_PHASES
  ) {
    validatePhases(_phases);
    this._durationSeconds = _phases.reduce((sum, phase) => sum + phase.durationSeconds, 0);
  }

  get currentPhaseId(): WindStandardAcceptancePhaseId | null {
    return this._phases[this._phaseIndex]?.id ?? null;
  }

  start(): Promise<WindStandardAcceptanceResult> {
    if (this._state === "running" && this._completion) return this._completion;
    this._recorder.start();
    this._state = "running";
    this._phaseIndex = 0;
    this._phaseElapsedSeconds = 0;
    this._elapsedSeconds = 0;
    this._lastResult = null;
    this._completion = new Promise((resolve) => {
      this._resolveCompletion = resolve;
    });
    this._enterPhase(this._phases[0]);
    this._onChange?.();
    return this._completion;
  }

  update(deltaTimeSeconds: number): void {
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      throw new RangeError("Wind standard acceptance delta time must be finite and non-negative");
    }
    if (this._state !== "running" || deltaTimeSeconds === 0) return;
    let remaining = deltaTimeSeconds;
    while (remaining > 0 && this._state === "running") {
      const phase = this._phases[this._phaseIndex];
      const phaseRemaining = phase.durationSeconds - this._phaseElapsedSeconds;
      const consumed = Math.min(remaining, phaseRemaining);
      this._phaseElapsedSeconds += consumed;
      this._elapsedSeconds += consumed;
      remaining -= consumed;
      if (this._phaseElapsedSeconds + PHASE_EPSILON_SECONDS < phase.durationSeconds) break;
      if (this._phaseIndex + 1 >= this._phases.length) {
        this._finish("complete");
        break;
      }
      this._phaseIndex++;
      this._phaseElapsedSeconds = 0;
      this._enterPhase(this._phases[this._phaseIndex]);
      this._onChange?.();
    }
  }

  cancel(): WindStandardAcceptanceResult {
    if (this._state !== "running") return this._lastResult ?? this._result("cancelled");
    return this._finish("cancelled");
  }

  reset(): void {
    if (this._state === "running") this._finish("cancelled");
    this._recorder.clear();
    this._state = "idle";
    this._phaseIndex = -1;
    this._phaseElapsedSeconds = 0;
    this._elapsedSeconds = 0;
    this._completion = null;
    this._resolveCompletion = null;
    this._lastResult = null;
    this._onChange?.();
  }

  getSnapshot(): WindStandardAcceptanceScenarioSnapshot {
    const phase = this._phases[this._phaseIndex];
    return Object.freeze({
      state: this._state,
      phase: phase?.id ?? null,
      phaseIndex: this._phaseIndex,
      phaseCount: this._phases.length,
      phaseProgress: phase ? Math.min(1, this._phaseElapsedSeconds / phase.durationSeconds) : 0,
      elapsedSeconds: this._elapsedSeconds,
      durationSeconds: this._durationSeconds,
      phaseCoveragePassed: this._lastResult?.phaseCoveragePassed ?? null,
      passed: this._lastResult?.passed ?? null
    });
  }

  private _enterPhase(phase: Readonly<WindStandardAcceptancePhase>): void {
    this._controls.applyWindState(phase.preset, phase.reversed, phase.transitionSeconds);
    if (phase.gustAmplitude !== undefined) this._controls.triggerGust(phase.gustAmplitude);
  }

  private _finish(state: "complete" | "cancelled"): WindStandardAcceptanceResult {
    this._recorder.stop();
    this._state = state;
    this._phaseElapsedSeconds = this._phases[this._phaseIndex]?.durationSeconds ?? 0;
    this._elapsedSeconds = Math.min(this._durationSeconds, this._elapsedSeconds);
    const result = this._result(state);
    this._lastResult = result;
    const resolve = this._resolveCompletion;
    this._resolveCompletion = null;
    resolve?.(result);
    this._onChange?.();
    return result;
  }

  private _result(state: "complete" | "cancelled"): WindStandardAcceptanceResult {
    const recording = this._recorder.getRecording();
    const phaseFrameCounts = Object.fromEntries(this._phases.map((phase) => [phase.id, 0])) as Record<
      WindStandardAcceptancePhaseId,
      number
    >;
    for (const frame of recording.frames) {
      if (frame.label in phaseFrameCounts) {
        phaseFrameCounts[frame.label as WindStandardAcceptancePhaseId]++;
      }
    }
    const phaseCoveragePassed = this._phases.every((phase) => phaseFrameCounts[phase.id] > 0);
    return Object.freeze({
      recording,
      phaseFrameCounts: Object.freeze(phaseFrameCounts),
      phaseCoveragePassed,
      passed: state === "complete" && phaseCoveragePassed && recording.summary.passed
    });
  }
}

function validatePhases(phases: readonly WindStandardAcceptancePhase[]): void {
  if (phases.length === 0) throw new RangeError("Wind standard acceptance requires at least one phase");
  const seen = new Set<WindStandardAcceptancePhaseId>();
  for (const phase of phases) {
    if (seen.has(phase.id)) throw new RangeError(`Duplicate wind acceptance phase: ${phase.id}`);
    seen.add(phase.id);
    if (!Number.isFinite(phase.durationSeconds) || phase.durationSeconds <= 0) {
      throw new RangeError(`Wind acceptance phase ${phase.id} duration must be finite and positive`);
    }
    if (!Number.isFinite(phase.transitionSeconds) || phase.transitionSeconds < 0) {
      throw new RangeError(`Wind acceptance phase ${phase.id} transition must be finite and non-negative`);
    }
    if (phase.gustAmplitude !== undefined && (!Number.isFinite(phase.gustAmplitude) || phase.gustAmplitude < 0)) {
      throw new RangeError(`Wind acceptance phase ${phase.id} gust must be finite and non-negative`);
    }
  }
}
