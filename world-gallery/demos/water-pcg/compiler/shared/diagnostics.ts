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
  ReversedElevation = "RIVER_REVERSED_ELEVATION",
  WaterProfileAdjusted = "RIVER_WATER_PROFILE_ADJUSTED",
  InvalidMergeRadius = "RIVER_INVALID_MERGE_RADIUS",
  NetworkBudgetExceeded = "RIVER_NETWORK_BUDGET_EXCEEDED",
  NetworkBudgetRedistributed = "RIVER_NETWORK_BUDGET_REDISTRIBUTED"
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
