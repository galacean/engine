import { Vector3 } from "@galacean/engine-math";
import { DirectLight } from "../DirectLight";
import type { EnvironmentLighting } from "../environment/EnvironmentLighting";
import type { ProbeVolume } from "../environment/ProbeVolume";
import type { DayNightState } from "./DayNightProfile";
import type { DayNightStateConsumer } from "./DayNightSystem";

/**
 * Applies real-time solar state to an existing directional light.
 *
 * @remarks
 * The light remains registered and retains its shadow type, so time changes do
 * not alter direct-light or shadow shader variants. A zero shadow strength is
 * used to skip shadow-map rendering at night.
 */
export class DayNightLightingAdapter implements DayNightStateConsumer {
  /** Sun intensity below which shadow strength is forced to zero. */
  shadowDisableThreshold = 0.01;

  private static _up = new Vector3(0, 1, 0);
  private _target = new Vector3();

  constructor(readonly light: DirectLight) {}

  applyDayNightState(state: DayNightState): void {
    const light = this.light;
    const intensity = state.sunIntensity <= this.shadowDisableThreshold ? 0 : state.sunIntensity;
    light.color.set(
      state.sunColor.r * intensity,
      state.sunColor.g * intensity,
      state.sunColor.b * intensity,
      state.sunColor.a
    );
    light.shadowStrength = intensity === 0 ? 0 : state.shadowStrength;

    const transform = light.entity.transform;
    Vector3.add(transform.worldPosition, state.sunDirection, this._target);
    transform.lookAt(this._target, DayNightLightingAdapter._up);
  }
}

/** One baked Probe scenario anchored to a local hour in a repeating 24-hour timeline. */
export interface DayNightProbeScenarioKey {
  /** Local hour in the range [0, 24). */
  timeHours: number;
  /** Baked lighting scenario name. */
  scenario: string;
}

/**
 * Blends the two Probe scenarios surrounding the current time.
 *
 * @remarks
 * Scenario changes only happen when time crosses a key. Within a segment, the
 * adapter updates one GPU blend uniform and does not alter Probe chunk
 * residency or shader variants.
 */
export class DayNightProbeTimelineAdapter implements DayNightStateConsumer {
  private _keys: DayNightProbeScenarioKey[];
  private _preparedVolume?: ProbeVolume;
  private _activeScenario = "";
  private _targetScenario = "";
  private _blendFactor = 0;

  constructor(
    readonly environmentLighting: EnvironmentLighting,
    keys: readonly DayNightProbeScenarioKey[]
  ) {
    validateTimelineKeys(keys, "DayNightProbeTimelineAdapter");
    this._keys = keys.map(({ timeHours, scenario }) => {
      return { timeHours, scenario };
    });
    this._keys.sort((left, right) => left.timeHours - right.timeHours);
  }

  /** Active baked scenario selected by the current timeline segment. */
  get activeScenario(): string {
    return this._activeScenario;
  }

  /** Target baked scenario selected by the current timeline segment. */
  get targetScenario(): string {
    return this._targetScenario;
  }

  /** Blend weight from {@link activeScenario} to {@link targetScenario}. */
  get blendFactor(): number {
    return this._blendFactor;
  }

  applyDayNightState(state: DayNightState): void {
    const volume = this.environmentLighting.probeVolume;
    if (!volume) {
      this._preparedVolume = undefined;
      this._activeScenario = "";
      this._targetScenario = "";
      this._blendFactor = 0;
      return;
    }

    if (this._preparedVolume !== volume) {
      const availableScenarios = volume.lightingScenarioNames;
      for (let i = 0; i < this._keys.length; i++) {
        const scenario = this._keys[i].scenario;
        if (!availableScenarios.includes(scenario)) {
          throw new Error(`DayNightProbeTimelineAdapter probe volume does not contain "${scenario}".`);
        }
      }
      this._preparedVolume = volume;
      this._activeScenario = "";
      this._targetScenario = "";
    }

    const segment = getTimelineSegment(this._keys, state.timeHours);
    const pair = {
      activeScenario: this._keys[segment.activeIndex].scenario,
      targetScenario: this._keys[segment.targetIndex].scenario,
      factor: segment.factor
    };
    if (this._activeScenario !== pair.activeScenario || this._targetScenario !== pair.targetScenario) {
      volume.setLightingScenarioBlendPair(pair.activeScenario, pair.targetScenario);
      this._activeScenario = pair.activeScenario;
      this._targetScenario = pair.targetScenario;
    }
    this._blendFactor = pair.factor;
    volume.setLightingScenarioBlendFactor(pair.factor);
  }
}

function validateTimelineKeys(keys: readonly { timeHours: number; scenario: string }[], label: string): void {
  if (keys.length < 2) {
    throw new Error(`${label} requires at least two scenario keys.`);
  }
  const sortedKeys = keys.slice().sort((left, right) => left.timeHours - right.timeHours);
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    if (!Number.isFinite(key.timeHours) || key.timeHours < 0 || key.timeHours >= 24) {
      throw new Error(`${label} key times must be in the range [0, 24).`);
    }
    if (!key.scenario) {
      throw new Error(`${label} scenario names must not be empty.`);
    }
    if (i > 0) {
      if (sortedKeys[i - 1].timeHours === key.timeHours) {
        throw new Error(`${label} key times must be unique.`);
      }
      if (sortedKeys[i - 1].scenario === key.scenario) {
        throw new Error(`${label} adjacent scenario names must differ.`);
      }
    }
  }
  if (sortedKeys[0].scenario === sortedKeys[sortedKeys.length - 1].scenario) {
    throw new Error(`${label} adjacent scenario names must differ across midnight.`);
  }
}

function getTimelineSegment(
  keys: readonly { timeHours: number }[],
  timeHours: number
): { activeIndex: number; targetIndex: number; factor: number } {
  const time = ((timeHours % 24) + 24) % 24;
  let activeIndex = keys.length - 1;
  for (let i = 0; i < keys.length; i++) {
    if (time >= keys[i].timeHours) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const targetIndex = (activeIndex + 1) % keys.length;
  const active = keys[activeIndex];
  const target = keys[targetIndex];
  const endTime = activeIndex === keys.length - 1 ? target.timeHours + 24 : target.timeHours;
  const sampleTime = time < active.timeHours ? time + 24 : time;
  return {
    activeIndex,
    targetIndex,
    factor: (sampleTime - active.timeHours) / (endTime - active.timeHours)
  };
}
