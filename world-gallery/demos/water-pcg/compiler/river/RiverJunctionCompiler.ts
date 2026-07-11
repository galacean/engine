import { Vector3 } from "@galacean/engine-math";
import { RiverNodeKind, RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverReadonlyUint32Buffer } from "../shared/ReadonlyNumericBuffer";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../shared/diagnostics";
import {
  RIVER_FLOW_UV_SCALE,
  RIVER_GEOMETRY_EPSILON,
  RIVER_GEOMETRY_Y_OFFSET,
  RIVER_JUNCTION_MIN_REACH_LENGTH
} from "./constants";
import { createRiverGeometryData } from "./RiverGeometryCompiler";
import { countDegenerateTriangles } from "./RiverGeometryAnalysis";
import { resolveRiverRibbonJoinFrame } from "./RiverRibbonJoinResolver";
import type {
  ReadonlyVector3Tuple,
  RiverCompiledNode,
  RiverJunctionArtifact,
  RiverSamplePoint,
  RiverSampleResult,
  Vector2Tuple
} from "./types";

export interface RiverJunctionReachInput {
  readonly reachIndex: number;
  readonly fromNodeIndex: number;
  readonly toNodeIndex: number;
  readonly order: number;
  readonly materialLevel: RiverQualityLevel;
  readonly networkDistanceOffset: number;
  readonly networkFlowTimeOffset: number;
  readonly sampleResult: RiverSampleResult;
}

export interface RiverJunctionCompileResult {
  readonly sampleResults: readonly RiverSampleResult[];
  readonly junctions: readonly RiverJunctionArtifact[];
  readonly diagnostics: readonly RiverDiagnostic[];
}

interface JunctionEndpoint {
  readonly reachIndex: number;
  readonly incoming: boolean;
  readonly sample: RiverSamplePoint;
  readonly samples: readonly RiverSamplePoint[];
  readonly sampleIndex: number;
  readonly networkDistance: number;
  readonly networkFlowTime: number;
}

interface JunctionVertex {
  readonly position: ReadonlyVector3Tuple;
  readonly uv: Vector2Tuple;
  readonly uv1: Vector2Tuple;
  readonly angle: number;
}

function tuple3(x: number, y: number, z: number): ReadonlyVector3Tuple {
  return Object.freeze([x, y, z] as const);
}

function tuple2(x: number, y: number): Vector2Tuple {
  return Object.freeze([x, y] as const);
}

function interpolateSample(a: RiverSamplePoint, b: RiverSamplePoint, distance: number): RiverSamplePoint {
  const span = b.distance - a.distance;
  const t = span > RIVER_GEOMETRY_EPSILON ? (distance - a.distance) / span : 0;
  const tangentX = a.tangent.x + (b.tangent.x - a.tangent.x) * t;
  const tangentY = a.tangent.y + (b.tangent.y - a.tangent.y) * t;
  const tangentZ = a.tangent.z + (b.tangent.z - a.tangent.z) * t;
  const tangentLength = Math.hypot(tangentX, tangentY, tangentZ) || 1;
  return {
    position: new Vector3(
      a.position.x + (b.position.x - a.position.x) * t,
      a.position.y + (b.position.y - a.position.y) * t,
      a.position.z + (b.position.z - a.position.z) * t
    ),
    tangent: new Vector3(tangentX / tangentLength, tangentY / tangentLength, tangentZ / tangentLength),
    distance,
    flowTravelTime: a.flowTravelTime + (b.flowTravelTime - a.flowTravelTime) * t,
    width: a.width + (b.width - a.width) * t,
    depth: a.depth + (b.depth - a.depth) * t,
    flowSpeed: a.flowSpeed + (b.flowSpeed - a.flowSpeed) * t,
    bankFeather: a.bankFeather + (b.bankFeather - a.bankFeather) * t
  };
}

function sampleAtDistance(samples: readonly RiverSamplePoint[], distance: number): RiverSamplePoint {
  if (distance <= samples[0].distance) return interpolateSample(samples[0], samples[0], distance);
  for (let index = 0; index + 1 < samples.length; index++) {
    if (distance <= samples[index + 1].distance) return interpolateSample(samples[index], samples[index + 1], distance);
  }
  const last = samples[samples.length - 1];
  return interpolateSample(last, last, distance);
}

function trimSamples(result: RiverSampleResult, startDistance: number, endDistance: number): RiverSampleResult {
  const points = [sampleAtDistance(result.points, startDistance)];
  for (const point of result.points) {
    if (point.distance > startDistance && point.distance < endDistance) points.push(point);
  }
  points.push(sampleAtDistance(result.points, endDistance));
  return { points, totalLength: result.totalLength, diagnostics: [...result.diagnostics] };
}

function createBoundaryVertices(
  node: RiverCompiledNode,
  endpoints: readonly JunctionEndpoint[],
  includeBankFeather: boolean,
  yOffset: number,
  forceWater = false
): JunctionVertex[] {
  const vertices: JunctionVertex[] = [];
  for (const endpoint of endpoints) {
    const join = resolveRiverRibbonJoinFrame(endpoint.samples, endpoint.sampleIndex);
    const width = endpoint.sample.width * 0.5 + (includeBankFeather ? endpoint.sample.bankFeather : 0);
    const offset = width * join.widthScale;
    const y = endpoint.sample.position.y + yOffset;
    const sides = [
      { sign: 1, across: includeBankFeather ? 0 : 0.25 },
      { sign: -1, across: includeBankFeather ? 1 : 0.75 }
    ];
    for (const side of sides) {
      const x = endpoint.sample.position.x + join.normalX * offset * side.sign;
      const z = endpoint.sample.position.z + join.normalZ * offset * side.sign;
      vertices.push({
        position: tuple3(x, y, z),
        uv: tuple2(forceWater ? 0.5 : side.across, endpoint.networkFlowTime * RIVER_FLOW_UV_SCALE),
        uv1: tuple2(endpoint.sample.flowSpeed, endpoint.networkDistance),
        angle: Math.atan2(z - node.position[2], x - node.position[0])
      });
    }
  }
  return vertices.sort((a, b) => a.angle - b.angle);
}

function createPatchGeometry(
  node: RiverCompiledNode,
  endpoints: readonly JunctionEndpoint[],
  includeBankFeather: boolean,
  yOffset: number,
  forceWater = false
) {
  const boundary = createBoundaryVertices(node, endpoints, includeBankFeather, yOffset, forceWater);
  const incomingDistances = endpoints
    .filter((endpoint) => endpoint.incoming)
    .map((endpoint) => endpoint.networkDistance);
  const nodeDistance =
    incomingDistances.length > 0
      ? Math.max(...incomingDistances)
      : Math.min(...endpoints.map((endpoint) => endpoint.networkDistance));
  const incomingFlowTimes = endpoints
    .filter((endpoint) => endpoint.incoming)
    .map((endpoint) => endpoint.networkFlowTime);
  const nodeFlowTime =
    incomingFlowTimes.length > 0
      ? Math.max(...incomingFlowTimes)
      : Math.min(...endpoints.map((endpoint) => endpoint.networkFlowTime));
  const averageFlowSpeed =
    endpoints.reduce((sum, endpoint) => sum + endpoint.sample.flowSpeed, 0) / Math.max(1, endpoints.length);
  const positions: ReadonlyVector3Tuple[] = [tuple3(node.position[0], node.position[1] + yOffset, node.position[2])];
  const uvs: Vector2Tuple[] = [tuple2(0.5, nodeFlowTime * RIVER_FLOW_UV_SCALE)];
  const uv1s: Vector2Tuple[] = [tuple2(averageFlowSpeed, nodeDistance)];
  for (const vertex of boundary) {
    positions.push(vertex.position);
    uvs.push(vertex.uv);
    uv1s.push(vertex.uv1);
  }
  const indices: number[] = [];
  for (let index = 0; index < boundary.length; index++) {
    indices.push(0, index + 1, ((index + 1) % boundary.length) + 1);
  }
  return createRiverGeometryData(positions, uvs, uv1s, indices, indices.length);
}

function resolveFlowDirection(endpoints: readonly JunctionEndpoint[]): ReadonlyVector3Tuple {
  const outgoing = endpoints.filter((endpoint) => !endpoint.incoming);
  const sources = outgoing.length > 0 ? outgoing : endpoints;
  let x = 0;
  let z = 0;
  for (const endpoint of sources) {
    x += endpoint.sample.tangent.x;
    z += endpoint.sample.tangent.z;
  }
  const length = Math.hypot(x, z) || 1;
  return tuple3(x / length, 0, z / length);
}

function averageEndpointValue(
  endpoints: readonly JunctionEndpoint[],
  select: (endpoint: JunctionEndpoint) => number
): number {
  return endpoints.reduce((sum, endpoint) => sum + select(endpoint), 0) / Math.max(1, endpoints.length);
}

export function compileRiverJunctions(
  nodes: readonly RiverCompiledNode[],
  reaches: readonly RiverJunctionReachInput[]
): RiverJunctionCompileResult {
  const diagnostics: RiverDiagnostic[] = [];
  const startDistances = reaches.map(() => 0);
  const endDistances = reaches.map((reach) => reach.sampleResult.totalLength);

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node = nodes[nodeIndex];
    if (node.kind !== RiverNodeKind.Confluence) continue;
    const mergeRadius = node.mergeRadius ?? 0;
    for (const reachIndex of node.incomingReachIndices) endDistances[reachIndex] -= mergeRadius;
    for (const reachIndex of node.outgoingReachIndices) startDistances[reachIndex] += mergeRadius;
  }

  for (let reachIndex = 0; reachIndex < reaches.length; reachIndex++) {
    const reach = reaches[reachIndex];
    if (endDistances[reachIndex] - startDistances[reachIndex] >= RIVER_JUNCTION_MIN_REACH_LENGTH) continue;
    const availableTrim = Math.max(0, reach.sampleResult.totalLength - RIVER_JUNCTION_MIN_REACH_LENGTH);
    const requestedStart = startDistances[reachIndex];
    const requestedEndTrim = reach.sampleResult.totalLength - endDistances[reachIndex];
    const requestedTotal = requestedStart + requestedEndTrim;
    const scale = requestedTotal > 0 ? availableTrim / requestedTotal : 0;
    startDistances[reachIndex] = requestedStart * scale;
    endDistances[reachIndex] = reach.sampleResult.totalLength - requestedEndTrim * scale;
    diagnostics.push({
      code: RiverDiagnosticCode.JunctionTrimClamped,
      severity: RiverDiagnosticSeverity.Warning,
      path: `reaches[${reachIndex}]`,
      message: "Junction trim distances were clamped to preserve a non-empty reach.",
      repair: {
        originalValue: [requestedStart, reach.sampleResult.totalLength - requestedEndTrim],
        repairedValue: [startDistances[reachIndex], endDistances[reachIndex]]
      }
    });
  }

  const sampleResults = reaches.map((reach, reachIndex) =>
    trimSamples(reach.sampleResult, startDistances[reachIndex], endDistances[reachIndex])
  );
  const junctions: RiverJunctionArtifact[] = [];

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node = nodes[nodeIndex];
    if (node.kind !== RiverNodeKind.Confluence) continue;
    const incomingReachIndices = Array.from(node.incomingReachIndices);
    const outgoingReachIndices = Array.from(node.outgoingReachIndices);
    const connectedReachIndices = [...incomingReachIndices, ...outgoingReachIndices];
    const endpoints: JunctionEndpoint[] = connectedReachIndices.map((reachIndex) => {
      const incoming = incomingReachIndices.includes(reachIndex);
      const samples = sampleResults[reachIndex].points;
      const sampleIndex = incoming ? samples.length - 1 : 0;
      return {
        reachIndex,
        incoming,
        samples,
        sampleIndex,
        sample: samples[sampleIndex],
        networkDistance: reaches[reachIndex].networkDistanceOffset + samples[sampleIndex].distance,
        networkFlowTime: reaches[reachIndex].networkFlowTimeOffset + samples[sampleIndex].flowTravelTime
      };
    });
    if (endpoints.length < 3) {
      diagnostics.push({
        code: RiverDiagnosticCode.JunctionBoundaryInvalid,
        severity: RiverDiagnosticSeverity.Error,
        path: `nodes[${nodeIndex}]`,
        message: "A confluence junction requires at least three connected reach boundaries."
      });
      continue;
    }
    const maximumHalfWidth = Math.max(...endpoints.map((endpoint) => endpoint.sample.width * 0.5));
    if ((node.mergeRadius ?? 0) + RIVER_GEOMETRY_EPSILON < maximumHalfWidth) {
      diagnostics.push({
        code: RiverDiagnosticCode.JunctionRadiusTooSmall,
        severity: RiverDiagnosticSeverity.Error,
        path: `nodes[${nodeIndex}].mergeRadius`,
        message: `Junction radius ${node.mergeRadius ?? 0} is smaller than the connected half-width ${maximumHalfWidth}.`
      });
      continue;
    }
    const materialSourceReachIndex =
      outgoingReachIndices[0] ??
      incomingReachIndices.reduce(
        (best, reachIndex) => (reaches[reachIndex].order > reaches[best].order ? reachIndex : best),
        incomingReachIndices[0]
      );
    const materialLevel = reaches[materialSourceReachIndex].materialLevel;
    const queryBoundary = Object.freeze(
      createBoundaryVertices(node, endpoints, false, 0).map((vertex) => vertex.position)
    );
    const surfaceGeometry =
      materialLevel === RiverQualityLevel.Low
        ? createPatchGeometry(node, endpoints, false, RIVER_GEOMETRY_Y_OFFSET.surface, true)
        : createPatchGeometry(node, endpoints, false, RIVER_GEOMETRY_Y_OFFSET.surface);
    const bankFoamGeometry =
      materialLevel === RiverQualityLevel.Low
        ? undefined
        : createPatchGeometry(node, endpoints, true, RIVER_GEOMETRY_Y_OFFSET.bankFoam);
    const degenerateTriangleCount =
      countDegenerateTriangles(surfaceGeometry) + (bankFoamGeometry ? countDegenerateTriangles(bankFoamGeometry) : 0);
    if (degenerateTriangleCount > 0) {
      diagnostics.push({
        code: RiverDiagnosticCode.DegenerateTriangle,
        severity: RiverDiagnosticSeverity.Error,
        path: `nodes[${nodeIndex}].junctionGeometry`,
        message: `${degenerateTriangleCount} degenerate junction triangles were generated.`
      });
      continue;
    }
    junctions.push(
      Object.freeze({
        id: node.id,
        nodeIndex,
        position: tuple3(node.position[0], node.position[1], node.position[2]),
        mergeRadius: node.mergeRadius ?? 0,
        incomingReachIndices: new RiverReadonlyUint32Buffer(incomingReachIndices),
        outgoingReachIndices: new RiverReadonlyUint32Buffer(outgoingReachIndices),
        materialSourceReachIndex,
        flowDirection: resolveFlowDirection(endpoints),
        flowSpeed: averageEndpointValue(endpoints, (endpoint) => endpoint.sample.flowSpeed),
        depth: averageEndpointValue(endpoints, (endpoint) => endpoint.sample.depth),
        queryBoundary,
        surfaceGeometry,
        bankFoamGeometry
      })
    );
  }

  return Object.freeze({
    sampleResults: Object.freeze(sampleResults),
    junctions: Object.freeze(junctions),
    diagnostics: Object.freeze(diagnostics)
  });
}
