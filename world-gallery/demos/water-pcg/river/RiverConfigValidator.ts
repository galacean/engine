/**
 * River configuration normalization and warning generation.
 *
 * AI-authored or GUI-edited water configs cannot be sent directly into mesh or
 * shader generation because invalid numbers, duplicate points, illegal colors, or
 * unbounded segment counts can produce broken geometry or expensive workloads.
 * This file is the safety gate for the river system: it clamps values, sanitizes
 * path data, fills minimum viable defaults, and reports suspicious authoring
 * choices before downstream systems build render or query data.
 */
import { RIVER_LIMITS } from "./constants";
import { RiverConfig, RiverPathControlPoint, Vector3Tuple } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizePoint(point: Vector3Tuple): Vector3Tuple {
  return [
    Number.isFinite(point[0]) ? point[0] : 0,
    Number.isFinite(point[1]) ? point[1] : 0,
    Number.isFinite(point[2]) ? point[2] : 0
  ];
}

function sanitizeOptionalPoint(point?: Vector3Tuple): Vector3Tuple | undefined {
  return point ? sanitizePoint(point) : undefined;
}

function clampOptional(value: number | undefined, min: number, max: number): number | undefined {
  return value !== undefined && Number.isFinite(value) ? clamp(value, min, max) : undefined;
}

function makePointId(point: RiverPathControlPoint, index: number): string {
  const trimmedId = point.id.trim();
  return trimmedId.length > 0 ? trimmedId : `river-point-${index}`;
}

function ensureUniquePointId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 1;
  let id = `${baseId}-${suffix}`;
  while (usedIds.has(id)) {
    suffix++;
    id = `${baseId}-${suffix}`;
  }
  usedIds.add(id);
  return id;
}

function sanitizeControlPoint(point: RiverPathControlPoint, index: number): RiverPathControlPoint {
  return {
    id: makePointId(point, index),
    position: sanitizePoint(point.position),
    in: sanitizeOptionalPoint(point.in),
    out: sanitizeOptionalPoint(point.out),
    width: clampOptional(point.width, RIVER_LIMITS.minWidth, RIVER_LIMITS.maxWidth),
    depth: clampOptional(point.depth, RIVER_LIMITS.minDepth, RIVER_LIMITS.maxDepth),
    flowSpeed: clampOptional(point.flowSpeed, RIVER_LIMITS.minFlowSpeed, RIVER_LIMITS.maxFlowSpeed),
    bankFeather: clampOptional(point.bankFeather, RIVER_LIMITS.minBankFeather, RIVER_LIMITS.maxBankFeather)
  };
}

function distanceXZ(a: RiverPathControlPoint, b: RiverPathControlPoint): number {
  const dx = a.position[0] - b.position[0];
  const dz = a.position[2] - b.position[2];
  return Math.sqrt(dx * dx + dz * dz);
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function createFallbackControlPoint(source: RiverPathControlPoint | undefined): RiverPathControlPoint {
  const position = source?.position ?? [0, 0, 0];
  return {
    id: "river-point-fallback",
    position: [position[0] + 10, position[1], position[2]]
  };
}

export function estimateRiverLength(points: RiverPathControlPoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distanceXZ(points[i - 1], points[i]);
  }
  return length;
}

export function normalizeRiverConfig(config: RiverConfig): RiverConfig {
  const points = config.path.points
    .slice(0, RIVER_LIMITS.maxPointCount)
    .map(sanitizeControlPoint)
    .filter((point, index, list) => index === 0 || distanceXZ(point, list[index - 1]) > 0.001);

  if (points.length < RIVER_LIMITS.minPointCount) {
    points.push(createFallbackControlPoint(points[0]));
  }

  const usedPointIds = new Set<string>();
  const uniquePoints = points.map((point, index) => ({
    ...point,
    id: ensureUniquePointId(makePointId(point, index), usedPointIds)
  }));
  const width = clamp(config.shape.width, RIVER_LIMITS.minWidth, RIVER_LIMITS.maxWidth);
  const segmentLength = clamp(config.path.segmentLength, RIVER_LIMITS.minSegmentLength, RIVER_LIMITS.maxSegmentLength);
  const maxSegmentCount = Math.min(
    Math.max(Math.floor(config.quality.maxSegmentCount), 1),
    RIVER_LIMITS.maxSegmentCount
  );

  return {
    ...config,
    path: {
      ...config.path,
      points: uniquePoints,
      segmentLength
    },
    shape: {
      width,
      depth: clamp(config.shape.depth, RIVER_LIMITS.minDepth, RIVER_LIMITS.maxDepth),
      bankFeather: clamp(config.shape.bankFeather, RIVER_LIMITS.minBankFeather, RIVER_LIMITS.maxBankFeather)
    },
    flow: {
      ...config.flow,
      speed: clamp(config.flow.speed, RIVER_LIMITS.minFlowSpeed, RIVER_LIMITS.maxFlowSpeed)
    },
    material: {
      ...config.material,
      baseColor: isHexColor(config.material.baseColor) ? config.material.baseColor : "#34a9c9",
      foamColor: isHexColor(config.material.foamColor) ? config.material.foamColor : "#d8f7ff",
      foamIntensity: clamp(config.material.foamIntensity, RIVER_LIMITS.minFoamIntensity, RIVER_LIMITS.maxFoamIntensity),
      clarity: clamp(config.material.clarity, RIVER_LIMITS.minClarity, RIVER_LIMITS.maxClarity)
    },
    quality: {
      ...config.quality,
      maxSegmentCount
    },
    debug: {
      ...config.debug,
      queryT: clamp(config.debug.queryT, 0, 1)
    }
  };
}

export function getRiverConfigWarnings(config: RiverConfig): string[] {
  const warnings: string[] = [];
  const length = estimateRiverLength(config.path.points);
  const minLength = config.shape.width * RIVER_LIMITS.minRiverLengthFactor;

  if (length < minLength) {
    warnings.push(`River length ${length.toFixed(1)} is short for width ${config.shape.width.toFixed(1)}.`);
  }

  if (config.path.points.length > config.quality.maxSegmentCount) {
    warnings.push("Point count exceeds max segment budget.");
  }

  return warnings;
}
