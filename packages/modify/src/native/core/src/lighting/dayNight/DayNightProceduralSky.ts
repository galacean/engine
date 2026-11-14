import { Vector3 } from "@galacean/engine-math";
import type { Engine } from "../../Engine";
import type { Material } from "../../material/Material";
import type { Mesh } from "../../graphic/Mesh";
import { PrimitiveMesh } from "../../mesh/PrimitiveMesh";
import type { Scene } from "../../Scene";
import { BackgroundMode } from "../../enums/BackgroundMode";
import { SkyProceduralMaterial } from "../../sky/SkyProceduralMaterial";
import type { DayNightState } from "./DayNightProfile";
import type { DayNightMoonLightingState } from "./DayNightMoonLighting";
import type { DayNightSolarPosition } from "./DayNightSolarPosition";

const TAU = Math.PI * 2;
const SIDEREAL_ROTATIONS_PER_SOLAR_DAY = 1.002737909350795;

/** Creates the subdivision sphere used by the default procedural sky. */
export function createDayNightProceduralSkyMesh(engine: Engine): Mesh {
  return PrimitiveMesh.createSubdivisionSurfaceSphere(engine, 0.5, 5);
}

/**
 * Scene-owned procedural sky driven exclusively by {@link DayNightState}.
 *
 * @remarks
 * The sky owns its material and mesh, while the day/night system remains a
 * renderer-independent state producer. Destroying the sky restores the
 * previously authored Scene background.
 */
export class DayNightProceduralSky {
  readonly material: SkyProceduralMaterial;

  private readonly _initialMaterial: Material | null;
  private readonly _initialMesh: Mesh | null;
  private readonly _initialBackgroundMode: BackgroundMode;
  private readonly _ownedMesh: Mesh;
  private _destroyed = false;

  constructor(
    private readonly _scene: Scene,
    private readonly _solarPosition: DayNightSolarPosition,
    resourceName = "DayNightProceduralSky"
  ) {
    const sky = _scene.background.sky;
    this._initialMaterial = sky.material;
    this._initialMesh = sky.mesh;
    this._initialBackgroundMode = _scene.background.mode;

    const material = (this.material = new SkyProceduralMaterial(_scene.engine));
    material.name = resourceName;
    material.starAxis = createCelestialNorthAxis(_solarPosition);

    const ownedMesh = (this._ownedMesh = createDayNightProceduralSkyMesh(_scene.engine));
    ownedMesh.name = `${resourceName}Mesh`;
    sky.mesh = ownedMesh;
    sky.material = material;
    _scene.background.mode = BackgroundMode.Sky;
  }

  /** Applies atmosphere authoring and sidereal star rotation from one shared state. */
  applyDayNightState(state: Readonly<DayNightState>): void {
    this._assertAlive();
    const material = this.material;
    material.skyTint.copyFrom(state.skyTint);
    material.groundTint.copyFrom(state.groundTint);
    material.sunDirection.copyFrom(state.sunDirection);
    material.sunAtmosphereColor.copyFrom(state.sunIrradiance);
    material.exposure = state.skyExposure;
    material.atmosphereThickness = state.atmosphereThickness;

    const solarPosition = this._solarPosition;
    const utcDay = solarPosition.dayOfYear - 1 + (state.timeHours - solarPosition.utcOffset) / 24;
    const localSiderealTurns = utcDay * SIDEREAL_ROTATIONS_PER_SOLAR_DAY + solarPosition.longitude / 360;
    material.starRotation = wrap(localSiderealTurns * TAU, TAU);
  }

  /** Applies lunar disk and atmospheric radiance evaluated by the Moon lighting adapter. */
  applyMoonLighting(state: Readonly<DayNightMoonLightingState>): void {
    this._assertAlive();
    const material = this.material;
    material.moonDirection.copyFrom(state.direction);
    material.moonColor.copyFrom(state.color);
    material.moonDiskIntensity = state.diskIntensity;
    material.moonAtmosphereIntensity = state.atmosphereIntensity;
    material.moonAngularRadius = state.angularRadius;
  }

  /** Restores the authored background and releases runtime-owned resources. */
  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    const sky = this._scene.background.sky;
    if (sky.material === this.material) {
      sky.material = this._initialMaterial!;
    }
    if (sky.mesh === this._ownedMesh) {
      sky.mesh = this._initialMesh!;
    }
    this._scene.background.mode = this._initialBackgroundMode;
    this.material.destroy(true);
    this._ownedMesh.destroy(true);
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("DayNightProceduralSky has been destroyed.");
    }
  }
}

function createCelestialNorthAxis(solarPosition: DayNightSolarPosition): Vector3 {
  const latitude = (solarPosition.latitude * Math.PI) / 180;
  const northOffset = (solarPosition.northOffset * Math.PI) / 180;
  const horizontal = Math.cos(latitude);
  return new Vector3(Math.sin(northOffset) * horizontal, Math.sin(latitude), Math.cos(northOffset) * horizontal);
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}
