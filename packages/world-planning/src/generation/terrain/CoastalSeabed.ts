const sampleSpacingMetres = 4;
const shoreBlendMetres = 2 * sampleSpacingMetres;

function smoothstep(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function splineWeights(t: number): readonly number[] {
  const u = 1 - t;
  return [u ** 3, 4 - 6 * t * t + 3 * t ** 3, 4 - 6 * u * u + 3 * u ** 3, t ** 3];
}

/**
 * Samples the submerged slope for polygonal islands. The distance callback returns the
 * unsigned distance to the closest outline, including at the filter taps on land.
 * Call only for ocean points, passing their exact distance to keep the shoreline at zero.
 */
export function createCoastalSeabed(
  distanceAt: (x: number, z: number) => number,
  slopeWidthMetres: number,
  depthMetres: number
): (x: number, z: number, shoreDistanceMetres: number) => number {
  const depths = new Map<number, Map<number, number>>();
  const depthAtDistance = (distance: number) => depthMetres * smoothstep(distance / slopeWidthMetres);

  function gridDepth(column: number, row: number): number {
    let columns = depths.get(row);
    if (!columns) depths.set(row, (columns = new Map()));
    let depth = columns.get(column);
    if (depth === undefined) {
      depth = depthAtDistance(distanceAt(column * sampleSpacingMetres, row * sampleSpacingMetres));
      columns.set(column, depth);
    }
    return depth;
  }

  return (x, z, distance) => {
    if (distance <= 0) return 0;
    // The farthest spline tap is at most two cells away on either axis.
    if (distance >= slopeWidthMetres + 2 * Math.SQRT2 * sampleSpacingMetres) return -depthMetres;
    const gridX = x / sampleSpacingMetres;
    const gridZ = z / sampleSpacingMetres;
    const column = Math.floor(gridX);
    const row = Math.floor(gridZ);
    const weightsX = splineWeights(gridX - column);
    const weightsZ = splineWeights(gridZ - row);
    let filteredDepth = 0;
    // Cubic B-spline weights join with continuous derivatives at cell boundaries.
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        filteredDepth += gridDepth(column + i - 1, row + j - 1) * weightsX[i] * weightsZ[j];
      }
    }
    const constrainedDepth = depthAtDistance(distance);
    const blend = smoothstep(distance / shoreBlendMetres);
    return -(constrainedDepth + (filteredDepth / 36 - constrainedDepth) * blend);
  };
}
