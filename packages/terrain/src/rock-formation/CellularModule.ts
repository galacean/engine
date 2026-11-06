/** Portable GLB decoder and finite assembly. No engine/Blender dependency. */
export interface CellularModule {
  period: number;
  meanCellSize: number;
  cellCount: number;
  positions: Float32Array;
  indices: Uint32Array;
  directions: Float32Array;
  cellIds: Float32Array;
  cellOffsets: Float32Array;
  random: Float32Array;
  bby: Float32Array;
  corners: Float32Array;
  centroidDistance: Float32Array;
  isTop: Uint32Array;
  neighbors: Uint32Array;
  wrapNeighbors: Uint32Array;
  wrapOffsets: Float32Array;
  /** Optional offline asymmetric tile; legacy source modules omit this. */
  bakedAsymmetric?: {
    version: string;
    seed: number;
    cellsAcross: number;
    /** Offline lower-boundary spacing in mean-cell units; caps keep their original density. */
    jointSpacing?: number;
  };
  shadingIds?: Float32Array;
}
export interface CellularTopology {
  positions: Float32Array;
  indices: Uint32Array;
  directions: Float32Array;
  random: Float32Array;
  bby: Float32Array;
  corners: Float32Array;
  centroidDistance: Float32Array;
  cellIds: Uint32Array;
  cellKeys: string[];
  isTop: Uint32Array;
  neighbors: Int32Array;
  boundaryEdges: number;
  tileCount: number;
  width: number;
  depth: number;
  scale: number;
  key: string;
}

export function decodeCellularModule(buffer: ArrayBuffer): CellularModule {
  const view = new DataView(buffer);
  if (
    buffer.byteLength < 28 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw Error("Invalid cellular GLB");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength > buffer.byteLength - 28)
    throw Error("Missing cellular GLB JSON");
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binStart = 28 + jsonLength;
  if (view.getUint32(binStart - 4, true) !== 0x004e4942) throw Error("Missing cellular GLB binary chunk");
  const mesh = gltf.meshes?.[0],
    primitive = mesh?.primitives?.[0],
    meta = mesh?.extras?.cellular;
  if (meta?.schema !== "landscape-cellular-module/1" || primitive?.mode !== 4)
    throw Error("Unsupported cellular module schema");
  function read(id: number, components: number, integer = false): Float32Array | Uint32Array {
    const a = gltf.accessors[id],
      b = gltf.bufferViews[a?.bufferView];
    const type = components === 1 ? "SCALAR" : `VEC${components}`;
    const offset = binStart + (b?.byteOffset ?? 0) + (a?.byteOffset ?? 0);
    if (
      !a ||
      !b ||
      b.buffer !== 0 ||
      b.byteStride ||
      a.sparse ||
      a.type !== type ||
      a.componentType !== (integer ? 5125 : 5126) ||
      !Number.isInteger(a.count) ||
      a.count < 1 ||
      offset % 4 ||
      a.count * components * 4 > b.byteLength ||
      offset + a.count * components * 4 > buffer.byteLength
    )
      throw Error("Invalid cellular accessor");
    return integer
      ? new Uint32Array(buffer, offset, a.count * components)
      : new Float32Array(buffer, offset, a.count * components);
  }
  const p = primitive.attributes;
  const module: CellularModule = {
    period: meta.period,
    meanCellSize: meta.meanCellSize,
    cellCount: meta.cellCount,
    positions: read(p.POSITION, 3) as Float32Array,
    indices: read(primitive.indices, 1, true) as Uint32Array,
    directions: read(p._DIR_TO_CENTROID, 3) as Float32Array,
    cellIds: read(p._CELL_ID, 1) as Float32Array,
    cellOffsets: read(p._CELL_OFFSET, 2) as Float32Array,
    random: read(p._CELL_RANDOM, 1) as Float32Array,
    bby: read(p._CELL_BBY, 1) as Float32Array,
    corners: read(p._IS_CORNER, 1) as Float32Array,
    centroidDistance: read(p._CENTROID_DISTANCE, 1) as Float32Array,
    isTop: read(meta.isTop, 1, true) as Uint32Array,
    neighbors: read(meta.neighbors, 3, true) as Uint32Array,
    wrapNeighbors: read(meta.wrapNeighbors, 3, true) as Uint32Array,
    wrapOffsets: read(meta.wrapOffsets, 2) as Float32Array
  };
  if (meta.bakedAsymmetric !== undefined) {
    const baked = meta.bakedAsymmetric;
    if (
      !baked ||
      typeof baked.version !== "string" ||
      !baked.version ||
      !Number.isInteger(baked.seed) ||
      !(Number.isInteger(baked.cellsAcross) && baked.cellsAcross > 0)
    )
      throw Error("Invalid baked cellular metadata");
    module.bakedAsymmetric = { version: baked.version, seed: baked.seed, cellsAcross: baked.cellsAcross };
    if (baked.jointSpacing !== undefined) {
      if (!(Number.isFinite(baked.jointSpacing) && baked.jointSpacing > 0)) throw Error("Invalid baked joint spacing");
      module.bakedAsymmetric.jointSpacing = baked.jointSpacing;
    }
    module.shadingIds = read(p._CELL_SHADING_ID, 1) as Float32Array;
  }
  const n = module.positions.length / 3,
    t = module.indices.length / 3;
  if (
    !(module.period > 0 && module.meanCellSize > 0 && module.cellCount > 0) ||
    !Number.isInteger(n) ||
    !Number.isInteger(t) ||
    module.directions.length !== n * 3 ||
    module.cellOffsets.length !== n * 2 ||
    module.isTop.length !== t ||
    module.neighbors.length !== t * 3 ||
    module.wrapNeighbors.length !== t * 3 ||
    module.wrapOffsets.length !== t * 6
  )
    throw Error("Inconsistent cellular module arrays");
  for (const a of [module.cellIds, module.random, module.bby, module.corners, module.centroidDistance])
    if (a.length !== n) throw Error("Invalid cellular point attributes");
  if (
    module.shadingIds &&
    (module.shadingIds.length !== n || !module.shadingIds.every((v) => Number.isInteger(v) && v >= 0 && v < 0x1000000))
  )
    throw Error("Invalid baked cellular shading identities");
  for (const a of [
    module.positions,
    module.directions,
    module.cellIds,
    module.cellOffsets,
    module.random,
    module.bby,
    module.corners,
    module.wrapOffsets
  ])
    if (!a.every(Number.isFinite)) throw Error("Non-finite cellular attributes");
  for (const i of module.indices) if (i >= n) throw Error("Cellular index out of bounds");
  for (const i of module.cellIds)
    if (!Number.isInteger(i) || i < 0 || i >= module.cellCount) throw Error("Invalid cellular identity");
  return module;
}

/** Rebuild adjacency in the assembled vertex domain; -1 means outer boundary. */
export function cellularAdjacency(
  indices: Uint32Array,
  vertexCount: number
): { neighbors: Int32Array; boundaryEdges: number } {
  const neighbors = new Int32Array(indices.length).fill(-1),
    edges = new Map<number, number>();
  for (let i = 0; i < indices.length; i++) {
    const face = Math.floor(i / 3) * 3,
      a = indices[i],
      b = indices[face + (((i % 3) + 1) % 3)];
    const key = Math.min(a, b) * vertexCount + Math.max(a, b),
      other = edges.get(key);
    if (other === undefined) edges.set(key, i);
    else {
      if (other < 0) throw Error("Non-manifold cellular edge");
      const of = Math.floor(other / 3) * 3;
      if (a !== indices[of + (((other % 3) + 1) % 3)] || b !== indices[other])
        throw Error("Inconsistent cellular winding");
      neighbors[i] = Math.floor(other / 3);
      neighbors[other] = Math.floor(i / 3);
      edges.set(key, -1);
    }
  }
  let boundaryEdges = 0;
  for (const edge of edges.values()) if (edge >= 0) boundaryEdges++;
  return { neighbors, boundaryEdges };
}

type ClipPoint = {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  bby: number;
  random: number;
  corner: number;
  distance: number;
  cell: string;
};
function interpolate(a: ClipPoint, b: ClipPoint, t: number): ClipPoint {
  const result = { cell: t < 0.5 ? a.cell : b.cell } as ClipPoint;
  for (const key of ["x", "y", "z", "dx", "dy", "dz", "bby", "random", "corner", "distance"] as const)
    result[key] = a[key] + (b[key] - a[key]) * t;
  return result;
}
function clip(input: ClipPoint[], axis: "x" | "z", boundary: number, greater: boolean): ClipPoint[] {
  const output: ClipPoint[] = [];
  if (!input.length) return output;
  let a = input[input.length - 1],
    da = (a[axis] - boundary) * (greater ? 1 : -1);
  for (const b of input) {
    const db = (b[axis] - boundary) * (greater ? 1 : -1);
    if (da >= 0 !== db >= 0) {
      const p = interpolate(a, b, da / (da - db));
      p[axis] = boundary;
      output.push(p);
    }
    if (db >= 0) output.push(b);
    a = b;
    da = db;
  }
  return output;
}

/** A bounded window of the repeating master, welded before any deformation. */
export function assembleCellularModule(
  module: CellularModule,
  width: number,
  depth: number,
  cellSize: number,
  phase: readonly [number, number] = [0, 0]
): CellularTopology {
  if (![width, depth, cellSize].every((v) => Number.isFinite(v) && v > 0))
    throw Error("Invalid cellular assembly dimensions");
  const scale = cellSize / module.meanCellSize,
    p = module.period,
    w = width / (2 * scale),
    h = depth / (2 * scale);
  if (!phase.every(Number.isFinite)) throw Error("Invalid cellular tile offset");
  const minU = Math.floor((-w - phase[0]) / p),
    maxU = Math.ceil((w - phase[0]) / p) - 1,
    minV = Math.floor((-h + phase[1]) / p),
    maxV = Math.ceil((h + phase[1]) / p) - 1;
  if ((maxU - minU + 1) * (maxV - minV + 1) > 64)
    throw Error("Cellular area exceeds 64 source tiles; increase slab size");
  const positions: number[] = [],
    directions: number[] = [],
    bby: number[] = [],
    random: number[] = [],
    corners: number[] = [],
    centroidDistance: number[] = [],
    cellIds: number[] = [],
    indices: number[] = [],
    isTop: number[] = [];
  const cellMap = new Map<string, number>(),
    weld = new Map<string, number>();
  let tileCount = 0;
  function vertex(q: ClipPoint): number {
    // Include the source rest height: top and joint-bottom records are distinct.
    const key = `${Math.round(q.x * 1e6)},${Math.round(q.y * 1e6)},${Math.round(q.z * 1e6)}`;
    let id = weld.get(key);
    if (id !== undefined) return id;
    id = positions.length / 3;
    weld.set(key, id);
    let cell = cellMap.get(q.cell);
    if (cell === undefined) {
      cell = cellMap.size;
      cellMap.set(q.cell, cell);
    }
    positions.push(q.x * scale, q.y * scale, q.z * scale);
    directions.push(q.dx, q.dy, q.dz);
    bby.push(q.bby);
    random.push(q.random);
    corners.push(q.corner);
    centroidDistance.push(q.distance * scale);
    cellIds.push(cell);
    return id;
  }
  const at = (id: number, u: number, v: number): ClipPoint => ({
    x: module.positions[id * 3] + u * p + phase[0],
    y: module.positions[id * 3 + 1],
    z: module.positions[id * 3 + 2] - v * p + phase[1],
    dx: module.directions[id * 3],
    dy: module.directions[id * 3 + 1],
    dz: module.directions[id * 3 + 2],
    bby: module.bby[id],
    random: module.random[id],
    corner: module.corners[id],
    distance: module.centroidDistance[id],
    cell: module.shadingIds
      ? `${module.shadingIds[id]}:${module.cellIds[id]}:${u + module.cellOffsets[id * 2]}:${v + module.cellOffsets[id * 2 + 1]}`
      : `${module.cellIds[id]}:${u + module.cellOffsets[id * 2]}:${v + module.cellOffsets[id * 2 + 1]}`
  });
  for (let v = minV; v <= maxV; v++)
    for (let u = minU; u <= maxU; u++) {
      const before = indices.length;
      for (let t = 0; t < module.indices.length; t += 3) {
        const ai = module.indices[t],
          bi = module.indices[t + 1],
          ci = module.indices[t + 2];
        const ax = module.positions[ai * 3] + u * p + phase[0],
          bx = module.positions[bi * 3] + u * p + phase[0],
          cx = module.positions[ci * 3] + u * p + phase[0];
        const az = module.positions[ai * 3 + 2] - v * p + phase[1],
          bz = module.positions[bi * 3 + 2] - v * p + phase[1],
          cz = module.positions[ci * 3 + 2] - v * p + phase[1];
        if (
          Math.max(ax, bx, cx) < -w ||
          Math.min(ax, bx, cx) > w ||
          Math.max(az, bz, cz) < -h ||
          Math.min(az, bz, cz) > h
        )
          continue;
        let polygon = [at(ai, u, v), at(bi, u, v), at(ci, u, v)];
        for (const [axis, bound, greater] of [
          ["x", -w, true],
          ["x", w, false],
          ["z", -h, true],
          ["z", h, false]
        ] as const)
          polygon = clip(polygon, axis, bound, greater);
        for (let j = 1; j < polygon.length - 1; j++) {
          const a = polygon[0],
            b = polygon[j],
            c = polygon[j + 1];
          const ex = b.x - a.x,
            ey = b.y - a.y,
            ez = b.z - a.z,
            fx = c.x - a.x,
            fy = c.y - a.y,
            fz = c.z - a.z;
          if (Math.hypot(ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx) < 1e-10) continue;
          const ia = vertex(a),
            ib = vertex(b),
            ic = vertex(c);
          if (ia === ib || ib === ic || ic === ia) continue;
          indices.push(ia, ib, ic);
          isTop.push(module.isTop[t / 3]);
          if (indices.length > 3_000_000)
            throw Error("Cellular window exceeds one million triangles; increase slab size");
        }
      }
      if (indices.length > before) tileCount++;
    }
  const indexArray = new Uint32Array(indices),
    adjacency = cellularAdjacency(indexArray, positions.length / 3);
  return {
    positions: new Float32Array(positions),
    directions: new Float32Array(directions),
    indices: indexArray,
    bby: new Float32Array(bby),
    random: new Float32Array(random),
    corners: new Float32Array(corners),
    centroidDistance: new Float32Array(centroidDistance),
    cellIds: new Uint32Array(cellIds),
    cellKeys: [...cellMap.keys()],
    isTop: new Uint32Array(isTop),
    ...adjacency,
    tileCount,
    width,
    depth,
    scale,
    key: `${width}/${depth}/${cellSize}${phase[0] || phase[1] ? `/${phase.join()}` : ""}`
  };
}

export interface CellularDeformation {
  height: number;
  width: number;
  center: number;
  relief: number;
  inset: number;
}
/** Exact numerical port of Scene 03's analytic guide, in engine Y-up coordinates. */
export function deformCellularExample(
  position: readonly number[],
  direction: readonly number[],
  random: number,
  bby: number,
  p: CellularDeformation
): [number, number, number] {
  const inset = (random * 11 - 3) * 0.065 * p.inset,
    x = position[0] + direction[0] * inset,
    z = position[2] + direction[2] * inset;
  const u = (x - p.center) / p.width,
    phase = -z / 40,
    h = Math.atan(u) * p.height + 14.2 + Math.sin(phase) * 2;
  const gx = p.height / p.width / (1 + u * u),
    gz = -Math.cos(phase) * 0.05,
    n = Math.sqrt((1 + gx * gx) * (1 + gz * gz));
  const d = (bby * (0.3 + random * 0.3) - 0.3) * p.relief;
  return [x - (gx / n) * d, h + (1 / n) * d, z - (gz / n) * d];
}
