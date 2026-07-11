/** Graph, topology, endpoint, elevation, and whole-network budget validation. */
import { RiverNetworkSchemaVersion, RiverNodeKind } from "../../authoring/river/RiverAuthoringEnums";
import { RIVER_LIMITS } from "../../authoring/river/RiverAuthoringLimits";
import type {
  RiverNetworkBudgetConfig,
  RiverValidationResult,
  Vector3Tuple
} from "../../authoring/river/RiverAuthoringTypes";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../shared/diagnostics";

const DEFAULT_NETWORK_BUDGET: RiverNetworkBudgetConfig = {
  maxSegmentCount: RIVER_LIMITS.maxNetworkSegmentCount,
  maxSampleCount: RIVER_LIMITS.maxNetworkSampleCount,
  maxVertexCount: RIVER_LIMITS.maxNetworkVertexCount,
  maxChunkCount: RIVER_LIMITS.maxNetworkChunkCount,
  maxMapPixelCount: RIVER_LIMITS.maxNetworkMapPixelCount
};

function pushDiagnostic(
  diagnostics: RiverDiagnostic[],
  code: RiverDiagnosticCode,
  severity: RiverDiagnosticSeverity,
  path: string,
  message: string,
  originalValue?: unknown,
  repairedValue?: unknown
): void {
  diagnostics.push({
    code,
    severity,
    path,
    message,
    repair: arguments.length >= 7 ? { originalValue, repairedValue } : undefined
  });
}

function hasErrors(diagnostics: readonly RiverDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === RiverDiagnosticSeverity.Error);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positionsMatch(a: Vector3Tuple, b: Vector3Tuple): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 0.01;
}

export function resolveRiverNetworkBudget(network: RiverNetworkDescriptor): RiverNetworkBudgetConfig {
  return { ...DEFAULT_NETWORK_BUDGET, ...network.budget };
}

export function validateRiverNetworkDescriptor(
  network: RiverNetworkDescriptor
): RiverValidationResult<RiverNetworkDescriptor> {
  const diagnostics: RiverDiagnostic[] = [];
  if (network.schemaVersion !== RiverNetworkSchemaVersion.V1) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.UnsupportedSchemaVersion,
      RiverDiagnosticSeverity.Error,
      "schemaVersion",
      `Expected river network schema version ${RiverNetworkSchemaVersion.V1}.`
    );
  }
  const nodeIds = new Set<string>();
  const segmentIds = new Set<string>();
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (let i = 0; i < network.nodes.length; i++) {
    const node = network.nodes[i];
    if (nodeIds.has(node.id)) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.DuplicateId,
        RiverDiagnosticSeverity.Error,
        `nodes[${i}].id`,
        "Node id is duplicated."
      );
    }
    nodeIds.add(node.id);
    incoming.set(node.id, 0);
    outgoing.set(node.id, 0);
    adjacency.set(node.id, []);
    if (
      (node.kind === RiverNodeKind.Confluence || node.kind === RiverNodeKind.Bifurcation) &&
      (!isFiniteNumber(node.mergeRadius) || node.mergeRadius <= 0)
    ) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.InvalidMergeRadius,
        RiverDiagnosticSeverity.Error,
        `nodes[${i}].mergeRadius`,
        "Junction nodes require a positive mergeRadius."
      );
    }
  }

  let minimumSamples = 0;
  for (let i = 0; i < network.segments.length; i++) {
    const segment = network.segments[i];
    if (segmentIds.has(segment.id)) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.DuplicateId,
        RiverDiagnosticSeverity.Error,
        `segments[${i}].id`,
        "Segment id is duplicated."
      );
    }
    segmentIds.add(segment.id);
    const from = nodeById.get(segment.from);
    const to = nodeById.get(segment.to);
    if (!from) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.MissingNodeReference,
        RiverDiagnosticSeverity.Error,
        `segments[${i}].from`,
        "Upstream node does not exist."
      );
    }
    if (!to) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.MissingNodeReference,
        RiverDiagnosticSeverity.Error,
        `segments[${i}].to`,
        "Downstream node does not exist."
      );
    }
    if (from && to) {
      incoming.set(to.id, (incoming.get(to.id) ?? 0) + 1);
      outgoing.set(from.id, (outgoing.get(from.id) ?? 0) + 1);
      adjacency.get(from.id)?.push(to.id);
      adjacency.get(to.id)?.push(from.id);
      const first = segment.curve.points[0];
      const last = segment.curve.points[segment.curve.points.length - 1];
      if (!first || !positionsMatch(first.position, from.position)) {
        pushDiagnostic(
          diagnostics,
          RiverDiagnosticCode.SegmentEndpointMismatch,
          RiverDiagnosticSeverity.Warning,
          `segments[${i}].curve.points[0]`,
          "Curve start does not match its from node and will be snapped by the compiler.",
          first?.position,
          from.position
        );
      }
      if (!last || !positionsMatch(last.position, to.position)) {
        pushDiagnostic(
          diagnostics,
          RiverDiagnosticCode.SegmentEndpointMismatch,
          RiverDiagnosticSeverity.Warning,
          `segments[${i}].curve.points[-1]`,
          "Curve end does not match its to node and will be snapped by the compiler.",
          last?.position,
          to.position
        );
      }
      if (isFiniteNumber(from.elevation) && isFiniteNumber(to.elevation) && to.elevation > from.elevation + 0.001) {
        pushDiagnostic(
          diagnostics,
          RiverDiagnosticCode.ReversedElevation,
          RiverDiagnosticSeverity.Warning,
          `segments[${i}]`,
          "Segment rises in its declared downstream direction."
        );
      }
    }
    minimumSamples += segment.curve.points.length;
  }

  for (let i = 0; i < network.nodes.length; i++) {
    const node = network.nodes[i];
    const inDegree = incoming.get(node.id) ?? 0;
    const outDegree = outgoing.get(node.id) ?? 0;
    const validDegree =
      (node.kind === RiverNodeKind.Source && inDegree === 0 && outDegree >= 1) ||
      (node.kind === RiverNodeKind.Mouth && inDegree >= 1 && outDegree === 0) ||
      (node.kind === RiverNodeKind.Confluence && inDegree >= 2 && outDegree >= 1) ||
      (node.kind === RiverNodeKind.Bifurcation && inDegree >= 1 && outDegree >= 2);
    if (!validDegree) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.InvalidNodeDegree,
        RiverDiagnosticSeverity.Error,
        `nodes[${i}].kind`,
        `Node kind ${node.kind} does not match in/out degree ${inDegree}/${outDegree}.`
      );
    }
  }

  if (network.nodes.length > 0) {
    const visited = new Set<string>();
    const queue = [network.nodes[0].id];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      for (const neighbor of adjacency.get(id) ?? []) if (!visited.has(neighbor)) queue.push(neighbor);
    }
    if (visited.size !== network.nodes.length) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.DisconnectedNetwork,
        RiverDiagnosticSeverity.Error,
        "nodes",
        "Network contains disconnected components."
      );
    }
  }

  const directed = new Map<string, string[]>();
  for (const node of network.nodes) directed.set(node.id, []);
  for (const segment of network.segments) directed.get(segment.from)?.push(segment.to);
  const visiting = new Set<string>();
  const visitedDirected = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visitedDirected.has(id)) return false;
    visiting.add(id);
    for (const next of directed.get(id) ?? []) if (hasCycle(next)) return true;
    visiting.delete(id);
    visitedDirected.add(id);
    return false;
  };
  if (network.nodes.some((node) => hasCycle(node.id))) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.NetworkCycle,
      RiverDiagnosticSeverity.Error,
      "segments",
      "Directed river graph contains a cycle."
    );
  }

  const budget = resolveRiverNetworkBudget(network);
  for (const key of [
    "maxSegmentCount",
    "maxSampleCount",
    "maxVertexCount",
    "maxChunkCount",
    "maxMapPixelCount"
  ] as const) {
    const minimum = key === "maxMapPixelCount" ? 0 : 1;
    if (!Number.isFinite(budget[key]) || budget[key] < minimum) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.ValueOutOfRange,
        RiverDiagnosticSeverity.Error,
        `budget.${key}`,
        `Expected a finite budget greater than or equal to ${minimum}.`
      );
    }
  }
  const minimumVertices = minimumSamples * 4;
  const minimumChunks = network.segments.length;
  const budgetChecks: Array<[number, number, string]> = [
    [network.segments.length, budget.maxSegmentCount, "budget.maxSegmentCount"],
    [minimumSamples, budget.maxSampleCount, "budget.maxSampleCount"],
    [minimumVertices, budget.maxVertexCount, "budget.maxVertexCount"],
    [minimumChunks, budget.maxChunkCount, "budget.maxChunkCount"],
    [0, budget.maxMapPixelCount, "budget.maxMapPixelCount"]
  ];
  for (const [actual, limit, path] of budgetChecks) {
    if (actual > limit) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.NetworkBudgetExceeded,
        RiverDiagnosticSeverity.Error,
        path,
        `Minimum required value ${actual} exceeds budget ${limit}.`
      );
    }
  }
  return { value: hasErrors(diagnostics) ? undefined : network, diagnostics, valid: !hasErrors(diagnostics) };
}

/** @deprecated Use validateRiverNetworkDescriptor. */
export const validateRiverNetworkConfig = validateRiverNetworkDescriptor;
