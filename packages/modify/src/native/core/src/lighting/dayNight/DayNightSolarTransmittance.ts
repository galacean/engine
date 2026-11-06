import { Color } from "@galacean/engine-math";

/** Clear-sky inputs for direct solar atmospheric transmittance. */
export interface DayNightSolarTransmittanceConfig {
  /** Apparent solar elevation in degrees represented by the authored direct-light reference. */
  referenceElevation: number;
  /** Aerosol optical depth at 550 nm. */
  aerosolOpticalDepth?: number;
  /** Angstrom exponent controlling aerosol wavelength dependence. */
  angstromExponent?: number;
}

const RED_WAVELENGTH = 0.65;
const GREEN_WAVELENGTH = 0.57;
const BLUE_WAVELENGTH = 0.475;
const AEROSOL_REFERENCE_WAVELENGTH = 0.55;

/**
 * Evaluates clear-sky RGB transmittance for the direct solar beam.
 *
 * @remarks
 * Relative optical air mass follows the Kasten-Young approximation. Rayleigh
 * optical depth and an Angstrom aerosol term provide wavelength-dependent
 * Beer-Lambert extinction. Results are normalized at `referenceElevation`, so
 * an authored directional-light color and energy remain the daylight baseline.
 */
export class DayNightSolarTransmittance {
  readonly referenceElevation: number;
  readonly aerosolOpticalDepth: number;
  readonly angstromExponent: number;

  private readonly _referenceAirMass: number;
  private readonly _redOpticalDepth: number;
  private readonly _greenOpticalDepth: number;
  private readonly _blueOpticalDepth: number;

  /**
   * Creates a direct solar transmittance model.
   * @param config - Clear-sky optical inputs and the authored daylight reference elevation
   */
  constructor(config: Readonly<DayNightSolarTransmittanceConfig>) {
    const { referenceElevation } = config;
    const aerosolOpticalDepth = config.aerosolOpticalDepth ?? 0.08;
    const angstromExponent = config.angstromExponent ?? 1.3;
    if (!Number.isFinite(referenceElevation) || referenceElevation <= 0 || referenceElevation > 90) {
      throw new RangeError("DayNightSolarTransmittance reference elevation must be within (0, 90].");
    }
    if (!Number.isFinite(aerosolOpticalDepth) || aerosolOpticalDepth < 0) {
      throw new RangeError("DayNightSolarTransmittance aerosol optical depth must be finite and non-negative.");
    }
    if (!Number.isFinite(angstromExponent) || angstromExponent < 0) {
      throw new RangeError("DayNightSolarTransmittance Angstrom exponent must be finite and non-negative.");
    }

    this.referenceElevation = referenceElevation;
    this.aerosolOpticalDepth = aerosolOpticalDepth;
    this.angstromExponent = angstromExponent;
    this._referenceAirMass = getRelativeAirMass(referenceElevation);
    this._redOpticalDepth = this._getOpticalDepth(RED_WAVELENGTH);
    this._greenOpticalDepth = this._getOpticalDepth(GREEN_WAVELENGTH);
    this._blueOpticalDepth = this._getOpticalDepth(BLUE_WAVELENGTH);
  }

  /**
   * Evaluates RGB direct-beam transmission relative to the authored daylight reference.
   * @param solarElevation - Apparent solar elevation in degrees
   * @param out - Receives the linear RGB transmission multiplier
   */
  evaluate(solarElevation: number, out: Color): Color {
    if (!Number.isFinite(solarElevation)) {
      throw new RangeError("DayNightSolarTransmittance solar elevation must be finite.");
    }
    if (solarElevation <= 0) {
      out.set(0, 0, 0, 1);
      return out;
    }

    const airMassDelta = Math.max(0, getRelativeAirMass(solarElevation) - this._referenceAirMass);
    out.set(
      Math.exp(-this._redOpticalDepth * airMassDelta),
      Math.exp(-this._greenOpticalDepth * airMassDelta),
      Math.exp(-this._blueOpticalDepth * airMassDelta),
      1
    );
    return out;
  }

  private _getOpticalDepth(wavelength: number): number {
    const inverseWavelengthSquared = 1 / (wavelength * wavelength);
    const inverseWavelengthFourth = inverseWavelengthSquared * inverseWavelengthSquared;
    const rayleighOpticalDepth =
      0.008569 * inverseWavelengthFourth * (1 + 0.0113 * inverseWavelengthSquared + 0.00013 * inverseWavelengthFourth);
    const aerosolOpticalDepth =
      this.aerosolOpticalDepth * Math.pow(wavelength / AEROSOL_REFERENCE_WAVELENGTH, -this.angstromExponent);
    return rayleighOpticalDepth + aerosolOpticalDepth;
  }
}

function getRelativeAirMass(solarElevation: number): number {
  const elevationRadians = (solarElevation * Math.PI) / 180;
  return 1 / (Math.sin(elevationRadians) + 0.50572 * Math.pow(solarElevation + 6.07995, -1.6364));
}
