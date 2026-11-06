/** Versioned authoring and diagnostic enums for raster-defined water surfaces. */
export enum HeightfieldWaterSchemaVersion {
  V1 = 1
}

export enum HeightfieldWaterDiagnosticSeverity {
  Info = "info",
  Warning = "warning",
  Error = "error"
}

export enum HeightfieldWaterDiagnosticCode {
  InvalidRootType = "HEIGHTFIELD_WATER_INVALID_ROOT_TYPE",
  UnsupportedSchemaVersion = "HEIGHTFIELD_WATER_UNSUPPORTED_SCHEMA_VERSION",
  MissingField = "HEIGHTFIELD_WATER_MISSING_FIELD",
  InvalidType = "HEIGHTFIELD_WATER_INVALID_TYPE",
  InvalidNumber = "HEIGHTFIELD_WATER_INVALID_NUMBER",
  InvalidEnum = "HEIGHTFIELD_WATER_INVALID_ENUM",
  ValueOutOfRange = "HEIGHTFIELD_WATER_VALUE_OUT_OF_RANGE",
  BufferLengthMismatch = "HEIGHTFIELD_WATER_BUFFER_LENGTH_MISMATCH",
  TexelIndexOutOfRange = "HEIGHTFIELD_WATER_TEXEL_INDEX_OUT_OF_RANGE",
  TexelOrderInvalid = "HEIGHTFIELD_WATER_TEXEL_ORDER_INVALID",
  BedAboveSurface = "HEIGHTFIELD_WATER_BED_ABOVE_SURFACE",
  InvalidWaveAsset = "HEIGHTFIELD_WATER_INVALID_WAVE_ASSET",
  BudgetExceeded = "HEIGHTFIELD_WATER_BUDGET_EXCEEDED",
  Uint16VertexLimitExceeded = "HEIGHTFIELD_WATER_UINT16_VERTEX_LIMIT_EXCEEDED"
}
