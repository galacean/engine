/** Transferable, Engine-object-free Water semantics consumed by Terrain and Layout Workers. */
import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";

export const WATER_SEMANTIC_FIELD_SCHEMA_VERSION = 1 as const;

export interface WaterSemanticCurvePointV1 {
  readonly x: number;
  readonly z: number;
  readonly surfaceHeight: number;
  readonly bedHeight: number;
}

/** Optional C2-A per-section semantics aligned with the River centerline factor. */
export interface WaterSemanticProfilePointV1 extends WaterSemanticCurvePointV1 {
  readonly factor: number;
  readonly halfWidth: number;
  readonly shoreWidth: number;
  readonly flowSpeed: number;
}

export interface WaterSemanticFieldSegmentV1 {
  readonly startX: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endZ: number;
  readonly startFactor: number;
  readonly endFactor: number;
  readonly startSurfaceHeight: number;
  readonly endSurfaceHeight: number;
  readonly startBedHeight: number;
  readonly endBedHeight: number;
  readonly startHalfWidth: number;
  readonly endHalfWidth: number;
  readonly startShoreWidth: number;
  readonly endShoreWidth: number;
  readonly startFlowSpeed: number;
  readonly endFlowSpeed: number;
}

/** Engine-free copy of the C2-B bounded River Field used by Terrain and Layout queries. */
export interface WaterSemanticLocalFieldV1 {
  readonly generationHash: string;
  readonly originX: number;
  readonly originZ: number;
  readonly cellSizeX: number;
  readonly cellSizeZ: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly maxSegmentsPerCell: number;
  readonly segmentIndices: readonly number[];
  readonly segments: readonly WaterSemanticFieldSegmentV1[];
}

export interface WaterSemanticFieldBodyV1 {
  readonly id: string;
  readonly bounds: WaterBoundsXZ;
  /** Wet overlap arbitration: higher priority, then higher surface, then deeper interior, then stable id. */
  readonly priority?: number;
  readonly halfWidth: number;
  readonly shoreWidth: number;
  readonly flowSpeed: number;
  readonly curve: readonly [
    start: WaterSemanticCurvePointV1,
    control: WaterSemanticCurvePointV1,
    end: WaterSemanticCurvePointV1
  ];
  /** Generic ordered section profile; absent on historical equal-width bodies. */
  readonly profile?: readonly WaterSemanticProfilePointV1[];
  /** C2-B bounded local representation. When present it is the query authority. */
  readonly localField?: WaterSemanticLocalFieldV1;
}

export interface WaterSemanticFieldSnapshotV1 {
  readonly schemaVersion: typeof WATER_SEMANTIC_FIELD_SCHEMA_VERSION;
  readonly generation: number;
  readonly sourceHash: string;
  readonly bodies: readonly WaterSemanticFieldBodyV1[];
}

export interface WaterSemanticFieldSample {
  bodyId: string;
  wet: boolean;
  surfaceHeight: number;
  bedHeight: number;
  /** Legacy V1 only: negative wet, zero shoreline, positive dry, in metres.
   * New consumers use WaterSemanticFieldAdapter to match the canonical positive-wet SpatialField contract. */
  shoreSignedDistance: number;
  flowX: number;
  flowZ: number;
}

export function createWaterSemanticFieldSnapshot(
  generation: number,
  sourceHash: string,
  bodies: readonly WaterSemanticFieldBodyV1[]
): WaterSemanticFieldSnapshotV1 {
  if (!Number.isInteger(generation) || generation < 0) {
    throw new RangeError("Water Semantic Field generation must be a non-negative integer.");
  }
  if (sourceHash.trim().length === 0) throw new Error("Water Semantic Field source hash must be non-empty.");
  const ids = new Set<string>();
  const normalized = bodies.map((body) => {
    if (body.id.trim().length === 0 || ids.has(body.id)) {
      throw new Error(`Water Semantic Field body id '${body.id}' is empty or duplicated.`);
    }
    ids.add(body.id);
    if (
      (body.priority !== undefined && !Number.isFinite(body.priority)) ||
      !Number.isFinite(body.halfWidth) ||
      body.halfWidth <= 0 ||
      !Number.isFinite(body.shoreWidth) ||
      body.shoreWidth < 0 ||
      !Number.isFinite(body.flowSpeed) ||
      body.flowSpeed < 0
    ) {
      throw new RangeError(`Water Semantic Field body '${body.id}' has invalid dimensions or flow.`);
    }
    const curve: WaterSemanticFieldBodyV1["curve"] = [{ ...body.curve[0] }, { ...body.curve[1] }, { ...body.curve[2] }];
    const profile = body.profile?.map((point, index) => {
      if (
        !Number.isFinite(point.factor) ||
        point.factor < 0 ||
        point.factor > 1 ||
        (index > 0 && point.factor <= body.profile![index - 1].factor) ||
        !Number.isFinite(point.halfWidth) ||
        point.halfWidth <= 0 ||
        !Number.isFinite(point.shoreWidth) ||
        point.shoreWidth < 0 ||
        !Number.isFinite(point.flowSpeed) ||
        point.flowSpeed < 0 ||
        !Number.isFinite(point.surfaceHeight) ||
        !Number.isFinite(point.bedHeight)
      ) {
        throw new RangeError(`Water Semantic Field body '${body.id}' profile point ${index} is invalid.`);
      }
      return { ...point };
    });
    if (profile && (profile.length < 2 || profile[0].factor !== 0 || profile[profile.length - 1].factor !== 1)) {
      throw new RangeError(`Water Semantic Field body '${body.id}' profile endpoints are invalid.`);
    }
    const localField = normalizeLocalField(body.id, body.localField);
    return deepFreeze({
      ...body,
      bounds: { ...body.bounds },
      curve,
      profile,
      localField
    });
  });
  return deepFreeze({
    schemaVersion: WATER_SEMANTIC_FIELD_SCHEMA_VERSION,
    generation,
    sourceHash,
    bodies: normalized
  });
}

export function createWaterSemanticFieldSample(): WaterSemanticFieldSample {
  return {
    bodyId: "",
    wet: false,
    surfaceHeight: Number.NaN,
    bedHeight: Number.NaN,
    shoreSignedDistance: Number.POSITIVE_INFINITY,
    flowX: 0,
    flowZ: 0
  };
}

export function sampleWaterSemanticField(
  snapshot: WaterSemanticFieldSnapshotV1,
  worldX: number,
  worldZ: number,
  outSample: WaterSemanticFieldSample
): boolean {
  resetSample(outSample);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
  let selectedBody: WaterSemanticFieldBodyV1 | undefined;
  let selectedNearest: ReturnType<typeof nearestQuadraticCurve> | undefined;
  let selectedSection: ReturnType<typeof sampleSemanticProfile> | undefined;
  let selectedSignedDistance = Number.POSITIVE_INFINITY;
  for (const body of snapshot.bodies) {
    if (
      worldX < body.bounds.minX ||
      worldX > body.bounds.maxX ||
      worldZ < body.bounds.minZ ||
      worldZ > body.bounds.maxZ
    ) {
      continue;
    }
    const nearest = body.localField
      ? nearestLocalField(body.localField, worldX, worldZ)
      : nearestQuadraticCurve(body.curve, worldX, worldZ);
    // Equal-width bodies need no interpolated section until they win. Variable
    // profile/local-field dimensions remain authoritative before cheap rejection.
    const section = body.localField
      ? selectedLocalFieldSection(body.localField, nearest as ReturnType<typeof nearestLocalField>)
      : body.profile
        ? sampleSemanticProfile(body, nearest.factor)
        : undefined;
    const signedDistance = nearest.distance - (section?.halfWidth ?? body.halfWidth);
    // Reject each body's unsupported dry bank before arbitration. A miss leaves
    // outSample reset, rather than exposing a body that cannot answer the query.
    if (signedDistance > (section?.shoreWidth ?? body.shoreWidth)) continue;
    const wet = signedDistance < 0;
    const selectedWet = selectedSignedDistance < 0;
    const rank = !selectedBody
      ? -1
      : wet !== selectedWet
        ? wet
          ? -1
          : 1
        : wet
          ? (selectedBody.priority ?? 0) - (body.priority ?? 0) ||
            selectedSection!.surfaceHeight -
              (section?.surfaceHeight ??
                mix(body.curve[0].surfaceHeight, body.curve[2].surfaceHeight, nearest.factor)) ||
            signedDistance - selectedSignedDistance
          : signedDistance - selectedSignedDistance;
    if (!selectedBody || rank < 0 || (rank === 0 && body.id < selectedBody.id)) {
      selectedBody = body;
      selectedNearest = nearest;
      selectedSection = section ?? sampleSemanticProfile(body, nearest.factor);
      selectedSignedDistance = signedDistance;
    }
  }
  if (!selectedBody || !selectedNearest || !selectedSection) return false;
  outSample.bodyId = selectedBody.id;
  outSample.wet = selectedSignedDistance < 0;
  outSample.surfaceHeight = selectedSection.surfaceHeight;
  outSample.bedHeight = selectedSection.bedHeight;
  outSample.shoreSignedDistance = selectedSignedDistance;
  const tangentLength = Math.max(1e-6, Math.hypot(selectedNearest.tangentX, selectedNearest.tangentZ));
  outSample.flowX = (selectedNearest.tangentX / tangentLength) * selectedSection.flowSpeed;
  outSample.flowZ = (selectedNearest.tangentZ / tangentLength) * selectedSection.flowSpeed;
  return true;
}

function normalizeLocalField(
  bodyId: string,
  field: WaterSemanticLocalFieldV1 | undefined
): WaterSemanticLocalFieldV1 | undefined {
  if (!field) return undefined;
  if (
    !/^[0-9a-f]{16}$/.test(field.generationHash) ||
    !Number.isFinite(field.originX) ||
    !Number.isFinite(field.originZ) ||
    !Number.isFinite(field.cellSizeX) ||
    field.cellSizeX <= 0 ||
    !Number.isFinite(field.cellSizeZ) ||
    field.cellSizeZ <= 0 ||
    !Number.isInteger(field.gridWidth) ||
    field.gridWidth < 1 ||
    !Number.isInteger(field.gridHeight) ||
    field.gridHeight < 1 ||
    !Number.isInteger(field.maxSegmentsPerCell) ||
    field.maxSegmentsPerCell < 1 ||
    field.segmentIndices.length !== field.gridWidth * field.gridHeight * field.maxSegmentsPerCell ||
    field.segments.length < 1
  ) {
    throw new RangeError(`Water Semantic Field body '${bodyId}' has an invalid local field.`);
  }
  return deepFreeze({
    ...field,
    segmentIndices: [...field.segmentIndices],
    segments: field.segments.map((segment) => ({ ...segment }))
  });
}

function nearestLocalField(
  field: WaterSemanticLocalFieldV1,
  worldX: number,
  worldZ: number
): {
  distance: number;
  factor: number;
  tangentX: number;
  tangentZ: number;
  segmentIndex: number;
  localFactor: number;
} {
  const cellX = clampInteger(Math.floor((worldX - field.originX) / field.cellSizeX), 0, field.gridWidth - 1);
  const cellZ = clampInteger(Math.floor((worldZ - field.originZ) / field.cellSizeZ), 0, field.gridHeight - 1);
  const offset = (cellZ * field.gridWidth + cellX) * field.maxSegmentsPerCell;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSegmentIndex = 0;
  let bestLocalFactor = 0;
  for (let slot = 0; slot < field.maxSegmentsPerCell; slot++) {
    const oneBasedIndex = field.segmentIndices[offset + slot];
    if (oneBasedIndex <= 0) continue;
    const segmentIndex = oneBasedIndex - 1;
    const segment = field.segments[segmentIndex];
    const segmentX = segment.endX - segment.startX;
    const segmentZ = segment.endZ - segment.startZ;
    const localFactor = clamp01(
      ((worldX - segment.startX) * segmentX + (worldZ - segment.startZ) * segmentZ) /
        Math.max(segmentX * segmentX + segmentZ * segmentZ, 1e-8)
    );
    const distance = Math.hypot(
      worldX - mix(segment.startX, segment.endX, localFactor),
      worldZ - mix(segment.startZ, segment.endZ, localFactor)
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegmentIndex = segmentIndex;
      bestLocalFactor = localFactor;
    }
  }
  const segment = field.segments[bestSegmentIndex];
  return {
    distance: bestDistance,
    factor: mix(segment.startFactor, segment.endFactor, bestLocalFactor),
    tangentX: segment.endX - segment.startX,
    tangentZ: segment.endZ - segment.startZ,
    segmentIndex: bestSegmentIndex,
    localFactor: bestLocalFactor
  };
}

function selectedLocalFieldSection(
  field: WaterSemanticLocalFieldV1,
  selected: Readonly<{ segmentIndex?: number; localFactor?: number }>
): Readonly<{
  halfWidth: number;
  shoreWidth: number;
  flowSpeed: number;
  surfaceHeight: number;
  bedHeight: number;
}> {
  const segment = field.segments[selected.segmentIndex ?? 0];
  const factor = selected.localFactor ?? 0;
  return {
    halfWidth: mix(segment.startHalfWidth, segment.endHalfWidth, factor),
    shoreWidth: mix(segment.startShoreWidth, segment.endShoreWidth, factor),
    flowSpeed: mix(segment.startFlowSpeed, segment.endFlowSpeed, factor),
    surfaceHeight: mix(segment.startSurfaceHeight, segment.endSurfaceHeight, factor),
    bedHeight: mix(segment.startBedHeight, segment.endBedHeight, factor)
  };
}

function sampleSemanticProfile(
  body: WaterSemanticFieldBodyV1,
  factor: number
): Readonly<{
  halfWidth: number;
  shoreWidth: number;
  flowSpeed: number;
  surfaceHeight: number;
  bedHeight: number;
}> {
  const profile = body.profile;
  if (!profile) {
    const [start, , end] = body.curve;
    return {
      halfWidth: body.halfWidth,
      shoreWidth: body.shoreWidth,
      flowSpeed: body.flowSpeed,
      surfaceHeight: mix(start.surfaceHeight, end.surfaceHeight, factor),
      bedHeight: mix(start.bedHeight, end.bedHeight, factor)
    };
  }
  if (factor <= profile[0].factor) return profile[0];
  for (let index = 1; index < profile.length; index++) {
    const right = profile[index];
    if (factor > right.factor) continue;
    const left = profile[index - 1];
    const localFactor = (factor - left.factor) / Math.max(1e-8, right.factor - left.factor);
    return {
      halfWidth: mix(left.halfWidth, right.halfWidth, localFactor),
      shoreWidth: mix(left.shoreWidth, right.shoreWidth, localFactor),
      flowSpeed: mix(left.flowSpeed, right.flowSpeed, localFactor),
      surfaceHeight: mix(left.surfaceHeight, right.surfaceHeight, localFactor),
      bedHeight: mix(left.bedHeight, right.bedHeight, localFactor)
    };
  }
  return profile[profile.length - 1];
}

function nearestQuadraticCurve(
  curve: WaterSemanticFieldBodyV1["curve"],
  worldX: number,
  worldZ: number
): { distance: number; factor: number; tangentX: number; tangentZ: number } {
  const [start, control, end] = curve;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestFactor = 0;
  let bestTangentX = end.x - start.x;
  let bestTangentZ = end.z - start.z;
  let segmentStartX = start.x;
  let segmentStartZ = start.z;
  const segmentCount = 12;
  for (let index = 1; index <= segmentCount; index++) {
    const endFactor = index / segmentCount;
    const segmentEnd = quadraticPoint(curve, endFactor);
    const segmentX = segmentEnd.x - segmentStartX;
    const segmentZ = segmentEnd.z - segmentStartZ;
    const localFactor = clamp01(
      ((worldX - segmentStartX) * segmentX + (worldZ - segmentStartZ) * segmentZ) /
        Math.max(segmentX * segmentX + segmentZ * segmentZ, 0.0001)
    );
    const candidateX = mix(segmentStartX, segmentEnd.x, localFactor);
    const candidateZ = mix(segmentStartZ, segmentEnd.z, localFactor);
    const distance = Math.hypot(worldX - candidateX, worldZ - candidateZ);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFactor = (index - 1 + localFactor) / segmentCount;
      const inverse = 1 - bestFactor;
      bestTangentX = 2 * inverse * (control.x - start.x) + 2 * bestFactor * (end.x - control.x);
      bestTangentZ = 2 * inverse * (control.z - start.z) + 2 * bestFactor * (end.z - control.z);
    }
    segmentStartX = segmentEnd.x;
    segmentStartZ = segmentEnd.z;
  }
  return { distance: bestDistance, factor: bestFactor, tangentX: bestTangentX, tangentZ: bestTangentZ };
}

function quadraticPoint(curve: WaterSemanticFieldBodyV1["curve"], factor: number): { x: number; z: number } {
  const [start, control, end] = curve;
  const inverse = 1 - factor;
  return {
    x: inverse * inverse * start.x + 2 * inverse * factor * control.x + factor * factor * end.x,
    z: inverse * inverse * start.z + 2 * inverse * factor * control.z + factor * factor * end.z
  };
}

function resetSample(sample: WaterSemanticFieldSample): void {
  sample.bodyId = "";
  sample.wet = false;
  sample.surfaceHeight = Number.NaN;
  sample.bedHeight = Number.NaN;
  sample.shoreSignedDistance = Number.POSITIVE_INFINITY;
  sample.flowX = 0;
  sample.flowZ = 0;
}

function mix(left: number, right: number, factor: number): number {
  return left + (right - left) * factor;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
  return Object.freeze(value);
}
