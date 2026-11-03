import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HERO_TREE_CALIBRATION_ASSETS as TREE_ASSETS,
  HERO_TREE_LOD_MESH_INDICES as TREE_LOD_MESH_INDICES
} from "./HeroTreeCalibrationAssets.mjs";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const ARRAY_BUFFER_TARGET = 34962;
const UNSIGNED_SHORT_COMPONENT_TYPE = 5123;
const TRUNK_PRIMITIVE_INDEX = 0;
const LEAF_PRIMITIVE_INDEX = 1;
const HIERARCHY_GENERATOR_VERSION = 16;
const MAXIMUM_MECHANICAL_DEPTH = 3;
const MECHANICAL_DATA_MAGIC = 0x33444d57;
const MECHANICAL_DATA_HEADER_BYTES = 64;
const MECHANICAL_TRANSFORM_TEXELS_PER_ELEMENT = 4;
const MECHANICAL_TEXTURE_WIDTH = 256;
const MINIMUM_ROOT_SECTION_VERTICES = 3;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const terrainDirectory = resolve(scriptDirectory, "../..");
const sourceModelDirectory = resolve(terrainDirectory, "data/grasslands/source/public/Models");
const releaseModelDirectory = resolve(terrainDirectory, "data/grasslands/public/Models");

async function main() {
  const results = [];
  for (const asset of TREE_ASSETS) {
    const canonicalModelPath = resolve(sourceModelDirectory, asset.model);
    const releaseModelPath = resolve(releaseModelDirectory, asset.model);
    const parsed = parseGlb(await readFile(canonicalModelPath));
    const source = restoreUnmodifiedSource(parsed);
    const generated = generateWindHierarchy(source, asset);
    const output = createGlb(generated.json, generated.binary);
    const mechanicalName = asset.model.replace(/\.glb$/u, ".treewind");
    await Promise.all([
      writeFile(canonicalModelPath, output),
      writeFile(releaseModelPath, output),
      writeFile(resolve(sourceModelDirectory, mechanicalName), generated.mechanicalData),
      writeFile(resolve(releaseModelDirectory, mechanicalName), generated.mechanicalData)
    ]);
    results.push({
      asset: asset.id,
      model: asset.model,
      species: asset.species,
      size: asset.size,
      bytes: output.byteLength,
      mechanicalBytes: generated.mechanicalData.byteLength,
      lods: generated.statistics
    });
  }
  console.log(JSON.stringify({ version: HIERARCHY_GENERATOR_VERSION, assets: results }, null, 2));
}

function restoreUnmodifiedSource(input) {
  const marker = input.json.extras?.terrainWindHierarchy ?? input.json.extras?.terrainWindAttachment;
  if (!marker) {
    return {
      json: structuredClone(input.json),
      binary: input.binary.subarray(0, input.json.buffers[0].byteLength)
    };
  }
  if (
    !Number.isInteger(marker.sourceAccessorCount) ||
    !Number.isInteger(marker.sourceBufferViewCount) ||
    !Number.isInteger(marker.sourceBufferByteLength)
  ) {
    throw new Error("Existing tree wind hierarchy marker is incomplete");
  }

  const json = structuredClone(input.json);
  for (const meshIndex of TREE_LOD_MESH_INDICES) {
    const trunk = requirePrimitive(json, meshIndex, TRUNK_PRIMITIVE_INDEX);
    const leaf = requirePrimitive(json, meshIndex, LEAF_PRIMITIVE_INDEX);
    for (let uv = 3; uv <= 7; uv++) {
      delete trunk.attributes[`TEXCOORD_${uv}`];
      delete leaf.attributes[`TEXCOORD_${uv}`];
    }
  }
  json.accessors.length = marker.sourceAccessorCount;
  json.bufferViews.length = marker.sourceBufferViewCount;
  json.buffers[0].byteLength = marker.sourceBufferByteLength;
  delete json.extras.terrainWindHierarchy;
  delete json.extras.terrainWindAttachment;
  if (Object.keys(json.extras).length === 0) delete json.extras;
  return {
    json,
    binary: input.binary.subarray(0, marker.sourceBufferByteLength)
  };
}

function generateWindHierarchy(source, asset) {
  const json = structuredClone(source.json);
  const mutableSource = { json: source.json, binary: Buffer.from(source.binary) };
  const sourceAccessorCount = json.accessors.length;
  const sourceBufferViewCount = json.bufferViews.length;
  const sourceBufferByteLength = mutableSource.binary.byteLength;
  const chunks = [mutableSource.binary];
  const statistics = [];
  const mechanicalElements = [];
  const lodElementOffsets = [];
  let byteOffset = source.binary.byteLength;

  const lodInputs = TREE_LOD_MESH_INDICES.map((meshIndex, lod) => {
    const trunk = requirePrimitive(json, meshIndex, TRUNK_PRIMITIVE_INDEX);
    const leaf = requirePrimitive(json, meshIndex, LEAF_PRIMITIVE_INDEX);
    return {
      lod,
      meshIndex,
      trunk,
      leaf,
      trunkPositions: readAccessor(mutableSource, trunk.attributes.POSITION),
      trunkIndices: readAccessor(mutableSource, trunk.indices).flat(),
      leafPositions: readAccessor(mutableSource, leaf.attributes.POSITION),
      leafIndices: readAccessor(mutableSource, leaf.indices).flat()
    };
  });

  for (const input of lodInputs) {
    // P3 owns the complete runtime wind contract. Remove the legacy authored wind UV
    // from the emitted mesh so it cannot consume vertex bandwidth or silently influence
    // the mechanically derived compliance field.
    delete input.trunk.attributes.TEXCOORD_2;
    delete input.leaf.attributes.TEXCOORD_2;
    lodElementOffsets.push(mechanicalElements.length);
    const hierarchy = buildMechanicalBranchHierarchy(
      input.trunkPositions,
      input.trunkIndices,
      `${asset.id} LOD${input.lod}`
    );
    const leaves = buildMechanicalLeafAttachments(
      input.trunkPositions,
      hierarchy,
      input.leafPositions,
      input.leafIndices,
      `${asset.id} LOD${input.lod}`
    );
    const lodMechanicalElements = finalizeMechanicalElements(hierarchy, leaves);
    const globalElementOffset = mechanicalElements.length;
    mechanicalElements.push(...lodMechanicalElements);

    const branchStream = appendNormalizedUnsignedShortVec2Stream(
      json,
      chunks,
      byteOffset,
      input.trunk,
      buildMechanicalVertexStream(hierarchy.vertices, globalElementOffset)
    );
    byteOffset = branchStream.byteOffset;
    const leafStream = appendNormalizedUnsignedShortVec2Stream(
      json,
      chunks,
      byteOffset,
      input.leaf,
      buildMechanicalVertexStream(leaves.vertices, globalElementOffset)
    );
    byteOffset = leafStream.byteOffset;

    const orderedDistances = [...leaves.distances].sort((a, b) => a - b);
    const orderedCompliance = hierarchy.components.map((entry) => entry.compliance).sort((a, b) => a - b);
    const structuralComponents = hierarchy.components.filter((component) => component.vertices.length >= 8);
    const rootSectionFractions = structuralComponents
      .map((component) => component.rootVertices.length / component.vertices.length)
      .sort((left, right) => left - right);
    statistics.push({
      lod: input.lod,
      meshIndex: input.meshIndex,
      branchVertices: input.trunkPositions.length,
      branchComponents: hierarchy.componentCount,
      mechanicalDepth: hierarchy.maximumMechanicalDepth,
      leafCards: leaves.cards,
      leafVertices: input.leafPositions.length,
      elementOffset: globalElementOffset,
      elementCount: lodMechanicalElements.length,
      branchComplianceP95: roundMetric(quantile(orderedCompliance, 0.95)),
      rootSectionFractionP95: roundMetric(quantile(rootSectionFractions, 0.95)),
      maximumRootSectionFraction: roundMetric(rootSectionFractions.at(-1) ?? 0),
      maximumAnchorError: roundMetric(hierarchy.maximumAnchorError),
      meanAttachmentDistance: roundMetric(mean(leaves.distances)),
      p95AttachmentDistance: roundMetric(quantile(orderedDistances, 0.95)),
      maximumAttachmentDistance: roundMetric(orderedDistances.at(-1) ?? 0)
    });
  }

  const binary = Buffer.concat(chunks);
  json.buffers[0].byteLength = binary.byteLength;
  json.extras = {
    ...(json.extras ?? {}),
    terrainWindHierarchy: {
      version: HIERARCHY_GENERATOR_VERSION,
      asset: asset.id,
      species: asset.species,
      size: asset.size,
      sourceAccessorCount,
      sourceBufferViewCount,
      sourceBufferByteLength,
      binding:
        "fixed-depth pre-expanded mechanical element records; vertices carry only a normalized uint16 element index and compliance progress",
      weightSource:
        "root-section-clamped offline geodesic progress integrated against a radius-derived fourth-power stiffness profile and descendant foliage load",
      branchJointSource:
        "the open child boundary nearest its parent resolves a rigid zero-compliance root section; its centroid is the hierarchy pivot and the complete section seeds the geodesic solve",
      maximumMechanicalDepth: MAXIMUM_MECHANICAL_DEPTH,
      vertexChannels: {
        TEXCOORD_3: "normalized uint16 element index / normalized uint16 local compliance progress"
      },
      mechanicalData: `${asset.model.replace(/\.glb$/u, ".treewind")} (4 RGBA16F pivots + 2 RGBA8 dynamics/frame texels)`,
      terminalPivotPacking:
        "terminal RGBA16F xyz stores the structural root; w stores signed leaf-card span along the quantized hinge",
      stageAttachmentPacking:
        "the first three RGBA16F texel w channels store the exact parent-component compliance coordinate for each hierarchy pivot",
      leafFramePacking:
        "octahedral petiole hinge + signed span twist + parent-branch attachment progress in the second RGBA8 mechanics texel",
      structuralMetadataPacking:
        "2-bit mechanical depth + 6-bit normalized leaf-card span in the first RGBA8 mechanics texel alpha",
      leafSpanSource:
        "quad boundary edge nearest the woody mesh defines the structural attachment; the card center is reconstructed from its baked span for coherent aerodynamic rotation; the opposite edge defines independent leaf-span compliance progress"
    }
  };
  const bounds = positionBounds(lodInputs.flatMap((input) => [...input.trunkPositions, ...input.leafPositions]));
  const mechanicalData = createMechanicalData(mechanicalElements, lodElementOffsets, bounds);
  return { json, binary, statistics, mechanicalData };
}

function buildMechanicalBranchHierarchy(positions, indices, label) {
  if (indices.length === 0 || indices.length % 3 !== 0) throw new Error(`${label} branch indices are invalid`);
  const adjacency = Array.from({ length: positions.length }, () => new Map());
  const edgeUse = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    addEdge(adjacency, positions, indices[offset], indices[offset + 1], label);
    addEdge(adjacency, positions, indices[offset + 1], indices[offset + 2], label);
    addEdge(adjacency, positions, indices[offset + 2], indices[offset], label);
    recordEdgeUse(edgeUse, indices[offset], indices[offset + 1]);
    recordEdgeUse(edgeUse, indices[offset + 1], indices[offset + 2]);
    recordEdgeUse(edgeUse, indices[offset + 2], indices[offset]);
  }
  const boundaryAdjacency = Array.from({ length: positions.length }, () => new Set());
  for (const edge of edgeUse.values()) {
    if (edge.count !== 1) continue;
    boundaryAdjacency[edge.left].add(edge.right);
    boundaryAdjacency[edge.right].add(edge.left);
  }
  const components = connectedComponents(adjacency).map((vertices, index) => ({
    index,
    vertices,
    minimumY: Math.min(...vertices.map((vertex) => positions[vertex][1])),
    maximumY: Math.max(...vertices.map((vertex) => positions[vertex][1])),
    parent: -1,
    childAttachment: -1,
    parentAttachment: -1,
    mechanicalDepth: 0,
    directLeafArea: 0,
    descendantLeafArea: 0,
    compliance: 0,
    localProgress: new Map()
  }));
  const treeMinimumY = Math.min(...positions.map((position) => position[1]));
  const treeMaximumY = Math.max(...positions.map((position) => position[1]));
  const rootBandMaximumY = treeMinimumY + (treeMaximumY - treeMinimumY) * 0.18;
  const mainRoot = [...components].sort(
    (left, right) =>
      right.maximumY - right.minimumY - (left.maximumY - left.minimumY) || right.vertices.length - left.vertices.length
  )[0];
  const rootComponents = new Set(
    components
      .filter((component) => component === mainRoot || component.maximumY <= rootBandMaximumY)
      .map((component) => component.index)
  );
  const assigned = new Set(rootComponents);
  const assignmentOrder = [];
  for (const rootIndex of rootComponents) {
    const root = components[rootIndex];
    root.childAttachment = [...root.vertices].sort((left, right) => positions[left][1] - positions[right][1])[0];
    root.parentAttachment = root.childAttachment;
  }
  while (assigned.size < components.length) {
    let nearest = null;
    for (const child of components) {
      if (assigned.has(child.index)) continue;
      for (const parentIndex of assigned) {
        const parent = components[parentIndex];
        // Degenerate cap triangles may follow a woody component, but must never become
        // the mechanical parent of another branch.
        if (parent.vertices.length < 8 && !rootComponents.has(parentIndex)) continue;
        for (const childVertex of child.vertices) {
          for (const parentVertex of parent.vertices) {
            const squaredDistance = squaredDistance3(positions[childVertex], positions[parentVertex]);
            if (!nearest || squaredDistance < nearest.squaredDistance) {
              nearest = { child, parent, childVertex, parentVertex, squaredDistance };
            }
          }
        }
      }
    }
    if (!nearest) throw new Error(`${label} cannot connect every woody component to a stable parent`);
    nearest.child.parent = nearest.parent.index;
    nearest.child.childAttachment = nearest.childVertex;
    nearest.child.parentAttachment = nearest.parentVertex;
    nearest.child.mechanicalDepth = nearest.parent.mechanicalDepth + 1;
    assigned.add(nearest.child.index);
    assignmentOrder.push(nearest.child.index);
  }

  const vertices = Array.from({ length: positions.length });
  for (const component of components) {
    const rootSection = resolveMechanicalRootSection(component, positions, boundaryAdjacency, label);
    component.rootVertices = rootSection.vertices;
    component.rootPivot = rootSection.pivot;
    const traversal = shortestPathTreeFromRoots(component.vertices, positions, adjacency, component.rootVertices);
    const maximumDistance = Math.max(...component.vertices.map((vertex) => traversal.distance[vertex]), 0);
    component.length = maximumDistance;
    const geometricProgress = new Map();
    for (const vertex of component.vertices) {
      const normalizedDistance = maximumDistance > 1e-6 ? traversal.distance[vertex] / maximumDistance : 0;
      geometricProgress.set(vertex, normalizedDistance);
    }
    const tipVertices = component.vertices.filter((vertex) => geometricProgress.get(vertex) >= 0.88);
    component.tip = centroid3(tipVertices.map((vertex) => positions[vertex]));
    const axis = normalize3(subtract3(component.tip, component.rootPivot));
    const radiusBins = estimateRadiusBins(component, positions, geometricProgress, axis);
    component.meanRadius = Math.max(mean(radiusBins), 0.0025);
    component.radiusBins = radiusBins;
    for (const vertex of component.vertices) {
      const geometric = geometricProgress.get(vertex);
      const integrated = integrateComplianceProgress(geometric, radiusBins);
      const localProgress = smoothstep(0.025, 1.0, integrated);
      component.localProgress.set(vertex, localProgress);
      vertices[vertex] = { elementIndex: component.index, localProgress };
    }
  }
  for (const component of components) {
    component.parentProgress = component.parent >= 0
      ? components[component.parent].localProgress.get(component.parentAttachment)
      : 0;
    if (!Number.isFinite(component.parentProgress)) {
      throw new Error(`${label} component ${component.index} has no parent attachment compliance coordinate`);
    }
  }
  return {
    vertices,
    positions,
    componentCount: components.length,
    components,
    rootComponents,
    maximumMechanicalDepth: Math.min(
      MAXIMUM_MECHANICAL_DEPTH,
      Math.max(...components.map((component) => component.mechanicalDepth))
    ),
    maximumAnchorError: 0
  };
}

/**
 * Resolve the complete root cross-section of one disconnected woody component.
 *
 * The source trees model branches as intersecting, disconnected open cylinders. The nearest
 * child/parent vertex pair identifies the attached end, but that one surface vertex is not a
 * physical hinge. Every production component has one or more explicit open boundary loops, so
 * the loop nearest that contact is the exact root cross-section—no guessed axis or distance
 * threshold is required. Every vertex in the loop seeds the final geodesic solve and its centroid
 * becomes the hierarchy pivot. This gives the child cantilever a rigid C0 boundary while retaining
 * the full authored compliance immediately above it.
 */
function resolveMechanicalRootSection(component, positions, boundaryAdjacency, label) {
  const attachmentPosition = positions[component.childAttachment];
  const componentSet = new Set(component.vertices);
  const visited = new Set();
  const loops = [];
  for (const start of component.vertices) {
    if (visited.has(start) || boundaryAdjacency[start].size === 0) continue;
    const loop = [];
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const vertex = stack.pop();
      loop.push(vertex);
      for (const neighbor of boundaryAdjacency[vertex]) {
        if (!componentSet.has(neighbor) || visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
    loops.push(loop);
  }
  if (loops.length === 0) throw new Error(`${label} component ${component.index} has no open root boundary`);
  loops.sort((left, right) => {
    const leftDistance = Math.min(...left.map((vertex) => squaredDistance3(positions[vertex], attachmentPosition)));
    const rightDistance = Math.min(...right.map((vertex) => squaredDistance3(positions[vertex], attachmentPosition)));
    return leftDistance - rightDistance || left.length - right.length;
  });
  let rootVertices = [...loops[0]];
  // A UV seam can connect the root rim, both longitudinal seam edges and the tip rim into one
  // topological boundary cycle. Such a cycle occupies a large fraction of the component and is
  // not itself a cross-section. Restrict it to the local contact neighbourhood; true closed root
  // rims are already compact and bypass this refinement.
  if (
    component.vertices.length >= 8 &&
    rootVertices.length / component.vertices.length > 0.35
  ) {
    const componentExtent = Math.max(
      ...component.vertices.map((vertex) =>
        Math.sqrt(squaredDistance3(positions[vertex], attachmentPosition))
      ),
      1e-6
    );
    const localBoundary = rootVertices
      .map((vertex) => ({
        vertex,
        distance: Math.sqrt(squaredDistance3(positions[vertex], attachmentPosition))
      }))
      .sort((left, right) => left.distance - right.distance || left.vertex - right.vertex);
    const localLimit = componentExtent * 0.18;
    const refined = localBoundary
      .filter((entry) => entry.distance <= localLimit)
      .map((entry) => entry.vertex);
    rootVertices = refined.length >= MINIMUM_ROOT_SECTION_VERTICES
      ? refined
      : localBoundary.slice(0, MINIMUM_ROOT_SECTION_VERTICES).map((entry) => entry.vertex);
  }
  rootVertices.sort((left, right) => left - right);
  if (rootVertices.length < Math.min(MINIMUM_ROOT_SECTION_VERTICES, component.vertices.length)) {
    throw new Error(`${label} component ${component.index} root boundary is degenerate`);
  }
  return {
    vertices: rootVertices,
    pivot: centroid3(rootVertices.map((vertex) => positions[vertex]))
  };
}

function buildMechanicalLeafAttachments(trunkPositions, hierarchy, leafPositions, leafIndices, label) {
  if (leafIndices.length === 0 || leafIndices.length % 6 !== 0) {
    throw new Error(`${label} leaves must be an indexed triangle-card list`);
  }
  const vertices = Array.from({ length: leafPositions.length });
  const assigned = new Uint8Array(leafPositions.length);
  const distances = [];
  const elements = [];
  const cards = leafIndices.length / 6;
  for (let card = 0; card < cards; card++) {
    const corners = [...new Set(leafIndices.slice(card * 6, card * 6 + 6))];
    if (corners.length !== 4) throw new Error(`${label} card ${card} is not an indexed quad`);
    for (const vertexIndex of corners) {
      const position = leafPositions[vertexIndex];
      if (!position) throw new Error(`${label} card ${card} references a missing vertex`);
    }
    const boundaryEdges = quadBoundaryEdges(leafIndices.slice(card * 6, card * 6 + 6), label, card);
    const rootCandidates = boundaryEdges.map(([left, right]) => {
      const midpoint = [
        (leafPositions[left][0] + leafPositions[right][0]) * 0.5,
        (leafPositions[left][1] + leafPositions[right][1]) * 0.5,
        (leafPositions[left][2] + leafPositions[right][2]) * 0.5
      ];
      return { edge: [left, right], midpoint, nearest: nearestVertex(midpoint, trunkPositions) };
    });
    rootCandidates.sort((left, right) => left.nearest.squaredDistance - right.nearest.squaredDistance);
    const rootEdge = rootCandidates[0].edge;
    const rootVertices = new Set(rootEdge);
    const tipEdge = boundaryEdges.find(([left, right]) => !rootVertices.has(left) && !rootVertices.has(right));
    if (!tipEdge) throw new Error(`${label} card ${card} has no edge opposite its woody root`);
    const tipVertices = new Set(tipEdge);
    const nearest = rootCandidates[0].nearest;
    if (nearest.index < 0) throw new Error(`${label} card ${card} has no woody attachment candidate`);
    const rootPivot = rootCandidates[0].midpoint;
    const branchElement = hierarchy.vertices[nearest.index].elementIndex;
    const parentProgress = hierarchy.vertices[nearest.index].localProgress;
    const branch = hierarchy.components[branchElement];
    const tipPivot = centroid3([...tipVertices].map((vertex) => leafPositions[vertex]));
    const leafMechanics = buildLeafMechanicalFrame(
      leafPositions,
      leafIndices.slice(card * 6, card * 6 + 6),
      rootEdge,
      rootPivot,
      tipPivot,
      label,
      card
    );
    const leafArea = quadArea(corners.map((vertex) => leafPositions[vertex]));
    branch.directLeafArea += leafArea;
    elements.push({
      branchElement,
      parentProgress,
      rootPivot,
      tipPivot,
      spanLength: leafMechanics.perpendicularSpanLength,
      hingeOffset: leafMechanics.hingeOffset,
      area: leafArea,
      frame: leafMechanics.frame
    });
    for (const vertexIndex of corners) {
      if (assigned[vertexIndex]) throw new Error(`${label} leaf vertex ${vertexIndex} is shared by multiple cards`);
      assigned[vertexIndex] = 1;
      if (!rootVertices.has(vertexIndex) && !tipVertices.has(vertexIndex)) {
        throw new Error(`${label} card ${card} leaf span does not cover vertex ${vertexIndex}`);
      }
      vertices[vertexIndex] = {
        elementIndex: hierarchy.componentCount + card,
        localProgress: tipVertices.has(vertexIndex) ? 1 : 0
      };
    }
    distances.push(Math.sqrt(nearest.squaredDistance));
  }
  const missingVertex = assigned.findIndex((value) => value === 0);
  if (missingVertex >= 0) throw new Error(`${label} leaf vertex ${missingVertex} is not owned by a card`);
  return { vertices, elements, distances, cards };
}

function finalizeMechanicalElements(hierarchy, leaves) {
  const { components } = hierarchy;
  for (const component of [...components].sort((left, right) => right.mechanicalDepth - left.mechanicalDepth)) {
    component.descendantLeafArea += component.directLeafArea;
    if (component.parent >= 0) components[component.parent].descendantLeafArea += component.descendantLeafArea;
  }
  const rawCompliance = components.map((component) => {
    if (hierarchy.rootComponents.has(component.index)) return 0;
    const radius = Math.max(component.meanRadius, 0.0025);
    const slenderness = Math.pow(Math.max(component.length, 0.0025), 3) / Math.pow(radius, 4);
    const foliageLoad = 1 + Math.sqrt(Math.max(component.descendantLeafArea, 0)) * 0.2;
    return Math.log2(1 + slenderness * foliageLoad);
  });
  const deformable = rawCompliance
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value > 0)
    .sort((left, right) => left.value - right.value || left.index - right.index);
  const complianceRank = new Map();
  for (let start = 0; start < deformable.length; ) {
    let end = start + 1;
    while (end < deformable.length && deformable[end].value === deformable[start].value) end++;
    const percentile = deformable.length <= 1
      ? 1
      : ((start + end - 1) * 0.5) / (deformable.length - 1);
    const normalizedCompliance = mix(0.12, 1, Math.pow(percentile, 1.35));
    for (let rank = start; rank < end; rank++) {
      complianceRank.set(deformable[rank].index, normalizedCompliance);
    }
    start = end;
  }
  components.forEach((component, index) => {
    component.compliance = rawCompliance[index] <= 0 ? 0 : complianceRank.get(index);
  });
  const branchElements = components.map((component) => mechanicalElementForComponent(component, components));
  const leafElements = leaves.elements.map((leaf) => mechanicalElementForLeaf(leaf, components));
  return [...branchElements, ...leafElements];
}

function mechanicalElementForComponent(component, components) {
  const stages = mechanicalStages(component, components);
  return mechanicalElement(stages, component.tip, null, 0, 0, 0);
}

function mechanicalElementForLeaf(leaf, components) {
  const stages = mechanicalStages(components[leaf.branchElement], components);
  return mechanicalElement(
    stages,
    leaf.rootPivot,
    leaf.frame,
    leaf.parentProgress,
    leaf.spanLength,
    leaf.hingeOffset
  );
}

function mechanicalElement(stages, terminalPivot, leafFrame, parentProgress, leafSpanLength, leafHingeOffset) {
  const pivots = Array.from(
    { length: MAXIMUM_MECHANICAL_DEPTH },
    (_, index) => stages[index]?.rootPivot ?? terminalPivot
  );
  return {
    pivots: [...pivots, terminalPivot],
    stageParentProgress: Array.from(
      { length: MAXIMUM_MECHANICAL_DEPTH },
      (_, index) => stages[index]?.parentProgress ?? 0
    ),
    compliance: Array.from({ length: MAXIMUM_MECHANICAL_DEPTH }, (_, index) => stages[index]?.compliance ?? 0),
    depth: stages.length,
    leafFrame,
    parentProgress,
    leafSpanLength,
    leafHingeOffset
  };
}

function buildLeafMechanicalFrame(positions, cardIndices, rootEdge, rootPivot, tipPivot, label, card) {
  let hingeAxis = normalize3(subtract3(positions[rootEdge[1]], positions[rootEdge[0]]));
  const rawSpan = subtract3(tipPivot, rootPivot);
  const authoredSpanAxis = normalize3(subtract3(rawSpan, scale3(hingeAxis, dot3(rawSpan, hingeAxis))));
  const faceNormal = normalize3(
    cross3(
      subtract3(positions[cardIndices[1]], positions[cardIndices[0]]),
      subtract3(positions[cardIndices[2]], positions[cardIndices[0]])
    )
  );
  if (length3(hingeAxis) <= 0.999 || length3(authoredSpanAxis) <= 0.999 || length3(faceNormal) <= 0.999) {
    throw new Error(`${label} card ${card} cannot produce a stable mechanical leaf frame`);
  }
  if (dot3(cross3(hingeAxis, authoredSpanAxis), faceNormal) < 0) hingeAxis = scale3(hingeAxis, -1);
  // Twist is meaningful only relative to the hinge direction the GPU actually reconstructs.
  // Quantizing the octahedral hinge can cross the reference-basis branch at |y|=0.9; computing
  // twist from the unquantized hinge then makes CPU and GPU choose different zero-angle frames.
  const octahedralHinge = encodeOctahedralDirection(hingeAxis).map(quantizeNormalizedByte);
  const decodedHingeAxis = decodeOctahedralDirection(octahedralHinge);
  const decodedSpanAxis = normalize3(
    subtract3(rawSpan, scale3(decodedHingeAxis, dot3(rawSpan, decodedHingeAxis)))
  );
  const hingeOffset = dot3(rawSpan, decodedHingeAxis);
  const perpendicularSpanLength = length3(
    subtract3(rawSpan, scale3(decodedHingeAxis, hingeOffset))
  );
  const referenceSpan = referencePerpendicular(decodedHingeAxis);
  const signedTwist = Math.atan2(
    dot3(cross3(referenceSpan, decodedSpanAxis), decodedHingeAxis),
    Math.max(-1, Math.min(1, dot3(referenceSpan, decodedSpanAxis)))
  );
  return {
    frame: [octahedralHinge[0], octahedralHinge[1], clamp01(signedTwist / (Math.PI * 2) + 0.5)],
    perpendicularSpanLength,
    hingeOffset
  };
}

function encodeOctahedralDirection(direction) {
  const inverseL1 = 1 / Math.max(Math.abs(direction[0]) + Math.abs(direction[1]) + Math.abs(direction[2]), 1e-8);
  let x = direction[0] * inverseL1;
  let y = direction[1] * inverseL1;
  if (direction[2] < 0) {
    const reflectedX = (1 - Math.abs(y)) * Math.sign(x || 1);
    y = (1 - Math.abs(x)) * Math.sign(y || 1);
    x = reflectedX;
  }
  return [clamp01(x * 0.5 + 0.5), clamp01(y * 0.5 + 0.5)];
}

function decodeOctahedralDirection(encoded) {
  const octahedral = [encoded[0] * 2 - 1, encoded[1] * 2 - 1];
  const direction = [
    octahedral[0],
    octahedral[1],
    1 - Math.abs(octahedral[0]) - Math.abs(octahedral[1])
  ];
  if (direction[2] < 0) {
    const originalX = direction[0];
    direction[0] = (1 - Math.abs(direction[1])) * Math.sign(direction[0] + 0.000001);
    direction[1] = (1 - Math.abs(originalX)) * Math.sign(direction[1] + 0.000001);
  }
  return normalize3(direction);
}

function quantizeNormalizedByte(value) {
  return Math.round(clamp01(value) * 255) / 255;
}

function referencePerpendicular(axis) {
  const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize3(cross3(helper, axis));
}

function mechanicalStages(component, components) {
  const path = [];
  for (let current = component; current && current.parent >= 0; current = components[current.parent])
    path.push(current);
  return path.reverse().slice(-MAXIMUM_MECHANICAL_DEPTH);
}

function buildMechanicalVertexStream(vertices, globalElementOffset) {
  const values = new Uint16Array(vertices.length * 2);
  vertices.forEach((entry, index) => {
    const elementIndex = globalElementOffset + entry.elementIndex;
    if (elementIndex > 65535) throw new Error(`Mechanical element index ${elementIndex} exceeds uint16`);
    values[index * 2] = elementIndex;
    values[index * 2 + 1] = Math.round(clamp01(entry.localProgress) * 65535);
  });
  return values;
}

function quadBoundaryEdges(indices, label, card) {
  const edgeUse = new Map();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const vertices = indices.slice(triangle, triangle + 3);
    for (const [left, right] of [
      [vertices[0], vertices[1]],
      [vertices[1], vertices[2]],
      [vertices[2], vertices[0]]
    ]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      const current = edgeUse.get(key);
      edgeUse.set(key, current ? { ...current, uses: current.uses + 1 } : { edge: [left, right], uses: 1 });
    }
  }
  const boundary = [...edgeUse.values()].filter(({ uses }) => uses === 1).map(({ edge }) => edge);
  if (boundary.length !== 4) throw new Error(`${label} card ${card} must have four boundary edges`);
  return boundary;
}

function appendNormalizedUnsignedShortVec2Stream(json, chunks, byteOffset, primitive, values) {
  const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  const alignedOffset = align4(byteOffset);
  if (alignedOffset !== byteOffset) chunks.push(Buffer.alloc(alignedOffset - byteOffset));
  chunks.push(bytes);
  const nextByteOffset = alignedOffset + bytes.byteLength;
  const bufferView = json.bufferViews.length;
  json.bufferViews.push({
    buffer: 0,
    byteOffset: alignedOffset,
    byteLength: bytes.byteLength,
    byteStride: 2 * Uint16Array.BYTES_PER_ELEMENT,
    target: ARRAY_BUFFER_TARGET
  });
  const accessor = json.accessors.length;
  json.accessors.push({
    bufferView,
    byteOffset: 0,
    componentType: UNSIGNED_SHORT_COMPONENT_TYPE,
    normalized: true,
    count: values.length / 2,
    type: "VEC2"
  });
  primitive.attributes.TEXCOORD_3 = accessor;
  return { byteOffset: nextByteOffset };
}

function createMechanicalData(elements, lodElementOffsets, bounds) {
  const transformTexelCount = elements.length * MECHANICAL_TRANSFORM_TEXELS_PER_ELEMENT;
  const transformWidth = Math.min(MECHANICAL_TEXTURE_WIDTH, Math.max(1, transformTexelCount));
  const transformHeight = Math.ceil(transformTexelCount / transformWidth);
  const dynamicsTexelCount = elements.length * 2;
  const dynamicsWidth = Math.min(MECHANICAL_TEXTURE_WIDTH, Math.max(1, dynamicsTexelCount));
  const dynamicsHeight = Math.ceil(dynamicsTexelCount / dynamicsWidth);
  const transformValues = new Uint16Array(transformWidth * transformHeight * 4);
  const dynamicsValues = new Uint8Array(dynamicsWidth * dynamicsHeight * 4);
  const extent = bounds.maximum.map((value, axis) => Math.max(value - bounds.minimum[axis], 1e-5));
  // One proxy card represents a visible leaf cluster, not one physical blade. Preserve the
  // woody root edge as the parent attachment while baking enough scale to reconstruct the
  // card center as its local aerodynamic pivot. The existing metadata byte has six spare bits,
  // so this adds no texture fetch, atlas texel, vertex attribute, or runtime bandwidth.
  const leafSpanReference = Math.max(...extent) * 0.25;
  elements.forEach((element, elementIndex) => {
    element.pivots.forEach((pivot, pivotIndex) => {
      const offset = (elementIndex * MECHANICAL_TRANSFORM_TEXELS_PER_ELEMENT + pivotIndex) * 4;
      for (let axis = 0; axis < 3; axis++) {
        transformValues[offset + axis] = toHalf(clamp01((pivot[axis] - bounds.minimum[axis]) / extent[axis]));
      }
      if (pivotIndex === MECHANICAL_TRANSFORM_TEXELS_PER_ELEMENT - 1) {
        transformValues[offset + 3] = toHalf(
          clamp01(element.leafHingeOffset / leafSpanReference * 0.5 + 0.5)
        );
      } else {
        transformValues[offset + 3] = toHalf(
          clamp01(element.stageParentProgress[pivotIndex])
        );
      }
    });
    const dynamicOffset = elementIndex * 8;
    for (let stage = 0; stage < MAXIMUM_MECHANICAL_DEPTH; stage++) {
      dynamicsValues[dynamicOffset + stage] = Math.round(clamp01(element.compliance[stage]) * 255);
    }
    const mechanicalDepth = Math.min(MAXIMUM_MECHANICAL_DEPTH, Math.max(0, element.depth));
    const normalizedLeafSpan = clamp01(element.leafSpanLength / leafSpanReference);
    const encodedLeafSpan = Math.round(normalizedLeafSpan * 63);
    dynamicsValues[dynamicOffset + 3] = (encodedLeafSpan << 2) | mechanicalDepth;
    const leafFrame = element.leafFrame ?? [0.5, 0.5, 0.5];
    dynamicsValues[dynamicOffset + 4] = Math.round(clamp01(leafFrame[0]) * 255);
    dynamicsValues[dynamicOffset + 5] = Math.round(clamp01(leafFrame[1]) * 255);
    dynamicsValues[dynamicOffset + 6] = Math.round(clamp01(leafFrame[2]) * 255);
    dynamicsValues[dynamicOffset + 7] = Math.round(clamp01(element.parentProgress) * 255);
  });

  const output = Buffer.alloc(MECHANICAL_DATA_HEADER_BYTES + transformValues.byteLength + dynamicsValues.byteLength);
  output.writeUInt32LE(MECHANICAL_DATA_MAGIC, 0);
  output.writeUInt16LE(HIERARCHY_GENERATOR_VERSION, 4);
  output.writeUInt8(MECHANICAL_TRANSFORM_TEXELS_PER_ELEMENT, 6);
  output.writeUInt8(lodElementOffsets.length, 7);
  output.writeUInt32LE(elements.length, 8);
  output.writeUInt16LE(transformWidth, 12);
  output.writeUInt16LE(transformHeight, 14);
  output.writeUInt16LE(dynamicsWidth, 16);
  output.writeUInt16LE(dynamicsHeight, 18);
  bounds.minimum.forEach((value, axis) => output.writeFloatLE(value, 20 + axis * 4));
  bounds.maximum.forEach((value, axis) => output.writeFloatLE(value, 32 + axis * 4));
  lodElementOffsets.forEach((value, lod) => output.writeUInt32LE(value, 44 + lod * 4));
  output.writeUInt32LE(transformValues.byteLength, 56);
  output.writeUInt32LE(dynamicsValues.byteLength, 60);
  Buffer.from(transformValues.buffer).copy(output, MECHANICAL_DATA_HEADER_BYTES);
  Buffer.from(dynamicsValues.buffer).copy(output, MECHANICAL_DATA_HEADER_BYTES + transformValues.byteLength);
  return output;
}

function positionBounds(positions) {
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const position of positions) {
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], position[axis]);
      maximum[axis] = Math.max(maximum[axis], position[axis]);
    }
  }
  return { minimum, maximum };
}

function estimateRadiusBins(component, positions, progressByVertex, axis) {
  const binCount = 8;
  const bins = Array.from({ length: binCount }, () => []);
  for (const vertex of component.vertices) {
    const delta = subtract3(positions[vertex], component.rootPivot);
    const axial = dot3(delta, axis);
    const radial = length3(subtract3(delta, scale3(axis, axial)));
    const bin = Math.min(binCount - 1, Math.floor(progressByVertex.get(vertex) * binCount));
    if (radial > 1e-5) bins[bin].push(radial);
  }
  let fallback = Math.max(component.length * 0.025, 0.0025);
  return bins.map((values) => {
    if (values.length > 0)
      fallback = quantile(
        values.sort((left, right) => left - right),
        0.55
      );
    return Math.max(fallback, 0.0025);
  });
}

function integrateComplianceProgress(progress, radiusBins) {
  const scaled = clamp01(progress) * radiusBins.length;
  let accumulated = 0;
  let total = 0;
  for (let bin = 0; bin < radiusBins.length; bin++) {
    const compliance = 1 / Math.pow(Math.max(radiusBins[bin], 0.0025), 4);
    total += compliance;
    accumulated += compliance * clamp01(scaled - bin);
  }
  return total > 0 ? accumulated / total : progress;
}

function quadArea(points) {
  const triangleArea = (a, b, c) => length3(cross3(subtract3(b, a), subtract3(c, a))) * 0.5;
  return triangleArea(points[0], points[1], points[2]) + triangleArea(points[0], points[2], points[3]);
}

function centroid3(points) {
  if (points.length === 0) return [0, 0, 0];
  const result = [0, 0, 0];
  for (const point of points) {
    result[0] += point[0];
    result[1] += point[1];
    result[2] += point[2];
  }
  return result.map((value) => value / points.length);
}

function subtract3(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale3(value, scale) {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function dot3(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross3(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function length3(value) {
  return Math.sqrt(dot3(value, value));
}

function normalize3(value) {
  const length = length3(value);
  return length > 1e-8 ? scale3(value, 1 / length) : [0, 1, 0];
}

function toHalf(value) {
  const bits = new Uint32Array(1);
  const float = new Float32Array(bits.buffer);
  float[0] = value;
  const source = bits[0];
  const sign = (source >>> 16) & 0x8000;
  let exponent = ((source >>> 23) & 0xff) - 127 + 15;
  let mantissa = source & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa = (mantissa | 0x800000) >>> (1 - exponent);
    return sign | ((mantissa + 0x1000) >>> 13);
  }
  if (exponent >= 31) return sign | 0x7c00;
  let halfMantissa = (mantissa + 0x1000) >>> 13;
  // Rounding 0x3ff upward produces 0x400. That bit is an exponent carry, not a
  // mantissa bit: OR-ing it with an odd exponent silently loses the carry and can
  // turn values just below 0.5 into 0.25, moving a tree attachment by metres.
  if (halfMantissa === 0x400) {
    halfMantissa = 0;
    exponent++;
    if (exponent >= 31) return sign | 0x7c00;
  }
  return sign | (exponent << 10) | halfMantissa;
}

function addEdge(adjacency, positions, left, right, label) {
  if (!positions[left] || !positions[right]) throw new Error(`${label} branch index references a missing vertex`);
  if (left === right) return;
  const distance = Math.sqrt(squaredDistance3(positions[left], positions[right]));
  if (!adjacency[left].has(right) || distance < adjacency[left].get(right)) adjacency[left].set(right, distance);
  if (!adjacency[right].has(left) || distance < adjacency[right].get(left)) adjacency[right].set(left, distance);
}

function recordEdgeUse(edgeUse, left, right) {
  if (left === right) return;
  const minimum = Math.min(left, right);
  const maximum = Math.max(left, right);
  const key = `${minimum}:${maximum}`;
  const edge = edgeUse.get(key);
  if (edge) {
    edge.count++;
  } else {
    edgeUse.set(key, { left: minimum, right: maximum, count: 1 });
  }
}

function connectedComponents(adjacency) {
  const visited = new Uint8Array(adjacency.length);
  const components = [];
  for (let start = 0; start < adjacency.length; start++) {
    if (visited[start]) continue;
    const vertices = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const vertex = stack.pop();
      vertices.push(vertex);
      for (const neighbor of adjacency[vertex].keys()) {
        if (visited[neighbor]) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    components.push(vertices);
  }
  return components;
}

function shortestPathTreeFromRoots(component, positions, adjacency, roots) {
  const distance = new Float64Array(positions.length);
  distance.fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap();
  for (const root of roots) {
    distance[root] = 0;
    heap.push(root, 0);
  }
  const componentSet = new Set(component);
  while (heap.size > 0) {
    const current = heap.pop();
    if (!current || current.distance !== distance[current.vertex]) continue;
    for (const [neighbor, edgeWeight] of adjacency[current.vertex]) {
      if (!componentSet.has(neighbor)) continue;
      const candidate = current.distance + edgeWeight;
      if (candidate >= distance[neighbor]) continue;
      distance[neighbor] = candidate;
      heap.push(neighbor, candidate);
    }
  }
  return { distance };
}

class MinHeap {
  constructor() {
    this.entries = [];
  }

  get size() {
    return this.entries.length;
  }

  push(vertex, distance) {
    const entry = { vertex, distance };
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.entries[parent].distance <= distance) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop() {
    if (this.entries.length === 0) return null;
    const result = this.entries[0];
    const tail = this.entries.pop();
    if (this.entries.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.entries.length) break;
        const child =
          right < this.entries.length && this.entries[right].distance < this.entries[left].distance ? right : left;
        if (this.entries[child].distance >= tail.distance) break;
        this.entries[index] = this.entries[child];
        index = child;
      }
      this.entries[index] = tail;
    }
    return result;
  }
}

function squaredDistance3(left, right) {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  const dz = left[2] - right[2];
  return dx * dx + dy * dy + dz * dz;
}

function nearestVertex(point, candidates) {
  let index = -1;
  let squaredDistance = Number.POSITIVE_INFINITY;
  for (let candidate = 0; candidate < candidates.length; candidate++) {
    const dx = point[0] - candidates[candidate][0];
    const dy = point[1] - candidates[candidate][1];
    const dz = point[2] - candidates[candidate][2];
    const candidateDistance = dx * dx + dy * dy + dz * dz;
    if (candidateDistance < squaredDistance) {
      squaredDistance = candidateDistance;
      index = candidate;
    }
  }
  return { index, squaredDistance };
}

function requirePrimitive(json, meshIndex, primitiveIndex) {
  const primitive = json.meshes?.[meshIndex]?.primitives?.[primitiveIndex];
  if (!primitive) throw new Error(`Tree source is missing meshes[${meshIndex}][${primitiveIndex}]`);
  return primitive;
}

function readAccessor(input, accessorIndex) {
  const accessor = input.json.accessors[accessorIndex];
  if (!accessor || accessor.sparse) throw new Error(`Unsupported tree accessor ${accessorIndex}`);
  const view = input.json.bufferViews[accessor.bufferView];
  const component = componentType(accessor.componentType);
  const components = accessorComponents(accessor.type);
  const stride = view.byteStride ?? component.bytes * components;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let index = 0; index < accessor.count; index++) {
    const tuple = [];
    for (let componentIndex = 0; componentIndex < components; componentIndex++) {
      tuple.push(input.binary[component.read](base + index * stride + componentIndex * component.bytes));
    }
    values.push(tuple);
  }
  return values;
}

function componentType(type) {
  switch (type) {
    case 5121:
      return { bytes: 1, read: "readUInt8", write: "writeUInt8", normalizedMaximum: 255 };
    case 5123:
      return { bytes: 2, read: "readUInt16LE", write: "writeUInt16LE", normalizedMaximum: 65535 };
    case 5125:
      return { bytes: 4, read: "readUInt32LE" };
    case 5126:
      return { bytes: 4, read: "readFloatLE" };
    default:
      throw new Error(`Unsupported tree accessor component type ${type}`);
  }
}

function accessorComponents(type) {
  switch (type) {
    case "SCALAR":
      return 1;
    case "VEC2":
      return 2;
    case "VEC3":
      return 3;
    case "VEC4":
      return 4;
    default:
      throw new Error(`Unsupported tree accessor shape ${type}`);
  }
}

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC || buffer.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error("Tree source must be a glTF 2.0 binary");
  }
  if (buffer.readUInt32LE(8) !== buffer.byteLength) throw new Error("Tree source GLB length is invalid");
  let json;
  let binary;
  for (let offset = 12; offset < buffer.byteLength; ) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === GLB_JSON_CHUNK) json = JSON.parse(chunk.toString("utf8").replace(/[\0 ]+$/u, ""));
    if (type === GLB_BIN_CHUNK) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("Tree source GLB must contain JSON and BIN chunks");
  return { json, binary };
}

function createGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJsonLength = align4(jsonBytes.byteLength);
  const paddedBinaryLength = align4(binary.byteLength);
  const output = Buffer.alloc(12 + 8 + paddedJsonLength + 8 + paddedBinaryLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(output.byteLength, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(GLB_JSON_CHUNK, 16);
  jsonBytes.copy(output, 20);
  output.fill(0x20, 20 + jsonBytes.byteLength, 20 + paddedJsonLength);
  const binaryHeader = 20 + paddedJsonLength;
  output.writeUInt32LE(paddedBinaryLength, binaryHeader);
  output.writeUInt32LE(GLB_BIN_CHUNK, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

function align4(value) {
  return (value + 3) & ~3;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(edge1 - edge0, 1e-6));
  return t * t * (3 - 2 * t);
}

function mix(left, right, amount) {
  return left + (right - left) * amount;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function quantile(sortedValues, fraction) {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * fraction))];
}

function roundMetric(value) {
  return Number(value.toFixed(6));
}

await main();
