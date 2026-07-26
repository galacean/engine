import { Color, Vector3 } from "@galacean/engine-math";

/** Named phases emitted by the day/night state producer. */
export type DayNightPhase = "Dawn" | "Day" | "Dusk" | "Night";

/** A scalar key sampled in normalized day time. */
export interface DayNightCurveKey {
  time: number;
  value: number;
}

/** Scalar interpolation used between authored day/night keys. */
export type DayNightCurveInterpolation = "Linear" | "MonotoneCubic";

/** A linear-space color key sampled in normalized day time. */
export interface DayNightColorKey {
  time: number;
  color: Color;
}

/**
 * Scalar curve for day/night authoring.
 *
 * @remarks
 * `MonotoneCubic` preserves authored extrema and produces continuous first
 * derivatives without overshooting. It is suitable for solar elevation,
 * where a linear curve would reverse velocity abruptly at noon.
 */
export class DayNightCurve {
  private _keys: DayNightCurveKey[] = [];
  private _tangents: number[] = [];

  /** Sorted curve keys. */
  get keys(): readonly DayNightCurveKey[] {
    return this._keys;
  }

  constructor(
    keys: readonly DayNightCurveKey[],
    readonly interpolation: DayNightCurveInterpolation = "Linear"
  ) {
    this.setKeys(keys);
  }

  /** Replace all curve keys. */
  setKeys(keys: readonly DayNightCurveKey[]): void {
    if (keys.length === 0) {
      throw new Error("DayNightCurve requires at least one key.");
    }
    this._keys = keys.map(({ time, value }) => {
      if (!Number.isFinite(time) || !Number.isFinite(value)) {
        throw new Error("DayNightCurve keys must be finite.");
      }
      return { time, value };
    });
    this._keys.sort((left, right) => left.time - right.time);
    validateUniqueKeyTimes(this._keys, "DayNightCurve");
    this._tangents = this.interpolation === "MonotoneCubic" ? createMonotoneCubicTangents(this._keys) : [];
  }

  /** Evaluate the curve without allocating. */
  evaluate(time: number): number {
    const keys = this._keys;
    if (time <= keys[0].time) {
      return keys[0].value;
    }
    for (let i = 1; i < keys.length; i++) {
      const next = keys[i];
      if (time <= next.time) {
        const previous = keys[i - 1];
        const factor = (time - previous.time) / (next.time - previous.time);
        if (this.interpolation === "MonotoneCubic") {
          const duration = next.time - previous.time;
          return evaluateCubicHermite(
            previous.value,
            next.value,
            this._tangents[i - 1],
            this._tangents[i],
            duration,
            factor
          );
        }
        return previous.value + (next.value - previous.value) * factor;
      }
    }
    return keys[keys.length - 1].value;
  }
}

/**
 * Piecewise-linear color gradient.
 *
 * @remarks
 * Keys are treated as linear-space values. Convert authored sRGB colors before
 * constructing the gradient when the source data is stored in sRGB.
 */
export class DayNightColorGradient {
  private _keys: DayNightColorKey[] = [];

  /** Sorted gradient keys. */
  get keys(): readonly DayNightColorKey[] {
    return this._keys;
  }

  constructor(keys: readonly DayNightColorKey[]) {
    this.setKeys(keys);
  }

  /** Replace all gradient keys. */
  setKeys(keys: readonly DayNightColorKey[]): void {
    if (keys.length === 0) {
      throw new Error("DayNightColorGradient requires at least one key.");
    }
    this._keys = keys.map(({ time, color }) => {
      if (!Number.isFinite(time)) {
        throw new Error("DayNightColorGradient key times must be finite.");
      }
      return { time, color: color.clone() };
    });
    this._keys.sort((left, right) => left.time - right.time);
    validateUniqueKeyTimes(this._keys, "DayNightColorGradient");
  }

  /** Evaluate the gradient into `out` without allocating. */
  evaluate(time: number, out: Color): Color {
    const keys = this._keys;
    if (time <= keys[0].time) {
      out.copyFrom(keys[0].color);
      return out;
    }
    for (let i = 1; i < keys.length; i++) {
      const next = keys[i];
      if (time <= next.time) {
        const previous = keys[i - 1];
        const factor = (time - previous.time) / (next.time - previous.time);
        Color.lerp(previous.color, next.color, factor, out);
        return out;
      }
    }
    out.copyFrom(keys[keys.length - 1].color);
    return out;
  }
}

/**
 * Immutable-at-consumption state produced by {@link DayNightSystem}.
 *
 * @remarks
 * The instance is reused on each evaluation to avoid periodic allocations.
 * Consumers that retain it must clone the fields they need.
 */
export interface DayNightState {
  normalizedTime: number;
  timeHours: number;
  phase: DayNightPhase;

  sunElevation: number;
  sunAzimuth: number;
  sunDirection: Vector3;
  sunColor: Color;
  sunIntensity: number;
  shadowStrength: number;

  dayFactor: number;
  twilightFactor: number;
  nightFactor: number;
  environmentBlend: number;

  skyTint: Color;
  groundTint: Color;
  skyExposure: number;
  atmosphereThickness: number;
  ambientIntensity: number;
  iblIntensity: number;

  exposureCompensation: number;
  whiteBalanceTemperature: number;
  whiteBalanceTint: number;
  bloomThreshold: number;

  fogFactor: number;
  fogColor: Color;
  fogDensity: number;
}

/**
 * Authored day/night curves and gradients.
 */
export class DayNightProfile {
  /** +6 degrees by default: fully day-facing environment above this elevation. */
  dayEnvironmentElevation = 6;
  /** -6 degrees by default: fully night-facing environment below this elevation. */
  nightEnvironmentElevation = -6;
  /** Sun intensity is forced to zero at or below this elevation. */
  directSunMinimumElevation = 0;

  sunElevation = new DayNightCurve(
    [
      { time: 0, value: -45 },
      { time: 0.25, value: 0 },
      { time: 0.5, value: 68 },
      { time: 0.75, value: 0 },
      { time: 1, value: -45 }
    ],
    "MonotoneCubic"
  );
  sunAzimuth = new DayNightCurve([
    { time: 0, value: 0 },
    { time: 1, value: 360 }
  ]);
  sunIntensity = new DayNightCurve([
    { time: 0, value: 0 },
    { time: 0.25, value: 0 },
    { time: 0.34, value: 1 },
    { time: 0.66, value: 1 },
    { time: 0.75, value: 0 },
    { time: 1, value: 0 }
  ]);
  shadowStrength = new DayNightCurve([
    { time: 0, value: 0 },
    { time: 0.27, value: 0 },
    { time: 0.34, value: 1 },
    { time: 0.66, value: 1 },
    { time: 0.73, value: 0 },
    { time: 1, value: 0 }
  ]);
  sunColor = new DayNightColorGradient([
    { time: 0, color: new Color(0.18, 0.22, 0.32, 1) },
    { time: 0.25, color: new Color(1, 0.3, 0.08, 1) },
    { time: 0.38, color: new Color(1, 0.78, 0.56, 1) },
    { time: 0.5, color: new Color(1, 0.93, 0.82, 1) },
    { time: 0.62, color: new Color(1, 0.78, 0.56, 1) },
    { time: 0.75, color: new Color(1, 0.24, 0.06, 1) },
    { time: 1, color: new Color(0.18, 0.22, 0.32, 1) }
  ]);

  skyTint = new DayNightColorGradient([
    { time: 0, color: new Color(0.008, 0.018, 0.055, 1) },
    { time: 0.22, color: new Color(0.025, 0.04, 0.12, 1) },
    { time: 0.28, color: new Color(0.55, 0.16, 0.055, 1) },
    { time: 0.38, color: new Color(0.23, 0.43, 0.78, 1) },
    { time: 0.5, color: new Color(0.36, 0.58, 1, 1) },
    { time: 0.62, color: new Color(0.23, 0.43, 0.78, 1) },
    { time: 0.72, color: new Color(0.55, 0.13, 0.04, 1) },
    { time: 0.78, color: new Color(0.025, 0.04, 0.12, 1) },
    { time: 1, color: new Color(0.008, 0.018, 0.055, 1) }
  ]);
  groundTint = new DayNightColorGradient([
    { time: 0, color: new Color(0.008, 0.009, 0.014, 1) },
    { time: 0.25, color: new Color(0.08, 0.025, 0.015, 1) },
    { time: 0.5, color: new Color(0.28, 0.24, 0.18, 1) },
    { time: 0.75, color: new Color(0.07, 0.02, 0.012, 1) },
    { time: 1, color: new Color(0.008, 0.009, 0.014, 1) }
  ]);
  skyExposure = new DayNightCurve([
    { time: 0, value: 0.18 },
    { time: 0.25, value: 0.28 },
    { time: 0.36, value: 1.05 },
    { time: 0.64, value: 1.05 },
    { time: 0.75, value: 0.28 },
    { time: 1, value: 0.18 }
  ]);
  atmosphereThickness = new DayNightCurve([
    { time: 0, value: 1.15 },
    { time: 0.25, value: 1.6 },
    { time: 0.5, value: 1 },
    { time: 0.75, value: 1.6 },
    { time: 1, value: 1.15 }
  ]);
  ambientIntensity = new DayNightCurve([
    { time: 0, value: 0.16 },
    { time: 0.25, value: 0.22 },
    { time: 0.36, value: 1 },
    { time: 0.64, value: 1 },
    { time: 0.75, value: 0.22 },
    { time: 1, value: 0.16 }
  ]);
  iblIntensity = new DayNightCurve([
    { time: 0, value: 0.32 },
    { time: 0.25, value: 0.38 },
    { time: 0.36, value: 1 },
    { time: 0.64, value: 1 },
    { time: 0.75, value: 0.38 },
    { time: 1, value: 0.32 }
  ]);

  exposureCompensation = new DayNightCurve([
    { time: 0, value: 1.1 },
    { time: 0.22, value: 1.1 },
    { time: 0.34, value: 0 },
    { time: 0.66, value: 0 },
    { time: 0.78, value: 1.1 },
    { time: 1, value: 1.1 }
  ]);
  whiteBalanceTemperature = new DayNightCurve([
    { time: 0, value: -12 },
    { time: 0.22, value: -12 },
    { time: 0.28, value: 9 },
    { time: 0.4, value: 0 },
    { time: 0.6, value: 0 },
    { time: 0.72, value: 12 },
    { time: 0.78, value: -12 },
    { time: 1, value: -12 }
  ]);
  whiteBalanceTint = new DayNightCurve([
    { time: 0, value: -2 },
    { time: 0.5, value: 0 },
    { time: 1, value: -2 }
  ]);
  bloomThreshold = new DayNightCurve([
    { time: 0, value: 1.1 },
    { time: 0.25, value: 0.9 },
    { time: 0.5, value: 0.8 },
    { time: 0.75, value: 0.9 },
    { time: 1, value: 1.1 }
  ]);

  fogFactor = new DayNightCurve([
    { time: 0, value: 0.8 },
    { time: 0.25, value: 1 },
    { time: 0.5, value: 0.2 },
    { time: 0.75, value: 1 },
    { time: 1, value: 0.8 }
  ]);
  fogColor = new DayNightColorGradient([
    { time: 0, color: new Color(0.008, 0.014, 0.035, 1) },
    { time: 0.25, color: new Color(0.32, 0.1, 0.045, 1) },
    { time: 0.5, color: new Color(0.42, 0.58, 0.82, 1) },
    { time: 0.75, color: new Color(0.3, 0.08, 0.035, 1) },
    { time: 1, color: new Color(0.008, 0.014, 0.035, 1) }
  ]);
  fogDensity = new DayNightCurve([
    { time: 0, value: 0.008 },
    { time: 0.25, value: 0.012 },
    { time: 0.5, value: 0.002 },
    { time: 0.75, value: 0.012 },
    { time: 1, value: 0.008 }
  ]);

  /** Create a reusable state object initialized from this profile. */
  createState(normalizedTime = 0.5): DayNightState {
    const state: DayNightState = {
      normalizedTime: 0,
      timeHours: 0,
      phase: "Day",
      sunElevation: 0,
      sunAzimuth: 0,
      sunDirection: new Vector3(),
      sunColor: new Color(),
      sunIntensity: 0,
      shadowStrength: 0,
      dayFactor: 0,
      twilightFactor: 0,
      nightFactor: 0,
      environmentBlend: 0,
      skyTint: new Color(),
      groundTint: new Color(),
      skyExposure: 1,
      atmosphereThickness: 1,
      ambientIntensity: 1,
      iblIntensity: 1,
      exposureCompensation: 0,
      whiteBalanceTemperature: 0,
      whiteBalanceTint: 0,
      bloomThreshold: 0.8,
      fogFactor: 0,
      fogColor: new Color(),
      fogDensity: 0
    };
    return this.evaluate(normalizedTime, state);
  }

  /** Evaluate all authored channels into a shared runtime state. */
  evaluate(normalizedTime: number, out: DayNightState): DayNightState {
    normalizedTime = wrap01(normalizedTime);
    const elevation = this.sunElevation.evaluate(normalizedTime);
    const azimuth = this.sunAzimuth.evaluate(normalizedTime);
    const environmentBlend = 1 - smoothstep(this.nightEnvironmentElevation, this.dayEnvironmentElevation, elevation);
    const twilightHalfRange = Math.max(
      Math.abs(this.dayEnvironmentElevation),
      Math.abs(this.nightEnvironmentElevation),
      1e-5
    );

    out.normalizedTime = normalizedTime;
    out.timeHours = normalizedTime * 24;
    out.sunElevation = elevation;
    out.sunAzimuth = azimuth;
    out.phase = getPhase(normalizedTime, elevation, this.nightEnvironmentElevation, this.dayEnvironmentElevation);
    setSunDirection(elevation, azimuth, out.sunDirection);
    this.sunColor.evaluate(normalizedTime, out.sunColor);
    const directSunVisibility =
      elevation <= this.directSunMinimumElevation
        ? 0
        : smoothstep(this.directSunMinimumElevation, this.directSunMinimumElevation + 2, elevation);
    out.sunIntensity = Math.max(0, this.sunIntensity.evaluate(normalizedTime)) * directSunVisibility;
    // Direct-light energy already fades to zero through directSunVisibility.
    // Fading shadow opacity by the same factor exposes occluded surfaces while
    // the sun still carries visible energy, producing a bright flash around
    // sunrise and sunset. Keep authored shadow opacity independent; the
    // lighting adapter disables shadow rendering once the sun energy is zero.
    out.shadowStrength = clamp01(this.shadowStrength.evaluate(normalizedTime));

    out.dayFactor = 1 - environmentBlend;
    out.twilightFactor = 1 - smoothstep(0, twilightHalfRange, Math.abs(elevation));
    out.nightFactor = environmentBlend;
    out.environmentBlend = environmentBlend;

    this.skyTint.evaluate(normalizedTime, out.skyTint);
    this.groundTint.evaluate(normalizedTime, out.groundTint);
    out.skyExposure = Math.max(0, this.skyExposure.evaluate(normalizedTime));
    out.atmosphereThickness = Math.max(0, this.atmosphereThickness.evaluate(normalizedTime));
    out.ambientIntensity = Math.max(0, this.ambientIntensity.evaluate(normalizedTime));
    out.iblIntensity = Math.max(0, this.iblIntensity.evaluate(normalizedTime));

    out.exposureCompensation = this.exposureCompensation.evaluate(normalizedTime);
    out.whiteBalanceTemperature = this.whiteBalanceTemperature.evaluate(normalizedTime);
    out.whiteBalanceTint = this.whiteBalanceTint.evaluate(normalizedTime);
    out.bloomThreshold = Math.max(0, this.bloomThreshold.evaluate(normalizedTime));

    out.fogFactor = clamp01(this.fogFactor.evaluate(normalizedTime));
    this.fogColor.evaluate(normalizedTime, out.fogColor);
    out.fogDensity = Math.max(0, this.fogDensity.evaluate(normalizedTime));
    return out;
  }
}

function validateUniqueKeyTimes(keys: readonly { time: number }[], label: string): void {
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].time === keys[i - 1].time) {
      throw new Error(`${label} key times must be unique.`);
    }
  }
}

function createMonotoneCubicTangents(keys: readonly DayNightCurveKey[]): number[] {
  const keyCount = keys.length;
  if (keyCount === 1) {
    return [0];
  }

  const intervalCount = keyCount - 1;
  const durations = new Array<number>(intervalCount);
  const slopes = new Array<number>(intervalCount);
  for (let i = 0; i < intervalCount; i++) {
    const duration = keys[i + 1].time - keys[i].time;
    durations[i] = duration;
    slopes[i] = (keys[i + 1].value - keys[i].value) / duration;
  }

  if (keyCount === 2) {
    return [slopes[0], slopes[0]];
  }

  const tangents = new Array<number>(keyCount);
  tangents[0] = createEndpointTangent(durations[0], durations[1], slopes[0], slopes[1]);
  for (let i = 1; i < keyCount - 1; i++) {
    const previousSlope = slopes[i - 1];
    const nextSlope = slopes[i];
    if (previousSlope === 0 || nextSlope === 0 || Math.sign(previousSlope) !== Math.sign(nextSlope)) {
      tangents[i] = 0;
      continue;
    }
    const previousDuration = durations[i - 1];
    const nextDuration = durations[i];
    const previousWeight = 2 * nextDuration + previousDuration;
    const nextWeight = nextDuration + 2 * previousDuration;
    tangents[i] = (previousWeight + nextWeight) / (previousWeight / previousSlope + nextWeight / nextSlope);
  }
  tangents[keyCount - 1] = createEndpointTangent(
    durations[intervalCount - 1],
    durations[intervalCount - 2],
    slopes[intervalCount - 1],
    slopes[intervalCount - 2]
  );
  return tangents;
}

function createEndpointTangent(
  adjacentDuration: number,
  nextDuration: number,
  adjacentSlope: number,
  nextSlope: number
): number {
  let tangent =
    ((2 * adjacentDuration + nextDuration) * adjacentSlope - adjacentDuration * nextSlope) /
    (adjacentDuration + nextDuration);
  if (Math.sign(tangent) !== Math.sign(adjacentSlope)) {
    tangent = 0;
  } else if (Math.sign(adjacentSlope) !== Math.sign(nextSlope) && Math.abs(tangent) > Math.abs(3 * adjacentSlope)) {
    tangent = 3 * adjacentSlope;
  }
  return tangent;
}

function evaluateCubicHermite(
  startValue: number,
  endValue: number,
  startTangent: number,
  endTangent: number,
  duration: number,
  factor: number
): number {
  const factorSquared = factor * factor;
  const factorCubed = factorSquared * factor;
  const startValueWeight = 2 * factorCubed - 3 * factorSquared + 1;
  const startTangentWeight = factorCubed - 2 * factorSquared + factor;
  const endValueWeight = -2 * factorCubed + 3 * factorSquared;
  const endTangentWeight = factorCubed - factorSquared;
  return (
    startValueWeight * startValue +
    startTangentWeight * duration * startTangent +
    endValueWeight * endValue +
    endTangentWeight * duration * endTangent
  );
}

function setSunDirection(elevationDegrees: number, azimuthDegrees: number, out: Vector3): void {
  const elevation = (elevationDegrees * Math.PI) / 180;
  const azimuth = (azimuthDegrees * Math.PI) / 180;
  const horizon = Math.cos(elevation);
  out.set(-Math.sin(azimuth) * horizon, -Math.sin(elevation), -Math.cos(azimuth) * horizon);
  out.normalize();
}

function getPhase(
  normalizedTime: number,
  elevation: number,
  nightElevation: number,
  dayElevation: number
): DayNightPhase {
  if (elevation >= dayElevation) {
    return "Day";
  }
  if (elevation <= nightElevation) {
    return "Night";
  }
  return normalizedTime < 0.5 ? "Dawn" : "Dusk";
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const factor = clamp01((value - edge0) / (edge1 - edge0));
  return factor * factor * (3 - 2 * factor);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}
