const WATER_METRIC_MILLIMETRES_PER_METRE = 1_000;
const WATER_METRIC_PPM_PER_UNIT = 1_000_000;
export const SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES = -128_000;
export const SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES = 1_600_000;
export const SEED_WORLD_R16_HEIGHT_SPAN_MILLIMETRES =
  SEED_WORLD_R16_MAXIMUM_HEIGHT_MILLIMETRES - SEED_WORLD_R16_MINIMUM_HEIGHT_MILLIMETRES;

export enum WaterMetricEncodingErrorCode {
  NonFinite = "NON_FINITE_WATER_METRIC",
  NegativeZero = "NON_CANONICAL_NEGATIVE_ZERO",
  OutOfRange = "WATER_METRIC_OUT_OF_RANGE"
}

export class WaterMetricEncodingError extends RangeError {
  readonly name = "WaterMetricEncodingError";

  constructor(
    readonly code: WaterMetricEncodingErrorCode,
    readonly field: string,
    message: string
  ) {
    super(message);
  }
}

/** IEEE-independent nearest-integer rounding with halves directed to the adjacent even integer. */
export function roundTiesToEven(value: number, field = "value"): number {
  requireFiniteCanonicalNumber(value, field);
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

export function encodeVerticalMetres(value: number, field = "verticalMetres"): number {
  return encodeScaledInt32(value, WATER_METRIC_MILLIMETRES_PER_METRE, field);
}

export function encodeLengthMetres(value: number, field = "lengthMetres"): number {
  return encodeScaledUint32(value, WATER_METRIC_MILLIMETRES_PER_METRE, field);
}

export function encodeRatioPpm(value: number, field = "ratio"): number {
  return encodeScaledInt32(value, WATER_METRIC_PPM_PER_UNIT, field);
}

function encodeScaledUint32(value: number, scale: number, field: string): number {
  requireFiniteCanonicalNumber(value, field);
  if (value < 0) throw outOfRange(field, value, "a non-negative value");
  const encoded = roundTiesToEven(value * scale, field);
  requireUint32(encoded, field, value);
  return encoded;
}

function encodeScaledInt32(value: number, scale: number, field: string): number {
  requireFiniteCanonicalNumber(value, field);
  const encoded = roundTiesToEven(value * scale, field);
  requireInt32(encoded, field, value);
  return encoded;
}

function requireFiniteCanonicalNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new WaterMetricEncodingError(WaterMetricEncodingErrorCode.NonFinite, field, `${field} must be finite.`);
  }
  if (Object.is(value, -0)) {
    throw new WaterMetricEncodingError(
      WaterMetricEncodingErrorCode.NegativeZero,
      field,
      `${field} must not be negative zero.`
    );
  }
}

function requireUint32(value: number, field: string, source = value): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw outOfRange(field, source, "Uint32");
  }
}

function requireInt32(value: number, field: string, source = value): void {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw outOfRange(field, source, "Int32");
  }
}

function outOfRange(field: string, value: number, expected: string): WaterMetricEncodingError {
  return new WaterMetricEncodingError(
    WaterMetricEncodingErrorCode.OutOfRange,
    field,
    `${field} value ${String(value)} is outside ${expected}.`
  );
}
