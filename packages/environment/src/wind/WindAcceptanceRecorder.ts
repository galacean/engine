export type WindAcceptanceRecorderState = "idle" | "recording" | "complete";

export interface WindAcceptanceThresholds {
  /** A verdict is provisional until this many real frames have been captured. */
  readonly minimumFrames: number;
  /** Mobile P3 default: the 95th-percentile frame must remain inside a 30 FPS budget. */
  readonly maximumP95FrameTimeMs: number;
  /** Consumer-unit change per second; configured per response family. */
  readonly maximumResponseRate: number;
  /** Per-frame response turn while both adjacent samples are above the speed floor. */
  readonly maximumDirectionChangeDegrees: number;
  readonly directionSpeedFloor: number;
  /** Rejects disconnected consumers that never produce a perceptible response. */
  readonly minimumPeakResponseSpeed: number;
  /** Rejects a static response that does not distinguish breeze from gale. */
  readonly minimumResponseSpeedRange: number;
  /** The reversal phase must create real, gradual directional travel rather than a frozen vector. */
  readonly minimumCumulativeDirectionChangeDegrees: number;
  /** Optional receiver-pose gates. Omitted for consumers without an authored pose response. */
  readonly maximumPoseStepRadians?: number;
  readonly maximumPoseRateRadiansPerSecond?: number;
  readonly maximumPoseAccelerationRadiansPerSecondSquared?: number;
}

export interface WindAcceptanceFrameInput {
  readonly timeSeconds: number;
  readonly deltaTimeSeconds: number;
  readonly inputVelocityWS: readonly [number, number, number];
  readonly responseVelocityWS: readonly [number, number, number];
  /** Normalized receiver pose used to detect visible one-frame snaps independently of response load. */
  readonly poseQuaternion?: readonly [number, number, number, number];
  readonly label?: string;
}

export interface WindAcceptanceFrame {
  readonly index: number;
  readonly timeSeconds: number;
  readonly deltaTimeSeconds: number;
  readonly frameTimeMs: number;
  readonly inputVelocityWS: readonly [number, number, number];
  readonly responseVelocityWS: readonly [number, number, number];
  readonly inputSpeed: number;
  readonly responseSpeed: number;
  readonly responseStep: number;
  readonly responseRate: number;
  readonly directionChangeDegrees: number;
  readonly poseQuaternion: readonly [number, number, number, number] | null;
  readonly poseStepRadians: number;
  readonly poseRateRadiansPerSecond: number;
  readonly poseAccelerationRadiansPerSecondSquared: number;
  readonly label: string;
}

export interface WindAcceptanceCheck {
  readonly passed: boolean;
  readonly actual: number;
  readonly limit: number;
}

export interface WindAcceptanceSummary {
  readonly state: WindAcceptanceRecorderState;
  readonly frameCount: number;
  readonly retainedFrameCount: number;
  readonly durationSeconds: number;
  readonly averageFps: number;
  readonly p95FrameTimeMs: number;
  readonly maximumFrameTimeMs: number;
  readonly maximumResponseStep: number;
  readonly maximumResponseRate: number;
  readonly maximumDirectionChangeDegrees: number;
  readonly minimumResponseSpeed: number;
  readonly maximumResponseSpeed: number;
  readonly responseSpeedRange: number;
  readonly cumulativeDirectionChangeDegrees: number;
  readonly maximumPoseStepRadians: number;
  readonly maximumPoseRateRadiansPerSecond: number;
  readonly maximumPoseAccelerationRadiansPerSecondSquared: number;
  readonly invalidFrameCount: number;
  readonly provisional: boolean;
  readonly passed: boolean;
  readonly checks: {
    readonly sampleCount: WindAcceptanceCheck;
    readonly frameTime: WindAcceptanceCheck;
    readonly responseRate: WindAcceptanceCheck;
    readonly directionContinuity: WindAcceptanceCheck;
    readonly responseActivity: WindAcceptanceCheck;
    readonly responseDynamicRange: WindAcceptanceCheck;
    readonly directionalTravel: WindAcceptanceCheck;
    readonly finiteValues: WindAcceptanceCheck;
    readonly poseStep: WindAcceptanceCheck | null;
    readonly poseRate: WindAcceptanceCheck | null;
    readonly poseAcceleration: WindAcceptanceCheck | null;
  };
}

export interface WindAcceptanceRecording {
  readonly summary: WindAcceptanceSummary;
  readonly frames: readonly WindAcceptanceFrame[];
}

export const DEFAULT_WIND_ACCEPTANCE_THRESHOLDS: Readonly<WindAcceptanceThresholds> = Object.freeze({
  minimumFrames: 120,
  maximumP95FrameTimeMs: 33.4,
  maximumResponseRate: 24,
  maximumDirectionChangeDegrees: 35,
  directionSpeedFloor: 0.2,
  minimumPeakResponseSpeed: 0,
  minimumResponseSpeedRange: 0,
  minimumCumulativeDirectionChangeDegrees: 0
});

/**
 * Opt-in bounded frame recorder shared by every wind acceptance scene.
 *
 * It deliberately allocates only while recording. Production frame loops pay one boolean branch;
 * the retained frames are detached so browser automation can inspect them without engine objects.
 */
export class WindAcceptanceRecorder {
  private readonly _thresholds: WindAcceptanceThresholds;
  private readonly _capacity: number;
  private readonly _frames: Array<WindAcceptanceFrame | undefined>;
  private _state: WindAcceptanceRecorderState = "idle";
  private _writeIndex = 0;
  private _retainedCount = 0;
  private _frameCount = 0;
  private _invalidFrameCount = 0;
  private _durationSeconds = 0;
  private _previousResponse: [number, number, number] | null = null;
  private _previousPose: [number, number, number, number] | null = null;
  private _previousPoseAngularVelocity: [number, number, number] | null = null;

  constructor(thresholds: Readonly<Partial<WindAcceptanceThresholds>> = {}, capacity = 900) {
    this._thresholds = { ...DEFAULT_WIND_ACCEPTANCE_THRESHOLDS, ...thresholds };
    validateThresholds(this._thresholds);
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError("Wind acceptance recorder capacity must be a positive safe integer");
    }
    this._capacity = capacity;
    this._frames = new Array<WindAcceptanceFrame | undefined>(capacity);
  }

  get state(): WindAcceptanceRecorderState {
    return this._state;
  }

  start(): void {
    this.clear();
    this._state = "recording";
  }

  stop(): WindAcceptanceRecording {
    if (this._state === "recording") this._state = "complete";
    return this.getRecording();
  }

  clear(): void {
    this._frames.fill(undefined);
    this._state = "idle";
    this._writeIndex = 0;
    this._retainedCount = 0;
    this._frameCount = 0;
    this._invalidFrameCount = 0;
    this._durationSeconds = 0;
    this._previousResponse = null;
    this._previousPose = null;
    this._previousPoseAngularVelocity = null;
  }

  record(input: Readonly<WindAcceptanceFrameInput>): void {
    if (this._state !== "recording") return;
    if (!isFiniteFrameInput(input)) {
      this._invalidFrameCount++;
      return;
    }
    const deltaTime = input.deltaTimeSeconds;
    const response: [number, number, number] = [...input.responseVelocityWS];
    const previous = this._previousResponse;
    const responseStep = previous ? distance(previous, response) : 0;
    const responseRate = deltaTime > 0 ? responseStep / deltaTime : 0;
    const directionChangeDegrees = previous
      ? directionChange(previous, response, this._thresholds.directionSpeedFloor)
      : 0;
    const pose = input.poseQuaternion ? normalizedQuaternion(input.poseQuaternion) : null;
    const poseMotion =
      pose && this._previousPose ? quaternionMotion(this._previousPose, pose, deltaTime) : ZERO_POSE_MOTION;
    const poseAcceleration =
      poseMotion.angularVelocity && this._previousPoseAngularVelocity && deltaTime > 0
        ? distance(this._previousPoseAngularVelocity, poseMotion.angularVelocity) / deltaTime
        : 0;
    const frame: WindAcceptanceFrame = Object.freeze({
      index: this._frameCount,
      timeSeconds: input.timeSeconds,
      deltaTimeSeconds: deltaTime,
      frameTimeMs: deltaTime * 1000,
      inputVelocityWS: Object.freeze([...input.inputVelocityWS] as [number, number, number]),
      responseVelocityWS: Object.freeze(response),
      inputSpeed: length(input.inputVelocityWS),
      responseSpeed: length(response),
      responseStep,
      responseRate,
      directionChangeDegrees,
      poseQuaternion: pose ? Object.freeze(pose) : null,
      poseStepRadians: poseMotion.stepRadians,
      poseRateRadiansPerSecond: poseMotion.rateRadiansPerSecond,
      poseAccelerationRadiansPerSecondSquared: poseAcceleration,
      label: input.label ?? ""
    });
    this._frames[this._writeIndex] = frame;
    this._writeIndex = (this._writeIndex + 1) % this._capacity;
    this._retainedCount = Math.min(this._capacity, this._retainedCount + 1);
    this._frameCount++;
    this._durationSeconds += deltaTime;
    this._previousResponse = response;
    this._previousPose = pose;
    this._previousPoseAngularVelocity = poseMotion.angularVelocity;
  }

  getRecording(): WindAcceptanceRecording {
    const frames = this._orderedFrames();
    return Object.freeze({
      summary: this._summarize(frames),
      frames: Object.freeze(frames)
    });
  }

  getSummary(): WindAcceptanceSummary {
    return this._summarize(this._orderedFrames());
  }

  private _orderedFrames(): WindAcceptanceFrame[] {
    const result: WindAcceptanceFrame[] = [];
    const start = this._retainedCount === this._capacity ? this._writeIndex : 0;
    for (let offset = 0; offset < this._retainedCount; offset++) {
      const frame = this._frames[(start + offset) % this._capacity];
      if (frame) result.push(frame);
    }
    return result;
  }

  private _summarize(frames: readonly WindAcceptanceFrame[]): WindAcceptanceSummary {
    const frameTimes = frames.map((frame) => frame.frameTimeMs).sort((left, right) => left - right);
    const p95Index = Math.max(0, Math.ceil(frameTimes.length * 0.95) - 1);
    const p95FrameTimeMs = frameTimes[p95Index] ?? 0;
    const maximumFrameTimeMs = maximum(frames, (frame) => frame.frameTimeMs);
    const maximumResponseStep = maximum(frames, (frame) => frame.responseStep);
    const maximumResponseRate = maximum(frames, (frame) => frame.responseRate);
    const maximumDirectionChangeDegrees = maximum(frames, (frame) => frame.directionChangeDegrees);
    const minimumResponseSpeed = minimum(frames, (frame) => frame.responseSpeed);
    const maximumResponseSpeed = maximum(frames, (frame) => frame.responseSpeed);
    const responseSpeedRange = Math.max(0, maximumResponseSpeed - minimumResponseSpeed);
    const cumulativeDirectionChangeDegrees = frames.reduce((sum, frame) => sum + frame.directionChangeDegrees, 0);
    const maximumPoseStepRadians = maximum(frames, (frame) => frame.poseStepRadians);
    const maximumPoseRateRadiansPerSecond = maximum(frames, (frame) => frame.poseRateRadiansPerSecond);
    const maximumPoseAccelerationRadiansPerSecondSquared = maximum(
      frames,
      (frame) => frame.poseAccelerationRadiansPerSecondSquared
    );
    const sampleCount = check(this._frameCount, this._thresholds.minimumFrames, "minimum");
    const frameTime = check(p95FrameTimeMs, this._thresholds.maximumP95FrameTimeMs, "maximum");
    const responseRate = check(maximumResponseRate, this._thresholds.maximumResponseRate, "maximum");
    const directionContinuity = check(
      maximumDirectionChangeDegrees,
      this._thresholds.maximumDirectionChangeDegrees,
      "maximum"
    );
    const responseActivity = check(maximumResponseSpeed, this._thresholds.minimumPeakResponseSpeed, "minimum");
    const responseDynamicRange = check(responseSpeedRange, this._thresholds.minimumResponseSpeedRange, "minimum");
    const directionalTravel = check(
      cumulativeDirectionChangeDegrees,
      this._thresholds.minimumCumulativeDirectionChangeDegrees,
      "minimum"
    );
    const finiteValues = check(this._invalidFrameCount, 0, "maximum");
    const poseStep = optionalMaximumCheck(maximumPoseStepRadians, this._thresholds.maximumPoseStepRadians);
    const poseRate = optionalMaximumCheck(
      maximumPoseRateRadiansPerSecond,
      this._thresholds.maximumPoseRateRadiansPerSecond
    );
    const poseAcceleration = optionalMaximumCheck(
      maximumPoseAccelerationRadiansPerSecondSquared,
      this._thresholds.maximumPoseAccelerationRadiansPerSecondSquared
    );
    const provisional = !sampleCount.passed;
    const passed =
      !provisional &&
      frameTime.passed &&
      responseRate.passed &&
      directionContinuity.passed &&
      responseActivity.passed &&
      responseDynamicRange.passed &&
      directionalTravel.passed &&
      finiteValues.passed &&
      poseStep?.passed !== false &&
      poseRate?.passed !== false &&
      poseAcceleration?.passed !== false;
    return Object.freeze({
      state: this._state,
      frameCount: this._frameCount,
      retainedFrameCount: frames.length,
      durationSeconds: this._durationSeconds,
      averageFps: this._durationSeconds > 0 ? this._frameCount / this._durationSeconds : 0,
      p95FrameTimeMs,
      maximumFrameTimeMs,
      maximumResponseStep,
      maximumResponseRate,
      maximumDirectionChangeDegrees,
      minimumResponseSpeed,
      maximumResponseSpeed,
      responseSpeedRange,
      cumulativeDirectionChangeDegrees,
      maximumPoseStepRadians,
      maximumPoseRateRadiansPerSecond,
      maximumPoseAccelerationRadiansPerSecondSquared,
      invalidFrameCount: this._invalidFrameCount,
      provisional,
      passed,
      checks: Object.freeze({
        sampleCount,
        frameTime,
        responseRate,
        directionContinuity,
        responseActivity,
        responseDynamicRange,
        directionalTravel,
        finiteValues,
        poseStep,
        poseRate,
        poseAcceleration
      })
    });
  }
}

function validateThresholds(thresholds: Readonly<WindAcceptanceThresholds>): void {
  if (!Number.isSafeInteger(thresholds.minimumFrames) || thresholds.minimumFrames <= 0) {
    throw new RangeError("Wind acceptance minimumFrames must be a positive safe integer");
  }
  for (const [name, value] of Object.entries(thresholds)) {
    if (name === "minimumFrames") continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`Wind acceptance ${name} must be finite and non-negative`);
    }
  }
}

function isFiniteFrameInput(input: Readonly<WindAcceptanceFrameInput>): boolean {
  const pose = input.poseQuaternion;
  return (
    Number.isFinite(input.timeSeconds) &&
    Number.isFinite(input.deltaTimeSeconds) &&
    input.deltaTimeSeconds >= 0 &&
    input.inputVelocityWS.length === 3 &&
    input.responseVelocityWS.length === 3 &&
    input.inputVelocityWS.every(Number.isFinite) &&
    input.responseVelocityWS.every(Number.isFinite) &&
    (!pose || (pose.length === 4 && pose.every(Number.isFinite) && Math.hypot(...pose) > 1e-8))
  );
}

interface PoseMotion {
  readonly stepRadians: number;
  readonly rateRadiansPerSecond: number;
  readonly angularVelocity: [number, number, number] | null;
}

const ZERO_POSE_MOTION: Readonly<PoseMotion> = Object.freeze({
  stepRadians: 0,
  rateRadiansPerSecond: 0,
  angularVelocity: null
});

function normalizedQuaternion(value: readonly [number, number, number, number]): [number, number, number, number] {
  const inverseLength = 1 / Math.hypot(value[0], value[1], value[2], value[3]);
  return [value[0] * inverseLength, value[1] * inverseLength, value[2] * inverseLength, value[3] * inverseLength];
}

function quaternionMotion(
  previous: readonly [number, number, number, number],
  current: readonly [number, number, number, number],
  deltaTimeSeconds: number
): PoseMotion {
  const [px, py, pz, pw] = previous;
  const [cx, cy, cz, cw] = current;
  let dx = cx * pw - cw * px - cy * pz + cz * py;
  let dy = cy * pw - cw * py - cz * px + cx * pz;
  let dz = cz * pw - cw * pz - cx * py + cy * px;
  let dw = cw * pw + cx * px + cy * py + cz * pz;
  if (dw < 0) {
    dx = -dx;
    dy = -dy;
    dz = -dz;
    dw = -dw;
  }
  const vectorLength = Math.hypot(dx, dy, dz);
  const stepRadians = 2 * Math.atan2(vectorLength, Math.min(1, Math.max(-1, dw)));
  if (deltaTimeSeconds <= 0 || vectorLength <= 1e-12) {
    return { stepRadians, rateRadiansPerSecond: 0, angularVelocity: [0, 0, 0] };
  }
  const rateRadiansPerSecond = stepRadians / deltaTimeSeconds;
  const velocityScale = rateRadiansPerSecond / vectorLength;
  return {
    stepRadians,
    rateRadiansPerSecond,
    angularVelocity: [dx * velocityScale, dy * velocityScale, dz * velocityScale]
  };
}

function optionalMaximumCheck(actual: number, limit: number | undefined): WindAcceptanceCheck | null {
  return limit === undefined ? null : check(actual, limit, "maximum");
}

function check(actual: number, limit: number, mode: "minimum" | "maximum"): WindAcceptanceCheck {
  return Object.freeze({ passed: mode === "minimum" ? actual >= limit : actual <= limit, actual, limit });
}

function maximum<T>(items: readonly T[], select: (item: T) => number): number {
  let result = 0;
  for (const item of items) result = Math.max(result, select(item));
  return result;
}

function minimum<T>(items: readonly T[], select: (item: T) => number): number {
  if (items.length === 0) return 0;
  let result = Number.POSITIVE_INFINITY;
  for (const item of items) result = Math.min(result, select(item));
  return Number.isFinite(result) ? result : 0;
}

function length(value: readonly [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2]);
}

function directionChange(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  speedFloor: number
): number {
  const leftLength = length(left);
  const rightLength = length(right);
  if (leftLength < speedFloor || rightLength < speedFloor) return 0;
  const cosine = Math.min(
    1,
    Math.max(-1, (left[0] * right[0] + left[1] * right[1] + left[2] * right[2]) / (leftLength * rightLength))
  );
  return Math.acos(cosine) * (180 / Math.PI);
}
