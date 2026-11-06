const ARRAY_BUFFER_TARGET = 34962;
const ELEMENT_ARRAY_BUFFER_TARGET = 34963;
const FLOAT = 5126;

const componentCounts = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 });
const componentBytes = Object.freeze({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 });

export function optimizeSeedWorldGroundDetail(input, profile) {
  const json = structuredClone(input.json);
  const sourceBinary = Buffer.from(input.binary);
  const primitive = requireSinglePrimitive(json, profile);
  const positions = readAccessor(json, sourceBinary, primitive.attributes.POSITION);
  const texcoords = readAccessor(json, sourceBinary, primitive.attributes.TEXCOORD_0);
  const indices = readAccessor(json, sourceBinary, primitive.indices).flat();
  const sourceFaces = chunkFaces(indices);
  const sourceVertexCount = positions.length;
  let faces;
  let normalOverrides = new Map();
  let tangentOverrides = new Map();

  switch (profile) {
    case "grass":
      faces = reduceGrassBlades(sourceFaces, positions, texcoords);
      break;
    case "flowers-1":
      faces = removeFlowersOneRootSkirts(sourceFaces, positions, texcoords);
      break;
    case "flowers-2": {
      faces = flattenFlowersTwoHeads(sourceFaces, positions);
      normalOverrides = calculateVertexNormals(faces, positions);
      if (primitive.attributes.TANGENT !== undefined) {
        tangentOverrides = calculateVertexTangents(faces, positions, texcoords, normalOverrides);
      }
      break;
    }
    case "flower-1":
      faces = reduceFlowerOneStems(sourceFaces, positions, texcoords);
      break;
    default:
      throw new Error(`Unknown Seed World ground-detail optimization profile '${profile}'`);
  }

  const optimized = compactPrimitive(
    { json, binary: sourceBinary },
    primitive,
    faces,
    new Map([
      ["NORMAL", normalOverrides],
      ["TANGENT", tangentOverrides]
    ])
  );
  delete optimized.json.extras?.terrainGroundWindWeights;
  if (optimized.json.extras && Object.keys(optimized.json.extras).length === 0) delete optimized.json.extras;

  const optimizedPrimitive = optimized.json.meshes[0].primitives[0];
  const result = {
    sourceVertices: sourceVertexCount,
    sourceTriangles: sourceFaces.length,
    vertices: optimized.json.accessors[optimizedPrimitive.attributes.POSITION].count,
    triangles: optimized.json.accessors[optimizedPrimitive.indices].count / 3
  };
  validateProfileMetrics(profile, result);
  return optimized;
}

function requireSinglePrimitive(json, profile) {
  if (json.meshes?.length !== 1 || json.meshes[0].primitives?.length !== 1) {
    throw new Error(`${profile} optimization requires one mesh with one primitive`);
  }
  if (json.animations?.length || json.skins?.length || json.images?.some((image) => image.bufferView !== undefined)) {
    throw new Error(`${profile} optimization does not support non-geometry buffer consumers`);
  }
  const primitive = json.meshes[0].primitives[0];
  if (primitive.mode !== undefined && primitive.mode !== 4) {
    throw new Error(`${profile} optimization requires indexed triangles`);
  }
  if (primitive.targets?.length) throw new Error(`${profile} optimization does not support morph targets`);
  if (primitive.attributes?.POSITION === undefined || primitive.attributes?.TEXCOORD_0 === undefined) {
    throw new Error(`${profile} optimization requires POSITION and TEXCOORD_0`);
  }
  if (primitive.indices === undefined) throw new Error(`${profile} optimization requires an index accessor`);
  return primitive;
}

function reduceGrassBlades(faces, positions, texcoords) {
  const components = connectedFaceComponents(faces);
  requireComponentContract("grass", components, 4, 6, 8);
  const output = [];

  for (const component of components) {
    const rings = clusterByCoordinate([...component.vertices], (vertex) => texcoords[vertex][0], 4);
    if (rings.some((ring) => ring.length !== 2)) throw new Error("Grass blade must contain four two-vertex rings");
    const removable = rings.find((ring) => ring.every((vertex) => Math.abs(texcoords[vertex][0] - 0.2572) <= 0.002));
    if (!removable) throw new Error("Grass blade no longer contains the authored u=0.2572 ring");
    const removableIndex = rings.indexOf(removable);
    if (removableIndex === 0 || removableIndex === rings.length - 1) {
      throw new Error("Grass optimizer selected a boundary ring");
    }
    const lower = rings[removableIndex - 1];
    const upper = rings[removableIndex + 1];
    output.push(...component.faces.filter((face) => face.every((vertex) => !removable.includes(vertex))));
    output.push(...triangulateQuad(lower, upper, positions, averageFaceNormal(component.faces, positions)));
  }
  return output;
}

function removeFlowersOneRootSkirts(faces, positions, texcoords) {
  const components = connectedFaceComponents(faces);
  requireComponentContract("flowers-1", components, 8, 5, 7);
  const removableTriangles = new Map([
    [7, [7, 12, 11]],
    [12, [14, 19, 18]],
    [22, [28, 33, 32]],
    [27, [35, 40, 39]],
    [37, [49, 54, 53]]
  ]);
  const expectedUvTriangles = [
    [
      [0.264381379, 1.00087142],
      [0.302606225, 0.921147585],
      [0.181577176, 0.922757626]
    ],
    [
      [0.634900391, 0.999963164],
      [0.737378657, 0.960831463],
      [0.610201418, 0.893071234]
    ]
  ];

  for (const [triangle, expectedIndices] of removableTriangles) {
    if (!sameArray(faces[triangle], expectedIndices)) {
      throw new Error(`flowers-1 root-skirt triangle ${triangle} changed topology`);
    }
    const actualUv = faces[triangle].map((vertex) => texcoords[vertex]);
    if (!expectedUvTriangles.some((expected) => approximatelyNested(actualUv, expected, 1e-5))) {
      throw new Error(`flowers-1 root-skirt triangle ${triangle} changed UVs`);
    }
    if (Math.max(...faces[triangle].map((vertex) => positions[vertex][1])) > 0.11) {
      throw new Error(`flowers-1 triangle ${triangle} is no longer confined to the buried root skirt`);
    }
  }
  return faces.filter((_face, triangle) => !removableTriangles.has(triangle));
}

function flattenFlowersTwoHeads(faces, positions) {
  const components = connectedFaceComponents(faces);
  requireComponentContract("flowers-2", components, 8, 4, 5);
  const output = [];
  for (const component of components) {
    const incidence = new Map([...component.vertices].map((vertex) => [vertex, 0]));
    component.faces.forEach((face) => face.forEach((vertex) => incidence.set(vertex, incidence.get(vertex) + 1)));
    const centers = [...component.vertices].filter((vertex) => incidence.get(vertex) === 4);
    if (centers.length !== 1) throw new Error("flowers-2 head no longer has one four-face center");
    const boundary = traceBoundaryCycle(component.faces, centers[0]);
    output.push(...triangulateBoundaryQuad(boundary, positions, averageFaceNormal(component.faces, positions)));
  }
  return output;
}

function reduceFlowerOneStems(faces, positions, texcoords) {
  const components = connectedFaceComponents(faces);
  const stems = components.filter((component) => component.faces.length === 18 && component.vertices.size === 16);
  const leaves = components.filter((component) => component.faces.length === 5 && component.vertices.size === 7);
  const heads = components.filter((component) => component.faces.length === 4 && component.vertices.size === 5);
  if (stems.length !== 4 || leaves.length !== 9 || heads.length !== 4 || components.length !== 17) {
    throw new Error(
      `flower-1 topology changed: found ${stems.length} stems, ${leaves.length} leaves, and ${heads.length} heads`
    );
  }

  const replacedFaces = new Set();
  const bridges = [];
  for (const stem of stems) {
    const rings = clusterByCoordinate([...stem.vertices], (vertex) => -positions[vertex][2], 4);
    if (rings.some((ring) => ring.length !== 4)) throw new Error("flower-1 stem must contain four GPU-vertex rings");
    const [root, mainMid, penultimate] = rings;
    const template = stem.faces.filter((face) =>
      face.every((vertex) => root.includes(vertex) || mainMid.includes(vertex))
    );
    if (template.length !== 6) throw new Error("flower-1 stem root segment must contain six triangles");
    const mapping = bestRingMapping(mainMid, penultimate, positions, texcoords);
    const mapped = template.map((face) => face.map((vertex) => mapping.get(vertex) ?? vertex));
    if (mapped.some((face) => new Set(face).size !== 3))
      throw new Error("flower-1 stem reduction made a degenerate face");
    stem.faces.forEach((face) => {
      if (face.some((vertex) => mainMid.includes(vertex))) replacedFaces.add(face);
    });
    mapped.forEach((face) => bridges.push(face));
  }
  return [...faces.filter((face) => !replacedFaces.has(face)), ...bridges];
}

function compactPrimitive(input, primitive, faces, semanticOverrides) {
  const json = input.json;
  const usedVertices = [...new Set(faces.flat())].sort((left, right) => left - right);
  const remap = new Map(usedVertices.map((vertex, index) => [vertex, index]));
  const compactFaces = faces.map((face) => face.map((vertex) => remap.get(vertex)));
  const attributes = {};
  const accessors = [];
  const bufferViews = [];
  const chunks = [];
  let byteLength = 0;

  const append = (payload, target) => {
    const aligned = align4(byteLength);
    if (aligned > byteLength) chunks.push(Buffer.alloc(aligned - byteLength));
    chunks.push(payload);
    const bufferView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: aligned, byteLength: payload.length, target });
    byteLength = aligned + payload.length;
    return bufferView;
  };

  for (const [semantic, sourceAccessorIndex] of Object.entries(primitive.attributes)) {
    const sourceAccessor = json.accessors[sourceAccessorIndex];
    const sourceValues = readAccessor(json, input.binary, sourceAccessorIndex);
    const overrides = semanticOverrides.get(semantic);
    const values = usedVertices.map((vertex) => overrides?.get(vertex) ?? sourceValues[vertex]);
    const payload = encodeAccessor(values, sourceAccessor.componentType);
    const accessor = compactAccessor(sourceAccessor, values, append(payload, ARRAY_BUFFER_TARGET));
    attributes[semantic] = accessors.length;
    accessors.push(accessor);
  }

  const sourceIndexAccessor = json.accessors[primitive.indices];
  const flatIndices = compactFaces.flat().map((value) => [value]);
  const indexPayload = encodeAccessor(flatIndices, sourceIndexAccessor.componentType);
  const indexAccessor = compactAccessor(
    sourceIndexAccessor,
    flatIndices,
    append(indexPayload, ELEMENT_ARRAY_BUFFER_TARGET)
  );
  const indexAccessorIndex = accessors.length;
  accessors.push(indexAccessor);

  primitive.attributes = attributes;
  primitive.indices = indexAccessorIndex;
  json.accessors = accessors;
  json.bufferViews = bufferViews;
  json.buffers = [{ ...json.buffers[0], byteLength }];
  delete json.buffers[0].uri;
  return { json, binary: Buffer.concat(chunks) };
}

function compactAccessor(source, values, bufferView) {
  const accessor = { ...source, bufferView, count: values.length };
  delete accessor.byteOffset;
  delete accessor.sparse;
  if (source.min || source.max) {
    const count = componentCounts[source.type];
    accessor.min = Array.from({ length: count }, (_, component) =>
      Math.min(...values.map((value) => value[component]))
    );
    accessor.max = Array.from({ length: count }, (_, component) =>
      Math.max(...values.map((value) => value[component]))
    );
  }
  return accessor;
}

function readAccessor(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  if (!accessor || accessor.sparse) throw new Error(`Unsupported accessor ${accessorIndex}`);
  const view = json.bufferViews[accessor.bufferView];
  const count = componentCounts[accessor.type];
  const bytes = componentBytes[accessor.componentType];
  if (!view || !count || !bytes) throw new Error(`Unsupported accessor ${accessorIndex}`);
  const stride = view.byteStride ?? count * bytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, element) =>
    Array.from({ length: count }, (_, component) =>
      readComponent(binary, start + element * stride + component * bytes, accessor.componentType)
    )
  );
}

function readComponent(buffer, offset, componentType) {
  switch (componentType) {
    case 5120:
      return buffer.readInt8(offset);
    case 5121:
      return buffer.readUInt8(offset);
    case 5122:
      return buffer.readInt16LE(offset);
    case 5123:
      return buffer.readUInt16LE(offset);
    case 5125:
      return buffer.readUInt32LE(offset);
    case FLOAT:
      return buffer.readFloatLE(offset);
    default:
      throw new Error(`Unsupported component type ${componentType}`);
  }
}

function encodeAccessor(values, componentType) {
  const bytes = componentBytes[componentType];
  const output = Buffer.alloc(values.length * values[0].length * bytes);
  let offset = 0;
  for (const value of values) {
    for (const component of value) {
      switch (componentType) {
        case 5120:
          output.writeInt8(component, offset);
          break;
        case 5121:
          output.writeUInt8(component, offset);
          break;
        case 5122:
          output.writeInt16LE(component, offset);
          break;
        case 5123:
          output.writeUInt16LE(component, offset);
          break;
        case 5125:
          output.writeUInt32LE(component, offset);
          break;
        case FLOAT:
          output.writeFloatLE(component, offset);
          break;
        default:
          throw new Error(`Unsupported component type ${componentType}`);
      }
      offset += bytes;
    }
  }
  return output;
}

function connectedFaceComponents(faces) {
  const vertexFaces = new Map();
  faces.forEach((face, faceIndex) =>
    face.forEach((vertex) => {
      const linked = vertexFaces.get(vertex) ?? [];
      linked.push(faceIndex);
      vertexFaces.set(vertex, linked);
    })
  );
  const unseen = new Set(faces.map((_face, index) => index));
  const components = [];
  while (unseen.size > 0) {
    const pending = [unseen.values().next().value];
    const faceIndices = [];
    const vertices = new Set();
    unseen.delete(pending[0]);
    while (pending.length > 0) {
      const faceIndex = pending.pop();
      faceIndices.push(faceIndex);
      for (const vertex of faces[faceIndex]) {
        vertices.add(vertex);
        for (const neighbor of vertexFaces.get(vertex)) {
          if (!unseen.delete(neighbor)) continue;
          pending.push(neighbor);
        }
      }
    }
    components.push({ faceIndices, faces: faceIndices.map((index) => faces[index]), vertices });
  }
  return components;
}

function clusterByCoordinate(vertices, coordinate, count) {
  const ordered = [...vertices].sort((left, right) => coordinate(left) - coordinate(right));
  if (ordered.length % count !== 0) throw new Error(`Cannot split ${ordered.length} vertices into ${count} rings`);
  const size = ordered.length / count;
  return Array.from({ length: count }, (_, index) => ordered.slice(index * size, (index + 1) * size));
}

function traceBoundaryCycle(faces, center) {
  const adjacency = new Map();
  for (const face of faces) {
    const boundary = face.filter((vertex) => vertex !== center);
    if (boundary.length !== 2) throw new Error("Expected a triangle fan around one center");
    for (const [left, right] of [boundary, [...boundary].reverse()]) {
      const neighbors = adjacency.get(left) ?? [];
      neighbors.push(right);
      adjacency.set(left, neighbors);
    }
  }
  if (adjacency.size !== 4 || [...adjacency.values()].some((neighbors) => neighbors.length !== 2)) {
    throw new Error("Flower boundary is not a four-vertex cycle");
  }
  const first = Math.min(...adjacency.keys());
  const cycle = [first];
  let previous = undefined;
  let current = first;
  while (cycle.length < 4) {
    const next = adjacency.get(current).find((candidate) => candidate !== previous && !cycle.includes(candidate));
    if (next === undefined) throw new Error("Could not trace flower boundary cycle");
    cycle.push(next);
    previous = current;
    current = next;
  }
  return cycle;
}

function triangulateQuad(left, right, positions, referenceNormal) {
  const direct =
    distanceSquared(positions[left[0]], positions[right[0]]) + distanceSquared(positions[left[1]], positions[right[1]]);
  const crossed =
    distanceSquared(positions[left[0]], positions[right[1]]) + distanceSquared(positions[left[1]], positions[right[0]]);
  const paired = direct <= crossed ? right : [right[1], right[0]];
  const cycle = [left[0], paired[0], paired[1], left[1]];
  return triangulateBoundaryQuad(cycle, positions, referenceNormal);
}

function triangulateBoundaryQuad(cycle, positions, referenceNormal) {
  const firstDiagonal = distanceSquared(positions[cycle[0]], positions[cycle[2]]);
  const secondDiagonal = distanceSquared(positions[cycle[1]], positions[cycle[3]]);
  const faces =
    firstDiagonal <= secondDiagonal
      ? [
          [cycle[0], cycle[1], cycle[2]],
          [cycle[0], cycle[2], cycle[3]]
        ]
      : [
          [cycle[0], cycle[1], cycle[3]],
          [cycle[1], cycle[2], cycle[3]]
        ];
  return faces.map((face) => orientFace(face, positions, referenceNormal));
}

function bestRingMapping(source, target, positions, texcoords) {
  const sourceCenter = average(source.map((vertex) => positions[vertex]));
  const targetCenter = average(target.map((vertex) => positions[vertex]));
  const sourceU = normalizeScalars(source.map((vertex) => texcoords[vertex][0]));
  const targetU = normalizeScalars(target.map((vertex) => texcoords[vertex][0]));
  let best = null;
  for (const permutation of permutations(target)) {
    const cost = source.reduce((sum, vertex, index) => {
      const sourceDirection = normalize(subtract(positions[vertex], sourceCenter));
      const targetDirection = normalize(subtract(positions[permutation[index]], targetCenter));
      return (
        sum +
        distanceSquared(sourceDirection, targetDirection) * 8 +
        (sourceU[index] - targetU[target.indexOf(permutation[index])]) ** 2
      );
    }, 0);
    if (!best || cost < best.cost) best = { cost, permutation };
  }
  return new Map(source.map((vertex, index) => [vertex, best.permutation[index]]));
}

function calculateVertexNormals(faces, positions, includedVertices) {
  const sums = new Map();
  for (const face of faces) {
    const normal = faceNormal(face, positions);
    for (const vertex of face) {
      if (includedVertices && !includedVertices.has(vertex)) continue;
      sums.set(vertex, add(sums.get(vertex) ?? [0, 0, 0], normal));
    }
  }
  return new Map([...sums].map(([vertex, normal]) => [vertex, normalize(normal)]));
}

function calculateVertexTangents(faces, positions, texcoords, normals) {
  const tangents = new Map();
  const bitangents = new Map();
  for (const face of faces) {
    const [a, b, c] = face;
    const edge1 = subtract(positions[b], positions[a]);
    const edge2 = subtract(positions[c], positions[a]);
    const du1 = texcoords[b][0] - texcoords[a][0];
    const dv1 = texcoords[b][1] - texcoords[a][1];
    const du2 = texcoords[c][0] - texcoords[a][0];
    const dv2 = texcoords[c][1] - texcoords[a][1];
    const determinant = du1 * dv2 - du2 * dv1;
    if (Math.abs(determinant) <= 1e-10) continue;
    const inverse = 1 / determinant;
    const tangent = scale(subtract(scale(edge1, dv2), scale(edge2, dv1)), inverse);
    const bitangent = scale(subtract(scale(edge2, du1), scale(edge1, du2)), inverse);
    for (const vertex of face) {
      tangents.set(vertex, add(tangents.get(vertex) ?? [0, 0, 0], tangent));
      bitangents.set(vertex, add(bitangents.get(vertex) ?? [0, 0, 0], bitangent));
    }
  }
  return new Map(
    [...normals].map(([vertex, normal]) => {
      const source = tangents.get(vertex) ?? [1, 0, 0];
      const tangent = normalize(subtract(source, scale(normal, dot(normal, source))));
      const handedness = dot(cross(normal, tangent), bitangents.get(vertex) ?? [0, 1, 0]) < 0 ? -1 : 1;
      return [vertex, [...tangent, handedness]];
    })
  );
}

function requireComponentContract(label, components, count, faceCount, vertexCount) {
  if (
    components.length !== count ||
    components.some((component) => component.faces.length !== faceCount || component.vertices.size !== vertexCount)
  ) {
    throw new Error(`${label} topology changed; expected ${count} components of ${faceCount}tri/${vertexCount}v`);
  }
}

function validateProfileMetrics(profile, metrics) {
  const expected = {
    grass: { sourceVertices: 32, sourceTriangles: 24, vertices: 24, triangles: 16 },
    "flowers-1": { sourceVertices: 56, sourceTriangles: 40, vertices: 51, triangles: 35 },
    "flowers-2": { sourceVertices: 40, sourceTriangles: 32, vertices: 32, triangles: 16 },
    "flower-1": { sourceVertices: 147, sourceTriangles: 133, vertices: 131, triangles: 109 }
  }[profile];
  if (JSON.stringify(metrics) !== JSON.stringify(expected)) {
    throw new Error(
      `${profile} optimization metrics changed: ${JSON.stringify(metrics)} != ${JSON.stringify(expected)}`
    );
  }
}

function chunkFaces(indices) {
  if (indices.length % 3 !== 0) throw new Error("Ground-detail index count must be divisible by three");
  return Array.from({ length: indices.length / 3 }, (_, index) => indices.slice(index * 3, index * 3 + 3));
}

function orientFace(face, positions, referenceNormal) {
  return dot(faceNormal(face, positions), referenceNormal) < 0 ? [face[0], face[2], face[1]] : face;
}

function averageFaceNormal(faces, positions) {
  return normalize(faces.reduce((sum, face) => add(sum, faceNormal(face, positions)), [0, 0, 0]));
}

function faceNormal(face, positions) {
  return cross(subtract(positions[face[1]], positions[face[0]]), subtract(positions[face[2]], positions[face[0]]));
}

function normalizeScalars(values) {
  const minimum = Math.min(...values);
  const range = Math.max(...values) - minimum || 1;
  return values.map((value) => (value - minimum) / range);
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((tail) => [value, ...tail])
  );
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function approximatelyNested(left, right, epsilon) {
  return left.length === right.length && left.every((value, index) => approximately(value, right[index], epsilon));
}

function approximately(left, right, epsilon) {
  return left.length === right.length && left.every((value, index) => Math.abs(value - right[index]) <= epsilon);
}

function average(values) {
  return scale(
    values.reduce((sum, value) => add(sum, value), [0, 0, 0]),
    1 / values.length
  );
}

function add(left, right) {
  return left.map((value, index) => value + right[index]);
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function scale(value, factor) {
  return value.map((component) => component * factor);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function normalize(value) {
  const length = Math.hypot(...value);
  return length > 1e-12 ? scale(value, 1 / length) : [0, 0, 1];
}

function distanceSquared(left, right) {
  return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
}

function align4(value) {
  return (value + 3) & ~3;
}
