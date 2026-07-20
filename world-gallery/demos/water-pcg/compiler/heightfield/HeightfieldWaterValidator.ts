/** Strict decoding and semantic validation for external heightfield-water descriptors. */
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveDiagnosticSeverity } from "../../authoring/wave/enums/WaterWaveDiagnostic";
import type { WaterWaveAssetV1 } from "../../authoring/wave/WaterWaveTypes";
import {
  HeightfieldWaterDiagnosticCode,
  HeightfieldWaterDiagnosticSeverity,
  HeightfieldWaterSchemaVersion
} from "../../authoring/heightfield/HeightfieldWaterEnums";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type {
  HeightfieldWaterBudgetConfig,
  HeightfieldWaterColor,
  HeightfieldWaterDiagnostic,
  HeightfieldWaterGridConfig,
  HeightfieldWaterMaterialConfig,
  HeightfieldWaterValidationResult,
  HeightfieldWaterVector2
} from "../../authoring/heightfield/HeightfieldWaterTypes";
import { validateWaterWaveAsset } from "../wave/WaterWaveValidator";
import { HEIGHTFIELD_WATER_DEFAULT_BUDGET } from "./constants";

type UnknownRecord = Record<string, unknown>;

const BUDGET_KEYS = [
  "maxWetTexelCount",
  "maxQueryTexelCount",
  "maxComponentCount",
  "maxVertexCount",
  "maxTriangleCount",
  "maxChunkCount",
  "maxMapPixelCount"
] as const satisfies readonly (keyof HeightfieldWaterBudgetConfig)[];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function push(
  diagnostics: HeightfieldWaterDiagnostic[],
  code: HeightfieldWaterDiagnosticCode,
  path: string,
  message: string
): void {
  diagnostics.push({ code, severity: HeightfieldWaterDiagnosticSeverity.Error, path, message });
}

function hasErrors(diagnostics: readonly HeightfieldWaterDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === HeightfieldWaterDiagnosticSeverity.Error);
}

function readFiniteNumber(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: HeightfieldWaterDiagnostic[]
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    push(
      diagnostics,
      key in record ? HeightfieldWaterDiagnosticCode.InvalidNumber : HeightfieldWaterDiagnosticCode.MissingField,
      path,
      key in record ? "Expected a finite number." : "Required numeric field is missing."
    );
    return undefined;
  }
  return value;
}

function readVector2(
  value: unknown,
  path: string,
  diagnostics: HeightfieldWaterDiagnostic[],
  positive: boolean
): HeightfieldWaterVector2 | undefined {
  if (!Array.isArray(value) || value.length !== 2) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidType, path, "Expected a two-number tuple.");
    return undefined;
  }
  if (!value.every((component) => typeof component === "number" && Number.isFinite(component))) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidNumber, path, "Tuple values must be finite numbers.");
    return undefined;
  }
  if (positive && value.some((component) => component <= 0)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.ValueOutOfRange, path, "Tuple values must be greater than zero.");
  }
  return Object.freeze([value[0] as number, value[1] as number] as const);
}

function readGrid(value: unknown, diagnostics: HeightfieldWaterDiagnostic[]): HeightfieldWaterGridConfig | undefined {
  if (!isRecord(value)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.MissingField, "$.grid", "A grid object is required.");
    return undefined;
  }
  const originXZ = readVector2(value.originXZ, "$.grid.originXZ", diagnostics, false);
  const cellSizeXZ = readVector2(value.cellSizeXZ, "$.grid.cellSizeXZ", diagnostics, true);
  const width = readFiniteNumber(value, "width", "$.grid.width", diagnostics);
  const height = readFiniteNumber(value, "height", "$.grid.height", diagnostics);
  for (const [name, dimension] of [
    ["width", width],
    ["height", height]
  ] as const) {
    if (dimension !== undefined && (!Number.isInteger(dimension) || dimension < 1 || dimension > 65535)) {
      push(
        diagnostics,
        HeightfieldWaterDiagnosticCode.ValueOutOfRange,
        `$.grid.${name}`,
        "Expected an integer in [1, 65535]."
      );
    }
  }
  if (width !== undefined && height !== undefined && width * height > 0x1_0000_0000) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.ValueOutOfRange,
      "$.grid",
      "The source grid must address at most 2^32 texels."
    );
  }
  return originXZ && cellSizeXZ && width !== undefined && height !== undefined
    ? Object.freeze({ originXZ, cellSizeXZ, width, height })
    : undefined;
}

function readColor(
  value: unknown,
  path: string,
  diagnostics: HeightfieldWaterDiagnostic[]
): HeightfieldWaterColor | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((component) => typeof component === "number" && Number.isFinite(component))
  ) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidType, path, "Expected four finite RGBA numbers.");
    return undefined;
  }
  if (value.some((component) => (component as number) < 0 || (component as number) > 1)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.ValueOutOfRange, path, "RGBA values must be in [0, 1].");
  }
  return Object.freeze([value[0] as number, value[1] as number, value[2] as number, value[3] as number] as const);
}

function readMaterial(
  value: unknown,
  diagnostics: HeightfieldWaterDiagnostic[]
): HeightfieldWaterMaterialConfig | undefined {
  if (!isRecord(value)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.MissingField, "$.material", "A material object is required.");
    return undefined;
  }
  const shallowColor = readColor(value.shallowColor, "$.material.shallowColor", diagnostics);
  const deepColor = readColor(value.deepColor, "$.material.deepColor", diagnostics);
  const opacity = readFiniteNumber(value, "opacity", "$.material.opacity", diagnostics);
  const shoreFoamWidth = readFiniteNumber(value, "shoreFoamWidth", "$.material.shoreFoamWidth", diagnostics);
  const microNormalStrength = readFiniteNumber(
    value,
    "microNormalStrength",
    "$.material.microNormalStrength",
    diagnostics
  );
  const waveStrength = readFiniteNumber(value, "waveStrength", "$.material.waveStrength", diagnostics);
  const ranges: Array<[string, number | undefined, number, number]> = [
    ["opacity", opacity, 0, 1],
    ["shoreFoamWidth", shoreFoamWidth, 0, 1024],
    ["microNormalStrength", microNormalStrength, 0, 4],
    ["waveStrength", waveStrength, 0, 4]
  ];
  for (const [name, number, minimum, maximum] of ranges) {
    if (number !== undefined && (number < minimum || number > maximum)) {
      push(
        diagnostics,
        HeightfieldWaterDiagnosticCode.ValueOutOfRange,
        `$.material.${name}`,
        `Expected a value in [${minimum}, ${maximum}].`
      );
    }
  }
  return shallowColor &&
    deepColor &&
    opacity !== undefined &&
    shoreFoamWidth !== undefined &&
    microNormalStrength !== undefined &&
    waveStrength !== undefined
    ? Object.freeze({ shallowColor, deepColor, opacity, shoreFoamWidth, microNormalStrength, waveStrength })
    : undefined;
}

function readBudget(
  value: unknown,
  diagnostics: HeightfieldWaterDiagnostic[]
): Partial<HeightfieldWaterBudgetConfig> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidType, "$.budget", "Expected a budget object.");
    return undefined;
  }
  const budget: Partial<Record<keyof HeightfieldWaterBudgetConfig, number>> = {};
  for (const key of BUDGET_KEYS) {
    if (!(key in value)) continue;
    const number = readFiniteNumber(value, key, `$.budget.${key}`, diagnostics);
    if (number !== undefined) {
      if (!Number.isInteger(number) || number < 1) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.ValueOutOfRange,
          `$.budget.${key}`,
          "Budget values must be positive integers."
        );
      }
      budget[key] = number;
    }
  }
  return Object.freeze(budget);
}

function readUint32Buffer(
  value: unknown,
  path: string,
  diagnostics: HeightfieldWaterDiagnostic[]
): Uint32Array | undefined {
  if (!(value instanceof Uint32Array)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidType, path, "Expected a Uint32Array.");
    return undefined;
  }
  return value.slice();
}

function readFloat32Buffer(
  value: unknown,
  path: string,
  diagnostics: HeightfieldWaterDiagnostic[],
  optional = false
): Float32Array | undefined {
  if (value === undefined && optional) return undefined;
  if (!(value instanceof Float32Array)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidType, path, "Expected a Float32Array.");
    return undefined;
  }
  return value.slice();
}

export function resolveHeightfieldWaterBudget(
  descriptor: Pick<HeightfieldWaterDescriptorV1, "budget">
): HeightfieldWaterBudgetConfig {
  return Object.freeze({ ...HEIGHTFIELD_WATER_DEFAULT_BUDGET, ...descriptor.budget });
}

export function validateHeightfieldWaterDescriptor(
  source: unknown
): HeightfieldWaterValidationResult<HeightfieldWaterDescriptorV1> {
  const diagnostics: HeightfieldWaterDiagnostic[] = [];
  if (!isRecord(source)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidRootType, "$", "Expected a descriptor object.");
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }

  if (source.schemaVersion !== HeightfieldWaterSchemaVersion.V1) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.UnsupportedSchemaVersion,
      "$.schemaVersion",
      `Expected schema version ${HeightfieldWaterSchemaVersion.V1}.`
    );
  }
  const id = typeof source.id === "string" && source.id.trim().length > 0 ? source.id : undefined;
  if (!id) push(diagnostics, HeightfieldWaterDiagnosticCode.MissingField, "$.id", "A non-empty id is required.");
  const grid = readGrid(source.grid, diagnostics);
  const wetTexelIndices = readUint32Buffer(source.wetTexelIndices, "$.wetTexelIndices", diagnostics);
  const surfaceHeights = readFloat32Buffer(source.surfaceHeights, "$.surfaceHeights", diagnostics);
  const bedHeights = readFloat32Buffer(source.bedHeights, "$.bedHeights", diagnostics, true);
  const flowVectorsXZ = readFloat32Buffer(source.flowVectorsXZ, "$.flowVectorsXZ", diagnostics, true);
  const material = readMaterial(source.material, diagnostics);
  const budget = readBudget(source.budget, diagnostics);

  const quality = source.quality;
  if (quality !== WaterQualityTier.Low && quality !== WaterQualityTier.Medium && quality !== WaterQualityTier.High) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidEnum, "$.quality", "Expected low, medium, or high.");
  }

  const waveValidation = validateWaterWaveAsset(source.waveAsset);
  for (const waveDiagnostic of waveValidation.diagnostics) {
    diagnostics.push({
      code: HeightfieldWaterDiagnosticCode.InvalidWaveAsset,
      severity:
        waveDiagnostic.severity === WaterWaveDiagnosticSeverity.Error
          ? HeightfieldWaterDiagnosticSeverity.Error
          : waveDiagnostic.severity === WaterWaveDiagnosticSeverity.Warning
            ? HeightfieldWaterDiagnosticSeverity.Warning
            : HeightfieldWaterDiagnosticSeverity.Info,
      path: `$.waveAsset${waveDiagnostic.path.startsWith("$") ? waveDiagnostic.path.slice(1) : `.${waveDiagnostic.path}`}`,
      message: waveDiagnostic.message
    });
  }

  const wetCount = wetTexelIndices?.length;
  if (wetCount === 0) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.ValueOutOfRange,
      "$.wetTexelIndices",
      "At least one wet texel is required."
    );
  }
  if (wetCount !== undefined && surfaceHeights && surfaceHeights.length !== wetCount) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BufferLengthMismatch,
      "$.surfaceHeights",
      "surfaceHeights must contain one value per wet texel."
    );
  }
  if (wetCount !== undefined && bedHeights && bedHeights.length !== wetCount) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BufferLengthMismatch,
      "$.bedHeights",
      "bedHeights must contain one value per wet texel."
    );
  }
  if (wetCount !== undefined && flowVectorsXZ && flowVectorsXZ.length !== wetCount * 2) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BufferLengthMismatch,
      "$.flowVectorsXZ",
      "flowVectorsXZ must contain two values per wet texel."
    );
  }

  if (wetTexelIndices && grid) {
    const texelCount = grid.width * grid.height;
    for (let index = 0; index < wetTexelIndices.length; index++) {
      const texelIndex = wetTexelIndices[index];
      if (texelIndex >= texelCount) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.TexelIndexOutOfRange,
          `$.wetTexelIndices[${index}]`,
          `Texel index must be less than ${texelCount}.`
        );
      }
      if (index > 0 && texelIndex <= wetTexelIndices[index - 1]) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.TexelOrderInvalid,
          `$.wetTexelIndices[${index}]`,
          "Wet texel indices must be strictly increasing."
        );
      }
    }
  }

  for (const [path, values] of [
    ["$.surfaceHeights", surfaceHeights],
    ["$.bedHeights", bedHeights],
    ["$.flowVectorsXZ", flowVectorsXZ]
  ] as const) {
    if (!values) continue;
    for (let index = 0; index < values.length; index++) {
      if (!Number.isFinite(values[index])) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.InvalidNumber,
          `${path}[${index}]`,
          "Buffer values must be finite."
        );
      }
    }
  }
  if (surfaceHeights && bedHeights && surfaceHeights.length === bedHeights.length) {
    for (let index = 0; index < surfaceHeights.length; index++) {
      if (bedHeights[index] > surfaceHeights[index]) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.BedAboveSurface,
          `$.bedHeights[${index}]`,
          "Bed height must not exceed the water-surface height."
        );
      }
    }
  }

  const resolvedBudget = Object.freeze({ ...HEIGHTFIELD_WATER_DEFAULT_BUDGET, ...budget });
  if (wetCount !== undefined && wetCount > resolvedBudget.maxWetTexelCount) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BudgetExceeded,
      "$.budget.maxWetTexelCount",
      `Wet texel count ${wetCount} exceeds budget ${resolvedBudget.maxWetTexelCount}.`
    );
  }
  if (grid && grid.width * grid.height > resolvedBudget.maxQueryTexelCount) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BudgetExceeded,
      "$.budget.maxQueryTexelCount",
      `Dense query grid size ${grid.width * grid.height} exceeds budget ${resolvedBudget.maxQueryTexelCount}.`
    );
  }

  const canBuild =
    id !== undefined &&
    grid !== undefined &&
    wetTexelIndices !== undefined &&
    surfaceHeights !== undefined &&
    material !== undefined &&
    waveValidation.value !== undefined &&
    (quality === WaterQualityTier.Low || quality === WaterQualityTier.Medium || quality === WaterQualityTier.High);
  const value: HeightfieldWaterDescriptorV1 | undefined = canBuild
    ? {
        schemaVersion: HeightfieldWaterSchemaVersion.V1,
        id,
        grid,
        wetTexelIndices,
        surfaceHeights,
        bedHeights,
        flowVectorsXZ,
        waveAsset: waveValidation.value as WaterWaveAssetV1,
        quality,
        material,
        budget
      }
    : undefined;
  return Object.freeze({
    valid: Boolean(value) && !hasErrors(diagnostics),
    value,
    diagnostics: Object.freeze(diagnostics)
  });
}
