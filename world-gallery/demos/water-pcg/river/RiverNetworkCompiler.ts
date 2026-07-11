/**
 * Deterministic river-network compiler.
 *
 * This module is intentionally independent from DOM, Galacean Engine objects,
 * meshes, materials, and GPU state. It validates a versioned authoring graph,
 * resolves a monotonic upstream-to-downstream water profile, snaps reach
 * endpoints to compiler-owned node positions, and emits immutable plain data
 * plus typed arrays that can run in a Worker or Node pipeline.
 */
import {
  RiverDebugMode,
  RiverDiagnosticCode,
  RiverDiagnosticSeverity,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPreviewStage
} from "./constants";
import { validateRiverConfig, validateRiverNetworkDescriptor } from "./RiverConfigValidator";
import {
  DeepReadonly,
  RiverCompileResult,
  RiverCompiledData,
  RiverCompiledNode,
  RiverCompiledReach,
  RiverConfig,
  RiverDebugConfig,
  RiverDiagnostic,
  RiverNetworkDescriptor,
  RiverPathControlPoint,
  RiverQualityConfig,
  RiverSegmentConfig,
  Vector3Tuple
} from "./types";

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

function cloneDebugConfig(config: DeepReadonly<RiverDebugConfig>): RiverDebugConfig {
  return { ...config };
}

function getDefaultDebugConfig(): RiverDebugConfig {
  return {
    previewStage: RiverPreviewStage.Full,
    mode: RiverDebugMode.Full,
    queryT: 0.5
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
  const incomingNodeIndices: number[][] = descriptor.nodes.map(() => []);
  for (const segment of descriptor.segments) {
    const fromNodeIndex = nodeIndexById.get(segment.from);
    const toNodeIndex = nodeIndexById.get(segment.to);
    if (fromNodeIndex !== undefined && toNodeIndex !== undefined) incomingNodeIndices[toNodeIndex].push(fromNodeIndex);
  }
  const elevations = new Float32Array(descriptor.nodes.length);
  for (const nodeIndex of topologicalNodeIndices) {
    const node = descriptor.nodes[nodeIndex];
    const authoredElevation = node.elevation ?? node.position[1];
    const upstreamNodeIndices = incomingNodeIndices[nodeIndex];
    if (upstreamNodeIndices.length === 0) {
      elevations[nodeIndex] = authoredElevation;
      continue;
    }
    let upstreamMinimum = Number.POSITIVE_INFINITY;
    for (const upstreamNodeIndex of upstreamNodeIndices) {
      upstreamMinimum = Math.min(upstreamMinimum, elevations[upstreamNodeIndex]);
    }
    const resolvedElevation = Math.min(authoredElevation, upstreamMinimum);
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
  }
  return elevations;
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
      incomingReachIndices: new Uint32Array(incomingReachIndices[nodeIndex]),
      outgoingReachIndices: new Uint32Array(outgoingReachIndices[nodeIndex])
    })
  );
}

function createResolvedRiverConfig(
  descriptor: RiverNetworkDescriptor,
  segment: RiverSegmentConfig,
  fromPosition: readonly [number, number, number],
  toPosition: readonly [number, number, number]
): RiverConfig {
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
    quality: cloneQualityConfig(descriptor.defaults.quality),
    debug: descriptor.debug ? cloneDebugConfig(descriptor.debug) : getDefaultDebugConfig()
  };
}

function createCompiledReaches(
  descriptor: RiverNetworkDescriptor,
  nodes: readonly RiverCompiledNode[],
  nodeIndexById: ReadonlyMap<string, number>,
  diagnostics: RiverDiagnostic[]
): readonly RiverCompiledReach[] {
  const reaches: RiverCompiledReach[] = [];
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
    reaches.push(
      deepFreezePlainData({
        id: segment.id,
        fromNodeIndex,
        toNodeIndex,
        order: segment.order ?? 0,
        elevationDrop: Math.max(
          0,
          nodes[fromNodeIndex].waterSurfaceElevation - nodes[toNodeIndex].waterSurfaceElevation
        ),
        config: configResult.value
      })
    );
  }
  return reaches;
}

function createStats(
  descriptor: RiverNetworkDescriptor,
  waterSurfaceElevations: Float32Array,
  diagnostics: readonly RiverDiagnostic[]
) {
  const elevationValues = Array.from(waterSurfaceElevations);
  return deepFreezePlainData({
    nodeCount: descriptor.nodes.length,
    reachCount: descriptor.segments.length,
    sourceCount: descriptor.nodes.filter((node) => node.kind === RiverNodeKind.Source).length,
    mouthCount: descriptor.nodes.filter((node) => node.kind === RiverNodeKind.Mouth).length,
    junctionCount: descriptor.nodes.filter(
      (node) => node.kind === RiverNodeKind.Confluence || node.kind === RiverNodeKind.Bifurcation
    ).length,
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
    minWaterSurfaceElevation: elevationValues.length > 0 ? Math.min(...elevationValues) : 0,
    maxWaterSurfaceElevation: elevationValues.length > 0 ? Math.max(...elevationValues) : 0
  });
}

export function cloneCompiledRiverConfig(config: DeepReadonly<RiverConfig>): RiverConfig {
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
    quality: cloneQualityConfig(config.quality),
    debug: cloneDebugConfig(config.debug)
  };
}

export class RiverNetworkCompiler {
  private constructor() {}

  static compile(descriptor: RiverNetworkDescriptor): RiverCompileResult {
    const validation = validateRiverNetworkDescriptor(descriptor);
    const diagnostics = validation.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      repair: diagnostic.repair ? { ...diagnostic.repair } : undefined
    }));
    if (!validation.value) {
      const frozenDiagnostics = deepFreezePlainData(diagnostics);
      return deepFreezePlainData({ diagnostics: frozenDiagnostics, valid: false });
    }

    const nodeIndexById = new Map(descriptor.nodes.map((node, nodeIndex) => [node.id, nodeIndex]));
    const topologicalNodeIndices = createTopologicalNodeIndices(descriptor, nodeIndexById);
    const waterSurfaceElevations = resolveWaterSurfaceElevations(
      descriptor,
      nodeIndexById,
      topologicalNodeIndices,
      diagnostics
    );
    const nodes = createCompiledNodes(descriptor, nodeIndexById, waterSurfaceElevations);
    const reaches = createCompiledReaches(descriptor, nodes, nodeIndexById, diagnostics);
    if (hasErrors(diagnostics) || reaches.length !== descriptor.segments.length) {
      const frozenDiagnostics = deepFreezePlainData(diagnostics);
      return deepFreezePlainData({ diagnostics: frozenDiagnostics, valid: false });
    }

    const frozenDiagnostics = deepFreezePlainData(diagnostics);
    const data: RiverCompiledData = deepFreezePlainData({
      schemaVersion: RiverNetworkSchemaVersion.V1,
      sourceId: descriptor.id,
      nodes,
      reaches,
      topologicalNodeIndices,
      waterSurfaceElevations,
      diagnostics: frozenDiagnostics,
      stats: createStats(descriptor, waterSurfaceElevations, frozenDiagnostics)
    });
    return deepFreezePlainData({ data, diagnostics: frozenDiagnostics, valid: true });
  }
}
