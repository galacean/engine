/** Strict, render-only validation for the finite Ocean bathymetry and shore SDF. */
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import {
  OceanNearshoreDiagnosticCode,
  OceanNearshoreDiagnosticSeverity,
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion,
  type OceanNearshoreBudgetConfig,
  type OceanNearshoreDiagnostic,
  type OceanNearshoreGridConfig,
  type OceanNearshoreOutsidePolicies,
  type OceanNearshoreValidationResult,
  type OceanNearshoreVector2,
  type OceanNearshoreWetSource,
  type ValidatedOceanNearshoreDescriptor
} from "../../authoring/ocean/OceanNearshoreTypes";
import {
  OCEAN_NEARSHORE_DEFAULT_BUDGET,
  OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH,
  OCEAN_NEARSHORE_HARD_BUDGET,
  OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE,
  OCEAN_NEARSHORE_MAXIMUM_DEPTH
} from "./constants";

type UnknownRecord = Record<string, unknown>;

const ROOT_KEYS = new Set([
  "schemaVersion",
  "id",
  "waterLevel",
  "grid",
  "bedHeights",
  "signedShoreDistances",
  "wetSource",
  "outsidePolicy",
  "budget"
]);
const GRID_KEYS = new Set(["originXZ", "cellSizeXZ", "width", "height"]);
const WET_SOURCE_KEYS = new Set(["kind", "mask", "minimumDepth"]);
const OUTSIDE_POLICY_KEYS = new Set(["negativeX", "positiveX", "negativeZ", "positiveZ"]);
const BUDGET_KEYS = new Set<keyof OceanNearshoreBudgetConfig>([
  "maxWidth",
  "maxHeight",
  "maxTexelCount",
  "maxAtlasByteLength"
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function addError(
  diagnostics: OceanNearshoreDiagnostic[],
  code: OceanNearshoreDiagnosticCode,
  path: string,
  message: string
): void {
  diagnostics.push({ code, severity: OceanNearshoreDiagnosticSeverity.Error, path, message });
}

function assertKeys(
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidType,
        `${path}.${key}`,
        `Field '${key}' is not part of the render-only Ocean nearshore schema.`
      );
    }
  }
}

function readFiniteNumber(value: unknown, path: string, diagnostics: OceanNearshoreDiagnostic[]): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(
      diagnostics,
      value === undefined ? OceanNearshoreDiagnosticCode.MissingField : OceanNearshoreDiagnosticCode.InvalidNumber,
      path,
      "Expected a finite number."
    );
    return undefined;
  }
  return value;
}

function readVector2(
  value: unknown,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[],
  positive: boolean
): OceanNearshoreVector2 | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((component) => typeof component === "number" && Number.isFinite(component))
  ) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.InvalidType, path, "Expected a finite two-number tuple.");
    return undefined;
  }
  const tuple = Object.freeze([value[0] as number, value[1] as number] as const);
  if (positive && (tuple[0] <= 0 || tuple[1] <= 0)) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.ValueOutOfRange, path, "Both values must be positive.");
  }
  return tuple;
}

function readGrid(value: unknown, diagnostics: OceanNearshoreDiagnostic[]): OceanNearshoreGridConfig | undefined {
  if (!isRecord(value)) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.MissingField, "$.grid", "A grid object is required.");
    return undefined;
  }
  assertKeys(value, GRID_KEYS, "$.grid", diagnostics);
  const originXZ = readVector2(value.originXZ, "$.grid.originXZ", diagnostics, false);
  const cellSizeXZ = readVector2(value.cellSizeXZ, "$.grid.cellSizeXZ", diagnostics, true);
  const width = readFiniteNumber(value.width, "$.grid.width", diagnostics);
  const height = readFiniteNumber(value.height, "$.grid.height", diagnostics);
  if (cellSizeXZ && Math.max(...cellSizeXZ) > OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.ValueOutOfRange,
      "$.grid.cellSizeXZ",
      `Cell size must not exceed ${OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE} metres.`
    );
  }
  for (const [key, dimension, maximum] of [
    ["width", width, OCEAN_NEARSHORE_HARD_BUDGET.maxWidth],
    ["height", height, OCEAN_NEARSHORE_HARD_BUDGET.maxHeight]
  ] as const) {
    if (dimension !== undefined && (!Number.isSafeInteger(dimension) || dimension < 2 || dimension > maximum)) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ValueOutOfRange,
        `$.grid.${key}`,
        `Expected an integer in [2, ${maximum}].`
      );
    }
  }
  return originXZ && cellSizeXZ && width !== undefined && height !== undefined
    ? Object.freeze({ originXZ, cellSizeXZ, width, height })
    : undefined;
}

function readFloat32Array(
  value: unknown,
  length: number | undefined,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[],
  required: boolean
): Float32Array | undefined {
  if (value === undefined && !required) return undefined;
  if (!(value instanceof Float32Array)) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.InvalidType, path, "Expected a Float32Array.");
    return undefined;
  }
  if (length !== undefined && value.length !== length) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.BufferLengthMismatch,
      path,
      `Expected ${length} values, received ${value.length}.`
    );
  }
  if (!value.every(Number.isFinite)) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.InvalidNumber, path, "Every value must be finite.");
  }
  return new Float32Array(value);
}

function readMinimumDepth(value: unknown, diagnostics: OceanNearshoreDiagnostic[]): number {
  if (value === undefined) return OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > OCEAN_NEARSHORE_MAXIMUM_DEPTH) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidDepth,
      "$.wetSource.minimumDepth",
      `Expected a depth in [0, ${OCEAN_NEARSHORE_MAXIMUM_DEPTH}].`
    );
    return OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  }
  return value;
}

function readWetSource(
  value: unknown,
  texelCount: number | undefined,
  diagnostics: OceanNearshoreDiagnostic[]
): OceanNearshoreWetSource | undefined {
  if (!isRecord(value)) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.MissingField, "$.wetSource", "A wetSource is required.");
    return undefined;
  }
  assertKeys(value, WET_SOURCE_KEYS, "$.wetSource", diagnostics);
  const minimumDepth = readMinimumDepth(value.minimumDepth, diagnostics);
  if (value.kind === "water-level") {
    if (value.mask !== undefined) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidType,
        "$.wetSource.mask",
        "Water-level wetSource must not contain a mask."
      );
    }
    return Object.freeze({ kind: "water-level", minimumDepth });
  }
  if (value.kind !== "mask" || !(value.mask instanceof Uint8Array)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidType,
      "$.wetSource",
      "Expected water-level or Uint8 mask wetSource."
    );
    return undefined;
  }
  if (texelCount !== undefined && value.mask.length !== texelCount) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.BufferLengthMismatch,
      "$.wetSource.mask",
      `Expected ${texelCount} values, received ${value.mask.length}.`
    );
  }
  if (!value.mask.every((entry) => entry === 0 || entry === 1)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.ValueOutOfRange,
      "$.wetSource.mask",
      "Mask values must be 0 or 1."
    );
  }
  return Object.freeze({ kind: "mask", mask: new Uint8Array(value.mask), minimumDepth });
}

function readOutsidePolicies(
  value: unknown,
  diagnostics: OceanNearshoreDiagnostic[]
): OceanNearshoreOutsidePolicies | undefined {
  if (!isRecord(value)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.MissingField,
      "$.outsidePolicy",
      "Four edge policies are required."
    );
    return undefined;
  }
  assertKeys(value, OUTSIDE_POLICY_KEYS, "$.outsidePolicy", diagnostics);
  const read = (key: keyof OceanNearshoreOutsidePolicies): OceanNearshoreOutsidePolicy | undefined => {
    const entry = value[key];
    if (entry !== OceanNearshoreOutsidePolicy.DeepOcean && entry !== OceanNearshoreOutsidePolicy.Dry) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidEnum,
        `$.outsidePolicy.${key}`,
        'Expected "deep-ocean" or "dry".'
      );
      return undefined;
    }
    return entry;
  };
  const negativeX = read("negativeX");
  const positiveX = read("positiveX");
  const negativeZ = read("negativeZ");
  const positiveZ = read("positiveZ");
  return negativeX && positiveX && negativeZ && positiveZ
    ? Object.freeze({ negativeX, positiveX, negativeZ, positiveZ })
    : undefined;
}

function readBudget(value: unknown, diagnostics: OceanNearshoreDiagnostic[]): Readonly<OceanNearshoreBudgetConfig> {
  if (value !== undefined && !isRecord(value)) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.InvalidType, "$.budget", "Expected a budget object.");
    return OCEAN_NEARSHORE_DEFAULT_BUDGET;
  }
  const source = isRecord(value) ? value : undefined;
  if (source) assertKeys(source, BUDGET_KEYS, "$.budget", diagnostics);
  const resolved: OceanNearshoreBudgetConfig = { ...OCEAN_NEARSHORE_DEFAULT_BUDGET };
  for (const key of BUDGET_KEYS) {
    const candidate = source?.[key];
    if (candidate === undefined) continue;
    const hardMaximum = OCEAN_NEARSHORE_HARD_BUDGET[key];
    if (!Number.isSafeInteger(candidate) || (candidate as number) <= 0 || (candidate as number) > hardMaximum) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ValueOutOfRange,
        `$.budget.${key}`,
        `Expected a positive integer no greater than ${hardMaximum}.`
      );
      continue;
    }
    (resolved as Record<keyof OceanNearshoreBudgetConfig, number>)[key] = candidate as number;
  }
  return Object.freeze(resolved);
}

function hasErrors(diagnostics: readonly OceanNearshoreDiagnostic[]): boolean {
  return diagnostics.some((entry) => entry.severity === OceanNearshoreDiagnosticSeverity.Error);
}

function validateTexelAuthority(
  waterLevel: number,
  bedHeights: Float32Array,
  signedShoreDistances: Float32Array | undefined,
  wetSource: Readonly<OceanNearshoreWetSource>,
  diagnostics: OceanNearshoreDiagnostic[]
): void {
  const minimumDepth = wetSource.minimumDepth ?? OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  let anyWet = false;
  for (let index = 0; index < bedHeights.length; index++) {
    const depth = waterLevel - bedHeights[index]!;
    if (depth > OCEAN_NEARSHORE_MAXIMUM_DEPTH) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidDepth,
        `$.bedHeights[${index}]`,
        `Water depth ${depth} exceeds ${OCEAN_NEARSHORE_MAXIMUM_DEPTH} metres.`
      );
    }

    const wet = wetSource.kind === "mask" ? wetSource.mask[index] === 1 : depth > minimumDepth;
    if (wetSource.kind === "mask" && wet && !(depth > minimumDepth)) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.MaskedWetDepthMismatch,
        `$.wetSource.mask[${index}]`,
        `Masked wet texel requires waterLevel - bedHeight > ${minimumDepth}; received ${depth}.`
      );
    }
    anyWet ||= wet;

    if (!signedShoreDistances) continue;
    const distance = signedShoreDistances[index]!;
    if (distance === 0) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ShoreDistanceZero,
        `$.signedShoreDistances[${index}]`,
        "Authored shore distance must be strictly positive for wet texels or strictly negative for dry texels."
      );
      continue;
    }
    if ((wet && distance < 0) || (!wet && distance > 0)) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ShoreDistanceSignMismatch,
        `$.signedShoreDistances[${index}]`,
        `Authored shore distance ${distance} contradicts the ${wet ? "wet" : "dry"} texel authority.`
      );
    }
  }
  if (!anyWet) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.NoWetTexels,
      "$.wetSource",
      "Ocean render field has no wet texels."
    );
  }
}

export function validateOceanNearshoreDescriptor(
  source: unknown
): OceanNearshoreValidationResult<ValidatedOceanNearshoreDescriptor> {
  const diagnostics: OceanNearshoreDiagnostic[] = [];
  if (!isRecord(source)) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.InvalidRootType, "$", "Expected an object.");
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  assertKeys(source, ROOT_KEYS, "$", diagnostics);
  if (source.schemaVersion !== OceanNearshoreSchemaVersion.V1) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.UnsupportedSchemaVersion,
      "$.schemaVersion",
      `Expected schema ${OceanNearshoreSchemaVersion.V1}.`
    );
  }
  if (typeof source.id !== "string" || source.id.trim().length === 0) {
    addError(diagnostics, OceanNearshoreDiagnosticCode.InvalidType, "$.id", "Expected a non-empty id.");
  }
  const waterLevel = readFiniteNumber(source.waterLevel, "$.waterLevel", diagnostics);
  const grid = readGrid(source.grid, diagnostics);
  const texelCount = grid ? grid.width * grid.height : undefined;
  const bedHeights = readFloat32Array(source.bedHeights, texelCount, "$.bedHeights", diagnostics, true);
  const signedShoreDistances = readFloat32Array(
    source.signedShoreDistances,
    texelCount,
    "$.signedShoreDistances",
    diagnostics,
    false
  );
  const wetSource = readWetSource(source.wetSource, texelCount, diagnostics);
  const outsidePolicy = readOutsidePolicies(source.outsidePolicy, diagnostics);
  const budget = readBudget(source.budget, diagnostics);

  if (grid) {
    const atlasBytes = grid.width * grid.height * 4;
    for (const [path, actual, maximum] of [
      ["$.grid.width", grid.width, budget.maxWidth],
      ["$.grid.height", grid.height, budget.maxHeight],
      ["$.grid", grid.width * grid.height, budget.maxTexelCount],
      ["$.budget.maxAtlasByteLength", atlasBytes, budget.maxAtlasByteLength]
    ] as const) {
      if (actual > maximum) {
        addError(
          diagnostics,
          OceanNearshoreDiagnosticCode.BudgetExceeded,
          path,
          `${actual} exceeds budget ${maximum}.`
        );
      }
    }
  }

  if (
    waterLevel !== undefined &&
    grid &&
    bedHeights?.length === grid.width * grid.height &&
    wetSource &&
    (wetSource.kind !== "mask" || wetSource.mask.length === grid.width * grid.height) &&
    (!signedShoreDistances || signedShoreDistances.length === grid.width * grid.height)
  ) {
    validateTexelAuthority(waterLevel, bedHeights, signedShoreDistances, wetSource, diagnostics);
  }

  if (
    hasErrors(diagnostics) ||
    waterLevel === undefined ||
    !grid ||
    !bedHeights ||
    !wetSource ||
    !outsidePolicy ||
    typeof source.id !== "string"
  ) {
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  const value: ValidatedOceanNearshoreDescriptor = Object.freeze({
    schemaVersion: OceanNearshoreSchemaVersion.V1,
    id: source.id,
    waterLevel,
    grid,
    bedHeights,
    signedShoreDistances,
    wetSource,
    outsidePolicy,
    budget
  });
  return Object.freeze({ valid: true, value, diagnostics: Object.freeze(diagnostics) });
}

export function assertOceanNearshoreDescriptor(value: unknown): asserts value is OceanNearshoreDescriptorV1 {
  const result = validateOceanNearshoreDescriptor(value);
  if (!result.valid) {
    throw new Error(result.diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join("; "));
  }
}
