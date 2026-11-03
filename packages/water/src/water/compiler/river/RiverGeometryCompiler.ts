/** Deterministic CPU geometry and query-source compilation. No GPU objects are created here. */
import { Vector3 } from "@galacean/engine-math";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverReadonlyFloat32Buffer, RiverReadonlyUint32Buffer } from "../shared/ReadonlyNumericBuffer";
import { WaterBufferOwnership } from "../shared/WaterBufferOwnership";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../shared/diagnostics";
import {
  RIVER_FLOW_UV_SCALE,
  RIVER_FLOW_TRAVEL_MIN_SPEED,
  RIVER_GEOMETRY_EPSILON,
  RIVER_QUERY_SAMPLE_COMPONENT,
  RIVER_QUERY_SAMPLE_STRIDE,
  RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY
} from "./constants";
import { inspectRiverGeometry } from "./RiverGeometryAnalysis";
import { resolveRiverRibbonJoinFrames, type RiverRibbonJoinFrame } from "./RiverRibbonJoinResolver";
import type {
  ReadonlyVector3Tuple,
  ReadonlyVector4Tuple,
  RiverCompiledSample,
  RiverGeometryBounds,
  RiverGeometryData,
  RiverQuerySourceData,
  RiverReachArtifact,
  RiverSamplePoint,
  RiverSampleResult,
  RiverVertexColorTuple,
  Vector2Tuple
} from "./types";

function vector3Tuple(x: number, y: number, z: number): ReadonlyVector3Tuple {
  return Object.freeze([x, y, z] as const);
}

function vector4Tuple(x: number, y: number, z: number, w: number): ReadonlyVector4Tuple {
  return Object.freeze([x, y, z, w] as const);
}

function vector2Tuple(x: number, y: number): Vector2Tuple {
  return Object.freeze([x, y] as const);
}

function createBounds(positions: readonly ReadonlyVector3Tuple[], maxDisplacement: number): RiverGeometryBounds {
  if (positions.length === 0) {
    return Object.freeze({ min: vector3Tuple(0, 0, 0), max: vector3Tuple(0, 0, 0) });
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    minX = Math.min(minX, position[0]);
    minY = Math.min(minY, position[1] - maxDisplacement);
    minZ = Math.min(minZ, position[2]);
    maxX = Math.max(maxX, position[0]);
    maxY = Math.max(maxY, position[1] + maxDisplacement);
    maxZ = Math.max(maxZ, position[2]);
  }
  return Object.freeze({ min: vector3Tuple(minX, minY, minZ), max: vector3Tuple(maxX, maxY, maxZ) });
}

export interface RiverGeometryAttributeData {
  readonly normals?: ReadonlyVector3Tuple[];
  readonly tangents?: ReadonlyVector4Tuple[];
  readonly uv2s?: Vector2Tuple[];
  readonly uv3s?: Vector2Tuple[];
  readonly motionGradients?: ReadonlyVector4Tuple[];
  readonly maxDisplacement?: number;
}

export function createRiverGeometryData(
  positions: ReadonlyVector3Tuple[],
  uvs: Vector2Tuple[],
  uv1s: Vector2Tuple[],
  indices: number[],
  drawCount: number,
  colors?: RiverVertexColorTuple[],
  attributes: RiverGeometryAttributeData = {}
): RiverGeometryData {
  const maxDisplacement = attributes.maxDisplacement ?? 0;
  return Object.freeze({
    positions: Object.freeze(positions),
    normals: attributes.normals ? Object.freeze(attributes.normals) : undefined,
    tangents: attributes.tangents ? Object.freeze(attributes.tangents) : undefined,
    uvs: Object.freeze(uvs),
    uv1s: Object.freeze(uv1s),
    uv2s: attributes.uv2s ? Object.freeze(attributes.uv2s) : undefined,
    uv3s: attributes.uv3s ? Object.freeze(attributes.uv3s) : undefined,
    motionGradients: attributes.motionGradients ? Object.freeze(attributes.motionGradients) : undefined,
    colors: colors ? Object.freeze(colors) : undefined,
    indices: new RiverReadonlyUint32Buffer(indices),
    bounds: createBounds(positions, maxDisplacement),
    maxDisplacement,
    drawStart: 0,
    drawCount
  });
}

export interface RiverSurfaceFrame {
  readonly normal: ReadonlyVector3Tuple;
  readonly tangent: ReadonlyVector4Tuple;
  /** XZ gradients of signed across distance and speed-scaled flow time. */
  readonly motionGradients: ReadonlyVector4Tuple;
}

export function createRiverSurfaceFrame(
  samples: readonly RiverSamplePoint[],
  sampleIndex: number,
  joins: readonly RiverRibbonJoinFrame[],
  signedAcrossDistance = 0
): RiverSurfaceFrame {
  const previousIndex = Math.max(0, sampleIndex - 1),
    nextIndex = Math.min(samples.length - 1, sampleIndex + 1);
  const previous = samples[previousIndex],
    next = samples[nextIndex];
  const join = joins[sampleIndex],
    previousJoin = joins[previousIndex],
    nextJoin = joins[nextIndex];
  // P(q,t) = center(t) + q * join(t). Differentiate the final ribbon at constant
  // signed across distance, including the longitudinal shear introduced by miters.
  const acrossX = join.normalX * join.widthScale,
    acrossZ = join.normalZ * join.widthScale;
  const tangentX =
    next.position.x -
    previous.position.x +
    signedAcrossDistance * (nextJoin.normalX * nextJoin.widthScale - previousJoin.normalX * previousJoin.widthScale);
  const tangentY = next.position.y - previous.position.y;
  const tangentZ =
    next.position.z -
    previous.position.z +
    signedAcrossDistance * (nextJoin.normalZ * nextJoin.widthScale - previousJoin.normalZ * previousJoin.widthScale);
  const determinant = acrossX * tangentZ - acrossZ * tangentX;
  const normalX = -acrossZ * tangentY,
    normalY = -determinant,
    normalZ = acrossX * tangentY;
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  const direction = normalY < 0 ? -1 : 1;
  const normal =
    normalLength > RIVER_GEOMETRY_EPSILON
      ? vector3Tuple(
          (direction * normalX) / normalLength,
          (direction * normalY) / normalLength,
          (direction * normalZ) / normalLength
        )
      : vector3Tuple(0, 1, 0);
  const tangentLength = Math.hypot(tangentX, tangentY, tangentZ) || 1;
  const tangent = vector4Tuple(tangentX / tangentLength, tangentY / tangentLength, tangentZ / tangentLength, 1);
  // Dual basis converts height derivatives in motion coordinates to local XZ.
  // Degenerate/folded surfaces are diagnosed separately; never bind NaN attributes.
  const flowSpan =
    (next.flowTravelTime - previous.flowTravelTime) *
    Math.max(samples[sampleIndex].flowSpeed, RIVER_FLOW_TRAVEL_MIN_SPEED);
  const motionGradients =
    Math.abs(determinant) > RIVER_GEOMETRY_EPSILON
      ? vector4Tuple(
          tangentZ / determinant,
          -tangentX / determinant,
          (-acrossZ * flowSpan) / determinant,
          (acrossX * flowSpan) / determinant
        )
      : vector4Tuple(0, 0, 0, 0);
  return { normal, tangent, motionGradients };
}

function createSurfaceRibbonData(
  samples: readonly RiverSamplePoint[],
  joins: readonly RiverRibbonJoinFrame[],
  crossSegments: number,
  networkDistanceOffset: number,
  networkFlowTimeOffset: number,
  maxDisplacement: number
): RiverGeometryData {
  const positions: ReadonlyVector3Tuple[] = [];
  const normals: ReadonlyVector3Tuple[] = [];
  const tangents: ReadonlyVector4Tuple[] = [];
  const uvs: Vector2Tuple[] = [];
  const uv1s: Vector2Tuple[] = [];
  const uv2s: Vector2Tuple[] = [];
  const uv3s: Vector2Tuple[] = [];
  const motionGradients: ReadonlyVector4Tuple[] = [];
  const indices: number[] = [];
  const rowWidth = crossSegments + 1;
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex];
    const join = joins[sampleIndex];
    const halfWidth = sample.width * 0.5;
    const y = sample.position.y;
    const networkDistance = networkDistanceOffset + sample.distance;
    const networkFlowTime = networkFlowTimeOffset + sample.flowTravelTime;
    for (let acrossIndex = 0; acrossIndex <= crossSegments; acrossIndex++) {
      const across = acrossIndex / crossSegments;
      const signedAcrossDistance = halfWidth * (1 - across * 2);
      const offset = signedAcrossDistance * join.widthScale;
      const frame = createRiverSurfaceFrame(samples, sampleIndex, joins, signedAcrossDistance);
      positions.push(
        vector3Tuple(sample.position.x + join.normalX * offset, y, sample.position.z + join.normalZ * offset)
      );
      normals.push(frame.normal);
      tangents.push(frame.tangent);
      motionGradients.push(frame.motionGradients);
      uvs.push(vector2Tuple(across, networkFlowTime * RIVER_FLOW_UV_SCALE));
      uv1s.push(vector2Tuple(sample.flowSpeed, networkDistance));
      uv2s.push(vector2Tuple(signedAcrossDistance, networkFlowTime));
      uv3s.push(vector2Tuple(halfWidth, sample.depth));
    }
  }
  for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex++) {
    const row = sampleIndex * rowWidth;
    const next = row + rowWidth;
    for (let strip = 0; strip < crossSegments; strip++) {
      const a = row + strip;
      const b = a + 1;
      const c = next + strip;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return createRiverGeometryData(
    positions,
    uvs,
    uv1s,
    indices,
    Math.max(0, samples.length - 1) * crossSegments * 6,
    undefined,
    { normals, tangents, uv2s, uv3s, motionGradients, maxDisplacement }
  );
}

/** Shared surface-only compilation; editing does not need serialized samples or query buffers. */
export function compileRiverSurfaceGeometry(
  samples: readonly RiverSamplePoint[],
  geometryLevel: RiverQualityLevel,
  networkDistanceOffset = 0,
  networkFlowTimeOffset = 0,
  maxDisplacement = 0
) {
  const joins = resolveRiverRibbonJoinFrames(samples);
  const crossSegments = RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY[geometryLevel];
  const surfaceGeometry = createSurfaceRibbonData(
    samples,
    joins,
    crossSegments,
    networkDistanceOffset,
    networkFlowTimeOffset,
    maxDisplacement
  );
  return { surfaceGeometry, inspection: inspectRiverGeometry(surfaceGeometry, crossSegments + 1, joins) };
}

function createQuerySource(samples: readonly RiverSamplePoint[]): RiverQuerySourceData {
  const data = new Float32Array(samples.length * RIVER_QUERY_SAMPLE_STRIDE);
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const offset = index * RIVER_QUERY_SAMPLE_STRIDE;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.x] = sample.position.x;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.y] = sample.position.y;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.z] = sample.position.z;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.distance] = sample.distance;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.width] = sample.width;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.depth] = sample.depth;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.flowSpeed] = sample.flowSpeed;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.tangentX] = sample.tangent.x;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.tangentZ] = sample.tangent.z;
    data[offset + RIVER_QUERY_SAMPLE_COMPONENT.flowTravelTime] = sample.flowTravelTime;
  }
  return Object.freeze({
    samples: new RiverReadonlyFloat32Buffer(data, WaterBufferOwnership.Transfer),
    stride: RIVER_QUERY_SAMPLE_STRIDE,
    sampleCount: samples.length
  });
}

function compileSamples(samples: readonly RiverSamplePoint[]): readonly RiverCompiledSample[] {
  return Object.freeze(
    samples.map((sample) =>
      Object.freeze({
        position: vector3Tuple(sample.position.x, sample.position.y, sample.position.z),
        tangent: vector3Tuple(sample.tangent.x, sample.tangent.y, sample.tangent.z),
        distance: sample.distance,
        flowTravelTime: sample.flowTravelTime,
        width: sample.width,
        depth: sample.depth,
        flowSpeed: sample.flowSpeed,
        bankFeather: sample.bankFeather
      })
    )
  );
}

export function decodeRiverSamplePoints(samples: readonly RiverCompiledSample[]): RiverSamplePoint[] {
  return samples.map((sample) => ({
    position: new Vector3(sample.position[0], sample.position[1], sample.position[2]),
    tangent: new Vector3(sample.tangent[0], sample.tangent[1], sample.tangent[2]),
    distance: sample.distance,
    flowTravelTime: sample.flowTravelTime,
    width: sample.width,
    depth: sample.depth,
    flowSpeed: sample.flowSpeed,
    bankFeather: sample.bankFeather
  }));
}

export class RiverGeometryCompiler {
  private constructor() {}

  static compile(
    sampleResult: RiverSampleResult,
    geometryLevel: RiverQualityLevel,
    networkDistanceOffset = 0,
    networkFlowTimeOffset = 0,
    options: { readonly maxDisplacement?: number } = {}
  ): RiverReachArtifact {
    const samples = sampleResult.points;
    const maxDisplacement = options.maxDisplacement ?? 0;
    const { surfaceGeometry, inspection } = compileRiverSurfaceGeometry(
      samples,
      geometryLevel,
      networkDistanceOffset,
      networkFlowTimeOffset,
      maxDisplacement
    );
    // Foam is evaluated by the water shader; no overlapping transparent bank ribbon.
    const geometryAnalysis = inspection.summary;
    const diagnostics: RiverDiagnostic[] = [...sampleResult.diagnostics];
    if (geometryAnalysis.sharpBendFallbackCount > 0) {
      diagnostics.push({
        code: RiverDiagnosticCode.SharpBendFallback,
        severity: RiverDiagnosticSeverity.Warning,
        path: "geometry.joins",
        message: `${geometryAnalysis.sharpBendFallbackCount} ribbon joins exceeded the miter limit and used the bounded fallback.`
      });
    }
    if (geometryAnalysis.bankSelfIntersectionCount > 0) {
      diagnostics.push({
        code: RiverDiagnosticCode.BankSelfIntersection,
        severity: RiverDiagnosticSeverity.Warning,
        path: "geometry.banks",
        message: `${geometryAnalysis.bankSelfIntersectionCount} bank self-intersections remain after join resolution.`
      });
    }
    if (geometryAnalysis.degenerateTriangleCount > 0) {
      diagnostics.push({
        code: RiverDiagnosticCode.DegenerateTriangle,
        severity: RiverDiagnosticSeverity.Error,
        path: "geometry.indices",
        message: `${geometryAnalysis.degenerateTriangleCount} degenerate triangles were generated.`
      });
    }
    return Object.freeze({
      samples: compileSamples(samples),
      totalLength: sampleResult.totalLength,
      diagnostics: Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic }))),
      geometryAnalysis,
      surfaceGeometry,
      querySource: createQuerySource(samples)
    });
  }
}
