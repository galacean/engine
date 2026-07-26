/** Strict validation and normalization for external surface appearance values. */
import {
  WaterSurfaceAppearanceDiagnosticCode,
  WaterSurfaceAppearanceDiagnosticSeverity,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel,
  WaterSurfaceNormalModel,
  WaterSurfaceNormalSampling,
  type WaterSurfaceAppearanceAssetV1,
  type WaterSurfaceAppearanceColor,
  type WaterSurfaceAppearanceDiagnostic,
  type WaterSurfaceAppearanceValidationResult,
  type WaterSurfaceCoastalAlphaAppearance,
  type WaterSurfaceContactFoamAppearance,
  type WaterSurfaceDepthTintAppearance,
  type WaterSurfaceFoamOctaves,
  type WaterSurfaceNormalAppearance
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";

type UnknownRecord = Record<string, unknown>;

interface NumberRule {
  readonly minimum: number;
  readonly maximum: number;
  readonly exclusiveMinimum?: boolean;
}

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA_256_PATTERN = /^[A-Fa-f0-9]{64}$/;
const MAX_DISTANCE = 100_000;
const MAX_TILING = 1_024;
const MAX_SCROLL_SPEED = 1_024;
const MAX_NORMAL_STRENGTH = 4;
const MAX_DEPTH_EXPONENT = 32;
const MAX_FOAM_WORLD_SCALE = 100_000;
const MAX_FOAM_TIME_RATE = 1_024;
const MAX_LACUNARITY = 64;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function addError(
  diagnostics: WaterSurfaceAppearanceDiagnostic[],
  code: WaterSurfaceAppearanceDiagnosticCode,
  path: string,
  message: string
): void {
  diagnostics.push({
    code,
    severity: WaterSurfaceAppearanceDiagnosticSeverity.Error,
    path,
    message
  });
}

function readRequiredRecord(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): UnknownRecord | undefined {
  if (isRecord(value)) return value;
  addError(
    diagnostics,
    value === undefined
      ? WaterSurfaceAppearanceDiagnosticCode.MissingField
      : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
    path,
    value === undefined ? "Required object field is missing." : "Expected an object."
  );
  return undefined;
}

function readFiniteNumber(
  record: UnknownRecord,
  key: string,
  path: string,
  rule: NumberRule,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(
      diagnostics,
      key in record
        ? WaterSurfaceAppearanceDiagnosticCode.InvalidNumber
        : WaterSurfaceAppearanceDiagnosticCode.MissingField,
      path,
      key in record ? "Expected a finite number." : "Required numeric field is missing."
    );
    return undefined;
  }
  const belowMinimum = rule.exclusiveMinimum ? value <= rule.minimum : value < rule.minimum;
  if (belowMinimum || value > rule.maximum) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
      path,
      `Expected a finite value ${rule.exclusiveMinimum ? "greater than" : "greater than or equal to"} ${
        rule.minimum
      } and less than or equal to ${rule.maximum}.`
    );
  }
  return value;
}

function readStableId(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): string | undefined {
  if (typeof value !== "string") {
    addError(
      diagnostics,
      value === undefined
        ? WaterSurfaceAppearanceDiagnosticCode.MissingField
        : WaterSurfaceAppearanceDiagnosticCode.InvalidIdentifier,
      path,
      value === undefined ? "Required identifier is missing." : "Expected a stable logical identifier."
    );
    return undefined;
  }
  if (
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("://") ||
    !STABLE_ID_PATTERN.test(value)
  ) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidIdentifier,
      path,
      "Expected a non-empty stable logical identifier, not a URL."
    );
  }
  return value;
}

function readContentHash(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): string | undefined {
  if (typeof value !== "string" || !SHA_256_PATTERN.test(value)) {
    addError(
      diagnostics,
      value === undefined
        ? WaterSurfaceAppearanceDiagnosticCode.MissingField
        : WaterSurfaceAppearanceDiagnosticCode.InvalidContentHash,
      path,
      value === undefined ? "Required SHA-256 content hash is missing." : "Expected a 64-digit hexadecimal SHA-256."
    );
    return undefined;
  }
  return value.toLowerCase();
}

function readColor(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceAppearanceColor | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      path,
      "Expected a four-number linear RGBA tuple."
    );
    return undefined;
  }
  let valid = true;
  for (let index = 0; index < value.length; index++) {
    const component = value[index];
    if (typeof component !== "number" || !Number.isFinite(component)) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.InvalidNumber,
        `${path}[${index}]`,
        "Expected a finite color component."
      );
      valid = false;
    } else if (component < 0 || component > 1) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
        `${path}[${index}]`,
        "Expected a linear color component in [0, 1]."
      );
      valid = false;
    }
  }
  if (!valid) return undefined;
  return Object.freeze([
    value[0] as number,
    value[1] as number,
    value[2] as number,
    value[3] as number
  ]);
}

function decodeNormal(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceNormalAppearance | undefined {
  const record = readRequiredRecord(value, "$.normal", diagnostics);
  if (!record) return undefined;
  if (record.model === WaterSurfaceNormalModel.ProceduralSlope) {
    return Object.freeze({ model: WaterSurfaceNormalModel.ProceduralSlope });
  }
  if (record.model !== WaterSurfaceNormalModel.ExternalTangentNormal) {
    addError(
      diagnostics,
      "model" in record
        ? WaterSurfaceAppearanceDiagnosticCode.InvalidEnum
        : WaterSurfaceAppearanceDiagnosticCode.MissingField,
      "$.normal.model",
      "Expected procedural-slope or external-tangent-normal."
    );
    return undefined;
  }
  const textureAssetId = readStableId(record.textureAssetId, "$.normal.textureAssetId", diagnostics);
  const textureContentHash = readContentHash(
    record.textureContentHash,
    "$.normal.textureContentHash",
    diagnostics
  );
  if (record.sampling !== WaterSurfaceNormalSampling.WorldXzMirroredDual) {
    addError(
      diagnostics,
      "sampling" in record
        ? WaterSurfaceAppearanceDiagnosticCode.InvalidEnum
        : WaterSurfaceAppearanceDiagnosticCode.MissingField,
      "$.normal.sampling",
      "Expected world-xz-mirrored-dual."
    );
  }
  const tiling = readFiniteNumber(
    record,
    "tiling",
    "$.normal.tiling",
    { minimum: 0, maximum: MAX_TILING, exclusiveMinimum: true },
    diagnostics
  );
  const scrollUvPerSecond = readFiniteNumber(
    record,
    "scrollUvPerSecond",
    "$.normal.scrollUvPerSecond",
    { minimum: -MAX_SCROLL_SPEED, maximum: MAX_SCROLL_SPEED },
    diagnostics
  );
  const strength = readFiniteNumber(
    record,
    "strength",
    "$.normal.strength",
    { minimum: 0, maximum: MAX_NORMAL_STRENGTH, exclusiveMinimum: true },
    diagnostics
  );
  let flipGreen = false;
  if ("flipGreen" in record && typeof record.flipGreen !== "boolean") {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      "$.normal.flipGreen",
      "Expected a boolean when provided."
    );
  } else if (typeof record.flipGreen === "boolean") {
    flipGreen = record.flipGreen;
  }
  if (
    textureAssetId === undefined ||
    textureContentHash === undefined ||
    record.sampling !== WaterSurfaceNormalSampling.WorldXzMirroredDual ||
    tiling === undefined ||
    scrollUvPerSecond === undefined ||
    strength === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    model: WaterSurfaceNormalModel.ExternalTangentNormal,
    textureAssetId,
    textureContentHash,
    sampling: WaterSurfaceNormalSampling.WorldXzMirroredDual,
    tiling,
    scrollUvPerSecond,
    strength,
    flipGreen
  });
}

function decodeDepthTint(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceDepthTintAppearance | undefined {
  const record = readRequiredRecord(value, "$.depthTint", diagnostics);
  if (!record) return undefined;
  if (record.model === WaterSurfaceDepthTintModel.BeerLambert) {
    return Object.freeze({ model: WaterSurfaceDepthTintModel.BeerLambert });
  }
  if (record.model !== WaterSurfaceDepthTintModel.SceneDepthPower) {
    addError(
      diagnostics,
      "model" in record
        ? WaterSurfaceAppearanceDiagnosticCode.InvalidEnum
        : WaterSurfaceAppearanceDiagnosticCode.MissingField,
      "$.depthTint.model",
      "Expected beer-lambert or scene-depth-power."
    );
    return undefined;
  }
  const color = readColor(record.color, "$.depthTint.color", diagnostics);
  const distance = readFiniteNumber(
    record,
    "distance",
    "$.depthTint.distance",
    { minimum: 0, maximum: MAX_DISTANCE, exclusiveMinimum: true },
    diagnostics
  );
  const exponent = readFiniteNumber(
    record,
    "exponent",
    "$.depthTint.exponent",
    { minimum: 0, maximum: MAX_DEPTH_EXPONENT, exclusiveMinimum: true },
    diagnostics
  );
  return color && distance !== undefined && exponent !== undefined
    ? Object.freeze({
        model: WaterSurfaceDepthTintModel.SceneDepthPower,
        color,
        distance,
        exponent
      })
    : undefined;
}

function decodeCoastalAlpha(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceCoastalAlphaAppearance | undefined {
  const record = readRequiredRecord(value, "$.coastalAlpha", diagnostics);
  if (!record) return undefined;
  if (record.model === WaterSurfaceCoastalAlphaModel.LegacyCoverage) {
    return Object.freeze({ model: WaterSurfaceCoastalAlphaModel.LegacyCoverage });
  }
  if (record.model !== WaterSurfaceCoastalAlphaModel.SceneDepth) {
    addError(
      diagnostics,
      "model" in record
        ? WaterSurfaceAppearanceDiagnosticCode.InvalidEnum
        : WaterSurfaceAppearanceDiagnosticCode.MissingField,
      "$.coastalAlpha.model",
      "Expected legacy-coverage or scene-depth."
    );
    return undefined;
  }
  const distance = readFiniteNumber(
    record,
    "distance",
    "$.coastalAlpha.distance",
    { minimum: 0, maximum: MAX_DISTANCE, exclusiveMinimum: true },
    diagnostics
  );
  return distance === undefined
    ? undefined
    : Object.freeze({ model: WaterSurfaceCoastalAlphaModel.SceneDepth, distance });
}

function decodeFoamOctaves(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceFoamOctaves | undefined {
  const record = readRequiredRecord(value, "$.contactFoam.octaves", diagnostics);
  if (!record) return undefined;
  const count = record.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 3) {
    addError(
      diagnostics,
      typeof count === "number"
        ? WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange
        : WaterSurfaceAppearanceDiagnosticCode.InvalidNumber,
      "$.contactFoam.octaves.count",
      "Expected an integer octave count in [1, 3]."
    );
    return undefined;
  }
  if (!Array.isArray(record.weights)) {
    addError(
      diagnostics,
      "weights" in record
        ? WaterSurfaceAppearanceDiagnosticCode.InvalidType
        : WaterSurfaceAppearanceDiagnosticCode.MissingField,
      "$.contactFoam.octaves.weights",
      "Expected an octave weight tuple."
    );
    return undefined;
  }
  if (record.weights.length !== count) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.TupleLengthMismatch,
      "$.contactFoam.octaves.weights",
      `Expected ${count} octave weight values, received ${record.weights.length}.`
    );
  }
  let valid = record.weights.length === count;
  for (let index = 0; index < record.weights.length; index++) {
    const weight = record.weights[index];
    if (typeof weight !== "number" || !Number.isFinite(weight)) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.InvalidNumber,
        `$.contactFoam.octaves.weights[${index}]`,
        "Expected a finite octave weight."
      );
      valid = false;
    } else if (weight < 0) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
        `$.contactFoam.octaves.weights[${index}]`,
        "Octave weights must be non-negative."
      );
      valid = false;
    }
  }
  if (!valid) return undefined;
  if (count === 1) {
    const weights: readonly [number] = Object.freeze([record.weights[0] as number]);
    return Object.freeze({ count: 1, weights });
  }
  if (count === 2) {
    const weights: readonly [number, number] = Object.freeze([
      record.weights[0] as number,
      record.weights[1] as number
    ]);
    return Object.freeze({
      count: 2,
      weights
    });
  }
  const weights: readonly [number, number, number] = Object.freeze([
    record.weights[0] as number,
    record.weights[1] as number,
    record.weights[2] as number
  ]);
  return Object.freeze({
    count: 3,
    weights
  });
}

function decodeContactFoam(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceContactFoamAppearance | undefined {
  const record = readRequiredRecord(value, "$.contactFoam", diagnostics);
  if (!record) return undefined;
  if (record.model === WaterSurfaceContactFoamModel.None) {
    return Object.freeze({ model: WaterSurfaceContactFoamModel.None });
  }
  if (record.model !== WaterSurfaceContactFoamModel.SceneDepthVoronoi) {
    addError(
      diagnostics,
      "model" in record
        ? WaterSurfaceAppearanceDiagnosticCode.InvalidEnum
        : WaterSurfaceAppearanceDiagnosticCode.MissingField,
      "$.contactFoam.model",
      "Expected none or scene-depth-voronoi."
    );
    return undefined;
  }
  const worldScale = readFiniteNumber(
    record,
    "worldScale",
    "$.contactFoam.worldScale",
    { minimum: 0, maximum: MAX_FOAM_WORLD_SCALE, exclusiveMinimum: true },
    diagnostics
  );
  const timeRate = readFiniteNumber(
    record,
    "timeRate",
    "$.contactFoam.timeRate",
    { minimum: 0, maximum: MAX_FOAM_TIME_RATE, exclusiveMinimum: true },
    diagnostics
  );
  const opacity = readFiniteNumber(
    record,
    "opacity",
    "$.contactFoam.opacity",
    { minimum: 0, maximum: 1, exclusiveMinimum: true },
    diagnostics
  );
  const contactDistance = readFiniteNumber(
    record,
    "contactDistance",
    "$.contactFoam.contactDistance",
    { minimum: 0, maximum: MAX_DISTANCE, exclusiveMinimum: true },
    diagnostics
  );
  const octaves = decodeFoamOctaves(record.octaves, diagnostics);
  const lacunarity = readFiniteNumber(
    record,
    "lacunarity",
    "$.contactFoam.lacunarity",
    { minimum: 0, maximum: MAX_LACUNARITY, exclusiveMinimum: true },
    diagnostics
  );
  const suppressRefraction = readFiniteNumber(
    record,
    "suppressRefraction",
    "$.contactFoam.suppressRefraction",
    { minimum: 0, maximum: 1 },
    diagnostics
  );
  const smoothnessReduction = readFiniteNumber(
    record,
    "smoothnessReduction",
    "$.contactFoam.smoothnessReduction",
    { minimum: 0, maximum: 1 },
    diagnostics
  );
  if (
    worldScale === undefined ||
    timeRate === undefined ||
    opacity === undefined ||
    contactDistance === undefined ||
    octaves === undefined ||
    lacunarity === undefined ||
    suppressRefraction === undefined ||
    smoothnessReduction === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    model: WaterSurfaceContactFoamModel.SceneDepthVoronoi,
    worldScale,
    timeRate,
    opacity,
    contactDistance,
    octaves,
    lacunarity,
    suppressRefraction,
    smoothnessReduction
  });
}

export function validateWaterSurfaceAppearanceAsset(
  source: unknown
): WaterSurfaceAppearanceValidationResult {
  const diagnostics: WaterSurfaceAppearanceDiagnostic[] = [];
  if (!isRecord(source)) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidRootType,
      "$",
      "Expected a surface appearance object."
    );
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  if (source.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V1) {
    addError(
      diagnostics,
      "schemaVersion" in source
        ? WaterSurfaceAppearanceDiagnosticCode.UnsupportedSchemaVersion
        : WaterSurfaceAppearanceDiagnosticCode.MissingField,
      "$.schemaVersion",
      "Expected surface appearance schema version 1."
    );
  }
  const id = readStableId(source.id, "$.id", diagnostics);
  const normal = decodeNormal(source.normal, diagnostics);
  const depthTint = decodeDepthTint(source.depthTint, diagnostics);
  const coastalAlpha = decodeCoastalAlpha(source.coastalAlpha, diagnostics);
  const contactFoam = decodeContactFoam(source.contactFoam, diagnostics);
  const frozenDiagnostics = Object.freeze(diagnostics);
  if (
    diagnostics.length > 0 ||
    id === undefined ||
    normal === undefined ||
    depthTint === undefined ||
    coastalAlpha === undefined ||
    contactFoam === undefined
  ) {
    return Object.freeze({ valid: false, diagnostics: frozenDiagnostics });
  }
  const value: WaterSurfaceAppearanceAssetV1 = Object.freeze({
    schemaVersion: WaterSurfaceAppearanceSchemaVersion.V1,
    id,
    normal,
    depthTint,
    coastalAlpha,
    contactFoam
  });
  return Object.freeze({ valid: true, value, diagnostics: frozenDiagnostics });
}
