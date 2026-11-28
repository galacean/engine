import type { VolumetricCloudPalette, VolumetricCloudWeatherSettings } from "@galacean/engine";

/** Named visual states shared by Integrated World and its sky-only presentation. */
export type VolumetricCloudTimelineId = "clear" | "sunset" | "night";

/** Shared astronomical-state response applied after the authored visual timeline. */
export interface VolumetricCloudEnvironmentResponseProfile {
  readonly solarTintStrength: number;
}

export const VOLUMETRIC_CLOUD_DEFAULT_ENVIRONMENT_RESPONSE: Readonly<VolumetricCloudEnvironmentResponseProfile> =
  Object.freeze({
    solarTintStrength: 0.68
  });

/** One authored cloud/sky key evaluated along the astronomical day/night clock. */
export interface VolumetricCloudTimelinePreset extends VolumetricCloudWeatherSettings {
  readonly time: number;
  readonly wind: number;
  readonly palette: VolumetricCloudPalette;
}

/** Shared cloud-color timeline consumed by Integrated World and its presentation-only mirrors. */
export const VOLUMETRIC_CLOUD_TIMELINE_PRESETS: Readonly<
  Record<VolumetricCloudTimelineId, VolumetricCloudTimelinePreset>
> = Object.freeze({
  clear: Object.freeze({
    time: 15.5,
    wind: 0.35,
    coverage: 0.46,
    cloudType: 0.5,
    detail: 0.4,
    palette: Object.freeze({
      zenith: [0.18, 0.48, 0.82] as const,
      horizon: [0.58, 0.79, 0.96] as const,
      cloudLight: [1.12, 1.08, 1] as const,
      cloudShadow: [0.25, 0.31, 0.42] as const,
      storm: 0,
      density: 1.24
    })
  }),
  sunset: Object.freeze({
    time: 17.8,
    wind: 0.3,
    coverage: 0.54,
    cloudType: 0.58,
    detail: 0.5,
    palette: Object.freeze({
      zenith: [0.32, 0.22, 0.52] as const,
      horizon: [1.08, 0.51, 0.28] as const,
      cloudLight: [1.18, 0.72, 0.58] as const,
      cloudShadow: [0.42, 0.22, 0.36] as const,
      storm: 0.08,
      density: 0.86
    })
  }),
  night: Object.freeze({
    time: 22.3,
    wind: 0.22,
    coverage: 0.38,
    cloudType: 0.5,
    detail: 0.58,
    palette: Object.freeze({
      zenith: [0.015, 0.035, 0.09] as const,
      horizon: [0.06, 0.13, 0.23] as const,
      cloudLight: [0.25, 0.38, 0.58] as const,
      cloudShadow: [0.018, 0.03, 0.07] as const,
      storm: 0.08,
      density: 0.68
    })
  })
});

export const VOLUMETRIC_CLOUD_TIMELINE_KEYS: readonly VolumetricCloudTimelineId[] = Object.freeze([
  "clear",
  "sunset",
  "night"
]);

/** Night radiance targets applied after the visual timeline using the scientific solar state. */
export const VOLUMETRIC_CLOUD_NIGHT_PALETTE = Object.freeze({
  zenith: [0.012, 0.025, 0.075] as const,
  horizon: [0.045, 0.09, 0.16] as const,
  cloudLight: [0.17, 0.28, 0.48] as const,
  cloudShadow: [0.012, 0.025, 0.06] as const
});
