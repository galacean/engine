import { Color, Vector3 } from "@galacean/engine-math";
import type { Entity } from "../../Entity";
import type { Scene } from "../../Scene";
import { ShadowType } from "../../shadow/enum/ShadowType";
import { DirectLight } from "../DirectLight";
import type { DayNightState } from "./DayNightProfile";
import { DayNightSolarTransmittance } from "./DayNightSolarTransmittance";

/** Rendering calibration for the engine-level Moon light and sky disk. */
export interface DayNightMoonLightingOptions {
  entityName?: string;
  /** Whether to create a dedicated surface DirectLight. Disable when one shared scene light is driven by both celestials. */
  createDirectLight?: boolean;
  /** Renderer-calibrated full-Moon direct-light intensity. */
  fullMoonIntensity?: number;
  /** Linear full-Moon source color before atmospheric transmission. */
  color?: Color;
  /** Visible lunar-disk radiance before atmospheric extinction. */
  diskIntensity?: number;
  /** Maps direct Moon energy into the procedural atmosphere. */
  atmosphereIntensityScale?: number;
  /** Elevation used as the unit atmospheric-transmission reference. */
  referenceElevation?: number;
  /** Artistic apparent-size multiplier that does not change lunar geometry. */
  angularScale?: number;
  /** Moon shadows are disabled by default for the mobile-oriented runtime. */
  shadowType?: ShadowType;
}

/** Lunar values shared by the visible sky and diagnostics. */
export interface DayNightMoonLightingState {
  readonly direction: Vector3;
  readonly color: Color;
  readonly directIntensity: number;
  readonly diskIntensity: number;
  readonly atmosphereIntensity: number;
  readonly illuminatedFraction: number;
  readonly angularRadius: number;
}

/** Owns one physically directed Moon light driven by {@link DayNightState}. */
export class DayNightMoonLighting {
  private static readonly _up = new Vector3(0, 1, 0);

  readonly entity: Entity | null;
  readonly light: DirectLight | null;
  readonly options: Required<DayNightMoonLightingOptions>;

  private readonly _initialCullingMask: number;
  private readonly _transmittance: DayNightSolarTransmittance;
  private readonly _transmission = new Color(1, 1, 1, 1);
  private readonly _target = new Vector3();
  private readonly _state: DayNightMoonLightingState = {
    direction: new Vector3(0, -1, 0),
    color: new Color(1, 1, 1, 1),
    directIntensity: 0,
    diskIntensity: 0,
    atmosphereIntensity: 0,
    illuminatedFraction: 0,
    angularRadius: 0.00465
  };
  private _destroyed = false;

  constructor(scene: Scene, options: DayNightMoonLightingOptions = {}) {
    this.options = {
      entityName: options.entityName ?? "DayNight Moon",
      createDirectLight: options.createDirectLight ?? true,
      fullMoonIntensity: options.fullMoonIntensity ?? 0.08,
      color: options.color?.clone() ?? new Color(1, 1, 1, 1),
      diskIntensity: options.diskIntensity ?? 1.8,
      atmosphereIntensityScale: options.atmosphereIntensityScale ?? 8,
      referenceElevation: options.referenceElevation ?? 60,
      angularScale: options.angularScale ?? 1.75,
      shadowType: options.shadowType ?? ShadowType.None
    };
    this._transmittance = new DayNightSolarTransmittance({
      referenceElevation: this.options.referenceElevation
    });

    if (this.options.createDirectLight) {
      const entity = (this.entity = scene.createRootEntity(this.options.entityName));
      const light = (this.light = entity.addComponent(DirectLight));
      this._initialCullingMask = light.cullingMask;
      light.shadowType = this.options.shadowType;
      light.shadowStrength = 0;
    } else {
      this.entity = null;
      this.light = null;
      this._initialCullingMask = 0;
    }
  }

  /** Applies one astronomical lunar state and returns the matching sky-render state. */
  applyDayNightState(state: Readonly<DayNightState>): DayNightMoonLightingState {
    this._assertAlive();
    const transmission = this._transmittance.evaluate(state.moonElevation, this._transmission);
    const baseColor = this.options.color;
    const red = baseColor.r * transmission.r;
    const green = baseColor.g * transmission.g;
    const blue = baseColor.b * transmission.b;
    const transmittedEnergy = Math.max(0, red, green, blue);
    const moonState = this._state as Writable<DayNightMoonLightingState>;
    if (transmittedEnergy > 0) {
      const inverseEnergy = 1 / transmittedEnergy;
      moonState.color.set(red * inverseEnergy, green * inverseEnergy, blue * inverseEnergy, 1);
    } else {
      moonState.color.set(1, 1, 1, 1);
    }

    const phaseBrightness = clamp01(state.moonPhaseBrightness);
    const directIntensity = this.options.fullMoonIntensity * phaseBrightness * transmittedEnergy;
    moonState.directIntensity = directIntensity;
    // The shader derives the illuminated disk per pixel from Sun/Moon geometry.
    // Applying aggregate phase brightness here would count the phase twice.
    moonState.diskIntensity = this.options.diskIntensity * transmittedEnergy;
    moonState.atmosphereIntensity = directIntensity * this.options.atmosphereIntensityScale;
    moonState.illuminatedFraction = clamp01(state.moonIlluminatedFraction);
    moonState.angularRadius = state.moonAngularRadius * this.options.angularScale;
    Vector3.scale(state.moonDirection, -1, moonState.direction);

    const light = this.light;
    if (light) {
      light.enabled = true;
      light.color.set(
        moonState.color.r * directIntensity,
        moonState.color.g * directIntensity,
        moonState.color.b * directIntensity,
        1
      );
      const transform = light.entity.transform;
      Vector3.add(transform.worldPosition, state.moonDirection, this._target);
      transform.lookAt(this._target, DayNightMoonLighting._up);
    }
    return this._state;
  }

  /** Includes or excludes Moon surface lighting without changing shader variants. */
  setDirectVisible(visible: boolean): void {
    this._assertAlive();
    if (this.light) this.light.cullingMask = visible ? this._initialCullingMask : 0;
  }

  /** Returns the allocation-free render state reused by this adapter. */
  getState(): Readonly<DayNightMoonLightingState> {
    this._assertAlive();
    return this._state;
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this.entity?.destroy();
    this._destroyed = true;
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("DayNightMoonLighting has been destroyed.");
    }
  }
}

type Writable<T> = { -readonly [Property in keyof T]: T[Property] };

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
