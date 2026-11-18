import type { Color } from "@galacean/engine-math";
import type { DayNightMoonPosition } from "./DayNightMoonPosition";
import { DayNightColorGradient, DayNightCurve, DayNightProfile } from "./DayNightProfile";
import type { DayNightSolarPosition } from "./DayNightSolarPosition";
import { DayNightSolarTransmittance } from "./DayNightSolarTransmittance";

/** Scene-authored lighting values interpreted at astronomical solar noon. */
export interface DayNightLightingReference {
  sunIntensity: number;
  sunColor: Color;
  shadowStrength: number;
  ambientIntensity: number;
  iblIntensity: number;
  exposureCompensation: number;
  bloomThreshold: number;
  fogDensity: number;
}

/** Creates a geographically directed profile from one authored lighting reference. */
export function createDayNightProfileFromLightingReference(
  reference: Readonly<DayNightLightingReference>,
  solarPosition: DayNightSolarPosition,
  moonPosition: DayNightMoonPosition | null = null
): DayNightProfile {
  const profile = new DayNightProfile();
  const solarNoonElevation = solarPosition.evaluate(solarPosition.getSolarNoonHours()).elevation;
  profile.solarPosition = solarPosition;
  profile.moonPosition = moonPosition;
  profile.solarTransmittance = new DayNightSolarTransmittance({ referenceElevation: solarNoonElevation });
  profile.sunIntensity = createConstantDayNightCurve(reference.sunIntensity);
  profile.shadowStrength = createConstantDayNightCurve(reference.shadowStrength);
  profile.sunColor = createConstantColorGradient(reference.sunColor);
  profile.ambientIntensity = createConstantDayNightCurve(reference.ambientIntensity);
  profile.iblIntensity = createConstantDayNightCurve(reference.iblIntensity);
  profile.exposureCompensation = createConstantDayNightCurve(reference.exposureCompensation);
  profile.bloomThreshold = createConstantDayNightCurve(reference.bloomThreshold);
  profile.fogFactor = createConstantDayNightCurve(1);
  profile.fogDensity = createConstantDayNightCurve(reference.fogDensity);
  return profile;
}

/** Creates a two-key constant curve without allocation during evaluation. */
export function createConstantDayNightCurve(value: number): DayNightCurve {
  return new DayNightCurve([
    { time: 0, value },
    { time: 1, value }
  ]);
}

function createConstantColorGradient(color: Color): DayNightColorGradient {
  return new DayNightColorGradient([
    { time: 0, color },
    { time: 1, color }
  ]);
}
