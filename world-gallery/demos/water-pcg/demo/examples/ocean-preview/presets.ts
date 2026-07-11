/** Ocean CPU-preview fixtures kept separate from river authoring descriptors. */
import type { OceanPreviewConfig } from "./types";

export const curvedMainRiverOceanPreview: OceanPreviewConfig = {
  size: 90,
  resolution: 72,
  waterLevel: 0,
  waveAmplitude: 0.45,
  waveLength: 12,
  waveSpeed: 0.85,
  alpha: 0.72,
  foamIntensity: 1.1,
  oceanColor: "#1c8fc7"
};

export const multiTributaryOceanPreview: OceanPreviewConfig = {
  size: 96,
  resolution: 72,
  waterLevel: -0.05,
  waveAmplitude: 0.36,
  waveLength: 14,
  waveSpeed: 0.72,
  alpha: 0.68,
  foamIntensity: 1.25,
  oceanColor: "#207f9b"
};
