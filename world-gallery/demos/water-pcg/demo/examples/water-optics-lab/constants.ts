import { Vector3 } from "@galacean/engine-math";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../../../runtime/optics/WaterOpticalProfile";
import type { WaterOpticsCameraPreset, WaterOpticsPreset, WaterOpticsTier } from "./types";

export const WATER_OPTICS_LAB_ID = "water-optics-lab-primary-pool";
export const WATER_OPTICS_LAB_WIDTH = 24;
export const WATER_OPTICS_LAB_LENGTH = 14;
export const WATER_OPTICS_LAB_SURFACE_Y = 0;
export const WATER_OPTICS_LAB_SURFACE_TIME = 12.5;
export const WATER_OPTICS_LAB_DEPTHS = Object.freeze([0.6, 1.6, 2.8] as const);
export const WATER_OPTICS_LAB_REFERENCE_VIEWPORT = Object.freeze({ width: 1280, height: 720, dpr: 1 });
export const WATER_OPTICS_FREE_CAMERA_MOVEMENT_SPEED = 5;
export const WATER_OPTICS_LEGACY_RENDER_PRIORITY = 0;
export const WATER_OPTICS_PRECOMPOSED_RENDER_PRIORITY = -100;
export const WATER_OPTICS_LAB_LOCAL_FOAM_MASK = Object.freeze({
  centerXZ: Object.freeze([-6, 1.5] as const),
  halfSizeXZ: Object.freeze([3.25, 4.25] as const),
  featherMeters: 0.45
});
export const WATER_OPTICS_LAB_REFLECTOR_MOTION = Object.freeze({
  centerX: 0,
  halfTravelX: 7.5,
  positionY: 0.62,
  positionZ: -7.85,
  angularRate: 0.52
});

/**
 * Golden-scene calibration profile. It keeps the shared physical medium facts
 * and raises only the documented artistic multipliers so 8-bit screenshots
 * retain a measurable Refraction/Probe signal. Engine defaults remain intact.
 */
export const WATER_OPTICS_LAB_OPTICAL_PROFILE: WaterOpticalProfile = Object.freeze({
  ...DEFAULT_WATER_OPTICAL_PROFILE,
  refractionStrength: 4,
  reflectionIntensity: 2
});

/** Explicit P0 calibration medium: D must reach Final without optical or reflected energy. */
export const WATER_OPTICS_PURE_TRANSMISSION_PROFILE: WaterOpticalProfile = Object.freeze({
  ...WATER_OPTICS_LAB_OPTICAL_PROFILE,
  absorptionCoefficient: Object.freeze([0, 0, 0] as const),
  scatteringColor: Object.freeze([0, 0, 0] as const),
  scatteringCoefficient: 0,
  indexOfRefraction: 1,
  reflectionIntensity: 0
});

export const WATER_OPTICS_LAB_DEFAULTS = Object.freeze({
  tier: "high" as WaterOpticsTier,
  preset: "refraction-correctness" as WaterOpticsPreset,
  cameraPreset: "overview" as WaterOpticsCameraPreset,
  reflectionMode: "planar" as const,
  planarFilterEnabled: true
});

export interface WaterOpticsCameraPose {
  readonly position: Readonly<Vector3>;
  readonly target: Readonly<Vector3>;
  readonly fieldOfView: number;
}

export const WATER_OPTICS_CAMERA_POSES: Readonly<Record<WaterOpticsCameraPreset, WaterOpticsCameraPose>> =
  Object.freeze({
    overview: Object.freeze({
      position: new Vector3(18, 12, 20),
      target: new Vector3(0, -0.8, 0),
      fieldOfView: 42
    }),
    "refraction-edge": Object.freeze({
      position: new Vector3(13.5, 4.8, 10.5),
      target: new Vector3(6, -0.6, 0),
      fieldOfView: 38
    }),
    "depth-steps": Object.freeze({
      position: new Vector3(0, 10.5, 17),
      target: new Vector3(0, -1.1, 0),
      fieldOfView: 36
    }),
    "reflection-front": Object.freeze({
      position: new Vector3(0, 5.6, 18),
      target: new Vector3(0, 1.5, 0),
      fieldOfView: 38
    }),
    "reflection-offscreen": Object.freeze({
      position: new Vector3(-9, 4.4, 13),
      target: new Vector3(1, 0.8, -1),
      fieldOfView: 35
    }),
    "grazing-angle": Object.freeze({
      position: new Vector3(18, 1.7, 18),
      target: new Vector3(0, 0, 0),
      fieldOfView: 34
    }),
    "multi-water": Object.freeze({
      position: new Vector3(0, 22, 38),
      target: new Vector3(0, -0.2, -0.5),
      fieldOfView: 50
    }),
    "multi-pool": Object.freeze({
      position: new Vector3(13.5, 22, 40),
      target: new Vector3(13.5, -0.3, 0),
      fieldOfView: 50
    }),
    "planar-too-close": Object.freeze({
      position: new Vector3(0, 0.01, 10),
      target: new Vector3(0, -1, 0),
      fieldOfView: 45
    }),
    "planar-underwater": Object.freeze({
      position: new Vector3(0, -1, 10),
      target: new Vector3(0, -2, 0),
      fieldOfView: 45
    }),
    "planar-back-facing": Object.freeze({
      position: new Vector3(0, 3, 10),
      target: new Vector3(0, 7, 0),
      fieldOfView: 45
    }),
    "surface-crossing": Object.freeze({
      position: new Vector3(0, 0.12, 8),
      target: new Vector3(0, -0.1, 0),
      fieldOfView: 45
    })
  });

export function parseWaterOpticsTier(value: string | null): WaterOpticsTier {
  return value === "medium" || value === "experimental" || value === "high" ? value : WATER_OPTICS_LAB_DEFAULTS.tier;
}

export function parseWaterOpticsPreset(value: string | null): WaterOpticsPreset {
  const presets: readonly WaterOpticsPreset[] = [
    "refraction-correctness",
    "reflection-correctness",
    "multi-water-arbitration",
    "cross-body-optics",
    "lifecycle-stress",
    "composite-ab",
    "ssr-fallback",
    "temporal-motion",
    "waterline-caustics"
  ];
  return presets.find((preset) => preset === value) ?? WATER_OPTICS_LAB_DEFAULTS.preset;
}
