export interface IndexedSegment {
  readonly startX: number;
  readonly startZ: number;
  readonly endX: number;
  readonly endZ: number;
}

export interface IndexedRoadSegment extends IndexedSegment {
  readonly startHalfWidthMetres: number;
  readonly endHalfWidthMetres: number;
  readonly startShoulderWidthMetres: number;
  readonly endShoulderWidthMetres: number;
}

/** Rasterize a constant-width road in a square local terrain from 0 to sizeMetres.
 * @param points Open road centerline in metres, in the same X/Z axes as the terrain.
 * @param sizeMetres Terrain width and depth.
 * @param resolution Samples per axis, including both terrain edges.
 * @param widthMetres Full width of the road core.
 * @param shoulderMetres Width of the soft shoulder on each side.
 * @returns Row-major road coverage from zero to one.
 */
export function rasterizeTerrainRoadCoverage(
  points: readonly { x: number; z: number }[],
  sizeMetres: number,
  resolution: number,
  widthMetres: number,
  shoulderMetres: number
): Float32Array {
  if (resolution < 2) throw new RangeError("Terrain road coverage requires at least two samples per axis");
  const segments: IndexedRoadSegment[] = [];
  const halfWidth = widthMetres * 0.5;
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1],
      end = points[i];
    segments.push({
      startX: start.x,
      startZ: start.z,
      endX: end.x,
      endZ: end.z,
      startHalfWidthMetres: halfWidth,
      endHalfWidthMetres: halfWidth,
      startShoulderWidthMetres: shoulderMetres,
      endShoulderWidthMetres: shoulderMetres
    });
  }
  const spacing = sizeMetres / (resolution - 1);
  return rasterizeRoadSurfaceCoverage(segments, resolution, spacing, -spacing * 0.5, 4);
}

export function rasterizeRoadSurfaceCoverage(
  segments: readonly IndexedRoadSegment[],
  resolution: number,
  cellMetres: number,
  origin: number,
  samplesPerAxis: number
): Float32Array {
  if (!Number.isInteger(resolution) || resolution < 1) {
    throw new RangeError("Seed World road coverage resolution must be a positive integer");
  }
  if (!Number.isInteger(samplesPerAxis) || samplesPerAxis < 4) {
    throw new RangeError("Seed World road coverage requires at least four samples per texel axis");
  }
  const field = new Float32Array(resolution * resolution);
  if (segments.length === 0) return field;
  const candidatesByPixel = new Map<number, number[]>();
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const segment = segments[segmentIndex]!;
    const expansion = Math.max(
      segment.startHalfWidthMetres + segment.startShoulderWidthMetres,
      segment.endHalfWidthMetres + segment.endShoulderWidthMetres
    );
    const minimumX = clamp(
      Math.floor((Math.min(segment.startX, segment.endX) - expansion - origin) / cellMetres),
      0,
      resolution - 1
    );
    const maximumX = clamp(
      Math.floor((Math.max(segment.startX, segment.endX) + expansion - origin) / cellMetres),
      0,
      resolution - 1
    );
    const minimumZ = clamp(
      Math.floor((Math.min(segment.startZ, segment.endZ) - expansion - origin) / cellMetres),
      0,
      resolution - 1
    );
    const maximumZ = clamp(
      Math.floor((Math.max(segment.startZ, segment.endZ) + expansion - origin) / cellMetres),
      0,
      resolution - 1
    );
    for (let z = minimumZ; z <= maximumZ; z++) {
      for (let x = minimumX; x <= maximumX; x++) {
        const pixel = z * resolution + x;
        const candidates = candidatesByPixel.get(pixel);
        if (candidates) candidates.push(segmentIndex);
        else candidatesByPixel.set(pixel, [segmentIndex]);
      }
    }
  }
  const inverseSampleCount = 1 / (samplesPerAxis * samplesPerAxis);
  for (const [pixel, segmentIndexes] of candidatesByPixel) {
    const pixelX = pixel % resolution;
    const pixelZ = Math.floor(pixel / resolution);
    let coverage = 0;
    for (let sampleZ = 0; sampleZ < samplesPerAxis; sampleZ++) {
      const worldZ = origin + (pixelZ + (sampleZ + 0.5) / samplesPerAxis) * cellMetres;
      for (let sampleX = 0; sampleX < samplesPerAxis; sampleX++) {
        const worldX = origin + (pixelX + (sampleX + 0.5) / samplesPerAxis) * cellMetres;
        let influence = 0;
        for (const segmentIndex of segmentIndexes) {
          influence = Math.max(influence, roadSurfaceInfluence(segments[segmentIndex]!, worldX, worldZ));
          if (influence >= 1) break;
        }
        coverage += influence;
      }
    }
    field[pixel] = coverage * inverseSampleCount;
  }
  return field;
}

export function pointSegmentDistance(
  pointX: number,
  pointZ: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number
): { readonly distance: number; readonly progress: number } {
  const directionX = endX - startX;
  const directionZ = endZ - startZ;
  const lengthSquared = directionX * directionX + directionZ * directionZ;
  const progress =
    lengthSquared > 0
      ? clamp(((pointX - startX) * directionX + (pointZ - startZ) * directionZ) / lengthSquared, 0, 1)
      : 0;
  return {
    distance: Math.hypot(pointX - mix(startX, endX, progress), pointZ - mix(startZ, endZ, progress)),
    progress
  };
}

function roadSurfaceInfluence(segment: IndexedRoadSegment, worldX: number, worldZ: number): number {
  const projection = pointSegmentDistance(worldX, worldZ, segment.startX, segment.startZ, segment.endX, segment.endZ);
  const coreHalfWidthMetres = mix(segment.startHalfWidthMetres, segment.endHalfWidthMetres, projection.progress);
  const signedDistanceMetres = projection.distance - coreHalfWidthMetres;
  if (signedDistanceMetres <= 0) return 1;
  const shoulderWidthMetres = mix(
    segment.startShoulderWidthMetres,
    segment.endShoulderWidthMetres,
    projection.progress
  );
  if (signedDistanceMetres >= shoulderWidthMetres) return 0;
  return 1 - smootherstep(signedDistanceMetres / Math.max(shoulderWidthMetres, 0.001));
}

export function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function smootherstep(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}
