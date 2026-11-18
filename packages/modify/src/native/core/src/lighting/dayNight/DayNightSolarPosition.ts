/** Geographic and calendar inputs for one scientific solar trajectory. */
export interface DayNightSolarPositionConfig {
  /** Geographic latitude in degrees, north positive. */
  latitude: number;
  /** Geographic longitude in degrees, east positive. */
  longitude: number;
  /** Civil-time offset from UTC in hours. */
  utcOffset: number;
  /** One-based local calendar day. */
  dayOfYear: number;
  /** Number of days in the configured year. */
  daysInYear?: 365 | 366;
  /** Clockwise rotation from geographic north to the Scene's world north. */
  northOffset?: number;
  /** Whether the standard atmospheric-refraction correction is applied. */
  atmosphericRefraction?: boolean;
}

/** Solar angles evaluated for one local civil time. */
export interface DayNightSolarAngles {
  /** Apparent solar elevation above the astronomical horizon in degrees. */
  elevation: number;
  /** Solar elevation before atmospheric refraction in degrees. */
  geometricElevation: number;
  /** Signed azimuth in degrees, clockwise from Scene north. */
  azimuth: number;
  /** Solar declination in degrees. */
  declination: number;
  /** Signed hour angle in degrees; negative is before solar noon. */
  hourAngle: number;
  /** Equation-of-time correction in minutes. */
  equationOfTime: number;
}

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const MINUTES_PER_DAY = 24 * 60;

/**
 * Computes the sun's apparent horizontal coordinates from civil time and location.
 *
 * @remarks
 * The fractional-year, equation-of-time, and declination equations follow the
 * NOAA general solar-position approximation. The resulting celestial path is
 * determined by geography and calendar inputs rather than authored keyframes.
 */
export class DayNightSolarPosition {
  readonly latitude: number;
  readonly longitude: number;
  readonly utcOffset: number;
  readonly dayOfYear: number;
  readonly daysInYear: 365 | 366;
  readonly northOffset: number;
  readonly atmosphericRefraction: boolean;

  constructor(config: Readonly<DayNightSolarPositionConfig>) {
    const daysInYear = config.daysInYear ?? 365;
    validateRange(config.latitude, -90, 90, "latitude");
    validateRange(config.longitude, -180, 180, "longitude");
    validateRange(config.utcOffset, -14, 14, "UTC offset");
    if (daysInYear !== 365 && daysInYear !== 366) {
      throw new RangeError("DayNightSolarPosition days in year must be 365 or 366.");
    }
    validateRange(config.dayOfYear, 1, daysInYear, "day of year");
    if (!Number.isFinite(config.northOffset ?? 0)) {
      throw new RangeError("DayNightSolarPosition north offset must be finite.");
    }

    this.latitude = config.latitude;
    this.longitude = config.longitude;
    this.utcOffset = config.utcOffset;
    this.dayOfYear = config.dayOfYear;
    this.daysInYear = daysInYear;
    this.northOffset = config.northOffset ?? 0;
    this.atmosphericRefraction = config.atmosphericRefraction ?? true;
  }

  /** Returns the local civil hour at which the Sun crosses the meridian. */
  getSolarNoonHours(): number {
    let localTime = 12;
    const angles = createSolarAngles();
    for (let i = 0; i < 3; i++) {
      const equationOfTime = this.evaluate(localTime, angles).equationOfTime;
      localTime = wrap((720 - 4 * this.longitude - equationOfTime + 60 * this.utcOffset) / 60, 24);
    }
    return localTime;
  }

  /**
   * Evaluates the solar angles at one local civil hour.
   * @param localTimeHours - Local civil time in hours
   * @param out - Receives the evaluated solar angles
   */
  evaluate(localTimeHours: number, out: DayNightSolarAngles = createSolarAngles()): DayNightSolarAngles {
    if (!Number.isFinite(localTimeHours)) {
      throw new RangeError("DayNightSolarPosition local time must be finite.");
    }

    const localTime = wrap(localTimeHours, 24);
    const fractionalYear = ((2 * Math.PI) / this.daysInYear) * (this.dayOfYear - 1 + (localTime - 12) / 24);
    const equationOfTime =
      229.18 *
      (0.000075 +
        0.001868 * Math.cos(fractionalYear) -
        0.032077 * Math.sin(fractionalYear) -
        0.014615 * Math.cos(2 * fractionalYear) -
        0.040849 * Math.sin(2 * fractionalYear));
    const declination =
      0.006918 -
      0.399912 * Math.cos(fractionalYear) +
      0.070257 * Math.sin(fractionalYear) -
      0.006758 * Math.cos(2 * fractionalYear) +
      0.000907 * Math.sin(2 * fractionalYear) -
      0.002697 * Math.cos(3 * fractionalYear) +
      0.00148 * Math.sin(3 * fractionalYear);
    const timeOffset = equationOfTime + 4 * this.longitude - 60 * this.utcOffset;
    const trueSolarMinutes = wrap(localTime * 60 + timeOffset, MINUTES_PER_DAY);
    const hourAngle = trueSolarMinutes / 4 - 180;

    const latitude = this.latitude * DEGREES_TO_RADIANS;
    const hourAngleRadians = hourAngle * DEGREES_TO_RADIANS;
    const sinLatitude = Math.sin(latitude);
    const cosLatitude = Math.cos(latitude);
    const sinDeclination = Math.sin(declination);
    const cosDeclination = Math.cos(declination);
    const cosHourAngle = Math.cos(hourAngleRadians);
    const east = -cosDeclination * Math.sin(hourAngleRadians);
    const north = cosLatitude * sinDeclination - sinLatitude * cosDeclination * cosHourAngle;
    const up = sinLatitude * sinDeclination + cosLatitude * cosDeclination * cosHourAngle;
    const geometricElevation = Math.asin(clamp(up, -1, 1)) * RADIANS_TO_DEGREES;
    const refraction = this.atmosphericRefraction ? getAtmosphericRefraction(geometricElevation) : 0;

    out.elevation = geometricElevation + refraction;
    out.geometricElevation = geometricElevation;
    out.azimuth = wrapSignedDegrees(Math.atan2(east, north) * RADIANS_TO_DEGREES + this.northOffset);
    out.declination = declination * RADIANS_TO_DEGREES;
    out.hourAngle = hourAngle;
    out.equationOfTime = equationOfTime;
    return out;
  }
}

function createSolarAngles(): DayNightSolarAngles {
  return {
    elevation: 0,
    geometricElevation: 0,
    azimuth: 0,
    declination: 0,
    hourAngle: 0,
    equationOfTime: 0
  };
}

function getAtmosphericRefraction(elevation: number): number {
  if (elevation > 85) return 0;
  if (elevation > 5) {
    const tangent = Math.tan(elevation * DEGREES_TO_RADIANS);
    return (58.1 / tangent - 0.07 / tangent ** 3 + 0.000086 / tangent ** 5) / 3600;
  }
  if (elevation > -0.575) {
    return (1735 - 518.2 * elevation + 103.4 * elevation ** 2 - 12.79 * elevation ** 3 + 0.711 * elevation ** 4) / 3600;
  }
  return -20.774 / Math.tan(elevation * DEGREES_TO_RADIANS) / 3600;
}

function validateRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`DayNightSolarPosition ${name} must be within [${minimum}, ${maximum}].`);
  }
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function wrapSignedDegrees(value: number): number {
  return wrap(value + 180, 360) - 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
