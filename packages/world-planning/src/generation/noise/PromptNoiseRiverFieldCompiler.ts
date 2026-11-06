import { evaluateRiverCatmullRom, evaluateRiverCubicBezier } from "@galacean/engine-water/water/index";
import type {
  PromptNoiseRiverControlPointV1,
  PromptNoiseRiverCurveMode,
  PromptNoiseRiverOperatorV1,
  PromptNoiseWorldPointV1
} from "./PromptNoiseTerrainProgram.ts";

export const PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS = 8 as const;
const TARGET_SEGMENT_LENGTH = 18;
const MAX_CURVE_SUBDIVISIONS = 32;
const MAX_GRID_AXIS = 128;
const MIN_GRID_CELL_SIZE = 8;
const SEGMENT_TEXELS = 4;
const CELL_TEXELS = 2;

export interface PromptNoiseRiverFieldSegmentV1 {
  readonly start: PromptNoiseWorldPointV1;
  readonly end: PromptNoiseWorldPointV1;
  readonly startBedHeight: number;
  readonly endBedHeight: number;
  readonly startWidth: number;
  readonly endWidth: number;
  readonly startDepth: number;
  readonly endDepth: number;
  readonly startFlowSpeed: number;
  readonly endFlowSpeed: number;
  readonly startBankFeather: number;
  readonly endBankFeather: number;
  readonly startFactor: number;
  readonly endFactor: number;
}

export interface PromptNoiseRiverFieldGridV1 {
  readonly originX: number;
  readonly originZ: number;
  readonly cellSizeX: number;
  readonly cellSizeZ: number;
  readonly width: number;
  readonly height: number;
  readonly maxSegmentsPerCell: typeof PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS;
  /** One-based segment indices; zero denotes an unused slot. */
  readonly segmentIndices: readonly number[];
}

export interface PromptNoiseRiverFieldV1 {
  readonly schemaVersion: 1;
  readonly operatorId: number;
  readonly curveMode: PromptNoiseRiverCurveMode;
  readonly controlPointCount: number;
  readonly segmentCount: number;
  readonly generationHash: string;
  readonly bounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  readonly segments: readonly PromptNoiseRiverFieldSegmentV1[];
  readonly grid: PromptNoiseRiverFieldGridV1;
}

export interface PromptNoiseRiverFieldSampleV1 {
  readonly operatorId: number;
  readonly generationHash: string;
  readonly distance: number;
  readonly factor: number;
  readonly tangentX: number;
  readonly tangentZ: number;
  readonly width: number;
  readonly depth: number;
  readonly flowSpeed: number;
  readonly bankFeather: number;
  readonly bedHeight: number;
  readonly surfaceHeight: number;
}

export interface PackedPromptNoiseRiverFieldBindingV1 {
  readonly operatorId: number;
  readonly generationHash: string;
  readonly segmentOffset: number;
  readonly segmentCount: number;
  readonly cellOffset: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly originX: number;
  readonly originZ: number;
  readonly cellSizeX: number;
  readonly cellSizeZ: number;
}

export interface PackedPromptNoiseRiverFieldSetV1 {
  readonly maxSegmentsPerCell: typeof PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS;
  readonly segmentTexels: Float32Array;
  readonly cellTexels: Float32Array;
  readonly bindings: readonly PackedPromptNoiseRiverFieldBindingV1[];
}

/** Bounded CPU/GPU complexity measurements for the currently packed River fields. */
export interface PromptNoiseRiverFieldSetMetricsV1 {
  readonly fieldCount: number;
  readonly controlPointCount: number;
  readonly segmentCount: number;
  readonly cellCount: number;
  readonly maxSegmentsPerCell: typeof PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS;
  readonly maximumCellSegmentCount: number;
  readonly segmentBytes: number;
  readonly cellBytes: number;
  readonly totalBytes: number;
}

export const EMPTY_PROMPT_NOISE_RIVER_FIELD_METRICS: PromptNoiseRiverFieldSetMetricsV1 = Object.freeze({
  fieldCount: 0,
  controlPointCount: 0,
  segmentCount: 0,
  cellCount: 0,
  maxSegmentsPerCell: PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS,
  maximumCellSegmentCount: 0,
  segmentBytes: 0,
  cellBytes: 0,
  totalBytes: 0
});

/** Pure compiler from editable River control points to a bounded local lookup field. */
export class PromptNoiseRiverFieldCompiler {
  static compile(operator: PromptNoiseRiverOperatorV1): PromptNoiseRiverFieldV1 {
    const points = operator.controlPoints;
    if (!points || points.length < 2 || !operator.curveMode) {
      throw new RangeError(`Prompt Noise River ${operator.id} does not contain C2-B control points.`);
    }
    const segments = Object.freeze([
      ...compileSegments(points, operator.curveMode),
      ...compileJunctionEndpointSegments(operator)
    ]);
    const maximumSupport =
      Math.max(
        ...points.map((point) => point.width * 0.5 + point.bankFeather),
        operator.halfWidth,
        operator.topology?.fromMergeRadius ?? 0,
        operator.topology?.toMergeRadius ?? 0
      ) + operator.bankWidth;
    const bounds = segmentBounds(segments, maximumSupport);
    const grid = compileGrid(segments, bounds);
    const generationHash = hashField(operator.id, operator.curveMode, points, segments, operator.topology);
    return deepFreeze({
      schemaVersion: 1 as const,
      operatorId: operator.id,
      curveMode: operator.curveMode,
      controlPointCount: points.length,
      segmentCount: segments.length,
      generationHash,
      bounds,
      segments,
      grid
    });
  }
}

/** Combines explicit Reach fields into one bounded Semantic / Layout query authority. */
export function combinePromptNoiseRiverFields(
  networkId: number,
  fields: readonly PromptNoiseRiverFieldV1[]
): PromptNoiseRiverFieldV1 {
  if (!Number.isInteger(networkId) || networkId < 1 || fields.length === 0) {
    throw new RangeError("Prompt Noise River Network Field input is invalid");
  }
  const regular: PromptNoiseRiverFieldSegmentV1[] = [];
  const junctions = new Map<string, PromptNoiseRiverFieldSegmentV1>();
  for (const segment of fields.flatMap((field) => field.segments)) {
    const length = Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z);
    if (length > 0.05) {
      regular.push(segment);
      continue;
    }
    const centerX = (segment.start.x + segment.end.x) * 0.5;
    const centerZ = (segment.start.z + segment.end.z) * 0.5;
    const key = `${centerX.toFixed(4)}:${centerZ.toFixed(4)}`;
    const previous = junctions.get(key);
    const width = Math.max(segment.startWidth, segment.endWidth);
    const previousWidth = previous ? Math.max(previous.startWidth, previous.endWidth) : -1;
    if (
      !previous ||
      width > previousWidth + 1e-5 ||
      (Math.abs(width - previousWidth) <= 1e-5 && segment.startBedHeight < previous.startBedHeight)
    ) {
      junctions.set(key, segment);
    }
  }
  const junctionProfiles = [...junctions.values()].map((segment) => ({
    x: (segment.start.x + segment.end.x) * 0.5,
    z: (segment.start.z + segment.end.z) * 0.5,
    bedHeight: segment.startBedHeight,
    depth: segment.startDepth
  }));
  const resolvedRegular = regular.map((segment) => {
    const startJunction = junctionProfiles.find(
      (junction) => Math.hypot(segment.start.x - junction.x, segment.start.z - junction.z) <= 0.02
    );
    const endJunction = junctionProfiles.find(
      (junction) => Math.hypot(segment.end.x - junction.x, segment.end.z - junction.z) <= 0.02
    );
    return Object.freeze({
      ...segment,
      startBedHeight: startJunction?.bedHeight ?? segment.startBedHeight,
      startDepth: startJunction?.depth ?? segment.startDepth,
      endBedHeight: endJunction?.bedHeight ?? segment.endBedHeight,
      endDepth: endJunction?.depth ?? segment.endDepth
    });
  });
  const segments = Object.freeze([...junctions.values(), ...resolvedRegular]);
  const bounds = Object.freeze({
    minX: Math.min(...fields.map((field) => field.bounds.minX)),
    minZ: Math.min(...fields.map((field) => field.bounds.minZ)),
    maxX: Math.max(...fields.map((field) => field.bounds.maxX)),
    maxZ: Math.max(...fields.map((field) => field.bounds.maxZ))
  });
  const grid = compileGrid(segments, bounds);
  const generationHash = hashStableValue({
    networkId,
    fields: fields.map(({ operatorId, generationHash }) => ({ operatorId, generationHash })),
    segments
  });
  return deepFreeze({
    schemaVersion: 1 as const,
    operatorId: networkId,
    curveMode: "linear" as const,
    controlPointCount: fields.reduce((sum, field) => sum + field.controlPointCount, 0),
    segmentCount: segments.length,
    generationHash,
    bounds,
    segments,
    grid
  });
}

/** Samples only the bounded candidate set stored for the addressed grid cell. */
export function samplePromptNoiseRiverField(
  field: PromptNoiseRiverFieldV1,
  worldX: number,
  worldZ: number
): PromptNoiseRiverFieldSampleV1 {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
    throw new RangeError("Prompt Noise River Field coordinates must be finite.");
  }
  const candidates = candidateSegmentIndices(field, worldX, worldZ);
  let bestSegment = field.segments[candidates[0] ?? 0];
  let bestLocalFactor = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const segmentIndex of candidates.length ? candidates : field.segments.map((_, index) => index)) {
    const segment = field.segments[segmentIndex];
    const segmentX = segment.end.x - segment.start.x;
    const segmentZ = segment.end.z - segment.start.z;
    const localFactor = clamp01(
      ((worldX - segment.start.x) * segmentX + (worldZ - segment.start.z) * segmentZ) /
        Math.max(segmentX * segmentX + segmentZ * segmentZ, 1e-8)
    );
    const closestX = mix(segment.start.x, segment.end.x, localFactor);
    const closestZ = mix(segment.start.z, segment.end.z, localFactor);
    const distance = Math.hypot(worldX - closestX, worldZ - closestZ);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegment = segment;
      bestLocalFactor = localFactor;
    }
  }
  if (!bestSegment) throw new Error(`Prompt Noise River Field ${field.operatorId} has no segments.`);
  const factor = mix(bestSegment.startFactor, bestSegment.endFactor, bestLocalFactor);
  const bedHeight = mix(bestSegment.startBedHeight, bestSegment.endBedHeight, bestLocalFactor);
  const depth = mix(bestSegment.startDepth, bestSegment.endDepth, bestLocalFactor);
  return Object.freeze({
    operatorId: field.operatorId,
    generationHash: field.generationHash,
    distance: bestDistance,
    factor,
    tangentX: bestSegment.end.x - bestSegment.start.x,
    tangentZ: bestSegment.end.z - bestSegment.start.z,
    width: mix(bestSegment.startWidth, bestSegment.endWidth, bestLocalFactor),
    depth,
    flowSpeed: mix(bestSegment.startFlowSpeed, bestSegment.endFlowSpeed, bestLocalFactor),
    bankFeather: mix(bestSegment.startBankFeather, bestSegment.endBankFeather, bestLocalFactor),
    bedHeight,
    surfaceHeight: bedHeight + depth
  });
}

/** Packs all compiled fields into fixed-layout RGBA32F tables for Terrain GPU upload. */
export function packPromptNoiseRiverFieldSet(
  fields: readonly PromptNoiseRiverFieldV1[]
): PackedPromptNoiseRiverFieldSetV1 {
  const segmentCount = fields.reduce((sum, field) => sum + field.segmentCount, 0);
  const cellCount = fields.reduce((sum, field) => sum + field.grid.width * field.grid.height, 0);
  const segmentTexels = new Float32Array(segmentCount * SEGMENT_TEXELS * 4);
  const cellTexels = new Float32Array(cellCount * CELL_TEXELS * 4);
  const bindings: PackedPromptNoiseRiverFieldBindingV1[] = [];
  let segmentOffset = 0;
  let cellOffset = 0;
  for (const field of fields) {
    field.segments.forEach((segment, localIndex) => {
      const offset = (segmentOffset + localIndex) * SEGMENT_TEXELS * 4;
      segmentTexels.set([segment.start.x, segment.start.z, segment.end.x, segment.end.z], offset);
      segmentTexels.set(
        [segment.startBedHeight, segment.endBedHeight, segment.startWidth, segment.endWidth],
        offset + 4
      );
      segmentTexels.set(
        [segment.startDepth, segment.endDepth, segment.startBankFeather, segment.endBankFeather],
        offset + 8
      );
      segmentTexels.set(
        [segment.startFlowSpeed, segment.endFlowSpeed, segment.startFactor, segment.endFactor],
        offset + 12
      );
    });
    for (let cell = 0; cell < field.grid.width * field.grid.height; cell++) {
      const sourceOffset = cell * PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS;
      const targetOffset = (cellOffset + cell) * CELL_TEXELS * 4;
      for (let slot = 0; slot < PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS; slot++) {
        const localIndex = field.grid.segmentIndices[sourceOffset + slot];
        cellTexels[targetOffset + slot] = localIndex === 0 ? 0 : segmentOffset + localIndex;
      }
    }
    bindings.push(
      Object.freeze({
        operatorId: field.operatorId,
        generationHash: field.generationHash,
        segmentOffset,
        segmentCount: field.segmentCount,
        cellOffset,
        gridWidth: field.grid.width,
        gridHeight: field.grid.height,
        originX: field.grid.originX,
        originZ: field.grid.originZ,
        cellSizeX: field.grid.cellSizeX,
        cellSizeZ: field.grid.cellSizeZ
      })
    );
    segmentOffset += field.segmentCount;
    cellOffset += field.grid.width * field.grid.height;
  }
  return Object.freeze({
    maxSegmentsPerCell: PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS,
    segmentTexels,
    cellTexels,
    bindings: Object.freeze(bindings)
  });
}

/** Measures the same bounded tables uploaded by Terrain without recompiling authoring data. */
export function measurePromptNoiseRiverFieldSet(
  fields: readonly PromptNoiseRiverFieldV1[],
  packed: PackedPromptNoiseRiverFieldSetV1
): PromptNoiseRiverFieldSetMetricsV1 {
  if (fields.length === 0) return EMPTY_PROMPT_NOISE_RIVER_FIELD_METRICS;
  let maximumCellSegmentCount = 0;
  for (const field of fields) {
    const stride = field.grid.maxSegmentsPerCell;
    for (let offset = 0; offset < field.grid.segmentIndices.length; offset += stride) {
      let count = 0;
      for (let slot = 0; slot < stride; slot++) {
        if (field.grid.segmentIndices[offset + slot] !== 0) count++;
      }
      maximumCellSegmentCount = Math.max(maximumCellSegmentCount, count);
    }
  }
  const segmentBytes = packed.segmentTexels.byteLength;
  const cellBytes = packed.cellTexels.byteLength;
  return Object.freeze({
    fieldCount: fields.length,
    controlPointCount: fields.reduce((sum, field) => sum + field.controlPointCount, 0),
    segmentCount: fields.reduce((sum, field) => sum + field.segmentCount, 0),
    cellCount: fields.reduce((sum, field) => sum + field.grid.width * field.grid.height, 0),
    maxSegmentsPerCell: PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS,
    maximumCellSegmentCount,
    segmentBytes,
    cellBytes,
    totalBytes: segmentBytes + cellBytes
  });
}

function compileSegments(
  points: readonly PromptNoiseRiverControlPointV1[],
  mode: PromptNoiseRiverCurveMode
): readonly PromptNoiseRiverFieldSegmentV1[] {
  const segments: PromptNoiseRiverFieldSegmentV1[] = [];
  const spanCount = points.length - 1;
  for (let spanIndex = 0; spanIndex < spanCount; spanIndex++) {
    const startPoint = points[spanIndex];
    const endPoint = points[spanIndex + 1];
    const approximateLength = approximateSpanLength(points, spanIndex, mode);
    const subdivisions = Math.min(
      MAX_CURVE_SUBDIVISIONS,
      Math.max(2, Math.ceil(approximateLength / TARGET_SEGMENT_LENGTH))
    );
    for (let subdivision = 0; subdivision < subdivisions; subdivision++) {
      const startLocal = subdivision / subdivisions;
      const endLocal = (subdivision + 1) / subdivisions;
      const start = curvePoint(points, spanIndex, startLocal, mode);
      const end = curvePoint(points, spanIndex, endLocal, mode);
      const startFactor = (spanIndex + startLocal) / spanCount;
      const endFactor = (spanIndex + endLocal) / spanCount;
      segments.push(
        Object.freeze({
          start: freezePoint(start),
          end: freezePoint(end),
          startBedHeight: mix(startPoint.bedHeight, endPoint.bedHeight, startLocal),
          endBedHeight: mix(startPoint.bedHeight, endPoint.bedHeight, endLocal),
          startWidth: mix(startPoint.width, endPoint.width, startLocal),
          endWidth: mix(startPoint.width, endPoint.width, endLocal),
          startDepth: mix(startPoint.depth, endPoint.depth, startLocal),
          endDepth: mix(startPoint.depth, endPoint.depth, endLocal),
          startFlowSpeed: mix(startPoint.flowSpeed, endPoint.flowSpeed, startLocal),
          endFlowSpeed: mix(startPoint.flowSpeed, endPoint.flowSpeed, endLocal),
          startBankFeather: mix(startPoint.bankFeather, endPoint.bankFeather, startLocal),
          endBankFeather: mix(startPoint.bankFeather, endPoint.bankFeather, endLocal),
          startFactor,
          endFactor
        })
      );
    }
  }
  return Object.freeze(segments);
}

function compileJunctionEndpointSegments(
  operator: PromptNoiseRiverOperatorV1
): readonly PromptNoiseRiverFieldSegmentV1[] {
  const topology = operator.topology;
  const points = operator.controlPoints!;
  if (!topology) return Object.freeze([]);
  const descriptors = [
    { point: points[0], adjacent: points[1], radius: topology.fromMergeRadius, factor: 0 },
    {
      point: points[points.length - 1],
      adjacent: points[points.length - 2],
      radius: topology.toMergeRadius,
      factor: 1
    }
  ] as const;
  return Object.freeze(
    descriptors.flatMap(({ point, adjacent, radius, factor }) => {
      if (radius <= 0) return [];
      const tangentX = adjacent.position.x - point.position.x;
      const tangentZ = adjacent.position.z - point.position.z;
      const length = Math.max(1e-5, Math.hypot(tangentX, tangentZ));
      const epsilon = 0.01;
      const offsetX = (tangentX / length) * epsilon * 0.5;
      const offsetZ = (tangentZ / length) * epsilon * 0.5;
      return [
        Object.freeze({
          start: freezePoint({ x: point.position.x - offsetX, z: point.position.z - offsetZ }),
          end: freezePoint({ x: point.position.x + offsetX, z: point.position.z + offsetZ }),
          startBedHeight: point.bedHeight,
          endBedHeight: point.bedHeight,
          startWidth: radius * 2,
          endWidth: radius * 2,
          startDepth: point.depth,
          endDepth: point.depth,
          startFlowSpeed: point.flowSpeed,
          endFlowSpeed: point.flowSpeed,
          startBankFeather: point.bankFeather,
          endBankFeather: point.bankFeather,
          startFactor: factor,
          endFactor: factor
        })
      ];
    })
  );
}

function approximateSpanLength(
  points: readonly PromptNoiseRiverControlPointV1[],
  spanIndex: number,
  mode: PromptNoiseRiverCurveMode
): number {
  let length = 0;
  let previous = curvePoint(points, spanIndex, 0, mode);
  for (let sample = 1; sample <= 8; sample++) {
    const point = curvePoint(points, spanIndex, sample / 8, mode);
    length += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = point;
  }
  return length;
}

function curvePoint(
  points: readonly PromptNoiseRiverControlPointV1[],
  spanIndex: number,
  factor: number,
  mode: PromptNoiseRiverCurveMode
): PromptNoiseWorldPointV1 {
  const start = points[spanIndex];
  const end = points[spanIndex + 1];
  if (mode === "linear") {
    return { x: mix(start.position.x, end.position.x, factor), z: mix(start.position.z, end.position.z, factor) };
  }
  const planar = (point: PromptNoiseWorldPointV1) => ({ x: point.x, y: 0, z: point.z });
  if (mode === "bezier") {
    const point = evaluateRiverCubicBezier(
      planar(start.position),
      planar(start.outHandle),
      planar(end.inHandle),
      planar(end.position),
      factor,
      "weights-first"
    );
    return { x: point.x, z: point.z };
  }
  // Shared Water parameterizes in 3D, including the published water elevation.
  const spatial = (point: PromptNoiseRiverControlPointV1 | undefined) =>
    point && { x: point.position.x, y: point.bedHeight + point.depth, z: point.position.z };
  const point = evaluateRiverCatmullRom(
    spatial(points[spanIndex - 1]),
    spatial(start)!,
    spatial(end)!,
    spatial(points[spanIndex + 2]),
    factor
  );
  return { x: point.x, z: point.z };
}

function segmentBounds(
  segments: readonly PromptNoiseRiverFieldSegmentV1[],
  support: number
): Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }> {
  const xs = segments.flatMap((segment) => [segment.start.x, segment.end.x]);
  const zs = segments.flatMap((segment) => [segment.start.z, segment.end.z]);
  return Object.freeze({
    minX: Math.min(...xs) - support,
    minZ: Math.min(...zs) - support,
    maxX: Math.max(...xs) + support,
    maxZ: Math.max(...zs) + support
  });
}

function compileGrid(
  segments: readonly PromptNoiseRiverFieldSegmentV1[],
  bounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>
): PromptNoiseRiverFieldGridV1 {
  const extentX = Math.max(MIN_GRID_CELL_SIZE, bounds.maxX - bounds.minX);
  const extentZ = Math.max(MIN_GRID_CELL_SIZE, bounds.maxZ - bounds.minZ);
  let width = Math.min(MAX_GRID_AXIS, Math.max(1, Math.ceil(extentX / (TARGET_SEGMENT_LENGTH * 2))));
  let height = Math.min(MAX_GRID_AXIS, Math.max(1, Math.ceil(extentZ / (TARGET_SEGMENT_LENGTH * 2))));
  let cells: number[][] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    cells = assignGridCells(segments, bounds, width, height);
    if (cells.every((cell) => cell.length <= PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS)) break;
    if (width >= MAX_GRID_AXIS && height >= MAX_GRID_AXIS) break;
    width = Math.min(MAX_GRID_AXIS, width * 2);
    height = Math.min(MAX_GRID_AXIS, height * 2);
  }
  const cellSizeX = extentX / width;
  const cellSizeZ = extentZ / height;
  const segmentIndices = new Array<number>(width * height * PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS).fill(0);
  cells.forEach((candidates, cellIndex) => {
    const centerX = bounds.minX + ((cellIndex % width) + 0.5) * cellSizeX;
    const centerZ = bounds.minZ + (Math.floor(cellIndex / width) + 0.5) * cellSizeZ;
    const selected = candidates
      .map((index) => ({ index, distance: segmentCenterDistance(segments[index], centerX, centerZ) }))
      .sort((left, right) => left.distance - right.distance || left.index - right.index)
      .slice(0, PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS);
    selected.forEach(({ index }, slot) => {
      segmentIndices[cellIndex * PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS + slot] = index + 1;
    });
  });
  return deepFreeze({
    originX: bounds.minX,
    originZ: bounds.minZ,
    cellSizeX,
    cellSizeZ,
    width,
    height,
    maxSegmentsPerCell: PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS,
    segmentIndices
  });
}

function assignGridCells(
  segments: readonly PromptNoiseRiverFieldSegmentV1[],
  bounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>,
  width: number,
  height: number
): number[][] {
  const cells = Array.from({ length: width * height }, () => [] as number[]);
  const cellSizeX = Math.max(MIN_GRID_CELL_SIZE, bounds.maxX - bounds.minX) / width;
  const cellSizeZ = Math.max(MIN_GRID_CELL_SIZE, bounds.maxZ - bounds.minZ) / height;
  segments.forEach((segment, segmentIndex) => {
    const minCellX = clampInteger(
      Math.floor((Math.min(segment.start.x, segment.end.x) - bounds.minX) / cellSizeX) - 1,
      0,
      width - 1
    );
    const maxCellX = clampInteger(
      Math.floor((Math.max(segment.start.x, segment.end.x) - bounds.minX) / cellSizeX) + 1,
      0,
      width - 1
    );
    const minCellZ = clampInteger(
      Math.floor((Math.min(segment.start.z, segment.end.z) - bounds.minZ) / cellSizeZ) - 1,
      0,
      height - 1
    );
    const maxCellZ = clampInteger(
      Math.floor((Math.max(segment.start.z, segment.end.z) - bounds.minZ) / cellSizeZ) + 1,
      0,
      height - 1
    );
    for (let z = minCellZ; z <= maxCellZ; z++) {
      for (let x = minCellX; x <= maxCellX; x++) cells[z * width + x].push(segmentIndex);
    }
  });
  return cells;
}

function candidateSegmentIndices(field: PromptNoiseRiverFieldV1, worldX: number, worldZ: number): number[] {
  const grid = field.grid;
  const cellX = clampInteger(Math.floor((worldX - grid.originX) / grid.cellSizeX), 0, grid.width - 1);
  const cellZ = clampInteger(Math.floor((worldZ - grid.originZ) / grid.cellSizeZ), 0, grid.height - 1);
  const offset = (cellZ * grid.width + cellX) * PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS;
  const candidates: number[] = [];
  for (let slot = 0; slot < PROMPT_NOISE_RIVER_FIELD_MAX_CELL_SEGMENTS; slot++) {
    const index = grid.segmentIndices[offset + slot];
    if (index > 0) candidates.push(index - 1);
  }
  return candidates;
}

function segmentCenterDistance(segment: PromptNoiseRiverFieldSegmentV1, worldX: number, worldZ: number): number {
  return Math.hypot(worldX - (segment.start.x + segment.end.x) * 0.5, worldZ - (segment.start.z + segment.end.z) * 0.5);
}

function hashField(
  operatorId: number,
  mode: PromptNoiseRiverCurveMode,
  points: readonly PromptNoiseRiverControlPointV1[],
  segments: readonly PromptNoiseRiverFieldSegmentV1[],
  topology: PromptNoiseRiverOperatorV1["topology"]
): string {
  return hashStableValue({ operatorId, mode, points, segments, topology });
}

function hashStableValue(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index++) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function freezePoint(point: PromptNoiseWorldPointV1): PromptNoiseWorldPointV1 {
  return Object.freeze({ x: Math.fround(point.x), z: Math.fround(point.z) });
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(left: number, right: number, factor: number): number {
  return left + (right - left) * factor;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
  return Object.freeze(value);
}
