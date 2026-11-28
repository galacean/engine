/** Strict common decoding for backend-independent Water source facts. */
import {
  WaterBathymetrySourceKind,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  WaterShoreSdfSourceKind,
  WaterSpatialFieldSourceSchemaVersion,
  type ExplicitBedHeightsWaterBathymetrySourceV1,
  type GridMaskWaterBodySourceV1,
  type OceanNearshoreWaterBodySourceV1,
  type PolygonWaterBodySourceV1,
  type ShoreDistanceProfileWaterBathymetrySourceV1,
  type SplineProfileWaterBodySourceV1,
  type TerrainBedSamplesWaterBathymetrySourceV1,
  type TerrainRegionWaterBodySourceV1,
  type WaterBathymetrySourceV1,
  type WaterBodySourceCapabilitiesV1,
  type WaterBodySourceV1,
  type WaterColorTuple,
  type WaterShoreSdfSourceV1,
  type WaterSpatialFieldSourcesV1,
  type WaterVector2Tuple,
  type WaterVector3Tuple
} from "./WaterBodyAuthoringTypes";
import { createImmutableWaterSnapshot } from "../identity/WaterImmutableSnapshot";
import { computeTerrainBedSamplesContentHash } from "./WaterSpatialFieldSourceHash";

type UnknownRecord = Record<string, unknown>;

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_POSITION_MAGNITUDE = 10_000_000;
const MAX_SPATIAL_FIELD_RESOLUTION = 4096;
const MAX_INLINE_BED_HEIGHT_COUNT = 4_194_304;
const STABLE_CONTENT_HASH_PATTERN = /^[a-f0-9]{16}$/i;

export enum WaterBodyDiagnosticSeverity {
  Error = "error"
}

export enum WaterBodyDiagnosticCode {
  InvalidRootType = "WATER_BODY_INVALID_ROOT_TYPE",
  UnsupportedSchemaVersion = "WATER_BODY_UNSUPPORTED_SCHEMA_VERSION",
  MissingField = "WATER_BODY_MISSING_FIELD",
  InvalidType = "WATER_BODY_INVALID_TYPE",
  InvalidNumber = "WATER_BODY_INVALID_NUMBER",
  InvalidEnum = "WATER_BODY_INVALID_ENUM",
  InvalidIdentifier = "WATER_BODY_INVALID_IDENTIFIER",
  ValueOutOfRange = "WATER_BODY_VALUE_OUT_OF_RANGE",
  InvalidDependency = "WATER_BODY_INVALID_DEPENDENCY",
  UnknownField = "WATER_BODY_UNKNOWN_FIELD",
  UnsupportedSourceKind = "WATER_BODY_UNSUPPORTED_SOURCE_KIND"
}

export interface WaterBodyDiagnostic {
  readonly code: WaterBodyDiagnosticCode;
  readonly severity: WaterBodyDiagnosticSeverity.Error;
  readonly path: string;
  readonly message: string;
}

export interface WaterBodyDecodeResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly diagnostics: readonly WaterBodyDiagnostic[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function addError(
  diagnostics: WaterBodyDiagnostic[],
  code: WaterBodyDiagnosticCode,
  path: string,
  message: string
): void {
  diagnostics.push({
    code,
    severity: WaterBodyDiagnosticSeverity.Error,
    path,
    message
  });
}

function readRecord(value: unknown, path: string, diagnostics: WaterBodyDiagnostic[]): UnknownRecord | undefined {
  if (isRecord(value)) return value;
  addError(
    diagnostics,
    path === "$" ? WaterBodyDiagnosticCode.InvalidRootType : WaterBodyDiagnosticCode.InvalidType,
    path,
    "Expected an object."
  );
  return undefined;
}

function readRequiredRecord(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: WaterBodyDiagnostic[]
): UnknownRecord | undefined {
  if (!(key in record)) {
    addError(diagnostics, WaterBodyDiagnosticCode.MissingField, path, "Required object field is missing.");
    return undefined;
  }
  return readRecord(record[key], path, diagnostics);
}

function readStableId(value: unknown, path: string, diagnostics: WaterBodyDiagnostic[]): string | undefined {
  if (typeof value !== "string") {
    addError(
      diagnostics,
      value === undefined ? WaterBodyDiagnosticCode.MissingField : WaterBodyDiagnosticCode.InvalidIdentifier,
      path,
      value === undefined ? "Required identifier is missing." : "Expected a stable identifier."
    );
    return undefined;
  }
  if (value.length === 0 || value !== value.trim() || value.includes("://") || !STABLE_ID_PATTERN.test(value)) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.InvalidIdentifier,
      path,
      "Expected a non-empty stable logical identifier, not a URL."
    );
    return undefined;
  }
  return value;
}

function readBoolean(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: WaterBodyDiagnostic[]
): boolean | undefined {
  const value = record[key];
  if (typeof value === "boolean") return value;
  addError(
    diagnostics,
    key in record ? WaterBodyDiagnosticCode.InvalidType : WaterBodyDiagnosticCode.MissingField,
    path,
    key in record ? "Expected a boolean." : "Required boolean field is missing."
  );
  return undefined;
}

interface NumberRule {
  readonly minimum: number;
  readonly maximum: number;
  readonly integer?: boolean;
  readonly exclusiveMinimum?: boolean;
}

function readNumber(
  record: UnknownRecord,
  key: string,
  path: string,
  rule: NumberRule,
  diagnostics: WaterBodyDiagnostic[]
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(
      diagnostics,
      key in record ? WaterBodyDiagnosticCode.InvalidNumber : WaterBodyDiagnosticCode.MissingField,
      path,
      key in record ? "Expected a finite number." : "Required numeric field is missing."
    );
    return undefined;
  }
  const belowMinimum = rule.exclusiveMinimum ? value <= rule.minimum : value < rule.minimum;
  if (belowMinimum || value > rule.maximum || (rule.integer === true && !Number.isInteger(value))) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.ValueOutOfRange,
      path,
      `Expected ${rule.integer ? "an integer" : "a number"} in the supported range.`
    );
    return undefined;
  }
  return value;
}

function readTuple(
  value: unknown,
  length: 2,
  path: string,
  diagnostics: WaterBodyDiagnostic[],
  minimum: number,
  maximum: number,
  exclusiveMinimum?: boolean
): WaterVector2Tuple | undefined;
function readTuple(
  value: unknown,
  length: 3,
  path: string,
  diagnostics: WaterBodyDiagnostic[],
  minimum: number,
  maximum: number,
  exclusiveMinimum?: false
): WaterVector3Tuple | undefined;
function readTuple(
  value: unknown,
  length: 4,
  path: string,
  diagnostics: WaterBodyDiagnostic[],
  minimum: number,
  maximum: number,
  exclusiveMinimum?: false
): WaterColorTuple | undefined;
function readTuple(
  value: unknown,
  length: 2 | 3 | 4,
  path: string,
  diagnostics: WaterBodyDiagnostic[],
  minimum: number,
  maximum: number,
  exclusiveMinimum = false
): WaterVector2Tuple | WaterVector3Tuple | WaterColorTuple | undefined {
  if (!Array.isArray(value) || value.length !== length) {
    addError(diagnostics, WaterBodyDiagnosticCode.InvalidType, path, `Expected a ${length}-number tuple.`);
    return undefined;
  }
  for (let index = 0; index < value.length; index++) {
    const component = value[index];
    if (typeof component !== "number" || !Number.isFinite(component)) {
      addError(
        diagnostics,
        WaterBodyDiagnosticCode.InvalidNumber,
        `${path}[${index}]`,
        "Expected a finite tuple component."
      );
      return undefined;
    }
    const belowMinimum = exclusiveMinimum ? component <= minimum : component < minimum;
    if (belowMinimum || component > maximum) {
      addError(
        diagnostics,
        WaterBodyDiagnosticCode.ValueOutOfRange,
        `${path}[${index}]`,
        "Tuple component is outside the supported range."
      );
      return undefined;
    }
  }
  if (length === 2) return Object.freeze([value[0] as number, value[1] as number]);
  if (length === 3) return Object.freeze([value[0] as number, value[1] as number, value[2] as number]);
  return Object.freeze([value[0] as number, value[1] as number, value[2] as number, value[3] as number]);
}

function readEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  diagnostics: WaterBodyDiagnostic[]
): T | undefined {
  if (typeof value === "string" && values.includes(value as T)) return value as T;
  addError(
    diagnostics,
    value === undefined ? WaterBodyDiagnosticCode.MissingField : WaterBodyDiagnosticCode.InvalidEnum,
    path,
    `Expected one of: ${values.join(", ")}.`
  );
  return undefined;
}

function rejectUnknownKeys(
  record: UnknownRecord,
  allowedKeys: readonly string[],
  path: string,
  diagnostics: WaterBodyDiagnostic[]
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (allowed.has(key)) continue;
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.UnknownField,
      `${path}.${key}`,
      "Unknown field is not allowed in this versioned schema."
    );
  }
}

function readFiniteNumberArray(
  value: unknown,
  path: string,
  diagnostics: WaterBodyDiagnostic[]
): readonly number[] | undefined {
  if (!Array.isArray(value)) {
    addError(
      diagnostics,
      value === undefined ? WaterBodyDiagnosticCode.MissingField : WaterBodyDiagnosticCode.InvalidType,
      path,
      value === undefined ? "Required numeric array is missing." : "Expected an array of finite numbers."
    );
    return undefined;
  }
  if (value.length === 0 || value.length > MAX_INLINE_BED_HEIGHT_COUNT) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.ValueOutOfRange,
      path,
      `Expected between 1 and ${MAX_INLINE_BED_HEIGHT_COUNT} bed-height samples.`
    );
    return undefined;
  }
  const values: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const sample = value[index];
    if (
      typeof sample !== "number" ||
      !Number.isFinite(sample) ||
      sample < -MAX_POSITION_MAGNITUDE ||
      sample > MAX_POSITION_MAGNITUDE
    ) {
      addError(
        diagnostics,
        typeof sample === "number" ? WaterBodyDiagnosticCode.InvalidNumber : WaterBodyDiagnosticCode.InvalidType,
        `${path}[${index}]`,
        "Expected a finite world-space bed height in the supported range."
      );
      return undefined;
    }
    values.push(sample);
  }
  return Object.freeze(values);
}

function readStableContentHash(value: unknown, path: string, diagnostics: WaterBodyDiagnostic[]): string | undefined {
  if (typeof value !== "string" || !STABLE_CONTENT_HASH_PATTERN.test(value)) {
    addError(
      diagnostics,
      value === undefined ? WaterBodyDiagnosticCode.MissingField : WaterBodyDiagnosticCode.InvalidIdentifier,
      path,
      "Expected a 16-character hexadecimal content hash."
    );
    return undefined;
  }
  return value.toLowerCase();
}

function decodeWaterBathymetrySource(
  record: UnknownRecord,
  path: string,
  diagnostics: WaterBodyDiagnostic[]
): WaterBathymetrySourceV1 | undefined {
  const versionValid = record.schemaVersion === WaterSpatialFieldSourceSchemaVersion.V1;
  if (!versionValid) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.UnsupportedSchemaVersion,
      `${path}.schemaVersion`,
      `Expected Water spatial-field source schema ${WaterSpatialFieldSourceSchemaVersion.V1}.`
    );
  }
  const kind = readEnum(record.kind, Object.values(WaterBathymetrySourceKind), `${path}.kind`, diagnostics);
  if (!kind) return undefined;

  switch (kind) {
    case WaterBathymetrySourceKind.ShoreDistanceProfile: {
      rejectUnknownKeys(
        record,
        ["schemaVersion", "kind", "edgeDepth", "channelDepth", "deepBandMeters", "profileExponent", "maximumDepth"],
        path,
        diagnostics
      );
      const edgeDepth = readNumber(
        record,
        "edgeDepth",
        `${path}.edgeDepth`,
        { minimum: 0, maximum: MAX_POSITION_MAGNITUDE },
        diagnostics
      );
      const channelDepth = readNumber(
        record,
        "channelDepth",
        `${path}.channelDepth`,
        {
          minimum: 0,
          maximum: MAX_POSITION_MAGNITUDE,
          exclusiveMinimum: true
        },
        diagnostics
      );
      const deepBandMeters = readNumber(
        record,
        "deepBandMeters",
        `${path}.deepBandMeters`,
        {
          minimum: 0,
          maximum: MAX_POSITION_MAGNITUDE,
          exclusiveMinimum: true
        },
        diagnostics
      );
      const profileExponent = readNumber(
        record,
        "profileExponent",
        `${path}.profileExponent`,
        { minimum: 0, maximum: 64, exclusiveMinimum: true },
        diagnostics
      );
      const maximumDepth = readNumber(
        record,
        "maximumDepth",
        `${path}.maximumDepth`,
        {
          minimum: 0,
          maximum: MAX_POSITION_MAGNITUDE,
          exclusiveMinimum: true
        },
        diagnostics
      );
      if (edgeDepth !== undefined && channelDepth !== undefined && edgeDepth > channelDepth) {
        addError(
          diagnostics,
          WaterBodyDiagnosticCode.InvalidDependency,
          `${path}.edgeDepth`,
          "Shore-distance edge depth must not exceed channel depth."
        );
      }
      if (channelDepth !== undefined && maximumDepth !== undefined && channelDepth > maximumDepth) {
        addError(
          diagnostics,
          WaterBodyDiagnosticCode.InvalidDependency,
          `${path}.channelDepth`,
          "Shore-distance channel depth must not exceed maximum depth."
        );
      }
      if (
        !versionValid ||
        edgeDepth === undefined ||
        channelDepth === undefined ||
        deepBandMeters === undefined ||
        profileExponent === undefined ||
        maximumDepth === undefined
      ) {
        return undefined;
      }
      return Object.freeze({
        schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1,
        kind,
        edgeDepth,
        channelDepth,
        deepBandMeters,
        profileExponent,
        maximumDepth
      } satisfies ShoreDistanceProfileWaterBathymetrySourceV1);
    }
    case WaterBathymetrySourceKind.ExplicitBedHeights: {
      rejectUnknownKeys(
        record,
        ["schemaVersion", "kind", "sampleOrder", "bedHeights", "maximumDepth"],
        path,
        diagnostics
      );
      const sampleOrder = readEnum(
        record.sampleOrder,
        ["source-wet-texel-order"] as const,
        `${path}.sampleOrder`,
        diagnostics
      );
      const bedHeights = readFiniteNumberArray(record.bedHeights, `${path}.bedHeights`, diagnostics);
      const maximumDepth = readNumber(
        record,
        "maximumDepth",
        `${path}.maximumDepth`,
        {
          minimum: 0,
          maximum: MAX_POSITION_MAGNITUDE,
          exclusiveMinimum: true
        },
        diagnostics
      );
      if (!versionValid || !sampleOrder || !bedHeights || maximumDepth === undefined) {
        return undefined;
      }
      return Object.freeze({
        schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1,
        kind,
        sampleOrder,
        bedHeights,
        maximumDepth
      } satisfies ExplicitBedHeightsWaterBathymetrySourceV1);
    }
    case WaterBathymetrySourceKind.TerrainBedSamples: {
      rejectUnknownKeys(
        record,
        ["schemaVersion", "kind", "sampleOrder", "resolution", "bedHeights", "maximumDepth", "contentHash"],
        path,
        diagnostics
      );
      const sampleOrder = readEnum(
        record.sampleOrder,
        ["row-major-region-grid"] as const,
        `${path}.sampleOrder`,
        diagnostics
      );
      const resolution = readTuple(
        record.resolution,
        2,
        `${path}.resolution`,
        diagnostics,
        1,
        MAX_SPATIAL_FIELD_RESOLUTION
      );
      if (resolution && (!Number.isInteger(resolution[0]) || !Number.isInteger(resolution[1]))) {
        addError(
          diagnostics,
          WaterBodyDiagnosticCode.ValueOutOfRange,
          `${path}.resolution`,
          "Terrain bed-sample resolution components must be integers."
        );
      }
      const sampleCount = resolution ? resolution[0] * resolution[1] : undefined;
      if (sampleCount !== undefined && sampleCount > MAX_INLINE_BED_HEIGHT_COUNT) {
        addError(
          diagnostics,
          WaterBodyDiagnosticCode.ValueOutOfRange,
          `${path}.resolution`,
          `Terrain bed-sample resolution may address at most ${MAX_INLINE_BED_HEIGHT_COUNT} inline samples.`
        );
      }
      const bedHeights = readFiniteNumberArray(record.bedHeights, `${path}.bedHeights`, diagnostics);
      if (sampleCount !== undefined && bedHeights && bedHeights.length !== sampleCount) {
        addError(
          diagnostics,
          WaterBodyDiagnosticCode.InvalidDependency,
          `${path}.bedHeights`,
          `Terrain bed-sample count must equal resolution width × height (${sampleCount}).`
        );
      }
      const maximumDepth = readNumber(
        record,
        "maximumDepth",
        `${path}.maximumDepth`,
        {
          minimum: 0,
          maximum: MAX_POSITION_MAGNITUDE,
          exclusiveMinimum: true
        },
        diagnostics
      );
      const contentHash = readStableContentHash(record.contentHash, `${path}.contentHash`, diagnostics);
      if (
        versionValid &&
        sampleOrder &&
        resolution &&
        Number.isInteger(resolution[0]) &&
        Number.isInteger(resolution[1]) &&
        bedHeights &&
        contentHash &&
        computeTerrainBedSamplesContentHash({
          schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1,
          kind,
          sampleOrder,
          resolution,
          bedHeights
        }) !== contentHash
      ) {
        addError(
          diagnostics,
          WaterBodyDiagnosticCode.InvalidDependency,
          `${path}.contentHash`,
          "Terrain bed-sample content hash does not match its serialized grid."
        );
      }
      if (
        !versionValid ||
        !sampleOrder ||
        !resolution ||
        !Number.isInteger(resolution[0]) ||
        !Number.isInteger(resolution[1]) ||
        sampleCount === undefined ||
        sampleCount > MAX_INLINE_BED_HEIGHT_COUNT ||
        !bedHeights ||
        maximumDepth === undefined ||
        !contentHash
      ) {
        return undefined;
      }
      return Object.freeze({
        schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1,
        kind,
        sampleOrder,
        resolution: Object.freeze([resolution[0], resolution[1]] as const),
        bedHeights,
        maximumDepth,
        contentHash
      } satisfies TerrainBedSamplesWaterBathymetrySourceV1);
    }
  }
}

function decodeWaterShoreSdfSource(
  record: UnknownRecord,
  path: string,
  diagnostics: WaterBodyDiagnostic[]
): WaterShoreSdfSourceV1 | undefined {
  rejectUnknownKeys(record, ["schemaVersion", "kind"], path, diagnostics);
  const versionValid = record.schemaVersion === WaterSpatialFieldSourceSchemaVersion.V1;
  if (!versionValid) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.UnsupportedSchemaVersion,
      `${path}.schemaVersion`,
      `Expected Water spatial-field source schema ${WaterSpatialFieldSourceSchemaVersion.V1}.`
    );
  }
  const kind = readEnum(record.kind, Object.values(WaterShoreSdfSourceKind), `${path}.kind`, diagnostics);
  if (!versionValid || !kind) return undefined;
  return Object.freeze({
    schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1,
    kind
  });
}

function decodeWaterSpatialFieldSourcesAtPath(
  source: unknown,
  path: string,
  diagnostics: WaterBodyDiagnostic[]
): WaterSpatialFieldSourcesV1 | undefined {
  const record = readRecord(source, path, diagnostics);
  if (!record) return undefined;
  rejectUnknownKeys(record, ["schemaVersion", "bathymetry", "shoreSdf"], path, diagnostics);
  const versionValid = record.schemaVersion === WaterSpatialFieldSourceSchemaVersion.V1;
  if (!versionValid) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.UnsupportedSchemaVersion,
      `${path}.schemaVersion`,
      `Expected Water spatial-field sources schema ${WaterSpatialFieldSourceSchemaVersion.V1}.`
    );
  }
  const bathymetryRecord =
    record.bathymetry === undefined ? undefined : readRecord(record.bathymetry, `${path}.bathymetry`, diagnostics);
  const bathymetry = bathymetryRecord
    ? decodeWaterBathymetrySource(bathymetryRecord, `${path}.bathymetry`, diagnostics)
    : undefined;
  const shoreSdfRecord =
    record.shoreSdf === undefined ? undefined : readRecord(record.shoreSdf, `${path}.shoreSdf`, diagnostics);
  const shoreSdf = shoreSdfRecord
    ? decodeWaterShoreSdfSource(shoreSdfRecord, `${path}.shoreSdf`, diagnostics)
    : undefined;
  if (!bathymetry && !shoreSdf) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.MissingField,
      path,
      "Water spatial-field sources must declare bathymetry, shoreSdf, or both."
    );
  }
  if (bathymetry?.kind === WaterBathymetrySourceKind.ShoreDistanceProfile && !shoreSdf) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.InvalidDependency,
      `${path}.shoreSdf`,
      "Shore-distance bathymetry requires an explicit shore SDF source."
    );
  }
  if (!versionValid || (!bathymetry && !shoreSdf)) return undefined;
  return Object.freeze({
    schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1,
    ...(bathymetry ? { bathymetry } : {}),
    ...(shoreSdf ? { shoreSdf } : {})
  });
}

export function decodeWaterSpatialFieldSources(source: unknown): WaterBodyDecodeResult<WaterSpatialFieldSourcesV1> {
  const diagnostics: WaterBodyDiagnostic[] = [];
  const value = decodeWaterSpatialFieldSourcesAtPath(source, "$", diagnostics);
  return Object.freeze({
    valid: value !== undefined && diagnostics.length === 0,
    value: diagnostics.length === 0 ? value : undefined,
    diagnostics: Object.freeze(diagnostics)
  });
}

/**
 * Produces canonical JSON only after strict decoding. Property order comes
 * from the decoder's normalized immutable value, never caller object order.
 */
export function encodeWaterSpatialFieldSourcesV1(source: unknown): string {
  const decoded = decodeWaterSpatialFieldSources(source);
  if (!decoded.valid || !decoded.value) {
    const first = decoded.diagnostics[0];
    throw new Error(
      first ? `${first.code} at ${first.path}: ${first.message}` : "Water spatial-field sources are invalid."
    );
  }
  return JSON.stringify(decoded.value);
}

function decodeSourceCapabilities(
  record: UnknownRecord,
  diagnostics: WaterBodyDiagnostic[]
): WaterBodySourceCapabilitiesV1 | undefined {
  const localBathymetry = readBoolean(record, "localBathymetry", "$.capabilities.localBathymetry", diagnostics);
  const shoreSdf = readBoolean(record, "shoreSdf", "$.capabilities.shoreSdf", diagnostics);
  const current = readBoolean(record, "current", "$.capabilities.current", diagnostics);
  if (localBathymetry === undefined || shoreSdf === undefined || current === undefined) return undefined;
  return Object.freeze({ localBathymetry, shoreSdf, current });
}

function requireDescriptor(record: UnknownRecord, diagnostics: WaterBodyDiagnostic[]): unknown | undefined {
  if (!("descriptor" in record) || record.descriptor === undefined) {
    addError(diagnostics, WaterBodyDiagnosticCode.MissingField, "$.descriptor", "Backend descriptor is required.");
    return undefined;
  }
  try {
    return createImmutableWaterSnapshot(record.descriptor);
  } catch (error) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.InvalidType,
      "$.descriptor",
      error instanceof Error ? error.message : String(error)
    );
    return undefined;
  }
}

export function decodeWaterBodySource(source: unknown): WaterBodyDecodeResult<WaterBodySourceV1> {
  const diagnostics: WaterBodyDiagnostic[] = [];
  const record = readRecord(source, "$", diagnostics);
  if (!record) return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  if (record.schemaVersion !== WaterBodySourceSchemaVersion.V1) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.UnsupportedSchemaVersion,
      "$.schemaVersion",
      `Expected WaterBody source schema ${WaterBodySourceSchemaVersion.V1}.`
    );
  }
  const kind = readEnum(record.kind, Object.values(WaterBodySourceKind), "$.kind", diagnostics);
  const capabilitiesRecord = readRequiredRecord(record, "capabilities", "$.capabilities", diagnostics);
  const capabilities = capabilitiesRecord ? decodeSourceCapabilities(capabilitiesRecord, diagnostics) : undefined;
  const spatialFields =
    record.spatialFields === undefined
      ? undefined
      : decodeWaterSpatialFieldSourcesAtPath(record.spatialFields, "$.spatialFields", diagnostics);
  if (!kind || !capabilities) {
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  if (spatialFields?.bathymetry && !capabilities.localBathymetry) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.InvalidDependency,
      "$.spatialFields.bathymetry",
      "A bathymetry source requires the localBathymetry capability."
    );
  }
  if (spatialFields?.shoreSdf && !capabilities.shoreSdf) {
    addError(
      diagnostics,
      WaterBodyDiagnosticCode.InvalidDependency,
      "$.spatialFields.shoreSdf",
      "A shore SDF source requires the shoreSdf capability."
    );
  }
  if (kind === WaterBodySourceKind.TerrainRegion) {
    if (capabilities.localBathymetry && !spatialFields?.bathymetry) {
      addError(
        diagnostics,
        WaterBodyDiagnosticCode.MissingField,
        "$.spatialFields.bathymetry",
        "Terrain-region local bathymetry must use an explicit common authoring source."
      );
    }
    if (capabilities.shoreSdf && !spatialFields?.shoreSdf) {
      addError(
        diagnostics,
        WaterBodyDiagnosticCode.MissingField,
        "$.spatialFields.shoreSdf",
        "Terrain-region shore SDF must use an explicit common authoring source."
      );
    }
  }
  const spatialFieldProperty = spatialFields ? { spatialFields } : {};

  let value: WaterBodySourceV1 | undefined;
  switch (kind) {
    case WaterBodySourceKind.GridMask: {
      const descriptor = requireDescriptor(record, diagnostics);
      if (descriptor !== undefined) {
        value = Object.freeze({
          schemaVersion: WaterBodySourceSchemaVersion.V1,
          kind,
          capabilities,
          ...spatialFieldProperty,
          descriptor
        } satisfies GridMaskWaterBodySourceV1);
      }
      break;
    }
    case WaterBodySourceKind.TerrainRegion: {
      const providerId = readStableId(record.providerId, "$.providerId", diagnostics);
      const parameters = readRecord(record.parameters, "$.parameters", diagnostics);
      if (providerId && parameters) {
        value = Object.freeze({
          schemaVersion: WaterBodySourceSchemaVersion.V1,
          kind,
          capabilities,
          ...spatialFieldProperty,
          providerId,
          parameters: createImmutableWaterSnapshot(parameters)
        } satisfies TerrainRegionWaterBodySourceV1);
      }
      break;
    }
    case WaterBodySourceKind.SplineProfile: {
      const descriptor = requireDescriptor(record, diagnostics);
      if (descriptor !== undefined) {
        value = Object.freeze({
          schemaVersion: WaterBodySourceSchemaVersion.V1,
          kind,
          capabilities,
          ...spatialFieldProperty,
          descriptor
        } satisfies SplineProfileWaterBodySourceV1);
      }
      break;
    }
    case WaterBodySourceKind.Polygon: {
      const vertices = record.verticesXZ;
      const decodedVertices: WaterVector2Tuple[] = [];
      if (!Array.isArray(vertices) || vertices.length < 3) {
        addError(
          diagnostics,
          WaterBodyDiagnosticCode.ValueOutOfRange,
          "$.verticesXZ",
          "Polygon water requires at least three XZ vertices."
        );
      } else {
        for (let index = 0; index < vertices.length; index++) {
          const vertex = readTuple(
            vertices[index],
            2,
            `$.verticesXZ[${index}]`,
            diagnostics,
            -MAX_POSITION_MAGNITUDE,
            MAX_POSITION_MAGNITUDE
          );
          if (vertex) decodedVertices.push(vertex);
        }
      }
      const waterLevel = readNumber(
        record,
        "waterLevel",
        "$.waterLevel",
        { minimum: -MAX_POSITION_MAGNITUDE, maximum: MAX_POSITION_MAGNITUDE },
        diagnostics
      );
      let bedHeight: number | undefined;
      if (record.bedHeight !== undefined) {
        bedHeight = readNumber(
          record,
          "bedHeight",
          "$.bedHeight",
          { minimum: -MAX_POSITION_MAGNITUDE, maximum: MAX_POSITION_MAGNITUDE },
          diagnostics
        );
      }
      if (waterLevel !== undefined && bedHeight !== undefined && bedHeight >= waterLevel) {
        addError(
          diagnostics,
          WaterBodyDiagnosticCode.ValueOutOfRange,
          "$.bedHeight",
          "Polygon bed height must be below water level."
        );
      }
      if (Array.isArray(vertices) && decodedVertices.length === vertices.length && waterLevel !== undefined) {
        value = Object.freeze({
          schemaVersion: WaterBodySourceSchemaVersion.V1,
          kind,
          capabilities,
          ...spatialFieldProperty,
          verticesXZ: Object.freeze(decodedVertices),
          waterLevel,
          bedHeight
        } satisfies PolygonWaterBodySourceV1);
      }
      break;
    }
    case WaterBodySourceKind.OceanNearshore: {
      const descriptor = requireDescriptor(record, diagnostics);
      if (descriptor !== undefined) {
        value = Object.freeze({
          schemaVersion: WaterBodySourceSchemaVersion.V1,
          kind,
          capabilities,
          ...spatialFieldProperty,
          descriptor
        } satisfies OceanNearshoreWaterBodySourceV1);
      }
      break;
    }
    default:
      addError(
        diagnostics,
        WaterBodyDiagnosticCode.UnsupportedSourceKind,
        "$.kind",
        "Unsupported WaterBody source kind."
      );
  }

  return Object.freeze({
    valid: value !== undefined && diagnostics.length === 0,
    value: diagnostics.length === 0 ? value : undefined,
    diagnostics: Object.freeze(diagnostics)
  });
}
