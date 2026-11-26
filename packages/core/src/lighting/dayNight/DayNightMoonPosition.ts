/** Geographic and calendar inputs for one scientific lunar trajectory. */
export interface DayNightMoonPositionConfig {
  /** Gregorian calendar year. */
  year: number;
  /** One-based local calendar day. */
  dayOfYear: number;
  /** Geographic latitude in degrees, north positive. */
  latitude: number;
  /** Geographic longitude in degrees, east positive. */
  longitude: number;
  /** Civil-time offset from UTC in hours. */
  utcOffset: number;
  /** Clockwise rotation from geographic north to the Scene's world north. */
  northOffset?: number;
  /** Whether standard atmospheric refraction is applied to the topocentric elevation. */
  atmosphericRefraction?: boolean;
}

/** Lunar angles and phase evaluated for one local civil time. */
export interface DayNightMoonAngles {
  /** Apparent topocentric lunar elevation in degrees. */
  elevation: number;
  /** Geocentric lunar elevation before parallax and atmospheric refraction, in degrees. */
  geometricElevation: number;
  /** Topocentric lunar elevation before atmospheric refraction, in degrees. */
  topocentricElevation: number;
  /** Signed azimuth in degrees, clockwise from Scene north. */
  azimuth: number;
  /** Geocentric right ascension in degrees. */
  rightAscension: number;
  /** Geocentric declination in degrees. */
  declination: number;
  /** Fraction of the apparent lunar disk illuminated by the Sun. */
  illuminatedFraction: number;
  /** Lambertian full-moon-normalized phase brightness. */
  phaseBrightness: number;
  /** Observer-facing lunar phase angle in degrees, where zero is full moon. */
  phaseAngle: number;
  /** Geocentric distance in Earth equatorial radii. */
  distanceEarthRadii: number;
  /** Apparent lunar angular radius in radians. */
  angularRadius: number;
}

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const MOON_RADIUS_EARTH_RADII = 1737.4 / 6378.137;
const JULIAN_DATE_J2000 = 2451545;
const ORBITAL_EPOCH_JULIAN_DATE = 2451543.5;

/**
 * Computes a low-precision topocentric lunar trajectory and phase from civil time and location.
 *
 * @remarks
 * The compact orbital model retains the principal lunar longitude, latitude, and distance perturbations.
 * Equatorial coordinates are transformed with Greenwich mean sidereal time, then corrected for lunar
 * parallax and optional atmospheric refraction at the observer.
 */
export class DayNightMoonPosition {
  readonly year: number;
  readonly dayOfYear: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly utcOffset: number;
  readonly northOffset: number;
  readonly atmosphericRefraction: boolean;

  /**
   * Creates a lunar-position model.
   * @param config - Gregorian date and observer location used by the lunar trajectory
   */
  constructor(config: Readonly<DayNightMoonPositionConfig>) {
    if (!Number.isInteger(config.year) || config.year < 1900 || config.year > 2100) {
      throw new RangeError("DayNightMoonPosition year must be an integer within [1900, 2100].");
    }
    validateRange(config.latitude, -90, 90, "latitude");
    validateRange(config.longitude, -180, 180, "longitude");
    validateRange(config.utcOffset, -14, 14, "UTC offset");
    validateRange(config.dayOfYear, 1, isLeapYear(config.year) ? 366 : 365, "day of year");
    if (!Number.isFinite(config.northOffset ?? 0)) {
      throw new RangeError("DayNightMoonPosition north offset must be finite.");
    }

    this.year = config.year;
    this.dayOfYear = config.dayOfYear;
    this.latitude = config.latitude;
    this.longitude = config.longitude;
    this.utcOffset = config.utcOffset;
    this.northOffset = config.northOffset ?? 0;
    this.atmosphericRefraction = config.atmosphericRefraction ?? true;
  }

  /**
   * Evaluates lunar position and phase at one local civil hour.
   * @param localTimeHours - Local civil time in hours
   * @param out - Receives the evaluated lunar angles and phase
   * @returns The supplied output object
   */
  evaluate(localTimeHours: number, out: DayNightMoonAngles = createMoonAngles()): DayNightMoonAngles {
    if (!Number.isFinite(localTimeHours)) {
      throw new RangeError("DayNightMoonPosition local time must be finite.");
    }

    const julianDate =
      getGregorianJulianDate(this.year, 1, 1) + (this.dayOfYear - 1) + (localTimeHours - this.utcOffset) / 24;
    const orbitalDays = julianDate - ORBITAL_EPOCH_JULIAN_DATE;
    const sun = evaluateSunOrbit(orbitalDays);
    const moon = evaluateMoonOrbit(orbitalDays, sun.meanAnomaly, sun.eclipticLongitude);
    const obliquity = (23.4393 - 3.563e-7 * orbitalDays) * DEGREES_TO_RADIANS;
    const lunarLongitude = moon.eclipticLongitude * DEGREES_TO_RADIANS;
    const lunarLatitude = moon.eclipticLatitude * DEGREES_TO_RADIANS;
    const longitudeCosine = Math.cos(lunarLongitude);
    const longitudeSine = Math.sin(lunarLongitude);
    const latitudeCosine = Math.cos(lunarLatitude);
    const latitudeSine = Math.sin(lunarLatitude);
    const eclipticX = moon.distanceEarthRadii * longitudeCosine * latitudeCosine;
    const eclipticY = moon.distanceEarthRadii * longitudeSine * latitudeCosine;
    const eclipticZ = moon.distanceEarthRadii * latitudeSine;
    const equatorialX = eclipticX;
    const equatorialY = eclipticY * Math.cos(obliquity) - eclipticZ * Math.sin(obliquity);
    const equatorialZ = eclipticY * Math.sin(obliquity) + eclipticZ * Math.cos(obliquity);
    const rightAscension = Math.atan2(equatorialY, equatorialX);
    const declination = Math.atan2(equatorialZ, Math.hypot(equatorialX, equatorialY));

    const centuriesSinceJ2000 = (julianDate - JULIAN_DATE_J2000) / 36525;
    const greenwichSiderealDegrees = wrap(
      280.46061837 +
        360.98564736629 * (julianDate - JULIAN_DATE_J2000) +
        0.000387933 * centuriesSinceJ2000 * centuriesSinceJ2000 -
        (centuriesSinceJ2000 * centuriesSinceJ2000 * centuriesSinceJ2000) / 38710000,
      360
    );
    const hourAngle = wrapRadians((greenwichSiderealDegrees + this.longitude) * DEGREES_TO_RADIANS - rightAscension);
    const latitude = this.latitude * DEGREES_TO_RADIANS;
    const cosDeclination = Math.cos(declination);
    const east = -cosDeclination * Math.sin(hourAngle);
    const north =
      Math.cos(latitude) * Math.sin(declination) - Math.sin(latitude) * cosDeclination * Math.cos(hourAngle);
    const up = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * cosDeclination * Math.cos(hourAngle);
    const geometricElevationRadians = Math.asin(clamp(up, -1, 1));
    const topocentricElevationRadians = Math.atan2(
      moon.distanceEarthRadii * Math.sin(geometricElevationRadians) - 1,
      moon.distanceEarthRadii * Math.cos(geometricElevationRadians)
    );
    const topocentricElevation = topocentricElevationRadians * RADIANS_TO_DEGREES;
    const refraction = this.atmosphericRefraction ? getAtmosphericRefraction(topocentricElevation) : 0;

    const sunLongitude = sun.eclipticLongitude * DEGREES_TO_RADIANS;
    const solarX = Math.cos(sunLongitude);
    const solarY = Math.sin(sunLongitude) * Math.cos(obliquity);
    const solarZ = Math.sin(sunLongitude) * Math.sin(obliquity);
    const elongation = Math.acos(
      clamp((equatorialX * solarX + equatorialY * solarY + equatorialZ * solarZ) / moon.distanceEarthRadii, -1, 1)
    );
    const phaseAngle = Math.PI - elongation;

    out.elevation = topocentricElevation + refraction;
    out.geometricElevation = geometricElevationRadians * RADIANS_TO_DEGREES;
    out.topocentricElevation = topocentricElevation;
    out.azimuth = wrapSignedDegrees(Math.atan2(east, north) * RADIANS_TO_DEGREES + this.northOffset);
    out.rightAscension = wrap(rightAscension * RADIANS_TO_DEGREES, 360);
    out.declination = declination * RADIANS_TO_DEGREES;
    out.illuminatedFraction = (1 - Math.cos(elongation)) * 0.5;
    out.phaseBrightness = (Math.sin(phaseAngle) + (Math.PI - phaseAngle) * Math.cos(phaseAngle)) / Math.PI;
    out.phaseAngle = phaseAngle * RADIANS_TO_DEGREES;
    out.distanceEarthRadii = moon.distanceEarthRadii;
    out.angularRadius = Math.asin(MOON_RADIUS_EARTH_RADII / moon.distanceEarthRadii);
    return out;
  }
}

interface SunOrbit {
  meanAnomaly: number;
  eclipticLongitude: number;
}

interface MoonOrbit {
  eclipticLongitude: number;
  eclipticLatitude: number;
  distanceEarthRadii: number;
}

function evaluateSunOrbit(orbitalDays: number): SunOrbit {
  const perihelionLongitude = wrap(282.9404 + 4.70935e-5 * orbitalDays, 360);
  const eccentricity = 0.016709 - 1.151e-9 * orbitalDays;
  const meanAnomaly = wrap(356.047 + 0.9856002585 * orbitalDays, 360);
  const eccentricAnomaly =
    meanAnomaly +
    eccentricity * RADIANS_TO_DEGREES * sinDegrees(meanAnomaly) * (1 + eccentricity * cosDegrees(meanAnomaly));
  const orbitalX = cosDegrees(eccentricAnomaly) - eccentricity;
  const orbitalY = Math.sqrt(1 - eccentricity * eccentricity) * sinDegrees(eccentricAnomaly);
  return {
    meanAnomaly,
    eclipticLongitude: wrap(Math.atan2(orbitalY, orbitalX) * RADIANS_TO_DEGREES + perihelionLongitude, 360)
  };
}

function evaluateMoonOrbit(orbitalDays: number, solarMeanAnomaly: number, solarLongitude: number): MoonOrbit {
  const ascendingNodeLongitude = wrap(125.1228 - 0.0529538083 * orbitalDays, 360);
  const inclination = 5.1454;
  const periapsisArgument = wrap(318.0634 + 0.1643573223 * orbitalDays, 360);
  const semiMajorAxis = 60.2666;
  const eccentricity = 0.0549;
  const meanAnomaly = wrap(115.3654 + 13.0649929509 * orbitalDays, 360);
  const eccentricAnomaly =
    meanAnomaly +
    eccentricity * RADIANS_TO_DEGREES * sinDegrees(meanAnomaly) * (1 + eccentricity * cosDegrees(meanAnomaly));
  const orbitalX = semiMajorAxis * (cosDegrees(eccentricAnomaly) - eccentricity);
  const orbitalY = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity) * sinDegrees(eccentricAnomaly);
  let distanceEarthRadii = Math.hypot(orbitalX, orbitalY);
  const trueAnomaly = Math.atan2(orbitalY, orbitalX) * RADIANS_TO_DEGREES;
  const orbitalLongitude = trueAnomaly + periapsisArgument;
  const eclipticX =
    distanceEarthRadii *
    (cosDegrees(ascendingNodeLongitude) * cosDegrees(orbitalLongitude) -
      sinDegrees(ascendingNodeLongitude) * sinDegrees(orbitalLongitude) * cosDegrees(inclination));
  const eclipticY =
    distanceEarthRadii *
    (sinDegrees(ascendingNodeLongitude) * cosDegrees(orbitalLongitude) +
      cosDegrees(ascendingNodeLongitude) * sinDegrees(orbitalLongitude) * cosDegrees(inclination));
  const eclipticZ = distanceEarthRadii * sinDegrees(orbitalLongitude) * sinDegrees(inclination);
  let eclipticLongitude = Math.atan2(eclipticY, eclipticX) * RADIANS_TO_DEGREES;
  let eclipticLatitude = Math.atan2(eclipticZ, Math.hypot(eclipticX, eclipticY)) * RADIANS_TO_DEGREES;
  const meanLongitude = wrap(ascendingNodeLongitude + periapsisArgument + meanAnomaly, 360);
  const elongation = wrap(meanLongitude - solarLongitude, 360);
  const argumentOfLatitude = wrap(meanLongitude - ascendingNodeLongitude, 360);

  eclipticLongitude +=
    -1.274 * sinDegrees(meanAnomaly - 2 * elongation) +
    0.658 * sinDegrees(2 * elongation) -
    0.186 * sinDegrees(solarMeanAnomaly) -
    0.059 * sinDegrees(2 * meanAnomaly - 2 * elongation) -
    0.057 * sinDegrees(meanAnomaly - 2 * elongation + solarMeanAnomaly) +
    0.053 * sinDegrees(meanAnomaly + 2 * elongation) +
    0.046 * sinDegrees(2 * elongation - solarMeanAnomaly) +
    0.041 * sinDegrees(meanAnomaly - solarMeanAnomaly) -
    0.035 * sinDegrees(elongation) -
    0.031 * sinDegrees(meanAnomaly + solarMeanAnomaly) -
    0.015 * sinDegrees(2 * argumentOfLatitude - 2 * elongation) +
    0.011 * sinDegrees(meanAnomaly - 4 * elongation);
  eclipticLatitude +=
    -0.173 * sinDegrees(argumentOfLatitude - 2 * elongation) -
    0.055 * sinDegrees(meanAnomaly - argumentOfLatitude - 2 * elongation) -
    0.046 * sinDegrees(meanAnomaly + argumentOfLatitude - 2 * elongation) +
    0.033 * sinDegrees(argumentOfLatitude + 2 * elongation) +
    0.017 * sinDegrees(2 * meanAnomaly + argumentOfLatitude);
  distanceEarthRadii += -0.58 * cosDegrees(meanAnomaly - 2 * elongation) - 0.46 * cosDegrees(2 * elongation);

  return { eclipticLongitude, eclipticLatitude, distanceEarthRadii };
}

function createMoonAngles(): DayNightMoonAngles {
  return {
    elevation: 0,
    geometricElevation: 0,
    topocentricElevation: 0,
    azimuth: 0,
    rightAscension: 0,
    declination: 0,
    illuminatedFraction: 0,
    phaseBrightness: 0,
    phaseAngle: 0,
    distanceEarthRadii: 60,
    angularRadius: 0
  };
}

function getGregorianJulianDate(year: number, month: number, day: number): number {
  let adjustedYear = year;
  let adjustedMonth = month;
  if (month <= 2) {
    adjustedYear--;
    adjustedMonth += 12;
  }
  const century = Math.floor(adjustedYear / 100);
  const correction = 2 - century + Math.floor(century / 4);
  return (
    Math.floor(365.25 * (adjustedYear + 4716)) + Math.floor(30.6001 * (adjustedMonth + 1)) + day + correction - 1524.5
  );
}

function getAtmosphericRefraction(elevation: number): number {
  if (elevation > 85) {
    return 0;
  }
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
    throw new RangeError(`DayNightMoonPosition ${name} must be within [${minimum}, ${maximum}].`);
  }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function sinDegrees(value: number): number {
  return Math.sin(value * DEGREES_TO_RADIANS);
}

function cosDegrees(value: number): number {
  return Math.cos(value * DEGREES_TO_RADIANS);
}

function wrapRadians(value: number): number {
  return wrap(value + Math.PI, Math.PI * 2) - Math.PI;
}

function wrapSignedDegrees(value: number): number {
  return wrap(value + 180, 360) - 180;
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
