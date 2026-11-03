import { waterTerrainContentHash } from "../../authoring/terrain/WaterTerrainIdentity";
import { tessellateLakeSurface } from "../lake/LakeSurfaceTessellation";
import { triangulateLakeBoundary } from "../lake/LakeBoundaryCompiler";
/** Public deterministic compiler for arbitrary raster-defined curved water surfaces. */
import {
  HeightfieldWaterDiagnosticCode,
  HeightfieldWaterDiagnosticSeverity
} from "../../authoring/heightfield/HeightfieldWaterEnums";
import type {
  HeightfieldWaterBudgetConfig,
  HeightfieldWaterDiagnostic
} from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type { WaterQueryQualityV2 } from "../../authoring/quality/WaterQualityPlan";
import { numericContentIdentity } from "../shared/numericIdentity";
import { hashStableValue } from "../shared/determinism";
import { compilePhysicalWaterWaveAsset } from "../wave/WaterWaveCompiler";
import { createHeightfieldWaterQueryGrid, prepareHeightfieldWaterData } from "./HeightfieldWaterComponentCompiler";
import type {
  HeightfieldWaterCompiledData,
  HeightfieldWaterCompileResult,
  HeightfieldWaterCompileStats
} from "./HeightfieldWaterCompiledTypes";
import {
  compileHeightfieldWaterChunks,
  compileHeightfieldWaterRenderSurfaceChunks,
  createHeightfieldWaterSurfaceTopology,
  estimateHeightfieldWaterRenderSurfaceGeometry,
  estimateHeightfieldWaterTopologyGeometry,
  preflightHeightfieldWaterTopologyAllocation
} from "./HeightfieldWaterGeometryCompiler";
import { HeightfieldWaterGeneratedBudgetExceededError } from "./internalTypes";
import {
  compileHeightfieldWaterLocalMap,
  resolveHeightfieldWaterLocalMapDimensions,
  resolveHeightfieldWaterLocalMapDimensionsForDescriptor
} from "./HeightfieldWaterLocalMapCompiler";
import { HEIGHTFIELD_WATER_AGGREGATION_SCALE, HEIGHTFIELD_WATER_COMPILER_VERSION } from "./constants";
import { resolveHeightfieldWaterBudget, validateHeightfieldWaterDescriptor } from "./HeightfieldWaterValidator";

function addBudgetDiagnostic(
  diagnostics: HeightfieldWaterDiagnostic[],
  key: keyof HeightfieldWaterBudgetConfig,
  actual: number,
  limit: number
): void {
  if (actual <= limit) return;
  diagnostics.push({
    code: HeightfieldWaterDiagnosticCode.BudgetExceeded,
    severity: HeightfieldWaterDiagnosticSeverity.Error,
    path: `$.budget.${key}`,
    message: `Compiled value ${actual} exceeds budget ${limit}.`
  });
}

function hasErrors(diagnostics: readonly HeightfieldWaterDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === HeightfieldWaterDiagnosticSeverity.Error);
}

/**
 * Stable authoring/compile identity shared by WaterBody asset registration and
 * the compiler output. Callers must still run the strict descriptor validator
 * before treating this hash as proof that the source is valid.
 */
export function computeHeightfieldWaterPhysicalSourceHash(descriptor: HeightfieldWaterDescriptorV1): string {
  return hashStableValue({
    physicalSchemaVersion: 2,
    schemaVersion: descriptor.schemaVersion,
    ...(descriptor.connections ? { connections: descriptor.connections } : {}),
    ...(descriptor.lakeBoundary ? { lakeBoundary: descriptor.lakeBoundary } : {}),
    grid: descriptor.grid,
    wetTexelIndices: numericContentIdentity(descriptor.wetTexelIndices),
    surfaceHeights: numericContentIdentity(descriptor.surfaceHeights),
    bedHeights: descriptor.bedHeights ? numericContentIdentity(descriptor.bedHeights) : undefined,
    ...(descriptor.bedTerrain ? { bedTerrainHash: waterTerrainContentHash(descriptor.bedTerrain) } : {}),
    flowVectorsXZ: descriptor.flowVectorsXZ ? numericContentIdentity(descriptor.flowVectorsXZ) : undefined,
    waveAsset: descriptor.waveAsset,
    surfaceMotion: descriptor.surfaceMotion
  });
}

/** Compile-input identity. This may vary with implementation Quality and visual bake inputs. */
export function computeHeightfieldWaterSourceHash(descriptor: HeightfieldWaterDescriptorV1): string {
  const budget = resolveHeightfieldWaterBudget(descriptor);
  return hashStableValue({
    compilerVersion: HEIGHTFIELD_WATER_COMPILER_VERSION,
    schemaVersion: descriptor.schemaVersion,
    ...(descriptor.connections ? { connections: descriptor.connections } : {}),
    ...(descriptor.lakeBoundary ? { lakeBoundary: descriptor.lakeBoundary } : {}),
    id: descriptor.id,
    grid: descriptor.grid,
    wetTexelIndices: numericContentIdentity(descriptor.wetTexelIndices),
    surfaceHeights: numericContentIdentity(descriptor.surfaceHeights),
    bedHeights: descriptor.bedHeights ? numericContentIdentity(descriptor.bedHeights) : undefined,
    ...(descriptor.bedTerrain ? { bedTerrainHash: waterTerrainContentHash(descriptor.bedTerrain) } : {}),
    flowVectorsXZ: descriptor.flowVectorsXZ ? numericContentIdentity(descriptor.flowVectorsXZ) : undefined,
    ...(descriptor.renderSurface
      ? {
          renderSurface: {
            topology: descriptor.renderSurface.topology,
            triangleVertices: numericContentIdentity(descriptor.renderSurface.triangleVertices),
            coverage:
              descriptor.renderSurface.coverage === "geometry"
                ? "geometry"
                : {
                    kind: descriptor.renderSurface.coverage.kind,
                    grid: descriptor.renderSurface.coverage.grid,
                    basinSupport: numericContentIdentity(descriptor.renderSurface.coverage.basinSupport),
                    terrainHeights: numericContentIdentity(descriptor.renderSurface.coverage.terrainHeights),
                    waterLevel: descriptor.renderSurface.coverage.waterLevel,
                    minimumVisibleDepth: descriptor.renderSurface.coverage.minimumVisibleDepth
                  }
          }
        }
      : {}),
    waveAsset: descriptor.waveAsset,
    quality: descriptor.quality,
    surfaceMotion: descriptor.surfaceMotion,
    spatialField: descriptor.spatialField,
    budget
  });
}

export interface HeightfieldWaterCompileOptions {
  /** Dense remains the default; sparse uses dense storage, off omits all CPU QueryGrid buffers. */
  readonly queryQuality?: WaterQueryQualityV2;
}

export function computeHeightfieldWaterCompileHash(
  descriptor: HeightfieldWaterDescriptorV1,
  queryQuality: WaterQueryQualityV2 = "dense"
): string {
  return compileHashFromSourceHash(computeHeightfieldWaterSourceHash(descriptor), queryQuality);
}

/** HF currently stores every non-off query request as the same dense grid. */
export function resolveHeightfieldWaterQueryRepresentation(queryQuality: WaterQueryQualityV2): "off" | "dense" {
  if (queryQuality === "off") return "off";
  if (queryQuality === "sparse" || queryQuality === "dense") return "dense";
  throw new TypeError(`Unsupported Heightfield query quality '${String(queryQuality)}'.`);
}

export function compileHashFromSourceHash(sourceHash: string, queryQuality: WaterQueryQualityV2): string {
  const representation = resolveHeightfieldWaterQueryRepresentation(queryQuality);
  return representation === "dense"
    ? sourceHash
    : hashStableValue({
        compilerVersion: HEIGHTFIELD_WATER_COMPILER_VERSION,
        sourceHash,
        queryQuality: representation
      });
}

export class HeightfieldWaterCompiler {
  private constructor() {}

  static compile(
    source: unknown,
    options: Readonly<HeightfieldWaterCompileOptions> = {}
  ): HeightfieldWaterCompileResult {
    const validation = validateHeightfieldWaterDescriptor(source);
    const diagnostics = [...validation.diagnostics];
    if (!validation.valid || !validation.value) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }
    let descriptor = validation.value;
    const queryQuality = resolveHeightfieldWaterQueryRepresentation(options.queryQuality ?? "dense");
    const budget = resolveHeightfieldWaterBudget(descriptor);
    const waveSet = compilePhysicalWaterWaveAsset(descriptor.waveAsset);
    const maximumDisplacement = waveSet.maxVerticalDisplacement * descriptor.surfaceMotion.waveStrength;
    const lakeBoundary = validation.sampledLakeBoundary;
    if (lakeBoundary) {
      try {
        const maximumTriangles = budget.maxTriangleCount;
        let triangleVertices = triangulateLakeBoundary(lakeBoundary, maximumTriangles);
        if (maximumDisplacement > 0) {
          triangleVertices = tessellateLakeSurface(
            triangleVertices,
            Math.min(...descriptor.grid.cellSizeXZ),
            maximumTriangles
          );
        }
        descriptor = {
          ...descriptor,
          renderSurface: {
            topology: "triangle-list",
            triangleVertices,
            coverage: descriptor.renderSurface?.coverage ?? "geometry"
          }
        };
      } catch (error) {
        diagnostics.push({
          code: HeightfieldWaterDiagnosticCode.BudgetExceeded,
          severity: HeightfieldWaterDiagnosticSeverity.Error,
          path: "$.lakeBoundary",
          message: String(error)
        });
        return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
      }
    }
    const aggregationScale = HEIGHTFIELD_WATER_AGGREGATION_SCALE[descriptor.quality];
    const descriptorMapDimensions = resolveHeightfieldWaterLocalMapDimensionsForDescriptor(descriptor);
    addBudgetDiagnostic(diagnostics, "maxMapPixelCount", descriptorMapDimensions.pixelCount, budget.maxMapPixelCount);
    try {
      preflightHeightfieldWaterTopologyAllocation(descriptor, aggregationScale, budget);
    } catch (error) {
      if (!(error instanceof HeightfieldWaterGeneratedBudgetExceededError)) throw error;
      addBudgetDiagnostic(diagnostics, error.key, error.actual, error.limit);
    }
    if (hasErrors(diagnostics)) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }
    let prepared;
    let topology;
    try {
      prepared = prepareHeightfieldWaterData(descriptor, budget);
      topology = descriptor.renderSurface
        ? undefined
        : createHeightfieldWaterSurfaceTopology(prepared, aggregationScale, budget);
    } catch (error) {
      if (!(error instanceof HeightfieldWaterGeneratedBudgetExceededError)) throw error;
      addBudgetDiagnostic(diagnostics, error.key, error.actual, error.limit);
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }
    const geometryEstimate = descriptor.renderSurface
      ? estimateHeightfieldWaterRenderSurfaceGeometry(
          descriptor.renderSurface.triangleVertices.length,
          descriptor.lakeBoundary ? descriptor.renderSurface.triangleVertices : undefined
        )
      : estimateHeightfieldWaterTopologyGeometry(topology!);
    const mapDimensions = resolveHeightfieldWaterLocalMapDimensions(prepared);
    addBudgetDiagnostic(diagnostics, "maxVertexCount", geometryEstimate.vertexCount, budget.maxVertexCount);
    addBudgetDiagnostic(diagnostics, "maxTriangleCount", geometryEstimate.triangleCount, budget.maxTriangleCount);
    addBudgetDiagnostic(diagnostics, "maxChunkCount", geometryEstimate.chunkCount, budget.maxChunkCount);
    addBudgetDiagnostic(diagnostics, "maxMapPixelCount", mapDimensions.pixelCount, budget.maxMapPixelCount);
    if (hasErrors(diagnostics)) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }
    const chunks = descriptor.renderSurface
      ? compileHeightfieldWaterRenderSurfaceChunks(prepared, maximumDisplacement)
      : compileHeightfieldWaterChunks(prepared, topology!, maximumDisplacement);
    const localMapAtlas = compileHeightfieldWaterLocalMap(prepared, aggregationScale, lakeBoundary);
    const queryGrid = queryQuality === "off" ? undefined : createHeightfieldWaterQueryGrid(prepared, lakeBoundary);
    let vertexCount = 0;
    let triangleCount = 0;
    for (const chunk of chunks) {
      vertexCount += chunk.geometry.vertexCount;
      triangleCount += chunk.geometry.indexCount / 3;
      if (chunk.geometry.vertexCount > 65535) {
        diagnostics.push({
          code: HeightfieldWaterDiagnosticCode.Uint16VertexLimitExceeded,
          severity: HeightfieldWaterDiagnosticSeverity.Error,
          path: `$.chunks.${chunk.id}`,
          message: `Chunk contains ${chunk.geometry.vertexCount} vertices; Uint16 permits at most 65535.`
        });
      }
    }
    let minSurfaceHeight = Number.POSITIVE_INFINITY;
    let maxSurfaceHeight = Number.NEGATIVE_INFINITY;
    for (const component of prepared.components) {
      minSurfaceHeight = Math.min(minSurfaceHeight, component.minSurfaceHeight);
      maxSurfaceHeight = Math.max(maxSurfaceHeight, component.maxSurfaceHeight);
    }
    const stats: HeightfieldWaterCompileStats = Object.freeze({
      sourceWetTexelCount: descriptor.wetTexelIndices.length,
      componentCount: prepared.components.length,
      outputCellCount: topology?.cells.length ?? 0,
      vertexCount,
      triangleCount,
      chunkCount: chunks.length,
      mapPixelCount: localMapAtlas.width * localMapAtlas.height,
      minSurfaceHeight,
      maxSurfaceHeight,
      maxDepth: localMapAtlas.maxDepth
    });
    addBudgetDiagnostic(diagnostics, "maxVertexCount", stats.vertexCount, budget.maxVertexCount);
    addBudgetDiagnostic(diagnostics, "maxTriangleCount", stats.triangleCount, budget.maxTriangleCount);
    addBudgetDiagnostic(diagnostics, "maxChunkCount", stats.chunkCount, budget.maxChunkCount);
    addBudgetDiagnostic(diagnostics, "maxMapPixelCount", stats.mapPixelCount, budget.maxMapPixelCount);
    if (hasErrors(diagnostics)) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }

    const sourceHash = computeHeightfieldWaterSourceHash(validation.value);
    const compiledHash = compileHashFromSourceHash(sourceHash, queryQuality);
    const frozenDiagnostics = Object.freeze(diagnostics);
    const data: HeightfieldWaterCompiledData = Object.freeze({
      schemaVersion: descriptor.schemaVersion,
      sourceId: descriptor.id,
      ...(descriptor.connections ? { connections: descriptor.connections } : {}),
      sourceHash,
      compiledHash,
      queryQuality,
      quality: descriptor.quality,
      aggregationScale,
      grid: descriptor.grid,
      surfaceMotion: descriptor.surfaceMotion,
      waveSet,
      components: prepared.components,
      chunks,
      localMapAtlas,
      queryGrid,
      lakeBoundary,
      diagnostics: frozenDiagnostics,
      stats
    });
    return Object.freeze({ valid: true, data, diagnostics: frozenDiagnostics });
  }
}
