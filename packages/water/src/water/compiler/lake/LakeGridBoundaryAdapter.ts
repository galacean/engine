import type { LakeBoundaryV1, LakePointXZ, LakeSplinePoint } from "../../authoring/lake/LakeBoundary";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type { HeightfieldWaterGridConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";

/** Trace the existing cell union, preserving holes and disconnected components without smoothing ownership. */
export function traceLakeGridBoundary(
  grid: HeightfieldWaterGridConfig,
  wetTexelIndices: ReadonlySet<number>,
  waterLevel: number
): LakeBoundaryV1 {
  const stride = grid.width + 1;
  const outgoingEdges = new Map<number, number[]>();
  const addBoundaryEdge = (a: number, b: number): void => {
    const list = outgoingEdges.get(a) ?? [];
    list.push(b);
    outgoingEdges.set(a, list);
  };
  for (const texelIndex of [...wetTexelIndices].sort((a, b) => a - b)) {
    const x = texelIndex % grid.width,
      z = Math.floor(texelIndex / grid.width),
      topLeftCorner = z * stride + x;
    if (z === 0 || !wetTexelIndices.has(texelIndex - grid.width)) addBoundaryEdge(topLeftCorner, topLeftCorner + 1);
    if (x === grid.width - 1 || !wetTexelIndices.has(texelIndex + 1))
      addBoundaryEdge(topLeftCorner + 1, topLeftCorner + stride + 1);
    if (z === grid.height - 1 || !wetTexelIndices.has(texelIndex + grid.width))
      addBoundaryEdge(topLeftCorner + stride + 1, topLeftCorner + stride);
    if (x === 0 || !wetTexelIndices.has(texelIndex - 1)) addBoundaryEdge(topLeftCorner + stride, topLeftCorner);
  }
  const rings: LakeSplinePoint[][] = [];
  while (outgoingEdges.size) {
    const start = outgoingEdges.keys().next().value!;
    let current = start,
      previous = -1;
    const cornerIndices: number[] = [];
    do {
      cornerIndices.push(current);
      const candidates = outgoingEdges.get(current);
      if (!candidates?.length) throw new Error("Lake cell contour is open.");
      // At diagonal contacts keep each four-connected region in its own ring.
      const incoming = previous < 0 ? -1 : gridEdgeDirection(previous, current, stride);
      candidates.sort(
        (a, b) =>
          rightTurnPriority(incoming, gridEdgeDirection(current, a, stride)) -
          rightTurnPriority(incoming, gridEdgeDirection(current, b, stride))
      );
      const next = candidates.shift()!;
      if (!candidates.length) outgoingEdges.delete(current);
      previous = current;
      current = next;
    } while (current !== start);
    const points = cornerIndices.filter(
      (key, i) =>
        gridEdgeDirection(cornerIndices[(i + cornerIndices.length - 1) % cornerIndices.length], key, stride) !==
        gridEdgeDirection(key, cornerIndices[(i + 1) % cornerIndices.length], stride)
    );
    rings.push(
      points.map((key) => ({
        position: Object.freeze([
          grid.originXZ[0] + ((key % stride) - 0.5) * grid.cellSizeXZ[0],
          grid.originXZ[1] + (Math.floor(key / stride) - 0.5) * grid.cellSizeXZ[1]
        ] as LakePointXZ)
      }))
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    waterLevel,
    rings: Object.freeze(rings.map((r) => Object.freeze(r))),
    maxChordError: 0.01,
    maxSegmentLength: Math.max(grid.width * grid.cellSizeXZ[0], grid.height * grid.cellSizeXZ[1]),
    queryCoverage: "source-grid"
  });
}

function gridEdgeDirection(a: number, b: number, stride: number): number {
  const ax = a % stride,
    az = Math.floor(a / stride),
    bx = b % stride,
    bz = Math.floor(b / stride);
  return bx > ax ? 0 : bz > az ? 1 : bx < ax ? 2 : 3;
}
function rightTurnPriority(incoming: number, outgoing: number): number {
  return incoming < 0 ? outgoing : (outgoing - incoming + 3) % 4;
}

/** Adapter only: the caller's Hydrology/Terrain classification stays authoritative. */
export function attachLakeGridBoundary(descriptor: HeightfieldWaterDescriptorV1): HeightfieldWaterDescriptorV1 {
  const coverage = descriptor.renderSurface?.coverage;
  const waterLevel = descriptor.surfaceHeights[0];
  if (
    !Number.isFinite(waterLevel) ||
    descriptor.surfaceHeights.some((height) => Math.abs(height - waterLevel) > 0.0001)
  ) {
    throw new RangeError("A Lake requires one uniform base water level.");
  }
  const grid = coverage && coverage !== "geometry" ? coverage.grid : descriptor.grid;
  const wetTexelIndices = new Set<number>();
  if (coverage && coverage !== "geometry") {
    for (let i = 0; i < coverage.basinSupport.length; i++) {
      if (coverage.basinSupport[i] && coverage.terrainHeights[i] < coverage.waterLevel - coverage.minimumVisibleDepth)
        wetTexelIndices.add(i);
    }
  } else {
    for (const texelIndex of descriptor.wetTexelIndices) wetTexelIndices.add(texelIndex);
  }
  return { ...descriptor, lakeBoundary: traceLakeGridBoundary(grid, wetTexelIndices, waterLevel) };
}
