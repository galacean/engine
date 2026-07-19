/**
 * Deterministic river-network compiler.
 *
 * This module is intentionally independent from DOM, Galacean Engine objects,
 * meshes, materials, and GPU state. It validates a versioned authoring graph,
 * resolves a monotonic upstream-to-downstream water profile, snaps reach
 * endpoints to compiler-owned node positions, and emits immutable plain data
 * plus typed arrays that can run in a Worker or Node pipeline.
 */
import { RiverNetworkSchemaVersion, RiverNodeKind } from "../../authoring/river/RiverAuthoringEnums";
import { RIVER_LIMITS } from "../../authoring/river/RiverAuthoringLimits";
import type {
  RiverAuthoringConfig,
  RiverNetworkBudgetConfig,
  RiverPathControlPoint,
  RiverQualityConfig,
  Vector3Tuple
} from "../../authoring/river/RiverAuthoringTypes";
import type { RiverNetworkDescriptor, RiverSegmentConfig } from "../../authoring/river/RiverDescriptor";
import { validateRiverConfig } from "../../authoring/river/RiverSchemaDecoder";
import { RiverReadonlyFloat32Buffer, RiverReadonlyUint32Buffer } from "../shared/ReadonlyNumericBuffer";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../shared/diagnostics";
import { RiverGeometryCompiler } from "./RiverGeometryCompiler";
import { compileRiverChunks } from "./RiverChunkCompiler";
import { compileRiverJunctions } from "./RiverJunctionCompiler";
import { compileRiverQueryIndex } from "./RiverQueryIndexCompiler";
import { compileRiverTerrainInteraction } from "./RiverTerrainCompiler";
import {
  RIVER_GEOMETRY_EPSILON,
  RIVER_MAX_WATER_SURFACE_SLOPE,
  RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY
} from "./constants";
import { resolveRiverSurfaceMotion } from "./RiverSurfaceMotion";
import { resolveRiverNetworkBudget, validateRiverNetwork } from "./RiverNetworkValidator";
import { calculateRiverFlowTravelDuration, sampleRiverPath } from "./RiverPathSampler";
import {
  DeepReadonly,
  RiverCompileResult,
  RiverCompiledData,
  RiverCompiledChunk,
  RiverJunctionArtifact,
  RiverCompiledNode,
  RiverCompiledReach,
  RiverCompiledDisturbanceSource,
  RiverCompiledSurfaceMotionData,
  RiverQueryIndexData,
  RiverTerrainInteractionData,
  RiverSampleResult
} from "./types";

interface RiverCompiledReachDraft {
  id: string;
  fromNodeIndex: number;
  toNodeIndex: number;
  order: number;
  elevationDrop: number;
  config: RiverAuthoringConfig;
}

interface RiverBudgetedReachResult {
  reaches: readonly RiverCompiledReach[];
  junctions: readonly RiverJunctionArtifact[];
  chunks: readonly RiverCompiledChunk[];
  queryIndex: RiverQueryIndexData;
  terrainInteraction: RiverTerrainInteractionData;
  sampleCount: number;
  vertexCount: number;
  chunkCount: number;
  mapPixelCount: number;
  budgetRedistributed: boolean;
}

interface RiverFinalizedGeometry {
  readonly reaches: readonly RiverCompiledReach[];
  readonly junctions: readonly RiverJunctionArtifact[];
  readonly chunks: readonly RiverCompiledChunk[];
  readonly queryIndex: RiverQueryIndexData;
  readonly terrainInteraction: RiverTerrainInteractionData;
  readonly sampleCount: number;
  readonly vertexCount: number;
  readonly chunkCount: number;
}

function cloneVector3Tuple(tuple: readonly [number, number, number]): Vector3Tuple {
  return [tuple[0], tuple[1], tuple[2]];
}

function cloneControlPoint(point: DeepReadonly<RiverPathControlPoint>): RiverPathControlPoint {
  return {
    ...point,
    position: cloneVector3Tuple(point.position),
    in: point.in ? cloneVector3Tuple(point.in) : undefined,
    out: point.out ? cloneVector3Tuple(point.out) : undefined
  };
}

function cloneQualityConfig(config: DeepReadonly<RiverQualityConfig>): RiverQualityConfig {
  return {
    geometry: { ...config.geometry },
    material: { ...config.material },
    maps: { ...config.maps },
    query: { ...config.query }
  };
}

function prefixDiagnostic(diagnostic: RiverDiagnostic, prefix: string): RiverDiagnostic {
  return {
    ...diagnostic,
    path: `${prefix}.${diagnostic.path}`,
    repair: diagnostic.repair ? { ...diagnostic.repair } : undefined
  };
}

function hasErrors(diagnostics: readonly RiverDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === RiverDiagnosticSeverity.Error);
}

function deepFreezePlainData<T>(value: T): T {
  if (typeof value !== "object" || value === null || ArrayBuffer.isView(value) || Object.isFrozen(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) deepFreezePlainData(record[key]);
  return Object.freeze(value);
}

function createTopologicalNodeIndices(
  descriptor: RiverNetworkDescriptor,
  nodeIndexById: ReadonlyMap<string, number>
): Uint32Array {
  const inDegree = new Uint32Array(descriptor.nodes.length);
  const outgoingReachIndices: number[][] = descriptor.nodes.map(() => []);
  for (let reachIndex = 0; reachIndex < descriptor.segments.length; reachIndex++) {
    const segment = descriptor.segments[reachIndex];
    const fromNodeIndex = nodeIndexById.get(segment.from);
    const toNodeIndex = nodeIndexById.get(segment.to);
    if (fromNodeIndex === undefined || toNodeIndex === undefined) continue;
    inDegree[toNodeIndex]++;
    outgoingReachIndices[fromNodeIndex].push(reachIndex);
  }
  const ready: number[] = [];
  for (let nodeIndex = 0; nodeIndex < inDegree.length; nodeIndex++) {
    if (inDegree[nodeIndex] === 0) ready.push(nodeIndex);
  }
  const ordered: number[] = [];
  while (ready.length > 0) {
    const nodeIndex = ready.shift();
    if (nodeIndex === undefined) continue;
    ordered.push(nodeIndex);
    for (const reachIndex of outgoingReachIndices[nodeIndex]) {
      const toNodeIndex = nodeIndexById.get(descriptor.segments[reachIndex].to);
      if (toNodeIndex === undefined) continue;
      inDegree[toNodeIndex]--;
      if (inDegree[toNodeIndex] === 0) ready.push(toNodeIndex);
    }
  }
  return new Uint32Array(ordered);
}

function resolveWaterSurfaceElevations(
  descriptor: RiverNetworkDescriptor,
  nodeIndexById: ReadonlyMap<string, number>,
  topologicalNodeIndices: Uint32Array,
  diagnostics: RiverDiagnostic[]
): Float32Array {
  const incomingEdges: Array<Array<{ upstreamNodeIndex: number; horizontalLength: number }>> = descriptor.nodes.map(
    () => []
  );
  for (const segment of descriptor.segments) {
    const fromNodeIndex = nodeIndexById.get(segment.from);
    const toNodeIndex = nodeIndexById.get(segment.to);
    if (fromNodeIndex !== undefined && toNodeIndex !== undefined) {
      const from = descriptor.nodes[fromNodeIndex].position;
      const to = descriptor.nodes[toNodeIndex].position;
      incomingEdges[toNodeIndex].push({
        upstreamNodeIndex: fromNodeIndex,
        horizontalLength: Math.max(RIVER_GEOMETRY_EPSILON, Math.hypot(to[0] - from[0], to[2] - from[2]))
      });
    }
  }
  const elevations = new Float32Array(descriptor.nodes.length);
  for (const nodeIndex of topologicalNodeIndices) {
    const node = descriptor.nodes[nodeIndex];
    const authoredElevation = node.elevation ?? node.position[1];
    const edges = incomingEdges[nodeIndex];
    if (edges.length === 0) {
      elevations[nodeIndex] = authoredElevation;
      continue;
    }
    let upstreamMinimum = Number.POSITIVE_INFINITY;
    let minimumSlopeElevation = Number.NEGATIVE_INFINITY;
    for (const edge of edges) {
      const upstreamElevation = elevations[edge.upstreamNodeIndex];
      upstreamMinimum = Math.min(upstreamMinimum, upstreamElevation);
      minimumSlopeElevation = Math.max(
        minimumSlopeElevation,
        upstreamElevation - edge.horizontalLength * RIVER_MAX_WATER_SURFACE_SLOPE
      );
    }
    if (minimumSlopeElevation > upstreamMinimum + RIVER_GEOMETRY_EPSILON) {
      diagnostics.push({
        code: RiverDiagnosticCode.WaterProfileSlopeConflict,
        severity: RiverDiagnosticSeverity.Error,
        path: `nodes[${nodeIndex}].elevation`,
        message: "Incoming reaches cannot share a continuous downstream-nonrising water level within the slope limit."
      });
    }
    const monotonicElevation = Math.min(authoredElevation, upstreamMinimum);
    const resolvedElevation = Math.min(upstreamMinimum, Math.max(monotonicElevation, minimumSlopeElevation));
    elevations[nodeIndex] = resolvedElevation;
    if (resolvedElevation < authoredElevation) {
      diagnostics.push({
        code: RiverDiagnosticCode.WaterProfileAdjusted,
        severity: RiverDiagnosticSeverity.Warning,
        path: `nodes[${nodeIndex}].elevation`,
        message: "Water surface elevation was lowered to keep the downstream profile monotonic.",
        repair: { originalValue: authoredElevation, repairedValue: resolvedElevation }
      });
    }
    if (resolvedElevation > monotonicElevation + RIVER_GEOMETRY_EPSILON) {
      diagnostics.push({
        code: RiverDiagnosticCode.WaterProfileSlopeAdjusted,
        severity: RiverDiagnosticSeverity.Warning,
        path: `nodes[${nodeIndex}].elevation`,
        message: "Water surface elevation was raised to stay within the maximum downstream slope.",
        repair: { originalValue: monotonicElevation, repairedValue: resolvedElevation }
      });
    }
  }
  return elevations;
}

function resolveReachWaterProfile(
  result: RiverSampleResult,
  upstreamElevation: number,
  downstreamElevation: number
): RiverSampleResult {
  if (result.points.length === 0) return result;
  const horizontalDistances = new Float64Array(result.points.length);
  let horizontalLength = 0;
  for (let index = 1; index < result.points.length; index++) {
    const previous = result.points[index - 1].position;
    const current = result.points[index].position;
    horizontalLength += Math.hypot(current.x - previous.x, current.z - previous.z);
    horizontalDistances[index] = horizontalLength;
  }
  const safeHorizontalLength = Math.max(horizontalLength, RIVER_GEOMETRY_EPSILON);
  for (let index = 0; index < result.points.length; index++) {
    const progress = Math.min(1, Math.max(0, horizontalDistances[index] / safeHorizontalLength));
    result.points[index].position.y = upstreamElevation + (downstreamElevation - upstreamElevation) * progress;
  }
  let totalLength = 0;
  let flowTravelTime = 0;
  result.points[0].distance = 0;
  result.points[0].flowTravelTime = 0;
  for (let index = 1; index < result.points.length; index++) {
    const previous = result.points[index - 1].position;
    const current = result.points[index].position;
    const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
    totalLength += segmentLength;
    flowTravelTime += calculateRiverFlowTravelDuration(
      segmentLength,
      result.points[index - 1].flowSpeed,
      result.points[index].flowSpeed
    );
    result.points[index].distance = totalLength;
    result.points[index].flowTravelTime = flowTravelTime;
  }
  return { points: result.points, totalLength, diagnostics: result.diagnostics };
}

function createCompiledNodes(
  descriptor: RiverNetworkDescriptor,
  nodeIndexById: ReadonlyMap<string, number>,
  waterSurfaceElevations: Float32Array
): readonly RiverCompiledNode[] {
  const incomingReachIndices: number[][] = descriptor.nodes.map(() => []);
  const outgoingReachIndices: number[][] = descriptor.nodes.map(() => []);
  for (let reachIndex = 0; reachIndex < descriptor.segments.length; reachIndex++) {
    const segment = descriptor.segments[reachIndex];
    const fromNodeIndex = nodeIndexById.get(segment.from);
    const toNodeIndex = nodeIndexById.get(segment.to);
    if (fromNodeIndex !== undefined) outgoingReachIndices[fromNodeIndex].push(reachIndex);
    if (toNodeIndex !== undefined) incomingReachIndices[toNodeIndex].push(reachIndex);
  }
  return descriptor.nodes.map((node, nodeIndex) =>
    deepFreezePlainData({
      id: node.id,
      kind: node.kind,
      position: [node.position[0], waterSurfaceElevations[nodeIndex], node.position[2]] as const,
      mergeRadius: node.mergeRadius,
      authoredElevation: node.elevation ?? node.position[1],
      waterSurfaceElevation: waterSurfaceElevations[nodeIndex],
      incomingReachIndices: new RiverReadonlyUint32Buffer(incomingReachIndices[nodeIndex]),
      outgoingReachIndices: new RiverReadonlyUint32Buffer(outgoingReachIndices[nodeIndex])
    })
  );
}

function createResolvedRiverConfig(
  descriptor: RiverNetworkDescriptor,
  segment: RiverSegmentConfig,
  fromPosition: readonly [number, number, number],
  toPosition: readonly [number, number, number]
): RiverAuthoringConfig {
  const points = segment.curve.points.map(cloneControlPoint);
  if (points.length > 0) points[0].position = cloneVector3Tuple(fromPosition);
  if (points.length > 1) points[points.length - 1].position = cloneVector3Tuple(toPosition);
  return {
    id: segment.id,
    path: {
      mode: segment.curve.mode,
      segmentLength: segment.curve.segmentLength,
      points
    },
    shape: { ...descriptor.defaults.shape, ...segment.shape },
    flow: { ...descriptor.defaults.flow, ...segment.flow },
    material: { ...descriptor.defaults.material, ...segment.material },
    quality: cloneQualityConfig(descriptor.defaults.quality)
  };
}

function createCompiledReachDrafts(
  descriptor: RiverNetworkDescriptor,
  nodes: readonly RiverCompiledNode[],
  nodeIndexById: ReadonlyMap<string, number>,
  diagnostics: RiverDiagnostic[]
): RiverCompiledReachDraft[] {
  const reaches: RiverCompiledReachDraft[] = [];
  for (let reachIndex = 0; reachIndex < descriptor.segments.length; reachIndex++) {
    const segment = descriptor.segments[reachIndex];
    const fromNodeIndex = nodeIndexById.get(segment.from);
    const toNodeIndex = nodeIndexById.get(segment.to);
    if (fromNodeIndex === undefined || toNodeIndex === undefined) continue;
    const configResult = validateRiverConfig(
      createResolvedRiverConfig(descriptor, segment, nodes[fromNodeIndex].position, nodes[toNodeIndex].position)
    );
    diagnostics.push(
      ...configResult.diagnostics.map((diagnostic) => prefixDiagnostic(diagnostic, `segments[${reachIndex}]`))
    );
    if (!configResult.value) continue;
    reaches.push({
      id: segment.id,
      fromNodeIndex,
      toNodeIndex,
      order: segment.order ?? 0,
      elevationDrop: Math.max(0, nodes[fromNodeIndex].waterSurfaceElevation - nodes[toNodeIndex].waterSurfaceElevation),
      config: configResult.value
    });
  }
  return reaches;
}

function allocateReachSegmentBudgets(
  sampleResults: readonly RiverSampleResult[],
  drafts: readonly RiverCompiledReachDraft[],
  totalSegmentBudget: number
): number[] {
  const minimum = drafts.map((draft) => Math.max(1, draft.config.path.points.length - 1));
  const desired = sampleResults.map((result, index) =>
    Math.max(minimum[index], Math.min(drafts[index].config.quality.geometry.maxSegmentCount, result.points.length - 1))
  );
  const minimumTotal = minimum.reduce((sum, count) => sum + count, 0);
  const result = [...minimum];
  let remaining = Math.max(0, totalSegmentBudget - minimumTotal);
  const desiredExtraTotal = desired.reduce((sum, count, index) => sum + count - minimum[index], 0);
  const fractions: Array<{ index: number; fraction: number }> = [];

  for (let index = 0; index < drafts.length; index++) {
    const desiredExtra = desired[index] - minimum[index];
    const exact = desiredExtraTotal > 0 ? (remaining * desiredExtra) / desiredExtraTotal : 0;
    const extra = Math.min(desiredExtra, Math.floor(exact));
    result[index] += extra;
    remaining -= extra;
    fractions.push({ index, fraction: exact - Math.floor(exact) });
  }

  fractions.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  while (remaining > 0) {
    let allocated = false;
    for (const { index } of fractions) {
      if (remaining <= 0) break;
      if (result[index] < desired[index]) {
        result[index]++;
        remaining--;
        allocated = true;
      }
    }
    if (!allocated) break;
  }

  return result;
}

function cloneConfigWithSegmentBudget(config: RiverAuthoringConfig, maxSegmentCount: number): RiverAuthoringConfig {
  const cloned = cloneCompiledRiverConfig(config);
  cloned.quality.geometry.maxSegmentCount = maxSegmentCount;
  return cloned;
}

function finalizeReachDistances(
  drafts: readonly RiverCompiledReachDraft[],
  sampleResults: readonly RiverSampleResult[],
  descriptor: RiverNetworkDescriptor,
  nodes: readonly RiverCompiledNode[],
  nodeIndexById: ReadonlyMap<string, number>,
  topologicalNodeIndices: Uint32Array,
  surfaceMotion: RiverCompiledSurfaceMotionData,
  disturbances: readonly RiverCompiledDisturbanceSource[],
  diagnostics: RiverDiagnostic[]
): RiverFinalizedGeometry {
  const nodeDistances = new Float64Array(descriptor.nodes.length);
  const nodeFlowTimes = new Float64Array(descriptor.nodes.length);
  const outgoingReachIndices: number[][] = descriptor.nodes.map(() => []);
  for (let reachIndex = 0; reachIndex < descriptor.segments.length; reachIndex++) {
    const fromNodeIndex = nodeIndexById.get(descriptor.segments[reachIndex].from);
    if (fromNodeIndex !== undefined) outgoingReachIndices[fromNodeIndex].push(reachIndex);
  }

  const offsets = new Float64Array(drafts.length);
  const flowTimeOffsets = new Float64Array(drafts.length);
  for (const nodeIndex of topologicalNodeIndices) {
    for (const reachIndex of outgoingReachIndices[nodeIndex]) {
      const draft = drafts[reachIndex];
      if (!draft) continue;
      offsets[reachIndex] = nodeDistances[nodeIndex];
      flowTimeOffsets[reachIndex] = nodeFlowTimes[nodeIndex];
      const downstreamDistance = nodeDistances[nodeIndex] + sampleResults[reachIndex].totalLength;
      const downstreamFlowTime =
        nodeFlowTimes[nodeIndex] + (sampleResults[reachIndex].points.at(-1)?.flowTravelTime ?? 0);
      nodeDistances[draft.toNodeIndex] = Math.max(nodeDistances[draft.toNodeIndex], downstreamDistance);
      nodeFlowTimes[draft.toNodeIndex] = Math.max(nodeFlowTimes[draft.toNodeIndex], downstreamFlowTime);
    }
  }

  const junctionResult = compileRiverJunctions(
    nodes,
    drafts.map((draft, reachIndex) => ({
      id: draft.id,
      reachIndex,
      fromNodeIndex: draft.fromNodeIndex,
      toNodeIndex: draft.toNodeIndex,
      order: draft.order,
      materialLevel: draft.config.quality.material.level,
      geometryLevel: draft.config.quality.geometry.level,
      maxDisplacement: surfaceMotion.maxDisplacement,
      material: draft.config.material,
      networkDistanceOffset: offsets[reachIndex],
      networkFlowTimeOffset: flowTimeOffsets[reachIndex],
      sampleResult: sampleResults[reachIndex]
    }))
  );
  diagnostics.push(...junctionResult.diagnostics);
  const reaches = drafts.map((draft, reachIndex) => {
    const sampleResult = junctionResult.sampleResults[reachIndex];
    const artifact = RiverGeometryCompiler.compile(
      sampleResult,
      draft.config.quality.geometry.level,
      offsets[reachIndex],
      flowTimeOffsets[reachIndex],
      {
        materialLevel: draft.config.quality.material.level,
        maxDisplacement: surfaceMotion.maxDisplacement
      }
    );
    diagnostics.push(
      ...artifact.diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.code === RiverDiagnosticCode.SharpBendFallback ||
            diagnostic.code === RiverDiagnosticCode.BankSelfIntersection ||
            diagnostic.code === RiverDiagnosticCode.DegenerateTriangle
        )
        .map((diagnostic) => prefixDiagnostic(diagnostic, `segments[${reachIndex}]`))
    );
    return deepFreezePlainData({
      ...draft,
      length: sampleResult.totalLength,
      flowTravelDuration: sampleResults[reachIndex].points.at(-1)?.flowTravelTime ?? 0,
      networkDistanceOffset: offsets[reachIndex],
      networkFlowTimeOffset: flowTimeOffsets[reachIndex],
      sampleCount: sampleResult.points.length,
      config: deepFreezePlainData(draft.config),
      artifact
    });
  });
  const queryIndex = compileRiverQueryIndex(reaches, junctionResult.junctions, descriptor.defaults.quality.query.level);
  const terrainInteraction = compileRiverTerrainInteraction(reaches, junctionResult.junctions, disturbances);
  const chunks = compileRiverChunks(reaches, junctionResult.junctions, terrainInteraction.localMapAtlas?.tiles);
  const vertexCount = chunks.reduce(
    (sum, chunk) => sum + chunk.surfaceGeometry.positions.length + (chunk.bankFoamGeometry?.positions.length ?? 0),
    0
  );
  return {
    reaches,
    junctions: junctionResult.junctions,
    chunks,
    queryIndex,
    terrainInteraction,
    sampleCount: junctionResult.sampleResults.reduce((sum, result) => sum + result.points.length, 0),
    vertexCount,
    chunkCount: chunks.length
  };
}

function applyNetworkRuntimeBudget(
  descriptor: RiverNetworkDescriptor,
  nodes: readonly RiverCompiledNode[],
  drafts: RiverCompiledReachDraft[],
  nodeIndexById: ReadonlyMap<string, number>,
  topologicalNodeIndices: Uint32Array,
  surfaceMotion: RiverCompiledSurfaceMotionData,
  disturbances: readonly RiverCompiledDisturbanceSource[],
  diagnostics: RiverDiagnostic[]
): RiverBudgetedReachResult | undefined {
  const budget = resolveRiverNetworkBudget(descriptor);
  let sampleResults = drafts.map((draft) => sampleRiverPath(draft.config));
  const initialSampleCount = sampleResults.reduce((sum, result) => sum + result.points.length, 0);
  const maximumCrossVertexCount = Math.max(
    ...drafts.map((draft) => RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY[draft.config.quality.geometry.level] + 1)
  );
  const maximumSampleCount = Math.min(
    budget.maxSampleCount,
    Math.floor(budget.maxVertexCount / maximumCrossVertexCount)
  );
  const minimumSampleCount = drafts.reduce((sum, draft) => sum + draft.config.path.points.length, 0);
  let budgetRedistributed = false;

  if (maximumSampleCount < minimumSampleCount) {
    diagnostics.push({
      code: RiverDiagnosticCode.NetworkBudgetExceeded,
      severity: RiverDiagnosticSeverity.Error,
      path: "budget.maxSampleCount",
      message: `Network requires at least ${minimumSampleCount} anchor samples but budget allows ${maximumSampleCount}.`
    });
    return undefined;
  }

  if (initialSampleCount > maximumSampleCount) {
    const totalSegmentBudget = maximumSampleCount - drafts.length;
    const originalReachBudgets = drafts.map((draft) => draft.config.quality.geometry.maxSegmentCount);
    const reachBudgets = allocateReachSegmentBudgets(sampleResults, drafts, totalSegmentBudget);
    drafts = drafts.map((draft, index) => ({
      ...draft,
      config: cloneConfigWithSegmentBudget(draft.config, reachBudgets[index])
    }));
    sampleResults = drafts.map((draft) => sampleRiverPath(draft.config));
    budgetRedistributed = true;
    diagnostics.push({
      code: RiverDiagnosticCode.NetworkBudgetRedistributed,
      severity: RiverDiagnosticSeverity.Warning,
      path: "budget",
      message: `Redistributed the network from ${initialSampleCount} to ${sampleResults.reduce((sum, result) => sum + result.points.length, 0)} samples.`,
      repair: {
        originalValue: originalReachBudgets,
        repairedValue: reachBudgets
      }
    });
  }

  sampleResults = sampleResults.map((result, reachIndex) =>
    resolveReachWaterProfile(
      result,
      nodes[drafts[reachIndex].fromNodeIndex].waterSurfaceElevation,
      nodes[drafts[reachIndex].toNodeIndex].waterSurfaceElevation
    )
  );

  for (let reachIndex = 0; reachIndex < sampleResults.length; reachIndex++) {
    diagnostics.push(
      ...sampleResults[reachIndex].diagnostics.map((diagnostic) =>
        prefixDiagnostic(diagnostic, `segments[${reachIndex}].sampling`)
      )
    );
  }

  const finalized = finalizeReachDistances(
    drafts,
    sampleResults,
    descriptor,
    nodes,
    nodeIndexById,
    topologicalNodeIndices,
    surfaceMotion,
    disturbances,
    diagnostics
  );
  const sampleCount = finalized.sampleCount;
  const vertexCount = finalized.vertexCount;
  const chunkCount = finalized.chunkCount;
  const mapPixelCount = finalized.terrainInteraction.localMapAtlas
    ? finalized.terrainInteraction.localMapAtlas.width * finalized.terrainInteraction.localMapAtlas.height
    : 0;
  const checks: Array<[number, number, string]> = [
    [drafts.length, budget.maxSegmentCount, "budget.maxSegmentCount"],
    [sampleCount, budget.maxSampleCount, "budget.maxSampleCount"],
    [vertexCount, budget.maxVertexCount, "budget.maxVertexCount"],
    [chunkCount, budget.maxChunkCount, "budget.maxChunkCount"],
    [mapPixelCount, budget.maxMapPixelCount, "budget.maxMapPixelCount"]
  ];
  for (const [actual, limit, path] of checks) {
    if (actual > limit) {
      diagnostics.push({
        code: RiverDiagnosticCode.NetworkBudgetExceeded,
        severity: RiverDiagnosticSeverity.Error,
        path,
        message: `Compiled value ${actual} exceeds budget ${limit}.`
      });
    }
  }
  if (hasErrors(diagnostics)) return undefined;

  return {
    reaches: finalized.reaches,
    junctions: finalized.junctions,
    chunks: finalized.chunks,
    queryIndex: finalized.queryIndex,
    terrainInteraction: finalized.terrainInteraction,
    sampleCount,
    vertexCount,
    chunkCount,
    mapPixelCount,
    budgetRedistributed
  };
}

function createStats(
  descriptor: RiverNetworkDescriptor,
  waterSurfaceElevations: Float32Array,
  diagnostics: readonly RiverDiagnostic[],
  budgeted: RiverBudgetedReachResult
) {
  const elevationValues = Array.from(waterSurfaceElevations);
  return deepFreezePlainData({
    nodeCount: descriptor.nodes.length,
    reachCount: descriptor.segments.length,
    sourceCount: descriptor.nodes.filter((node) => node.kind === RiverNodeKind.Source).length,
    mouthCount: descriptor.nodes.filter((node) => node.kind === RiverNodeKind.Mouth).length,
    junctionCount: budgeted.junctions.length,
    maxReachOrder: descriptor.segments.reduce((maximum, segment) => Math.max(maximum, segment.order ?? 0), 0),
    endpointSnapCount: diagnostics.filter(
      (diagnostic) => diagnostic.code === RiverDiagnosticCode.SegmentEndpointMismatch
    ).length,
    reversedElevationCount: diagnostics.filter(
      (diagnostic) => diagnostic.code === RiverDiagnosticCode.ReversedElevation
    ).length,
    waterProfileAdjustmentCount: diagnostics.filter(
      (diagnostic) => diagnostic.code === RiverDiagnosticCode.WaterProfileAdjusted
    ).length,
    waterSlopeAdjustmentCount: diagnostics.filter(
      (diagnostic) => diagnostic.code === RiverDiagnosticCode.WaterProfileSlopeAdjusted
    ).length,
    sampleCount: budgeted.sampleCount,
    vertexCount: budgeted.vertexCount,
    chunkCount: budgeted.chunkCount,
    mapPixelCount: budgeted.mapPixelCount,
    queryPrimitiveCount: budgeted.queryIndex.primitiveCount,
    queryCellCount: budgeted.queryIndex.cellCount,
    localMapRegionCount: budgeted.terrainInteraction.localMapBakeRegions.length,
    budgetRedistributed: budgeted.budgetRedistributed,
    minWaterSurfaceElevation: elevationValues.length > 0 ? Math.min(...elevationValues) : 0,
    maxWaterSurfaceElevation: elevationValues.length > 0 ? Math.max(...elevationValues) : 0
  });
}

export function cloneCompiledRiverConfig(config: DeepReadonly<RiverAuthoringConfig>): RiverAuthoringConfig {
  return {
    id: config.id,
    path: {
      mode: config.path.mode,
      segmentLength: config.path.segmentLength,
      points: config.path.points.map(cloneControlPoint)
    },
    shape: { ...config.shape },
    flow: { ...config.flow },
    material: { ...config.material },
    quality: cloneQualityConfig(config.quality)
  };
}

export class RiverNetworkCompiler {
  private constructor() {}

  static compile(source: unknown): RiverCompileResult {
    const validation = validateRiverNetwork(source);
    const diagnostics = validation.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      repair: diagnostic.repair ? { ...diagnostic.repair } : undefined
    }));
    if (!validation.value) {
      const frozenDiagnostics = deepFreezePlainData(diagnostics);
      return deepFreezePlainData({ diagnostics: frozenDiagnostics, valid: false });
    }
    const descriptor = validation.value;
    const surfaceMotion = resolveRiverSurfaceMotion(descriptor);
    const disturbances: readonly RiverCompiledDisturbanceSource[] = Object.freeze(
      descriptor.schemaVersion === RiverNetworkSchemaVersion.V2
        ? (descriptor.disturbances ?? []).map((disturbance) =>
            deepFreezePlainData({
              id: disturbance.id,
              kind: disturbance.kind,
              position: cloneVector3Tuple(disturbance.position) as readonly [number, number, number],
              radius: disturbance.radius,
              strength: disturbance.strength
            })
          )
        : []
    );

    const nodeIndexById = new Map(descriptor.nodes.map((node, nodeIndex) => [node.id, nodeIndex]));
    const topologicalNodeIndices = createTopologicalNodeIndices(descriptor, nodeIndexById);
    const waterSurfaceElevations = resolveWaterSurfaceElevations(
      descriptor,
      nodeIndexById,
      topologicalNodeIndices,
      diagnostics
    );
    const nodes = createCompiledNodes(descriptor, nodeIndexById, waterSurfaceElevations);
    const reachDrafts = createCompiledReachDrafts(descriptor, nodes, nodeIndexById, diagnostics);
    if (hasErrors(diagnostics) || reachDrafts.length !== descriptor.segments.length) {
      const frozenDiagnostics = deepFreezePlainData(diagnostics);
      return deepFreezePlainData({ diagnostics: frozenDiagnostics, valid: false });
    }
    const budgeted = applyNetworkRuntimeBudget(
      descriptor,
      nodes,
      reachDrafts,
      nodeIndexById,
      topologicalNodeIndices,
      surfaceMotion,
      disturbances,
      diagnostics
    );
    if (!budgeted || hasErrors(diagnostics)) {
      const frozenDiagnostics = deepFreezePlainData(diagnostics);
      return deepFreezePlainData({ diagnostics: frozenDiagnostics, valid: false });
    }

    const frozenDiagnostics = deepFreezePlainData(diagnostics);
    const data: RiverCompiledData = deepFreezePlainData({
      schemaVersion: descriptor.schemaVersion,
      sourceId: descriptor.id,
      nodes,
      reaches: budgeted.reaches,
      junctions: budgeted.junctions,
      chunks: budgeted.chunks,
      queryIndex: budgeted.queryIndex,
      terrainInteraction: budgeted.terrainInteraction,
      surfaceMotion,
      disturbances,
      topologicalNodeIndices: new RiverReadonlyUint32Buffer(topologicalNodeIndices),
      waterSurfaceElevations: new RiverReadonlyFloat32Buffer(waterSurfaceElevations),
      diagnostics: frozenDiagnostics,
      stats: createStats(descriptor, waterSurfaceElevations, frozenDiagnostics, budgeted)
    });
    return deepFreezePlainData({ data, diagnostics: frozenDiagnostics, valid: true });
  }
}
