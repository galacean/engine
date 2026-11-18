import type { Point } from "./ProceduralTreeGenerator";

const AXIS_EPSILON = 1e-12;

/** Geometry-only leaf frame required by the shared canopy-occlusion solver. */
export interface ProceduralTreeCanopyOcclusionFrame {
  readonly pivot: Point;
  readonly right: Point;
  readonly up: Point;
  /** Optional continuous shading normal that owns the receiving ambient hemisphere. */
  readonly normal?: Point;
  readonly width: number;
  readonly height: number;
}

export type ProceduralTreeCanopyLodTuple<T> = readonly [lod0: T, lod1: T, lod2: T, lod3: T];

/** Validation-only material controls; the geometric optical depth remains generator-owned. */
export interface ProceduralTreeCanopyOcclusionTuning {
  readonly enabled: boolean;
  readonly density: number;
  /** sRGB colour applied only to the occluded fraction of indirect canopy light. */
  readonly colorRgb: readonly [red: number, green: number, blue: number];
}

export const DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING: ProceduralTreeCanopyOcclusionTuning = Object.freeze({
  enabled: true,
  // The default broad alpha-cut mask covers 23.2455% of its card. The panel keeps
  // this effective coefficient editable so other silhouettes can be calibrated.
  density: 0.23,
  // White preserves the scalar Beer-Lambert result; artists can tint the absorbed
  // indirect-light fraction without changing direct sunlight or leaf Base Color.
  colorRgb: [255, 255, 255] as const
});

export interface ProceduralTreeCanopyOcclusionStatistics {
  readonly leafCount: number;
  readonly opticalDepth: readonly [minimum: number, mean: number, maximum: number];
  readonly ambientVisibility: readonly [minimum: number, mean: number, maximum: number];
}

interface PreparedCanopyFrame {
  readonly center: Point;
  readonly normal: Point;
  readonly area: number;
}

interface CanopyProxyKdNode {
  readonly frameIndex: number;
  readonly axis: 0 | 1 | 2;
  readonly left: CanopyProxyKdNode | null;
  readonly right: CanopyProxyKdNode | null;
}

interface NearestCanopyProxy {
  frameIndex: number;
  distanceSquared: number;
}

interface AggregatedCanopyProxyFields {
  readonly opticalDepths: readonly number[];
  /** Area-weighted mean normal. Its length is the directional concentration in [0, 1]. */
  readonly normalMoments: readonly Point[];
}

/**
 * Integrates the cosine-weighted upper-hemisphere solid angle of every other generated leaf card.
 *
 * Each card is replaced only for this calculation by a disk with the same projected area.
 * Its bounded cosine-weighted hemispherical coverage is converted to a Lambertian
 * ambient-visibility loss and accumulated in optical-depth space. Because projected area and
 * squared distance scale together, the result is invariant under tree translation and uniform
 * scale. The calculation runs once per shared generated tree, never per instance.
 */
export function calculateProceduralTreeCanopyOpticalDepths(
  frames: readonly ProceduralTreeCanopyOcclusionFrame[]
): readonly number[] {
  const prepared = frames.map(prepareCanopyFrame);
  return calculatePreparedCanopyOpticalDepths(prepared);
}

function calculatePreparedCanopyOpticalDepths(prepared: readonly PreparedCanopyFrame[]): readonly number[] {
  return prepared.map((target, targetIndex) => {
    let opticalDepth = 0;
    for (let occluderIndex = 0; occluderIndex < prepared.length; occluderIndex++) {
      if (occluderIndex === targetIndex) continue;
      const occluder = prepared[occluderIndex];
      const offset: Point = [
        occluder.center[0] - target.center[0],
        occluder.center[1] - target.center[1],
        occluder.center[2] - target.center[2]
      ];
      const distanceSquared = dot(offset, offset);
      if (distanceSquared <= AXIS_EPSILON) {
        // Coincident cards cover half of an unresolved local hemisphere. Accumulating
        // -log(visibility) keeps the result composable with Beer-Lambert density.
        opticalDepth += Math.LN2;
        continue;
      }
      const distance = Math.sqrt(distanceSquared);
      const inverseDistance = 1 / distance;
      const direction: Point = [offset[0] * inverseDistance, offset[1] * inverseDistance, offset[2] * inverseDistance];
      const targetCosine = Math.max(dot(target.normal, direction), 0);
      if (targetCosine <= AXIS_EPSILON) continue;
      const projectedArea = occluder.area * Math.abs(dot(occluder.normal, direction));
      if (projectedArea <= AXIS_EPSILON) continue;
      const equivalentRadiusSquared = projectedArea / Math.PI;
      // A disk of radius r at axial distance d covers sin^2(alpha) = r^2 / (d^2 + r^2)
      // of a cosine-weighted hemisphere. Multiplying by the receiver cosine preserves the
      // small-disk limit while keeping every finite, non-coincident occluder strictly below
      // full coverage. The previous 4*f solid-angle approximation omitted the (1-f) term and
      // could exceed one for nearby large cards, producing an artificial infinite optical depth.
      const cosineWeightedDiskFraction = equivalentRadiusSquared / (distanceSquared + equivalentRadiusSquared);
      const blockedAmbientFraction = cosineWeightedDiskFraction * targetCosine;
      opticalDepth -= Math.log1p(-blockedAmbientFraction);
    }
    return opticalDepth;
  });
}

/** Adds generator-derived optical depth without changing card identity or geometry. */
export function attachProceduralTreeCanopyOpticalDepth<Frame extends ProceduralTreeCanopyOcclusionFrame>(
  frames: readonly Frame[]
): readonly (Frame & { readonly canopyOpticalDepth: number })[] {
  const opticalDepths = calculateProceduralTreeCanopyOpticalDepths(frames);
  return frames.map((frame, index) => ({ ...frame, canopyOpticalDepth: opticalDepths[index] }));
}

/**
 * Attaches four optical depths and first normal moments to one canonical frame table while
 * conserving the full-detail canopy represented by every lower-LOD proxy.
 *
 * LOD0 is the physical foliage reference and is integrated exactly once. For each lower LOD,
 * every discarded reference card transfers its area-weighted optical depth and shading normal
 * to the nearest retained card. The retained card therefore shades the complete spatial cell it
 * represents, instead of losing occluder mass or collapsing its normal distribution when geometry
 * is thinned. Render-card enlargement remains a separate silhouette policy and cannot change
 * physical canopy mass.
 */
export function attachProceduralTreeCanopyOpticalDepthByLod<
  Frame extends ProceduralTreeCanopyOcclusionFrame & { readonly leafId: string }
>(
  frames: readonly Frame[],
  leafCardIdsByLod: ProceduralTreeCanopyLodTuple<readonly string[]>
): readonly (Frame & {
  readonly canopyOpticalDepth: number;
  readonly canopyOpticalDepthByLod: ProceduralTreeCanopyLodTuple<number>;
  readonly canopyNormalMomentByLod: ProceduralTreeCanopyLodTuple<Point>;
})[] {
  const prepared = frames.map(prepareCanopyFrame);
  const frameIndexById = new Map(frames.map((frame, index) => [frame.leafId, index]));
  if (frameIndexById.size !== frames.length) {
    throw new RangeError("Procedural tree canopy frames must have unique leaf IDs");
  }
  let previousLeafIds: ReadonlySet<string> | undefined;
  const frameIndicesByLod = leafCardIdsByLod.map((leafIds, lodIndex) => {
    const currentLeafIds = new Set(leafIds);
    if (currentLeafIds.size !== leafIds.length) {
      throw new RangeError(`Procedural tree LOD${lodIndex} contains duplicate leaf IDs`);
    }
    const selectedIndices = leafIds.map((leafId) => {
      const frameIndex = frameIndexById.get(leafId);
      if (frameIndex === undefined) throw new RangeError(`Procedural tree LOD references missing leaf ${leafId}`);
      return frameIndex;
    });
    const previous = previousLeafIds;
    if (previous && leafIds.some((leafId) => !previous.has(leafId))) {
      throw new RangeError(`Procedural tree canopy LOD${lodIndex} must be a subset of LOD${lodIndex - 1}`);
    }
    if ((previousLeafIds?.size ?? 0) > 0 && selectedIndices.length === 0) {
      throw new RangeError(`Procedural tree canopy LOD${lodIndex} cannot proxy a non-empty canopy without leaves`);
    }
    previousLeafIds = currentLeafIds;
    return selectedIndices;
  }) as unknown as ProceduralTreeCanopyLodTuple<readonly number[]>;
  const referenceIndices = frameIndicesByLod[0];
  const referenceDepths = Array(frames.length).fill(0) as number[];
  const compactReferenceDepths = calculatePreparedCanopyOpticalDepths(
    referenceIndices.map((frameIndex) => prepared[frameIndex])
  );
  referenceIndices.forEach((frameIndex, referenceIndex) => {
    referenceDepths[frameIndex] = compactReferenceDepths[referenceIndex];
  });
  const referenceNormalMoments = Array.from({ length: frames.length }, (): Point => [0, 0, 0]);
  referenceIndices.forEach((frameIndex) => {
    referenceNormalMoments[frameIndex] = prepared[frameIndex].normal;
  });
  const fieldsByLod = frameIndicesByLod.map((selectedIndices, lodIndex): AggregatedCanopyProxyFields => {
    return lodIndex === 0
      ? { opticalDepths: referenceDepths, normalMoments: referenceNormalMoments }
      : aggregateCanopyReferenceFieldsIntoProxies(prepared, referenceIndices, referenceDepths, selectedIndices);
  }) as unknown as ProceduralTreeCanopyLodTuple<AggregatedCanopyProxyFields>;
  return frames.map((frame, frameIndex) => {
    const canopyOpticalDepthByLod = fieldsByLod.map(
      ({ opticalDepths }) => opticalDepths[frameIndex]
    ) as unknown as ProceduralTreeCanopyLodTuple<number>;
    const canopyNormalMomentByLod = fieldsByLod.map(
      ({ normalMoments }) => normalMoments[frameIndex]
    ) as unknown as ProceduralTreeCanopyLodTuple<Point>;
    return {
      ...frame,
      canopyOpticalDepth: canopyOpticalDepthByLod[0],
      canopyOpticalDepthByLod,
      canopyNormalMomentByLod
    };
  });
}

/**
 * Area-averages the invariant LOD0 optical-depth field and first normal moment into the same exact
 * nearest-proxy partition. A balanced k-d tree keeps assignment O(N log M) for N source leaves and
 * M retained proxies; adding the normal moment does not add a second spatial query.
 */
function aggregateCanopyReferenceFieldsIntoProxies(
  prepared: readonly PreparedCanopyFrame[],
  referenceIndices: readonly number[],
  referenceDepths: readonly number[],
  selectedIndices: readonly number[]
): AggregatedCanopyProxyFields {
  const proxyMasses = new Float64Array(prepared.length);
  const proxyWeightedDepths = new Float64Array(prepared.length);
  const proxyWeightedNormalX = new Float64Array(prepared.length);
  const proxyWeightedNormalY = new Float64Array(prepared.length);
  const proxyWeightedNormalZ = new Float64Array(prepared.length);
  const proxyDepths = Array(prepared.length).fill(0) as number[];
  const proxyNormalMoments = Array.from({ length: prepared.length }, (): Point => [0, 0, 0]);
  if (selectedIndices.length === 0) {
    return { opticalDepths: proxyDepths, normalMoments: proxyNormalMoments };
  }
  const selectedSet = new Set(selectedIndices);
  const kdTree = buildCanopyProxyKdTree([...selectedIndices], prepared);
  for (const sourceIndex of referenceIndices) {
    let proxyIndex = sourceIndex;
    if (!selectedSet.has(sourceIndex)) {
      const nearest: NearestCanopyProxy = {
        frameIndex: selectedIndices[0],
        distanceSquared: Number.POSITIVE_INFINITY
      };
      findNearestCanopyProxy(kdTree, prepared[sourceIndex].center, prepared, nearest);
      proxyIndex = nearest.frameIndex;
    }
    const sourceMass = prepared[sourceIndex].area;
    const sourceNormal = prepared[sourceIndex].normal;
    proxyMasses[proxyIndex] += sourceMass;
    proxyWeightedDepths[proxyIndex] += sourceMass * referenceDepths[sourceIndex];
    proxyWeightedNormalX[proxyIndex] += sourceMass * sourceNormal[0];
    proxyWeightedNormalY[proxyIndex] += sourceMass * sourceNormal[1];
    proxyWeightedNormalZ[proxyIndex] += sourceMass * sourceNormal[2];
  }

  const referenceTree = selectedIndices.some((index) => proxyMasses[index] === 0)
    ? buildCanopyProxyKdTree([...referenceIndices], prepared)
    : null;
  selectedIndices.forEach((frameIndex) => {
    // Rebuilt LOD cards need not be a subset of the reference leaves. An empty
    // partition samples the nearest reference, rather than dividing zero mass.
    if (proxyMasses[frameIndex] === 0) {
      if (referenceTree) {
        const nearest = { frameIndex: referenceIndices[0], distanceSquared: Number.POSITIVE_INFINITY };
        findNearestCanopyProxy(referenceTree, prepared[frameIndex].center, prepared, nearest);
        proxyDepths[frameIndex] = referenceDepths[nearest.frameIndex];
        proxyNormalMoments[frameIndex] = prepared[nearest.frameIndex].normal;
      }
      return;
    }
    const inverseMass = 1 / proxyMasses[frameIndex];
    proxyDepths[frameIndex] = proxyWeightedDepths[frameIndex] * inverseMass;
    proxyNormalMoments[frameIndex] = [
      proxyWeightedNormalX[frameIndex] * inverseMass,
      proxyWeightedNormalY[frameIndex] * inverseMass,
      proxyWeightedNormalZ[frameIndex] * inverseMass
    ];
  });
  return { opticalDepths: proxyDepths, normalMoments: proxyNormalMoments };
}

/** Transfer the same area-weighted LOD0 field to independently rebuilt LOD cards. */
export function resampleProceduralTreeCanopyOpticalDepths(
  reference: readonly ProceduralTreeCanopyOcclusionFrame[],
  opticalDepths: readonly number[],
  proxies: readonly ProceduralTreeCanopyOcclusionFrame[]
): number[] {
  if (
    reference.length !== opticalDepths.length ||
    opticalDepths.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new RangeError("Canopy reference depths must cover every reference frame");
  }
  const prepared = [...reference, ...proxies].map(prepareCanopyFrame);
  const referenceIndices = reference.map((_, index) => index);
  const selectedIndices = proxies.map((_, index) => reference.length + index);
  const fields = aggregateCanopyReferenceFieldsIntoProxies(prepared, referenceIndices, opticalDepths, selectedIndices);
  return selectedIndices.map((index) => fields.opticalDepths[index]);
}

function buildCanopyProxyKdTree(
  frameIndices: number[],
  prepared: readonly PreparedCanopyFrame[]
): CanopyProxyKdNode | null {
  if (frameIndices.length === 0) return null;
  const axis = widestCanopyProxyAxis(frameIndices, prepared);
  frameIndices.sort((left, right) => prepared[left].center[axis] - prepared[right].center[axis] || left - right);
  const middle = Math.floor(frameIndices.length / 2);
  return {
    frameIndex: frameIndices[middle],
    axis,
    left: buildCanopyProxyKdTree(frameIndices.slice(0, middle), prepared),
    right: buildCanopyProxyKdTree(frameIndices.slice(middle + 1), prepared)
  };
}

function widestCanopyProxyAxis(frameIndices: readonly number[], prepared: readonly PreparedCanopyFrame[]): 0 | 1 | 2 {
  const minimum = [...prepared[frameIndices[0]].center] as [number, number, number];
  const maximum = [...minimum] as [number, number, number];
  frameIndices.forEach((frameIndex) => {
    const center = prepared[frameIndex].center;
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], center[axis]);
      maximum[axis] = Math.max(maximum[axis], center[axis]);
    }
  });
  const extents = maximum.map((value, axis) => value - minimum[axis]);
  return (extents[1] > extents[0] && extents[1] >= extents[2] ? 1 : extents[2] > extents[0] ? 2 : 0) as 0 | 1 | 2;
}

function findNearestCanopyProxy(
  node: CanopyProxyKdNode | null,
  sourceCenter: Point,
  prepared: readonly PreparedCanopyFrame[],
  nearest: NearestCanopyProxy
): void {
  if (!node) return;
  const proxyCenter = prepared[node.frameIndex].center;
  const distanceSquared = squaredPointDistance(sourceCenter, proxyCenter);
  if (
    distanceSquared < nearest.distanceSquared ||
    (distanceSquared === nearest.distanceSquared && node.frameIndex < nearest.frameIndex)
  ) {
    nearest.frameIndex = node.frameIndex;
    nearest.distanceSquared = distanceSquared;
  }
  const axisDelta = sourceCenter[node.axis] - proxyCenter[node.axis];
  const nearNode = axisDelta <= 0 ? node.left : node.right;
  const farNode = axisDelta <= 0 ? node.right : node.left;
  findNearestCanopyProxy(nearNode, sourceCenter, prepared, nearest);
  if (axisDelta * axisDelta <= nearest.distanceSquared) {
    findNearestCanopyProxy(farNode, sourceCenter, prepared, nearest);
  }
}

/** Beer-Lambert ambient visibility for one geometric optical depth and material density. */
export function proceduralTreeCanopyAmbientVisibility(opticalDepth: number, density: number): number {
  if (!Number.isFinite(opticalDepth) || opticalDepth < 0) {
    throw new RangeError("Procedural tree canopy optical depth must be finite and non-negative");
  }
  if (!Number.isFinite(density) || density < 0) {
    throw new RangeError("Procedural tree canopy density must be finite and non-negative");
  }
  return Math.exp(-opticalDepth * density);
}

/** Produces detached A/B evidence from the exact canonical leaf-frame table. */
export function summarizeProceduralTreeCanopyOcclusion(
  opticalDepths: readonly number[],
  tuning: ProceduralTreeCanopyOcclusionTuning
): ProceduralTreeCanopyOcclusionStatistics {
  validateProceduralTreeCanopyOcclusionTuning(tuning);
  if (opticalDepths.length === 0) {
    return { leafCount: 0, opticalDepth: [0, 0, 0], ambientVisibility: [1, 1, 1] };
  }
  const minimumDepth = Math.min(...opticalDepths);
  const maximumDepth = Math.max(...opticalDepths);
  const meanDepth = opticalDepths.reduce((sum, value) => sum + value, 0) / opticalDepths.length;
  const effectiveDensity = tuning.enabled ? tuning.density : 0;
  const visibilities = opticalDepths.map((depth) => proceduralTreeCanopyAmbientVisibility(depth, effectiveDensity));
  return {
    leafCount: opticalDepths.length,
    opticalDepth: [minimumDepth, meanDepth, maximumDepth],
    ambientVisibility: [Math.min(...visibilities), mean(visibilities), Math.max(...visibilities)]
  };
}

export function validateProceduralTreeCanopyOcclusionTuning(tuning: ProceduralTreeCanopyOcclusionTuning): void {
  if (typeof tuning.enabled !== "boolean") {
    throw new TypeError("Procedural tree canopy occlusion enabled state must be boolean");
  }
  if (!Number.isFinite(tuning.density) || tuning.density < 0) {
    throw new RangeError("Procedural tree canopy density must be finite and non-negative");
  }
  if (
    tuning.colorRgb.length !== 3 ||
    tuning.colorRgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)
  ) {
    throw new RangeError("Procedural tree canopy colour must contain three 8-bit sRGB channels");
  }
}

function prepareCanopyFrame(frame: ProceduralTreeCanopyOcclusionFrame): PreparedCanopyFrame {
  if (
    ![...frame.pivot, ...frame.right, ...frame.up, ...(frame.normal ?? []), frame.width, frame.height].every(
      Number.isFinite
    )
  ) {
    throw new RangeError("Procedural tree canopy frames must contain only finite values");
  }
  if (!(frame.width > 0) || !(frame.height > 0)) {
    throw new RangeError("Procedural tree canopy card dimensions must be positive");
  }
  const up = normalize(frame.up);
  const normal = normalize(frame.normal ?? cross(frame.right, frame.up));
  return {
    center: [
      frame.pivot[0] + up[0] * frame.height * 0.5,
      frame.pivot[1] + up[1] * frame.height * 0.5,
      frame.pivot[2] + up[2] * frame.height * 0.5
    ],
    normal,
    area: frame.width * frame.height
  };
}

function normalize(vector: Point): Point {
  const length = Math.hypot(...vector);
  if (!(length > AXIS_EPSILON)) throw new RangeError("Procedural tree canopy frame axes must be non-zero");
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross(left: Point, right: Point): Point {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function dot(left: Point, right: Point): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function squaredPointDistance(left: Point, right: Point): number {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  const z = left[2] - right[2];
  return x * x + y * y + z * z;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
