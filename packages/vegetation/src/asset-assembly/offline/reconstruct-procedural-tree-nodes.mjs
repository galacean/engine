/**
 * Converts an extracted source hierarchy into editable, scale-free procedural node parameters.
 * No triangle vertex, index, skin, transform, or asset-container data crosses this boundary.
 */
export function deriveStemNodeParameters(sourceAnalysis, topologyGeometry) {
  const branches = [...sourceAnalysis.branches].sort((left, right) => left.id - right.id);
  const selectedStemIds = new Set(topologyGeometry.leafNodeContext.stems.map((stem) => stem.stemId));
  const targetByLevel = new Map(
    [0, 1, 2].map((level) => [
      level,
      topologyGeometry.gpuStemRecords
        .filter((record) => record.level === level && selectedStemIds.has(record.stemId))
        .sort((left, right) => left.numericId - right.numericId)
    ])
  );
  const sourceByLevel = new Map([0, 1, 2].map((level) => [level, branches.filter((branch) => branch.level === level)]));
  for (const level of [0, 1, 2]) {
    if (sourceByLevel.get(level).length > targetByLevel.get(level).length) {
      throw new Error(
        "Cannot bind source level " +
          level +
          " nodes: source has " +
          sourceByLevel.get(level).length +
          ", generator has only " +
          targetByLevel.get(level).length
      );
    }
    targetByLevel.set(level, targetByLevel.get(level).slice(0, sourceByLevel.get(level).length));
  }
  const stableIdBySourceId = new Map();
  for (const level of [0, 1, 2]) {
    sourceByLevel.get(level).forEach((branch, index) => {
      stableIdBySourceId.set(branch.id, targetByLevel.get(level)[index].stemId);
    });
  }
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const nodes = branches.map((branch) => {
    const parent = branch.support === null ? null : branchById.get(branch.support);
    if (branch.level !== 0 && !parent) throw new Error("Source stem " + branch.id + " has no parent");
    const branchPathLength = Math.max(pathLength(branch.points), Number.EPSILON);
    const start = branch.points[0];
    const direction = sampleVertexPolylineTangent(branch.points, 0);
    // The extractor reports nearest-point progress by arc length. The editable/GPU Path contract indexes its
    // explicit controls uniformly, so convert the source progress once instead of silently changing its meaning.
    const attachmentProgress = parent ? arcProgressToVertexProgress(parent.points, branch.attachmentProgress) : 0;
    const parentFrame = parent
      ? createStemFrame(parent.points, attachmentProgress)
      : { right: [1, 0, 0], along: [0, 1, 0], out: [0, 0, 1] };
    const attachment = parent ? sampleVertexPolylinePoint(parent.points, attachmentProgress) : start;
    const pathFrame = createPathFrame(direction, parentFrame.right);
    const minimumRadius = sourceAnalysis.height * 1e-7;
    const startRadius = Math.max(branch.radii[0], minimumRadius);
    const endRadius = Math.max(branch.radii.at(-1), minimumRadius);
    return {
      stemId: stableIdBySourceId.get(branch.id),
      parentStemId: parent ? stableIdBySourceId.get(parent.id) : null,
      attachmentProgressPercent: parent ? attachmentProgress * 100 : 0,
      directionInParentFrame: frameCoordinates(parentFrame, direction),
      lengthPercentOfHeight: (branchPathLength / sourceAnalysis.height) * 100,
      startRadiusPercentOfHeight: (startRadius / sourceAnalysis.height) * 100,
      endRadiusPercentOfStart: (endRadius / startRadius) * 100,
      pathControlPointsPercentOfLength: branch.points.map((point) =>
        scale(frameCoordinates(pathFrame, subtract(point, attachment)), 100 / branchPathLength)
      ),
      radiusProfilePercentOfStart: branch.radii.map((radius) => (Math.max(radius, minimumRadius) / startRadius) * 100),
      radialSegments: branch.radialSegments,
      axialSubdivisions: branch.points.slice(1).map(() => 1),
      tipCap: branch.tipCap,
      ...(parent ? {} : { rootPositionPercentOfHeight: scale(start, 100 / sourceAnalysis.height) })
    };
  });
  return allocateAxialSubdivisions(nodes, branches, sourceAnalysis.leaves?.length ?? 0, 3000, 4000);
}

/**
 * Fills the preferred budget only with linear subdivisions of source Path segments. This raises vertex density
 * without changing any centerline, radius interpolation, silhouette, hierarchy, or species-specific rule.
 */
function allocateAxialSubdivisions(nodes, branches, leafCount, preferredTriangles, maximumTriangles) {
  const mutable = nodes.map((node) => ({ ...node, axialSubdivisions: [...node.axialSubdivisions] }));
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const branchIdByStemId = new Map(nodes.map((node, index) => [node.stemId, branches[index].id]));
  let triangleCount =
    leafCount * 2 +
    mutable.reduce(
      (sum, node) => sum + node.radialSegments * 2 * node.axialSubdivisions.reduce((total, value) => total + value, 0),
      0
    );
  if (triangleCount > maximumTriangles) {
    throw new Error(
      "Source procedural topology requires " +
        triangleCount +
        " triangles and cannot satisfy the " +
        maximumTriangles +
        " hard limit"
    );
  }
  while (triangleCount < preferredTriangles) {
    let best = null;
    mutable.forEach((node, nodeIndex) => {
      const branch = branchById.get(branchIdByStemId.get(node.stemId));
      node.axialSubdivisions.forEach((subdivisionCount, segmentIndex) => {
        if (subdivisionCount >= 64) return;
        const cost = node.radialSegments * 2;
        const nextTriangleCount = triangleCount + cost;
        if (
          nextTriangleCount > maximumTriangles ||
          Math.abs(preferredTriangles - nextTriangleCount) >= Math.abs(preferredTriangles - triangleCount)
        ) {
          return;
        }
        const segmentLength = magnitude(subtract(branch.points[segmentIndex + 1], branch.points[segmentIndex]));
        const spacing = segmentLength / subdivisionCount;
        if (
          !best ||
          spacing > best.spacing + Number.EPSILON ||
          (Math.abs(spacing - best.spacing) <= Number.EPSILON &&
            (node.stemId < best.stemId || (node.stemId === best.stemId && segmentIndex < best.segmentIndex)))
        ) {
          best = { nodeIndex, segmentIndex, cost, spacing, stemId: node.stemId };
        }
      });
    });
    if (!best) break;
    mutable[best.nodeIndex].axialSubdivisions[best.segmentIndex]++;
    triangleCount += best.cost;
  }
  return mutable;
}

export function deriveLeafNodeParameters(sourceAnalysis, stemGeometry) {
  const sourceLeaves = sourceAnalysis.leaves ?? [];
  const targetLeafCards = stemGeometry.lods[0].leafCards;
  if (sourceLeaves.length !== targetLeafCards.length) {
    throw new Error(
      "Cannot bind source leaf nodes: source has " +
        sourceLeaves.length +
        ", generator LOD0 has " +
        targetLeafCards.length
    );
  }
  const branches = [...sourceAnalysis.branches].sort((left, right) => left.id - right.id);
  const selectedStemIds = new Set(stemGeometry.leafNodeContext.stems.map((stem) => stem.stemId));
  const generatedStemsByLevel = new Map(
    [0, 1, 2].map((level) => [
      level,
      stemGeometry.gpuStemRecords
        .filter((record) => record.level === level && selectedStemIds.has(record.stemId))
        .sort((left, right) => left.numericId - right.numericId)
    ])
  );
  const sourceStemStableId = new Map();
  for (const level of [0, 1, 2]) {
    const sourceBranches = branches.filter((branch) => branch.level === level);
    const generatedStems = generatedStemsByLevel.get(level).slice(0, sourceBranches.length);
    if (generatedStems.length !== sourceBranches.length) {
      throw new Error("Cannot bind source leaf stems for hierarchy level " + level);
    }
    sourceBranches.forEach((branch, index) => sourceStemStableId.set(branch.id, generatedStems[index].stemId));
  }
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  return sourceLeaves.map((leaf, index) => {
    const branch = branchById.get(leaf.stem);
    if (!branch) throw new Error("Source leaf " + index + " references absent stem " + leaf.stem);
    const progress = arcProgressToVertexProgress(branch.points, leaf.progress);
    const frame = createStemFrame(branch.points, progress);
    const stemPoint = sampleVertexPolylinePoint(branch.points, progress);
    const right = normalize(leaf.right);
    const up = normalizeOr(reject(leaf.up, right), radialAround(right, Math.PI * 0.5));
    return {
      leafId: targetLeafCards[index].leafId,
      stemId: sourceStemStableId.get(branch.id),
      progressPercent: progress * 100,
      positionOffsetPercentOfHeight: scale(
        frameCoordinates(frame, subtract(leaf.pivot, stemPoint)),
        100 / sourceAnalysis.height
      ),
      right,
      up,
      widthPercentOfHeight: (magnitude(leaf.right) / sourceAnalysis.height) * 100,
      heightPercentOfHeight: (magnitude(leaf.up) / sourceAnalysis.height) * 100
    };
  });
}

/** Materializes the exact vertex-shader leaf frames only for offline pixel comparison. */
export function materializeLeafNodePositions(geometry, foliageTuning, lodIndex = 0) {
  const lod = geometry.lods[lodIndex];
  const frameById = new Map(geometry.leafGpuFrames.map((frame) => [frame.leafId, frame]));
  const cardIds = lod.crown.leafCardIds ?? [];
  if (cardIds.length * 4 !== lod.crown.uvs.length) {
    throw new Error("Procedural crown card identities do not match its vertex stream");
  }
  const widthScale = foliageTuning.widthScale * lod.foliageScale;
  const heightScale = foliageTuning.heightScale * lod.foliageScale;
  const additiveSize = foliageTuning.additiveHalfExtent * 2;
  return cardIds.flatMap((leafId, cardIndex) => {
    const frame = frameById.get(leafId);
    if (!frame) throw new Error("Procedural crown references absent leaf frame " + leafId);
    const halfWidth = (frame.width * widthScale + additiveSize) * 0.5;
    const height = frame.height * heightScale + additiveSize;
    return lod.crown.uvs
      .slice(cardIndex * 4, cardIndex * 4 + 4)
      .map((uv) =>
        add(frame.pivot, add(scale(frame.right, (uv[0] * 2 - 1) * halfWidth), scale(frame.up, uv[1] * height)))
      );
  });
}

function createStemFrame(points, progress) {
  const along = sampleVertexPolylineTangent(points, progress);
  const right = radialAround(along, 0);
  return { right, along, out: normalizeOr(cross(along, right), radialAround(along, Math.PI * 0.5)) };
}

function createPathFrame(direction, parentRight) {
  const along = normalize(direction);
  const right = normalizeOr(reject(parentRight, along), radialAround(along, 0));
  return { right, along, out: normalizeOr(cross(along, right), radialAround(along, Math.PI * 0.5)) };
}

function frameCoordinates(frame, value) {
  return [dot(value, frame.right), dot(value, frame.along), dot(value, frame.out)];
}

function sampleVertexPolylineTangent(points, progress) {
  if (points.length < 2) return [0, 1, 0];
  const interval = 1 / Math.max(points.length - 1, 1);
  return normalize(
    subtract(
      sampleVertexPolylinePoint(points, progress + interval * 0.5),
      sampleVertexPolylinePoint(points, progress - interval * 0.5)
    )
  );
}

function sampleVertexPolylinePoint(points, progress) {
  if (points.length < 2) return points[0] ?? [0, 0, 0];
  const position = clamp(progress, 0, 1) * (points.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(points.length - 1, lower + 1);
  const weight = position - lower;
  return add(scale(points[lower], 1 - weight), scale(points[upper], weight));
}

function arcProgressToVertexProgress(points, progress) {
  if (points.length < 2) return 0;
  const cumulative = cumulativeLengths(points);
  const target = clamp(progress, 0, 1) * cumulative.at(-1);
  let segment = 0;
  while (segment + 1 < cumulative.length - 1 && cumulative[segment + 1] < target) segment++;
  const segmentLength = cumulative[segment + 1] - cumulative[segment];
  const local = segmentLength > Number.EPSILON ? (target - cumulative[segment]) / segmentLength : 0;
  return (segment + local) / (points.length - 1);
}

function cumulativeLengths(points) {
  const result = [0];
  for (let index = 1; index < points.length; index++) {
    result.push(result[index - 1] + magnitude(subtract(points[index], points[index - 1])));
  }
  return result;
}

function pathLength(points) {
  return cumulativeLengths(points).at(-1) ?? 0;
}

function radialAround(direction, angle) {
  const tangent = normalize(direction);
  const reference = Math.abs(tangent[1]) < 0.96 ? [0, 1, 0] : [1, 0, 0];
  const first = normalize(cross(tangent, reference));
  const second = normalize(cross(tangent, first));
  return normalize(add(scale(first, Math.cos(angle)), scale(second, Math.sin(angle))));
}

function reject(value, axis) {
  const normalizedAxis = normalize(axis);
  return subtract(value, scale(normalizedAxis, dot(value, normalizedAxis)));
}

function normalizeOr(value, fallback) {
  return magnitude(value) > 1e-9 ? normalize(value) : normalize(fallback);
}

function normalize(value) {
  const length = magnitude(value);
  return length > 1e-9 ? scale(value, 1 / length) : [0, 1, 0];
}

function magnitude(value) {
  return Math.hypot(...value);
}

function dot(left, right) {
  return left.reduce((sum, value, axis) => sum + value * right[axis], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function add(left, right) {
  return left.map((value, axis) => value + right[axis]);
}

function subtract(left, right) {
  return left.map((value, axis) => value - right[axis]);
}

function scale(value, factor) {
  return value.map((component) => component * factor);
}

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}
