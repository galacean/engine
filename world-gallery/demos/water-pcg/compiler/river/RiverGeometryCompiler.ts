/** Deterministic CPU geometry and query-source compilation. No GPU objects are created here. */
import { Vector3 } from "@galacean/engine-math";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverReadonlyFloat32Buffer, RiverReadonlyUint32Buffer } from "../shared/ReadonlyNumericBuffer";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../shared/diagnostics";
import { RIVER_FLOW_UV_SCALE, RIVER_GEOMETRY_Y_OFFSET, RIVER_QUERY_SAMPLE_STRIDE } from "./constants";
import { analyzeRiverGeometry } from "./RiverGeometryAnalysis";
import { resolveRiverRibbonJoinFrame } from "./RiverRibbonJoinResolver";
import type {
  ReadonlyVector3Tuple,
  RiverCompiledSample,
  RiverGeometryBounds,
  RiverGeometryData,
  RiverQuerySourceData,
  RiverReachArtifact,
  RiverSamplePoint,
  RiverSampleResult,
  Vector2Tuple
} from "./types";

function vector3Tuple(x: number, y: number, z: number): ReadonlyVector3Tuple {
  return Object.freeze([x, y, z] as const);
}

function vector2Tuple(x: number, y: number): Vector2Tuple {
  return Object.freeze([x, y] as const);
}

function createBounds(positions: readonly ReadonlyVector3Tuple[]): RiverGeometryBounds {
  if (positions.length === 0) {
    return Object.freeze({ min: vector3Tuple(0, 0, 0), max: vector3Tuple(0, 0, 0) });
  }
  const boundsPadding = 3;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    minX = Math.min(minX, position[0]);
    minY = Math.min(minY, position[1] - boundsPadding);
    minZ = Math.min(minZ, position[2]);
    maxX = Math.max(maxX, position[0]);
    maxY = Math.max(maxY, position[1] + boundsPadding);
    maxZ = Math.max(maxZ, position[2]);
  }
  return Object.freeze({ min: vector3Tuple(minX, minY, minZ), max: vector3Tuple(maxX, maxY, maxZ) });
}

function freezeGeometry(
  positions: ReadonlyVector3Tuple[],
  uvs: Vector2Tuple[],
  uv1s: Vector2Tuple[],
  indices: number[],
  drawCount: number
): RiverGeometryData {
  return Object.freeze({
    positions: Object.freeze(positions),
    uvs: Object.freeze(uvs),
    uv1s: Object.freeze(uv1s),
    indices: new RiverReadonlyUint32Buffer(indices),
    bounds: createBounds(positions),
    drawStart: 0,
    drawCount
  });
}

function createHighRibbonData(
  samples: readonly RiverSamplePoint[],
  getWidthOffset: (sample: RiverSamplePoint) => number,
  yOffset: number,
  networkDistanceOffset: number
): RiverGeometryData {
  const positions: ReadonlyVector3Tuple[] = [];
  const uvs: Vector2Tuple[] = [];
  const uv1s: Vector2Tuple[] = [];
  const indices: number[] = [];
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex];
    const join = resolveRiverRibbonJoinFrame(samples, sampleIndex);
    const halfWidth = sample.width * 0.5 + getWidthOffset(sample);
    const offset = halfWidth * join.widthScale;
    const y = sample.position.y + yOffset;
    positions.push(
      vector3Tuple(sample.position.x + join.normalX * offset, y, sample.position.z + join.normalZ * offset),
      vector3Tuple(sample.position.x - join.normalX * offset, y, sample.position.z - join.normalZ * offset)
    );
    const networkDistance = networkDistanceOffset + sample.distance;
    uvs.push(
      vector2Tuple(0, networkDistance * RIVER_FLOW_UV_SCALE),
      vector2Tuple(1, networkDistance * RIVER_FLOW_UV_SCALE)
    );
    uv1s.push(vector2Tuple(sample.flowSpeed, networkDistance), vector2Tuple(sample.flowSpeed, networkDistance));
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return freezeGeometry(positions, uvs, uv1s, indices, Math.max(0, samples.length - 1) * 6);
}

export function createLowRiverGeometryData(
  samples: readonly RiverSamplePoint[],
  networkDistanceOffset = 0
): RiverGeometryData {
  const positions: ReadonlyVector3Tuple[] = [];
  const uvs: Vector2Tuple[] = [];
  const uv1s: Vector2Tuple[] = [];
  const indices: number[] = [];
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex];
    const join = resolveRiverRibbonJoinFrame(samples, sampleIndex);
    const halfWidth = sample.width * 0.5;
    const outerWidth = halfWidth + sample.bankFeather;
    const y = sample.position.y + RIVER_GEOMETRY_Y_OFFSET.surface;
    const widths = [outerWidth, halfWidth, -halfWidth, -outerWidth];
    const across = [0, 0.25, 0.75, 1];
    for (let i = 0; i < widths.length; i++) {
      positions.push(
        vector3Tuple(
          sample.position.x + join.normalX * widths[i] * join.widthScale,
          y,
          sample.position.z + join.normalZ * widths[i] * join.widthScale
        )
      );
      const networkDistance = networkDistanceOffset + sample.distance;
      uvs.push(vector2Tuple(across[i], networkDistance * RIVER_FLOW_UV_SCALE));
      uv1s.push(vector2Tuple(sample.flowSpeed, networkDistance));
    }
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const row = i * 4;
    const next = row + 4;
    for (let strip = 0; strip < 3; strip++) {
      const a = row + strip;
      const b = a + 1;
      const c = next + strip;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return freezeGeometry(positions, uvs, uv1s, indices, Math.max(0, samples.length - 1) * 18);
}

function createQuerySource(samples: readonly RiverSamplePoint[]): RiverQuerySourceData {
  const data = new Float32Array(samples.length * RIVER_QUERY_SAMPLE_STRIDE);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const offset = i * RIVER_QUERY_SAMPLE_STRIDE;
    data[offset] = sample.position.x;
    data[offset + 1] = sample.position.y;
    data[offset + 2] = sample.position.z;
    data[offset + 3] = sample.distance;
    data[offset + 4] = sample.width;
    data[offset + 5] = sample.depth;
    data[offset + 6] = sample.flowSpeed;
    data[offset + 7] = sample.tangent.x;
    data[offset + 8] = sample.tangent.z;
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
    materialLevel: RiverQualityLevel,
    networkDistanceOffset = 0
  ): RiverReachArtifact {
    const samples = sampleResult.points;
    const surfaceGeometry =
      materialLevel === RiverQualityLevel.Low
        ? createLowRiverGeometryData(samples, networkDistanceOffset)
        : createHighRibbonData(samples, () => 0, RIVER_GEOMETRY_Y_OFFSET.surface, networkDistanceOffset);
    const bankFoamGeometry =
      materialLevel === RiverQualityLevel.Low
        ? undefined
        : createHighRibbonData(
            samples,
            (sample) => sample.bankFeather,
            RIVER_GEOMETRY_Y_OFFSET.bankFoam,
            networkDistanceOffset
          );
    const geometryAnalysis = analyzeRiverGeometry(
      samples,
      surfaceGeometry,
      materialLevel === RiverQualityLevel.Low ? 4 : 2
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
