/** Stable diagnostic contract shared by decoder, compiler, and callers. */
export enum RiverDiagnosticSeverity {
  Info = "info",
  Warning = "warning",
  Error = "error"
}

export enum RiverDiagnosticCode {
  InvalidRootType = "RIVER_INVALID_ROOT_TYPE",
  UnsupportedSchemaVersion = "RIVER_UNSUPPORTED_SCHEMA_VERSION",
  MissingField = "RIVER_MISSING_FIELD",
  InvalidType = "RIVER_INVALID_TYPE",
  InvalidNumber = "RIVER_INVALID_NUMBER",
  InvalidEnum = "RIVER_INVALID_ENUM",
  DuplicateId = "RIVER_DUPLICATE_ID",
  ValueOutOfRange = "RIVER_VALUE_OUT_OF_RANGE",
  ControlPointLimitExceeded = "RIVER_CONTROL_POINT_LIMIT_EXCEEDED",
  ControlPointRepaired = "RIVER_CONTROL_POINT_REPAIRED",
  DegenerateControlPoint = "RIVER_DEGENERATE_CONTROL_POINT",
  SamplingBudgetRedistributed = "RIVER_SAMPLING_BUDGET_REDISTRIBUTED",
  SamplingBudgetBelowAnchorCount = "RIVER_SAMPLING_BUDGET_BELOW_ANCHOR_COUNT",
  ShortRiver = "RIVER_SHORT_LENGTH",
  MissingNodeReference = "RIVER_MISSING_NODE_REFERENCE",
  SegmentEndpointMismatch = "RIVER_SEGMENT_ENDPOINT_MISMATCH",
  NetworkCycle = "RIVER_NETWORK_CYCLE",
  DisconnectedNetwork = "RIVER_DISCONNECTED_NETWORK",
  InvalidNodeDegree = "RIVER_INVALID_NODE_DEGREE",
  UnsupportedJunctionKind = "RIVER_UNSUPPORTED_JUNCTION_KIND",
  ReversedElevation = "RIVER_REVERSED_ELEVATION",
  WaterProfileAdjusted = "RIVER_WATER_PROFILE_ADJUSTED",
  WaterProfileSlopeAdjusted = "RIVER_WATER_PROFILE_SLOPE_ADJUSTED",
  WaterProfileSlopeConflict = "RIVER_WATER_PROFILE_SLOPE_CONFLICT",
  InvalidMergeRadius = "RIVER_INVALID_MERGE_RADIUS",
  NetworkBudgetExceeded = "RIVER_NETWORK_BUDGET_EXCEEDED",
  NetworkBudgetRedistributed = "RIVER_NETWORK_BUDGET_REDISTRIBUTED",
  SharpBendFallback = "RIVER_SHARP_BEND_FALLBACK",
  BankSelfIntersection = "RIVER_BANK_SELF_INTERSECTION",
  DegenerateTriangle = "RIVER_DEGENERATE_TRIANGLE",
  JunctionTrimClamped = "RIVER_JUNCTION_TRIM_CLAMPED",
  JunctionBoundaryInvalid = "RIVER_JUNCTION_BOUNDARY_INVALID",
  JunctionRadiusTooSmall = "RIVER_JUNCTION_RADIUS_TOO_SMALL",
  IncompatibleJunctionMaterial = "RIVER_INCOMPATIBLE_JUNCTION_MATERIAL"
}

export interface RiverDiagnosticRepair {
  originalValue: unknown;
  repairedValue: unknown;
}

export interface RiverDiagnostic {
  code: RiverDiagnosticCode;
  severity: RiverDiagnosticSeverity;
  path: string;
  message: string;
  repair?: RiverDiagnosticRepair;
}
