import {
  copyWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot
} from "../../authoring/terrain/WaterTerrainSnapshot";
import { decodeWaterConnectionPorts } from "../../authoring/connections/WaterConnection";
import { decodeLakeBoundary, sampleLakeBoundary, sampleLakeSignedShoreDistance } from "../lake/LakeBoundaryCompiler";
import type { LakeBoundaryV1, SampledLakeBoundary } from "../../authoring/lake/LakeBoundary";
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
  HeightfieldWaterBasinTerrainCoverageV1,
  HeightfieldWaterDiagnostic,
  HeightfieldWaterGridConfig,
  HeightfieldWaterSpatialFieldConfig,
  HeightfieldWaterSurfaceMotionConfig,
  HeightfieldWaterRenderSurfaceV1,
  HeightfieldWaterValidationResult,
  HeightfieldWaterVector2
} from "../../authoring/heightfield/HeightfieldWaterTypes";
import { validateWaterWaveAsset } from "../wave/WaterWaveValidator";
import { HEIGHTFIELD_WATER_DEFAULT_BUDGET } from "./constants";

type UnknownRecord = Record<string, unknown>;

export interface HeightfieldWaterDescriptorValidationResult
  extends HeightfieldWaterValidationResult<HeightfieldWaterDescriptorV1> {
  /** Reuse the validated samples for geometry, atlas coverage and runtime queries. */
  readonly sampledLakeBoundary?: SampledLakeBoundary;
}

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

function readGrid(
  value: unknown,
  diagnostics: HeightfieldWaterDiagnostic[],
  path = "$.grid"
): HeightfieldWaterGridConfig | undefined {
  if (!isRecord(value)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.MissingField, path, "A grid object is required.");
    return undefined;
  }
  const originXZ = readVector2(value.originXZ, `${path}.originXZ`, diagnostics, false);
  const cellSizeXZ = readVector2(value.cellSizeXZ, `${path}.cellSizeXZ`, diagnostics, true);
  const width = readFiniteNumber(value, "width", `${path}.width`, diagnostics);
  const height = readFiniteNumber(value, "height", `${path}.height`, diagnostics);
  for (const [name, dimension] of [
    ["width", width],
    ["height", height]
  ] as const) {
    if (dimension !== undefined && (!Number.isInteger(dimension) || dimension < 1 || dimension > 65535)) {
      push(
        diagnostics,
        HeightfieldWaterDiagnosticCode.ValueOutOfRange,
        `${path}.${name}`,
        "Expected an integer in [1, 65535]."
      );
    }
  }
  if (width !== undefined && height !== undefined && width * height > 0x1_0000_0000) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.ValueOutOfRange,
      path,
      "The source grid must address at most 2^32 texels."
    );
  }
  return originXZ && cellSizeXZ && width !== undefined && height !== undefined
    ? Object.freeze({ originXZ, cellSizeXZ, width, height })
    : undefined;
}

function readSurfaceMotion(
  value: unknown,
  diagnostics: HeightfieldWaterDiagnostic[]
): HeightfieldWaterSurfaceMotionConfig | undefined {
  if (!isRecord(value)) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.MissingField,
      "$.surfaceMotion",
      "A surfaceMotion object is required."
    );
    return undefined;
  }
  const waveStrength = readFiniteNumber(value, "waveStrength", "$.surfaceMotion.waveStrength", diagnostics);
  const shoreDampingWidth = readFiniteNumber(
    value,
    "shoreDampingWidth",
    "$.surfaceMotion.shoreDampingWidth",
    diagnostics
  );
  if (waveStrength !== undefined && (waveStrength < 0 || waveStrength > 4)) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.ValueOutOfRange,
      "$.surfaceMotion.waveStrength",
      "Expected a value in [0, 4]."
    );
  }
  if (shoreDampingWidth !== undefined && (shoreDampingWidth < 0 || shoreDampingWidth > 8192)) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.ValueOutOfRange,
      "$.surfaceMotion.shoreDampingWidth",
      "Expected a value in [0, 8192]."
    );
  }
  return waveStrength === undefined || shoreDampingWidth === undefined
    ? undefined
    : Object.freeze({ waveStrength, shoreDampingWidth });
}

function readSpatialField(
  value: unknown,
  diagnostics: HeightfieldWaterDiagnostic[]
): HeightfieldWaterSpatialFieldConfig | undefined {
  if (!isRecord(value)) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.MissingField,
      "$.spatialField",
      "A spatialField object is required."
    );
    return undefined;
  }
  const signedDistanceRange = readFiniteNumber(
    value,
    "signedDistanceRange",
    "$.spatialField.signedDistanceRange",
    diagnostics
  );
  if (signedDistanceRange !== undefined && (signedDistanceRange < 1 || signedDistanceRange > 8192)) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.ValueOutOfRange,
      "$.spatialField.signedDistanceRange",
      "Expected a value in [1, 8192]."
    );
  }
  return signedDistanceRange === undefined ? undefined : Object.freeze({ signedDistanceRange });
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
      } else if (number > HEIGHTFIELD_WATER_DEFAULT_BUDGET[key]) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.ValueOutOfRange,
          `$.budget.${key}`,
          `Source validation limits may only tighten the compiler hard limit ${HEIGHTFIELD_WATER_DEFAULT_BUDGET[key]}.`
        );
      }
      budget[key] = number;
    }
  }
  return Object.freeze(budget);
}

function preflightLimit(source: UnknownRecord, key: keyof HeightfieldWaterBudgetConfig): number {
  const rawBudget = isRecord(source.budget) ? source.budget[key] : undefined;
  return typeof rawBudget === "number" && Number.isInteger(rawBudget) && rawBudget > 0
    ? Math.min(rawBudget, HEIGHTFIELD_WATER_DEFAULT_BUDGET[key])
    : HEIGHTFIELD_WATER_DEFAULT_BUDGET[key];
}

function pushPreflightLength(
  diagnostics: HeightfieldWaterDiagnostic[],
  path: string,
  actual: number,
  maximum: number
): void {
  if (actual <= maximum) return;
  push(
    diagnostics,
    HeightfieldWaterDiagnosticCode.BudgetExceeded,
    path,
    `Input length ${actual} exceeds trusted preflight limit ${maximum}.`
  );
}

/** Length/dimension-only guard. It intentionally performs no buffer copy or scan. */
export function preflightHeightfieldWaterDescriptorAllocation(source: unknown): readonly HeightfieldWaterDiagnostic[] {
  const diagnostics: HeightfieldWaterDiagnostic[] = [];
  if (!isRecord(source)) return Object.freeze(diagnostics);
  const maximumWet = preflightLimit(source, "maxWetTexelCount");
  const maximumQuery = preflightLimit(source, "maxQueryTexelCount");
  const maximumVertices = preflightLimit(source, "maxVertexCount");
  const maximumTriangles = preflightLimit(source, "maxTriangleCount");
  if (source.wetTexelIndices instanceof Uint32Array) {
    pushPreflightLength(diagnostics, "$.wetTexelIndices", source.wetTexelIndices.length, maximumWet);
  }
  if (source.surfaceHeights instanceof Float32Array) {
    pushPreflightLength(diagnostics, "$.surfaceHeights", source.surfaceHeights.length, maximumWet);
  }
  if (source.bedHeights instanceof Float32Array) {
    pushPreflightLength(diagnostics, "$.bedHeights", source.bedHeights.length, maximumWet);
  }
  if (source.flowVectorsXZ instanceof Float32Array) {
    pushPreflightLength(diagnostics, "$.flowVectorsXZ", source.flowVectorsXZ.length, maximumWet * 2);
  }
  if (isRecord(source.grid)) {
    const width = source.grid.width;
    const height = source.grid.height;
    if (
      typeof width === "number" &&
      typeof height === "number" &&
      Number.isSafeInteger(width) &&
      Number.isSafeInteger(height)
    ) {
      pushPreflightLength(diagnostics, "$.grid", width * height, maximumQuery);
    }
  }
  if (isRecord(source.renderSurface)) {
    const triangles = source.renderSurface.triangleVertices;
    if (triangles instanceof Float32Array) {
      pushPreflightLength(
        diagnostics,
        "$.renderSurface.triangleVertices",
        triangles.length,
        Math.min(maximumTriangles * 9, maximumVertices * 3)
      );
    }
    const coverage = source.renderSurface.coverage;
    if (isRecord(coverage) && coverage.kind === "basin-constrained-terrain-height") {
      if (coverage.basinSupport instanceof Uint8Array) {
        pushPreflightLength(
          diagnostics,
          "$.renderSurface.coverage.basinSupport",
          coverage.basinSupport.length,
          maximumQuery
        );
      }
      if (coverage.terrainHeights instanceof Float32Array) {
        pushPreflightLength(
          diagnostics,
          "$.renderSurface.coverage.terrainHeights",
          coverage.terrainHeights.length,
          maximumQuery
        );
      }
    }
  }
  return Object.freeze(diagnostics);
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

function readUint8Buffer(
  value: unknown,
  path: string,
  diagnostics: HeightfieldWaterDiagnostic[]
): Uint8Array | undefined {
  if (!(value instanceof Uint8Array)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidType, path, "Expected a Uint8Array.");
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

function readBasinTerrainCoverage(
  value: unknown,
  path: string,
  diagnostics: HeightfieldWaterDiagnostic[]
): HeightfieldWaterBasinTerrainCoverageV1 | undefined {
  if (!isRecord(value)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidType, path, "Expected a Terrain-height coverage object.");
    return undefined;
  }
  if (value.kind !== "basin-constrained-terrain-height") {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.InvalidEnum,
      `${path}.kind`,
      "Expected basin-constrained-terrain-height."
    );
  }
  const grid = readGrid(value.grid, diagnostics, `${path}.grid`);
  const basinSupport = readUint8Buffer(value.basinSupport, `${path}.basinSupport`, diagnostics);
  const terrainHeights = readFloat32Buffer(value.terrainHeights, `${path}.terrainHeights`, diagnostics);
  const waterLevel = readFiniteNumber(value, "waterLevel", `${path}.waterLevel`, diagnostics);
  const minimumVisibleDepth = readFiniteNumber(
    value,
    "minimumVisibleDepth",
    `${path}.minimumVisibleDepth`,
    diagnostics
  );
  if (minimumVisibleDepth !== undefined && minimumVisibleDepth < 0) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.ValueOutOfRange,
      `${path}.minimumVisibleDepth`,
      "minimumVisibleDepth must be non-negative."
    );
  }
  if (grid) {
    const expectedLength = grid.width * grid.height;
    if (basinSupport && basinSupport.length !== expectedLength) {
      push(
        diagnostics,
        HeightfieldWaterDiagnosticCode.BufferLengthMismatch,
        `${path}.basinSupport`,
        `basinSupport must contain ${expectedLength} texels.`
      );
    }
    if (terrainHeights && terrainHeights.length !== expectedLength) {
      push(
        diagnostics,
        HeightfieldWaterDiagnosticCode.BufferLengthMismatch,
        `${path}.terrainHeights`,
        `terrainHeights must contain ${expectedLength} samples.`
      );
    }
  }
  if (basinSupport) {
    let supported = false;
    for (let index = 0; index < basinSupport.length; index++) {
      const support = basinSupport[index];
      if (support !== 0 && support !== 1) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.ValueOutOfRange,
          `${path}.basinSupport[${index}]`,
          "Basin support values must be 0 or 1."
        );
        break;
      }
      supported ||= support === 1;
    }
    if (!supported) {
      push(
        diagnostics,
        HeightfieldWaterDiagnosticCode.ValueOutOfRange,
        `${path}.basinSupport`,
        "Basin support must contain at least one supported texel."
      );
    }
  }
  if (terrainHeights) {
    for (let index = 0; index < terrainHeights.length; index++) {
      if (!Number.isFinite(terrainHeights[index])) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.InvalidNumber,
          `${path}.terrainHeights[${index}]`,
          "Terrain-height samples must be finite."
        );
        break;
      }
    }
  }
  return value.kind === "basin-constrained-terrain-height" &&
    grid &&
    basinSupport &&
    terrainHeights &&
    waterLevel !== undefined &&
    minimumVisibleDepth !== undefined
    ? Object.freeze({
        kind: value.kind,
        grid,
        basinSupport,
        terrainHeights,
        waterLevel,
        minimumVisibleDepth
      })
    : undefined;
}

function readRenderSurface(
  value: unknown,
  diagnostics: HeightfieldWaterDiagnostic[]
): HeightfieldWaterRenderSurfaceV1 | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.InvalidType,
      "$.renderSurface",
      "Expected a render surface object."
    );
    return undefined;
  }
  if (value.topology !== "triangle-list") {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.InvalidEnum,
      "$.renderSurface.topology",
      "Expected triangle-list."
    );
  }
  const coverage =
    value.coverage === "geometry"
      ? "geometry"
      : readBasinTerrainCoverage(value.coverage, "$.renderSurface.coverage", diagnostics);
  if (!coverage) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.InvalidEnum,
      "$.renderSurface.coverage",
      "Expected geometry-owned coverage or basin-constrained Terrain-height coverage."
    );
  }
  const triangleVertices = readFloat32Buffer(value.triangleVertices, "$.renderSurface.triangleVertices", diagnostics);
  if (triangleVertices && (triangleVertices.length === 0 || triangleVertices.length % 9 !== 0)) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BufferLengthMismatch,
      "$.renderSurface.triangleVertices",
      "triangleVertices must contain one or more complete XYZ triangle triplets."
    );
  }
  if (triangleVertices) {
    for (let offset = 0; offset + 8 < triangleVertices.length; offset += 9) {
      const ax = triangleVertices[offset]!;
      const az = triangleVertices[offset + 2]!;
      const bx = triangleVertices[offset + 3]!;
      const bz = triangleVertices[offset + 5]!;
      const cx = triangleVertices[offset + 6]!;
      const cz = triangleVertices[offset + 8]!;
      const doubledArea = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (doubledArea >= -1e-8) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.ValueOutOfRange,
          `$.renderSurface.triangleVertices[${offset / 9}]`,
          "Render surface triangles must have non-zero horizontal area and upward-facing XZ winding."
        );
      }
    }
  }
  return triangleVertices && value.topology === "triangle-list" && coverage
    ? Object.freeze({ topology: value.topology, triangleVertices, coverage })
    : undefined;
}

export function resolveHeightfieldWaterBudget(
  descriptor: Pick<HeightfieldWaterDescriptorV1, "budget">
): HeightfieldWaterBudgetConfig {
  return Object.freeze(
    Object.fromEntries(
      BUDGET_KEYS.map((key) => [
        key,
        Math.min(
          descriptor.budget?.[key] ?? HEIGHTFIELD_WATER_DEFAULT_BUDGET[key],
          HEIGHTFIELD_WATER_DEFAULT_BUDGET[key]
        )
      ])
    ) as unknown as HeightfieldWaterBudgetConfig
  );
}

export function validateHeightfieldWaterDescriptor(source: unknown): HeightfieldWaterDescriptorValidationResult {
  const diagnostics: HeightfieldWaterDiagnostic[] = [];
  if (!isRecord(source)) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidRootType, "$", "Expected a descriptor object.");
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  diagnostics.push(...preflightHeightfieldWaterDescriptorAllocation(source));
  if (hasErrors(diagnostics)) {
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
  let bedTerrain: WaterTerrainSnapshot | undefined;
  if (source.bedTerrain !== undefined) {
    try {
      bedTerrain = copyWaterTerrainSnapshot(source.bedTerrain as WaterTerrainSnapshot);
      if (!source.lakeBoundary || !grid) throw new Error("Canonical bed terrain requires a Lake boundary and grid.");
      const corners = [
        [0, 0],
        [grid.width - 1, 0],
        [0, grid.height - 1],
        [grid.width - 1, grid.height - 1]
      ];
      for (const [x, z] of corners)
        if (
          sampleWaterTerrainHeight(
            bedTerrain,
            grid.originXZ[0] + x * grid.cellSizeXZ[0],
            grid.originXZ[1] + z * grid.cellSizeXZ[1]
          ) === undefined
        )
          throw new Error("Canonical bed terrain must cover the full Lake support grid.");
      if (bedHeights && wetTexelIndices)
        for (let i = 0; i < wetTexelIndices.length; i++) {
          const index = wetTexelIndices[i];
          const canonical = sampleWaterTerrainHeight(
            bedTerrain,
            grid.originXZ[0] + (index % grid.width) * grid.cellSizeXZ[0],
            grid.originXZ[1] + Math.floor(index / grid.width) * grid.cellSizeXZ[1]
          );
          if (canonical === undefined || Math.fround(canonical) !== bedHeights[i])
            throw new Error("Lake raster bed samples must match the canonical terrain at every support vertex.");
        }
    } catch (error) {
      push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidNumber, "$.bedTerrain", String(error));
    }
  }
  let connections: ReturnType<typeof decodeWaterConnectionPorts>;
  try {
    connections = decodeWaterConnectionPorts(source.connections);
  } catch (error) {
    push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidNumber, "$.connections", String(error));
  }
  let lakeBoundary: LakeBoundaryV1 | undefined;
  let sampledLakeBoundary: SampledLakeBoundary | undefined;
  if (source.lakeBoundary !== undefined) {
    try {
      lakeBoundary = decodeLakeBoundary(source.lakeBoundary);
      sampledLakeBoundary = sampleLakeBoundary(lakeBoundary);
      if (bedTerrain) {
        // The raster owns half-cell coverage, but canonical Terrain ends at its outer vertices.
        // Its rectangular domain is convex: containing every sampled ring vertex also contains
        // all shoreline segments and the triangulated interior. Never invent a bed by clamping.
        const minX = bedTerrain.origin[0],
          minZ = bedTerrain.origin[1],
          maxX = minX + (bedTerrain.columns - 1) * bedTerrain.spacing,
          maxZ = minZ + (bedTerrain.rows - 1) * (bedTerrain.spacingZ ?? bedTerrain.spacing);
        for (const ring of sampledLakeBoundary.rings)
          for (const p of ring)
            if (p[0] < minX || p[0] > maxX || p[1] < minZ || p[1] > maxZ)
              throw new RangeError("Canonical bed terrain must cover the full Lake boundary.");
      }
      if (lakeBoundary.queryCoverage === "boundary" && grid) {
        if (wetTexelIndices?.length !== grid.width * grid.height) {
          throw new RangeError(
            "Authored Lake boundaries require a complete bathymetry grid; wetness comes from the spline."
          );
        }
        const minX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
        const minZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
        for (const ring of sampledLakeBoundary.rings)
          for (const p of ring) {
            if (
              p[0] < minX - 1e-6 ||
              p[1] < minZ - 1e-6 ||
              p[0] > minX + grid.width * grid.cellSizeXZ[0] + 1e-6 ||
              p[1] > minZ + grid.height * grid.cellSizeXZ[1] + 1e-6
            ) {
              throw new RangeError("Lake boundary leaves its bathymetry grid.");
            }
          }
      }
      if (surfaceHeights?.some((height) => Math.abs(height - lakeBoundary!.waterLevel) > 0.0001)) {
        throw new RangeError("Lake surface heights must all equal its base water level.");
      }
    } catch (error) {
      push(diagnostics, HeightfieldWaterDiagnosticCode.InvalidNumber, "$.lakeBoundary", String(error));
    }
  }
  const renderSurface = readRenderSurface(source.renderSurface, diagnostics);
  const surfaceMotion = readSurfaceMotion(source.surfaceMotion, diagnostics);
  const spatialField = readSpatialField(source.spatialField, diagnostics);
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
    ["$.flowVectorsXZ", flowVectorsXZ],
    ["$.renderSurface.triangleVertices", renderSurface?.triangleVertices]
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
      // Authored Lake grids include dry interpolation support. Preserve its real
      // elevation; only a bed above water INSIDE the resolved boundary is invalid.
      const dryLakeSupport =
        lakeBoundary?.queryCoverage === "boundary" &&
        sampledLakeBoundary &&
        grid &&
        bedHeights[index] > surfaceHeights[index] &&
        sampleLakeSignedShoreDistance(
          sampledLakeBoundary.rings,
          grid.originXZ[0] + (index % grid.width) * grid.cellSizeXZ[0],
          grid.originXZ[1] + Math.floor(index / grid.width) * grid.cellSizeXZ[1]
        ) <= 1e-6;
      if (bedHeights[index] > surfaceHeights[index] && !dryLakeSupport) {
        push(
          diagnostics,
          HeightfieldWaterDiagnosticCode.BedAboveSurface,
          `$.bedHeights[${index}]`,
          "Bed height must not exceed the water-surface height."
        );
      }
    }
  }

  const resolvedBudget = resolveHeightfieldWaterBudget({ budget });
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
  if (renderSurface && renderSurface.triangleVertices.length / 9 > resolvedBudget.maxTriangleCount) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BudgetExceeded,
      "$.budget.maxTriangleCount",
      `Render triangle count ${renderSurface.triangleVertices.length / 9} exceeds budget ${resolvedBudget.maxTriangleCount}.`
    );
  }
  if (renderSurface && renderSurface.triangleVertices.length / 3 > resolvedBudget.maxVertexCount) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BudgetExceeded,
      "$.budget.maxVertexCount",
      `Render vertex count ${renderSurface.triangleVertices.length / 3} exceeds budget ${resolvedBudget.maxVertexCount}.`
    );
  }
  const basinCoverage = renderSurface && renderSurface.coverage !== "geometry" ? renderSurface.coverage : undefined;
  if (basinCoverage && basinCoverage.grid.width * basinCoverage.grid.height > resolvedBudget.maxMapPixelCount) {
    push(
      diagnostics,
      HeightfieldWaterDiagnosticCode.BudgetExceeded,
      "$.budget.maxMapPixelCount",
      `Terrain-height coverage contains ${basinCoverage.grid.width * basinCoverage.grid.height} pixels; budget is ${resolvedBudget.maxMapPixelCount}.`
    );
  }

  const canBuild =
    id !== undefined &&
    grid !== undefined &&
    wetTexelIndices !== undefined &&
    surfaceHeights !== undefined &&
    surfaceMotion !== undefined &&
    spatialField !== undefined &&
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
        ...(bedTerrain ? { bedTerrain } : {}),
        flowVectorsXZ,
        renderSurface,
        lakeBoundary,
        ...(source.connections !== undefined ? { connections } : {}),
        waveAsset: waveValidation.value as WaterWaveAssetV1,
        quality,
        surfaceMotion,
        spatialField,
        budget
      }
    : undefined;
  return Object.freeze({
    valid: Boolean(value) && !hasErrors(diagnostics),
    value,
    sampledLakeBoundary,
    diagnostics: Object.freeze(diagnostics)
  });
}
