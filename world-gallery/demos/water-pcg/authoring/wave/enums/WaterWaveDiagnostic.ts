/** Stable diagnostics returned by WaterWaveAsset validation. */
export enum WaterWaveDiagnosticSeverity {
  Warning = "warning",
  Error = "error"
}

export enum WaterWaveDiagnosticCode {
  InvalidRootType = "WATER_WAVE_INVALID_ROOT_TYPE",
  UnsupportedSchemaVersion = "WATER_WAVE_UNSUPPORTED_SCHEMA_VERSION",
  UnsupportedModel = "WATER_WAVE_UNSUPPORTED_MODEL",
  UnsupportedQuality = "WATER_WAVE_UNSUPPORTED_QUALITY",
  MissingField = "WATER_WAVE_MISSING_FIELD",
  InvalidNumber = "WATER_WAVE_INVALID_NUMBER",
  ValueOutOfRange = "WATER_WAVE_VALUE_OUT_OF_RANGE",
  InvalidRange = "WATER_WAVE_INVALID_RANGE",
  SelfIntersectionRisk = "WATER_WAVE_SELF_INTERSECTION_RISK"
}
