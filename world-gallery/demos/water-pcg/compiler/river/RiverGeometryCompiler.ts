/** Deterministic CPU geometry and query-source compilation. No GPU objects are created here. */
import { Vector3 } from "@galacean/engine-math";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverReadonlyFloat32Buffer, RiverReadonlyUint32Buffer } from "../shared/ReadonlyNumericBuffer";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../shared/diagnostics";
import {
  RIVER_FLOW_UV_SCALE,
  RIVER_GEOMETRY_Y_OFFSET,
  RIVER_QUERY_SAMPLE_COMPONENT,
  RIVER_QUERY_SAMPLE_STRIDE,
  RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY
} from "./constants";
import { analyzeRiverGeometry } from "./RiverGeometryAnalysis";
import { resolveRiverRibbonJoinFrame } from "./RiverRibbonJoinResolver";
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
}

export function createRiverSurfaceFrame(samples: readonly RiverSamplePoint[], sampleIndex: number): RiverSurfaceFrame {
  const previous = samples[Math.max(0, sampleIndex - 1)].position;
  const next = samples[Math.min(samples.length - 1, sampleIndex + 1)].position;
  let tangentX = next.x - previous.x;
  let tangentY = next.y - previous.y;
  let tangentZ = next.z - previous.z;
  const tangentLength = Math.hypot(tangentX, tangentY, tangentZ) || 1;
  tangentX /= tangentLength;
  tangentY /= tangentLength;
  tangentZ /= tangentLength;
  const horizontalLength = Math.hypot(tangentX, tangentZ) || 1;
  const lateralX = -tangentZ / horizontalLength;
  const lateralZ = tangentX / horizontalLength;
  const normalX = -lateralZ * tangentY;
  const normalY = lateralZ * tangentX - lateralX * tangentZ;
  const normalZ = lateralX * tangentY;
  const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
  return Object.freeze({
    normal: vector3Tuple(normalX / normalLength, normalY / normalLength, normalZ / normalLength),
    tangent: vector4Tuple(tangentX, tangentY, tangentZ, 1)
  });
}

function createSurfaceRibbonData(
  samples: readonly RiverSamplePoint[],
  crossSegments: number,
  yOffset: number,
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
  const indices: number[] = [];
  const rowWidth = crossSegments + 1;
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex];
    const join = resolveRiverRibbonJoinFrame(samples, sampleIndex);
    const halfWidth = sample.width * 0.5;
    const frame = createRiverSurfaceFrame(samples, sampleIndex);
    const y = sample.position.y + yOffset;
    const networkDistance = networkDistanceOffset + sample.distance;
    const networkFlowTime = networkFlowTimeOffset + sample.flowTravelTime;
    for (let acrossIndex = 0; acrossIndex <= crossSegments; acrossIndex++) {
      const across = acrossIndex / crossSegments;
      const signedAcrossDistance = halfWidth * (1 - across * 2);
      const offset = signedAcrossDistance * join.widthScale;
      positions.push(
        vector3Tuple(sample.position.x + join.normalX * offset, y, sample.position.z + join.normalZ * offset)
      );
      normals.push(frame.normal);
      tangents.push(frame.tangent);
      uvs.push(vector2Tuple(across, networkFlowTime * RIVER_FLOW_UV_SCALE));
      uv1s.push(vector2Tuple(sample.flowSpeed, networkDistance));
      uv2s.push(vector2Tuple(signedAcrossDistance, networkFlowTime));
      uv3s.push(vector2Tuple(halfWidth, 0));
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
    { normals, tangents, uv2s, uv3s, maxDisplacement }
  );
}

export function createLowRiverGeometryData(
  samples: readonly RiverSamplePoint[],
  networkDistanceOffset = 0,
  networkFlowTimeOffset = 0,
  includeMotionAttributes = false,
  maxDisplacement = 0
): RiverGeometryData {
  const positions: ReadonlyVector3Tuple[] = [];
  const normals: ReadonlyVector3Tuple[] = [];
  const tangents: ReadonlyVector4Tuple[] = [];
  const uvs: Vector2Tuple[] = [];
  const uv1s: Vector2Tuple[] = [];
  const uv2s: Vector2Tuple[] = [];
  const uv3s: Vector2Tuple[] = [];
  const indices: number[] = [];
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex];
    const join = resolveRiverRibbonJoinFrame(samples, sampleIndex);
    const halfWidth = sample.width * 0.5;
    const outerWidth = halfWidth + sample.bankFeather;
    const y = sample.position.y + RIVER_GEOMETRY_Y_OFFSET.surface;
    const widths = [outerWidth, halfWidth, -halfWidth, -outerWidth];
    const across = [0, 0.25, 0.75, 1];
    const frame = createRiverSurfaceFrame(samples, sampleIndex);
    for (let index = 0; index < widths.length; index++) {
      positions.push(
        vector3Tuple(
          sample.position.x + join.normalX * widths[index] * join.widthScale,
          y,
          sample.position.z + join.normalZ * widths[index] * join.widthScale
        )
      );
      const networkDistance = networkDistanceOffset + sample.distance;
      const networkFlowTime = networkFlowTimeOffset + sample.flowTravelTime;
      uvs.push(vector2Tuple(across[index], networkFlowTime * RIVER_FLOW_UV_SCALE));
      uv1s.push(vector2Tuple(sample.flowSpeed, networkDistance));
      if (includeMotionAttributes) {
        normals.push(frame.normal);
        tangents.push(frame.tangent);
        uv2s.push(vector2Tuple(widths[index], networkFlowTime));
        uv3s.push(vector2Tuple(halfWidth, 0));
      }
    }
  }
  for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex++) {
    const row = sampleIndex * 4;
    const next = row + 4;
    for (let strip = 0; strip < 3; strip++) {
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
    Math.max(0, samples.length - 1) * 18,
    undefined,
    includeMotionAttributes ? { normals, tangents, uv2s, uv3s, maxDisplacement } : undefined
  );
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
    samples: new RiverReadonlyFloat32Buffer(data),
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
    options: { readonly materialLevel?: RiverQualityLevel; readonly maxDisplacement?: number } = {}
  ): RiverReachArtifact {
    const samples = sampleResult.points;
    const materialLevel = options.materialLevel ?? geometryLevel;
    const maxDisplacement = materialLevel === RiverQualityLevel.Low ? 0 : (options.maxDisplacement ?? 0);
    const surfaceGeometry =
      geometryLevel === RiverQualityLevel.Low
        ? createLowRiverGeometryData(
            samples,
            networkDistanceOffset,
            networkFlowTimeOffset,
            materialLevel !== RiverQualityLevel.Low,
            maxDisplacement
          )
        : createSurfaceRibbonData(
            samples,
            RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY[geometryLevel],
            RIVER_GEOMETRY_Y_OFFSET.surface,
            networkDistanceOffset,
            networkFlowTimeOffset,
            maxDisplacement
          );
    // Shore foam is evaluated inside the water-surface shader. Keeping a second transparent
    // ribbon here caused branch banks to overlap and reorder as the camera moved.
    const bankFoamGeometry = undefined;
    const geometryAnalysis = analyzeRiverGeometry(
      samples,
      surfaceGeometry,
      RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY[geometryLevel] + 1
    );
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
      bankFoamGeometry,
      querySource: createQuerySource(samples)
    });
  }
}
