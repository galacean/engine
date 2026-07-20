/** Public deterministic compiler for arbitrary raster-defined curved water surfaces. */
import {
  HeightfieldWaterDiagnosticCode,
  HeightfieldWaterDiagnosticSeverity
} from "../../authoring/heightfield/HeightfieldWaterEnums";
import type {
  HeightfieldWaterBudgetConfig,
  HeightfieldWaterDiagnostic
} from "../../authoring/heightfield/HeightfieldWaterTypes";
import { hashStableValue } from "../shared/determinism";
import { compileWaterWaveAsset } from "../wave/WaterWaveCompiler";
import { createHeightfieldWaterQueryGrid, prepareHeightfieldWaterData } from "./HeightfieldWaterComponentCompiler";
import type {
  HeightfieldWaterCompiledData,
  HeightfieldWaterCompileResult,
  HeightfieldWaterCompileStats
} from "./HeightfieldWaterCompiledTypes";
import {
  compileHeightfieldWaterChunks,
  createHeightfieldWaterSurfaceTopology
} from "./HeightfieldWaterGeometryCompiler";
import { compileHeightfieldWaterLocalMap } from "./HeightfieldWaterLocalMapCompiler";
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

export class HeightfieldWaterCompiler {
  private constructor() {}

  static compile(source: unknown): HeightfieldWaterCompileResult {
    const validation = validateHeightfieldWaterDescriptor(source);
    const diagnostics = [...validation.diagnostics];
    if (!validation.valid || !validation.value) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }
    const descriptor = validation.value;
    const budget = resolveHeightfieldWaterBudget(descriptor);
    const prepared = prepareHeightfieldWaterData(descriptor);
    addBudgetDiagnostic(diagnostics, "maxComponentCount", prepared.components.length, budget.maxComponentCount);
    if (hasErrors(diagnostics)) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }

    const aggregationScale = HEIGHTFIELD_WATER_AGGREGATION_SCALE[descriptor.quality];
    const waveSet = compileWaterWaveAsset(descriptor.waveAsset, descriptor.quality);
    const topology = createHeightfieldWaterSurfaceTopology(prepared, aggregationScale);
    const chunks = compileHeightfieldWaterChunks(
      prepared,
      topology,
      waveSet.maxVerticalDisplacement * descriptor.material.waveStrength
    );
    const localMapAtlas = compileHeightfieldWaterLocalMap(prepared, aggregationScale);
    const queryGrid = createHeightfieldWaterQueryGrid(prepared);
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
      outputCellCount: topology.cells.length,
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

    const sourceHash = hashStableValue({
      compilerVersion: HEIGHTFIELD_WATER_COMPILER_VERSION,
      schemaVersion: descriptor.schemaVersion,
      id: descriptor.id,
      grid: descriptor.grid,
      wetTexelIndices: Array.from(descriptor.wetTexelIndices),
      surfaceHeights: Array.from(descriptor.surfaceHeights),
      bedHeights: descriptor.bedHeights ? Array.from(descriptor.bedHeights) : undefined,
      flowVectorsXZ: descriptor.flowVectorsXZ ? Array.from(descriptor.flowVectorsXZ) : undefined,
      waveAsset: descriptor.waveAsset,
      quality: descriptor.quality,
      material: descriptor.material,
      budget
    });
    const frozenDiagnostics = Object.freeze(diagnostics);
    const data: HeightfieldWaterCompiledData = Object.freeze({
      schemaVersion: descriptor.schemaVersion,
      sourceId: descriptor.id,
      sourceHash,
      quality: descriptor.quality,
      aggregationScale,
      grid: descriptor.grid,
      material: descriptor.material,
      waveSet,
      components: prepared.components,
      chunks,
      localMapAtlas,
      queryGrid,
      diagnostics: frozenDiagnostics,
      stats
    });
    return Object.freeze({ valid: true, data, diagnostics: frozenDiagnostics });
  }
}
