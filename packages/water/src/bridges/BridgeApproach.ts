import type { BridgePoint } from "./SuspensionBridge";

/** Shared by exact triangle sampling and conservative query bounds. */
export const BRIDGE_APPROACH_BARYCENTRIC_EPSILON = 1e-6;

export interface BridgeApproachMesh {
  positions: number[];
  indices: number[];
}
/** The complete structural mouth, rather than just its centre point. */
export interface BridgeApproachBoundary {
  edge: readonly [BridgePoint, BridgePoint];
  /** Inward deck height profile, used to keep dry-bank fill below the timber. */
  deckSlope: number;
  deckCurvature: number;
  /** Existing terrain-cell diagonal; keeps the full entrance supported after rasterization. */
  terrainCellM: number;
}
export interface CompiledBridgeApproach {
  /** Terrain-only landing envelopes; never uploaded as a render mesh. */
  landings?: (BridgeApproachBoundary & { inward: { x: number; z: number } })[];

  /** Odd row size keeps the published centre line as an exact vertex. */
  rowSize: number;
  surface: BridgeApproachMesh;
  grading: BridgeApproachMesh;
  /** Lane = 1, untouched soil = 0; used to combine intersecting shoulders continuously. */
  gradingWeights: number[];
}
const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const distance = (a: Pick<BridgePoint, "x" | "z">, b: Pick<BridgePoint, "x" | "z">) => Math.hypot(b.x - a.x, b.z - a.z);
const upArea = (a: Pick<BridgePoint, "x" | "z">, b: Pick<BridgePoint, "x" | "z">, c: Pick<BridgePoint, "x" | "z">) =>
  (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);

/** Trim inside offset loops to their exact intersection, retaining the outer road
 * footprint. Repeated intersection vertices form a fan instead of folded strips. */
function trimApproachSections(sections: BridgePoint[][]): Set<number>[] {
  const size = sections[0]?.length ?? 0,
    center = (size - 1) / 2;
  const collapsed = [new Set<number>(), new Set<number>()];
  for (const [which, side] of [0, size - 1].entries()) {
    for (let round = 0; round < sections.length; round++) {
      let found = false;
      for (let i = 0; i + 1 < sections.length && !found; i++)
        for (let j = i + 2; j + 1 < sections.length; j++) {
          const a = sections[i][side],
            b = sections[i + 1][side],
            c = sections[j][side],
            d = sections[j + 1][side];
          const dx = b.x - a.x,
            dz = b.z - a.z,
            ex = d.x - c.x,
            ez = d.z - c.z,
            det = dx * ez - dz * ex;
          if (Math.abs(det) < 1e-10) continue;
          const t = ((c.x - a.x) * ez - (c.z - a.z) * ex) / det,
            u = ((c.x - a.x) * dz - (c.z - a.z) * dx) / det;
          if (t <= 1e-7 || t >= 1 - 1e-7 || u <= 1e-7 || u >= 1 - 1e-7) continue;
          const point = { x: a.x + dx * t, z: a.z + dz * t, y: (a.y + (b.y - a.y) * t + c.y + (d.y - c.y) * u) / 2 };
          for (let row = i + 1; row <= j; row++) {
            const p = sections[row][center];
            for (let k = Math.min(side, center); k <= Math.max(side, center); k++) {
              const v = Math.abs(k - center) / center;
              sections[row][k] = {
                x: p.x + (point.x - p.x) * v,
                y: p.y + (point.y - p.y) * v,
                z: p.z + (point.z - p.z) * v
              };
            }
            collapsed[which].add(row);
          }
          found = true;
          break;
        }
      if (!found) break;
    }
  }
  return collapsed;
}

/** One supported lane and one non-overlapping shoulder/runout mesh, all in world metres. */
export function compileBridgeApproach(
  path: readonly BridgePoint[],
  width: number | readonly number[],
  ground: (point: { x: number; z: number }) => number,
  flatEnds: { start?: boolean | BridgeApproachBoundary; end?: boolean | BridgeApproachBoundary } = {},
  acceptsGrading: (footprint: readonly { x: number; z: number }[]) => boolean = () => true
): CompiledBridgeApproach {
  const surface: BridgeApproachMesh = { positions: [], indices: [] };
  const maxWidth = typeof width === "number" ? width : Math.max(...width);
  const rowSize = Math.max(3, Math.ceil(maxWidth / 0.8) * 2 + 1);
  const arcs = [0];
  for (let i = 1; i < path.length; i++) arcs.push(arcs[i - 1] + distance(path[i - 1], path[i]));
  const total = arcs.at(-1)!,
    transitionLength = Math.max(0.001, Math.min(Math.max(2, maxWidth), total));
  const tangentWindow = Math.min(total / 3, Math.max(0.25, maxWidth * 0.25));
  const along = (arc: number) => {
    if (path.length < 2) return path[0];
    let j = 1;
    while (j + 1 < arcs.length && arcs[j] < arc) j++;
    const a = path[j - 1],
      b = path[j],
      t = Math.max(0, Math.min(1, (arc - arcs[j - 1]) / (arcs[j] - arcs[j - 1] || 1)));
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t };
  };
  const landBlend = (p: BridgePoint | undefined, flat?: boolean | BridgeApproachBoundary) =>
    !p || flat ? 0 : 1 - smooth(Math.abs(p.y - ground(p)) / 0.75);
  const startLand = landBlend(path[0], flatEnds.start),
    endLand = landBlend(path.at(-1), flatEnds.end);
  const boundaries = (
    [
      ["start", 0],
      ["end", path.length - 1]
    ] as const
  ).flatMap(([key, index]) => {
    const boundary = flatEnds[key];
    if (!boundary || typeof boundary === "boolean") return [];
    const [a, b] = boundary.edge,
      size = distance(a, b);
    if (size <= 1e-8) throw new Error("Bridge approach mouth has zero width");
    const nx = (b.x - a.x) / size,
      nz = (b.z - a.z) / size;
    const neighbor = path[index === 0 ? 1 : index - 1];
    // The inward normal always points from land into the bridge.
    let dx = -nz,
      dz = nx;
    if ((neighbor.x - path[index].x) * dx + (neighbor.z - path[index].z) * dz > 0) {
      dx = -dx;
      dz = -dz;
    }
    return [{ ...boundary, index, size, nx, nz, dx, dz, center: path[index] }];
  });
  const landward = (p: BridgePoint) => {
    for (const b of boundaries) {
      const intrusion = (p.x - b.center.x) * b.dx + (p.z - b.center.z) * b.dz;
      if (intrusion > 0) {
        p.x -= intrusion * b.dx;
        p.z -= intrusion * b.dz;
        const [a, c] = b.edge;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * b.nx + (p.z - a.z) * b.nz) / b.size));
        p.y = a.y + (c.y - a.y) * t;
      }
    }
    return p;
  };
  const normals: { x: number; z: number }[] = [],
    sections: BridgePoint[][] = [];
  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    // Use a metre-based tangent stencil. An arbitrarily short final sample must
    // not rotate a full-width landing abruptly and fold its last cross-section.
    const before = along(Math.max(0, arcs[i] - tangentWindow)),
      after = along(Math.min(total, arcs[i] + tangentWindow));
    const rowWidth = typeof width === "number" ? width : width[i];
    const length = distance(before, after) || 1;
    const nx = -(after.z - before.z) / length,
      nz = (after.x - before.x) / length;
    // Crossfall is a boundary condition, not a function of local cut/fill depth. Turning it
    // on every time the centre happens to touch natural soil creates bumps inside a ramp.
    const feather = Math.max(
      Math.min(startLand, endLand),
      startLand * (1 - smooth(arcs[i] / transitionLength)),
      endLand * (1 - smooth((total - arcs[i]) / transitionLength))
    );
    const floor = ground(point);
    const row = Array.from({ length: rowSize }, (_, side) => {
      const offset = (side / (rowSize - 1) - 0.5) * rowWidth;
      const x = point.x + nx * offset,
        z = point.z + nz * offset;
      // Preserve centre height exactly; gradually inherit the bank's crossfall towards the landing.
      return landward({ x, z, y: point.y + (ground({ x, z }) - floor) * feather });
    });
    const mouth = boundaries.find((b) => b.index === i);
    if (mouth) {
      const [a, b] = nx * mouth.nx + nz * mouth.nz < 0 ? [...mouth.edge].reverse() : mouth.edge;
      for (let k = 0; k < rowSize; k++) {
        const t = k / (rowSize - 1);
        row[k] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      }
    }
    sections.push(row);
    const first = row[0],
      last = row.at(-1)!,
      across = distance(first, last) || 1;
    normals.push(mouth ? { x: (last.x - first.x) / across, z: (last.z - first.z) / across } : { x: nx, z: nz });
  }
  const collapsed = trimApproachSections(sections);
  // Trimming never changes terminal rows. Validate the actual adjusted lane against
  // the same water/obstacle predicate already used by its earthwork.
  if (boundaries.length)
    for (let i = 1; i < sections.length; i++) {
      for (let k = 1; k < rowSize; k++) {
        if (
          !acceptsGrading([sections[i - 1][k - 1], sections[i - 1][k], sections[i][k]]) ||
          !acceptsGrading([sections[i - 1][k - 1], sections[i][k], sections[i][k - 1]])
        )
          throw new Error("Bridge approach mouth intersects water or an obstacle");
      }
    }
  for (let i = 0; i < sections.length; i++) {
    const row = sections[i];
    surface.positions.push(...row.flatMap((p) => [p.x, p.y, p.z]));
    if (i)
      for (let side = 0; side < rowSize - 1; side++) {
        const a = (i - 1) * rowSize + side,
          b = i * rowSize + side;
        surface.indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }
  const grading: BridgeApproachMesh = { positions: surface.positions.slice(), indices: surface.indices.slice() };
  const gradingWeights = sections.flatMap((row) => row.map(() => 1));
  type Sample = BridgePoint & { weight: number };
  const quad = (points: Sample[]) => {
    const offset = grading.positions.length / 3;
    grading.positions.push(...points.flatMap((p) => [p.x, p.y, p.z]));
    gradingWeights.push(...points.map((p) => p.weight));
    grading.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  };
  const endSections: Sample[][] = sections.map((row) => row.map((p) => ({ ...p, weight: 1 })));
  for (const side of [0, rowSize - 1]) {
    const sign = side === 0 ? -1 : 1,
      inner = side - sign;
    const toes = sections.map((row) => Math.max(1.25, maxWidth * 0.4) + Math.abs(row[side].y - ground(row[side])) * 3);
    for (let i = 1; i + 1 < path.length; i++) {
      if (collapsed[side === 0 ? 0 : 1].has(i)) continue;
      const a = path[i - 1],
        b = path[i],
        c = path[i + 1];
      const turn = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      if (turn * sign <= 1e-9) continue;
      const radius = (distance(a, b) * distance(b, c) * distance(a, c)) / (2 * Math.abs(turn));
      const halfWidth = distance(sections[i][0], sections[i].at(-1)!) / 2;
      // Inside a bend, unconstrained offset rows cross at the curvature centre and
      // produce folded earthwork triangles. Keep the shoulder before that singularity.
      toes[i] = Math.min(toes[i], Math.max(0.015, radius * 0.85 - halfWidth));
    }
    const boundary = (j: number) =>
      landward({
        x: sections[j][side].x + normals[j].x * sign * toes[j],
        y: sections[j][side].y,
        z: sections[j][side].z + normals[j].z * sign * toes[j]
      });
    for (let i = 1; i < sections.length; i++) {
      const footprint = () => {
        const polygon =
          side === 0
            ? [sections[i - 1][side], sections[i][side], boundary(i), boundary(i - 1)]
            : [sections[i][side], sections[i - 1][side], boundary(i - 1), boundary(i)];
        if (distance(polygon[0], polygon[1]) < 1e-7 && upArea(polygon[0], polygon[2], polygon[3]) < 0)
          polygon.reverse();
        return polygon;
      };
      const convex = () => {
        const polygon = footprint();
        return polygon.every((p, j) => upArea(p, polygon[(j + 1) % 4], polygon[(j + 2) % 4]) >= -1e-9);
      };
      while (Math.max(toes[i - 1], toes[i]) > 0.00001 && (!convex() || !acceptsGrading(footprint()))) {
        toes[i - 1] *= 0.75;
        toes[i] *= 0.75;
      }
    }
    // Spread a constrained toe along the road instead of pinching a single row into a spike.
    for (let i = 1; i < toes.length; i++)
      toes[i] = Math.min(toes[i], toes[i - 1] + distance(path[i - 1], path[i]) * 0.75);
    for (let i = toes.length - 2; i >= 0; i--)
      toes[i] = Math.min(toes[i], toes[i + 1] + distance(path[i], path[i + 1]) * 0.75);
    const bands = Math.max(6, Math.ceil(Math.max(...toes, 0) / 0.35));
    const outer = (j: number, u: number): Sample => {
      const p = sections[j][side],
        q = sections[j][inner],
        run = toes[j] * u;
      const { x, z } = landward({ x: p.x + normals[j].x * sign * run, y: p.y, z: p.z + normals[j].z * sign * run });
      const slope = (p.y - q.y) / (distance(p, q) || 1);
      // The bridge mouth has no continuing road outside its width. Round its
      // earthwork back into the bank instead of leaving two square lateral wings.
      const mouth = Math.max(
        flatEnds.start ? 1 - smooth(arcs[j] / transitionLength) : 0,
        flatEnds.end ? 1 - smooth((total - arcs[j]) / transitionLength) : 0
      );
      const weight = (1 - smooth(u)) * (1 - mouth * smooth(u));
      // Blend the lane's tangent plane into the actual terrain, matching slopes at BOTH boundaries.
      const floor = ground({ x, z });
      return { x, z, y: floor + (p.y + slope * run - floor) * weight, weight };
    };
    for (let j = 0; j < sections.length; j++) {
      const shoulder = Array.from({ length: bands }, (_, k) => outer(j, (k + 1) / bands));
      if (side === 0) endSections[j].unshift(...shoulder.reverse());
      else endSections[j].push(...shoulder);
    }
    for (let i = 1; i < sections.length; i++)
      for (let step = 0; step < bands; step++) {
        const u = step / bands,
          v = (step + 1) / bands;
        const polygon =
          side === 0
            ? [outer(i - 1, u), outer(i, u), outer(i, v), outer(i - 1, v)]
            : [outer(i, u), outer(i - 1, u), outer(i - 1, v), outer(i, v)];
        // A trimmed concave corner has a shared pivot. Its radial shoulder fan
        // has the opposite strip orientation, but occupies valid non-folded soil.
        if (
          distance(sections[i - 1][side], sections[i][side]) < 1e-7 &&
          upArea(polygon[0], polygon[1], polygon[2]) + upArea(polygon[0], polygon[2], polygon[3]) < 0
        )
          polygon.reverse();
        quad(polygon);
      }
  }
  // Each cross-section vertex has its own available dry runout. A single strip mesh closes
  // the whole lane and shoulders; overlapping wide/narrow caps previously left visible ridges.
  if (path.length > 1)
    for (const end of [0, path.length - 1]) {
      const mouth = boundaries.find((b) => b.index === end);
      const neighbor = end === 0 ? 1 : end - 1,
        length = distance(path[end], path[neighbor]) || 1;
      const dx = mouth?.dx ?? (path[end].x - path[neighbor].x) / length,
        dz = mouth?.dz ?? (path[end].z - path[neighbor].z) / length;
      const edge = endSections[end],
        prior = endSections[neighbor];
      const slopes = edge.map((p, i) => {
        const a = edge[Math.max(0, i - 1)],
          b = edge[Math.min(edge.length - 1, i + 1)],
          q = prior[i];
        const ux = b.x - a.x,
          uz = b.z - a.z,
          vx = p.x - q.x,
          vz = p.z - q.z,
          uy = b.y - a.y,
          vy = p.y - q.y,
          det = ux * vz - uz * vx;
        // Fit the actual local plane. A metre-based end tangent need not be exactly
        // perpendicular to the last segment; axis-only crossfall subtraction then
        // invents earthwork even on a perfectly fitting affine bank.
        return Math.abs(det) > 1e-9
          ? ((uy * vz - vy * uz) * dx + (ux * vy - vx * uy) * dz) / det
          : (ground({ x: p.x + dx * 0.05, z: p.z + dz * 0.05 }) - ground({ x: p.x - dx * 0.05, z: p.z - dz * 0.05 })) /
              0.1;
      });
      const runs = edge.map((p) => 1.25 + Math.abs(p.y - ground(p)) * 3);
      const toe = (i: number) => ({ x: edge[i].x + dx * runs[i], z: edge[i].z + dz * runs[i] });
      for (let i = 1; i < edge.length; i++) {
        while (Math.max(runs[i - 1], runs[i]) > 0.015 && !acceptsGrading([edge[i - 1], edge[i], toe(i), toe(i - 1)])) {
          runs[i - 1] *= 0.75;
          runs[i] *= 0.75;
        }
      }
      // Constraint clipping must form one continuous runout envelope. Independent
      // columns scallop against an oblique river bank and make isolated earthwork fins.
      // Only shorten runs, so the accepted dry-land footprint never grows.
      for (let i = 1; i < runs.length; i++)
        runs[i] = Math.min(runs[i], runs[i - 1] + distance(edge[i - 1], edge[i]) * 0.5);
      for (let i = runs.length - 2; i >= 0; i--)
        runs[i] = Math.min(runs[i], runs[i + 1] + distance(edge[i], edge[i + 1]) * 0.5);
      const bands = Math.max(6, Math.ceil(Math.max(...runs) / 0.35));
      const at = (i: number, u: number): Sample => {
        const p = edge[i],
          run = runs[i] * u,
          x = p.x + dx * run,
          z = p.z + dz * run;
        const floor = ground({ x, z }),
          weight = 1 - smooth(u),
          slope = slopes[i];
        const bridgeEnd = end === 0 ? flatEnds.start : flatEnds.end;
        // The structural bridge edge is not a road continuation: extrapolating an uphill
        // tangent under its sagging deck would bury planks and alter walking support.
        const deckDisplacement = p.y - (mouth ? floor : ground(p));
        // The end cap must retain the shoulder's spatial influence as well as its
        // height. Otherwise a plane fitted beside an untouched outer vertex can
        // extrapolate a tiny ridge along a column whose declared influence is zero.
        const tangentDisplacement = deckDisplacement + (ground(p) + slope * run - floor) * smooth(p.weight / 0.15);
        // Outside the structural lane keep the shoulder's longitudinal tangent. Using
        // the terrain tangent at the whole bridge end creates a ridge across the bank.
        // Fade back to the deck-safe runout under the planks, where weight is one.
        const shoulderTangent = smooth((1 - p.weight) / 0.15);
        const displacement = bridgeEnd
          ? deckDisplacement * (1 - shoulderTangent) + tangentDisplacement * shoulderTangent
          : tangentDisplacement;
        const fill = floor + displacement * weight;
        const deckCeiling = mouth
          ? mouth.center.y + mouth.deckSlope * run + mouth.deckCurvature * run * run - 0.04
          : Infinity;
        return { x, z, y: Math.min(fill, deckCeiling), weight: p.weight * weight };
      };
      for (let step = 0; step < bands; step++)
        for (let side = 0; side < edge.length - 1; side++) {
          const a = at(side, step / bands),
            b = at(side + 1, step / bands),
            c = at(side, (step + 1) / bands),
            d = at(side + 1, (step + 1) / bands);
          quad(end === 0 ? [b, a, c, d] : [a, b, d, c]);
        }
    }
  for (const b of boundaries) {
    const reach = b.terrainCellM * 1.5,
      half = b.size / 2 + reach;
    const footprint = [
      [-half, -reach],
      [half, -reach],
      [half, reach],
      [-half, reach]
    ].map(([x, z]) => ({ x: b.center.x + b.nx * x + b.dx * z, z: b.center.z + b.nz * x + b.dz * z }));
    if (!acceptsGrading(footprint)) throw new Error("Bridge terrain landing intersects water or an obstacle");
  }
  return {
    landings: boundaries.map((b) => ({
      edge: b.edge,
      deckSlope: b.deckSlope,
      deckCurvature: b.deckCurvature,
      terrainCellM: b.terrainCellM,
      inward: { x: b.dx, z: b.dz }
    })),
    rowSize,
    surface,
    grading,
    gradingWeights
  };
}

/** Barycentric height on the exact top triangles, including the bank's transverse slope at a landing. */
export function bridgeApproachHeight(
  approach: CompiledBridgeApproach,
  point: { x: number; z: number }
): number | undefined {
  return bridgeApproachMeshHeight(approach.surface, point);
}

export function bridgeApproachMeshHeight(
  mesh: BridgeApproachMesh,
  point: { x: number; z: number }
): number | undefined {
  const { positions, indices } = mesh;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    const ax = positions[a],
      az = positions[a + 2],
      bx = positions[b],
      bz = positions[b + 2],
      cx = positions[c],
      cz = positions[c + 2];
    const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(determinant) < 1e-10) continue;
    const u = ((bz - cz) * (point.x - cx) + (cx - bx) * (point.z - cz)) / determinant;
    const v = ((cz - az) * (point.x - cx) + (ax - cx) * (point.z - cz)) / determinant;
    if (
      u >= -BRIDGE_APPROACH_BARYCENTRIC_EPSILON &&
      v >= -BRIDGE_APPROACH_BARYCENTRIC_EPSILON &&
      u + v <= 1 + BRIDGE_APPROACH_BARYCENTRIC_EPSILON
    )
      return u * positions[a + 1] + v * positions[b + 1] + (1 - u - v) * positions[c + 1];
  }
  return undefined;
}

/** Spatially indexed support. Shoulder intersections use continuous influence weights, never a cut/fill winner switch. */
export function bridgeApproachGradingSampler(
  approaches: readonly { approach?: CompiledBridgeApproach }[],
  natural?: (p: { x: number; z: number }) => number
): (p: { x: number; z: number }) => number | undefined {
  type Triangle = { mesh: BridgeApproachMesh; influence: BridgeApproachMesh; lane: boolean };
  const cells = new Map<string, Map<number, Triangle[]>>(),
    cellSize = 1;
  approaches.forEach(({ approach }, owner) => {
    if (!approach?.grading) return;
    const { positions, indices } = approach.grading;
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = indices.slice(i, i + 3),
        xyz = vertices.flatMap((j) => positions.slice(j * 3, j * 3 + 3));
      const triangle = {
        mesh: { positions: xyz, indices: [0, 1, 2] },
        influence: {
          positions: vertices.flatMap((j) => [positions[j * 3], approach.gradingWeights[j], positions[j * 3 + 2]]),
          indices: [0, 1, 2]
        },
        lane: i < approach.surface.indices.length
      };
      const xs = [xyz[0], xyz[3], xyz[6]],
        zs = [xyz[2], xyz[5], xyz[8]];
      for (let z = Math.floor(Math.min(...zs) / cellSize); z <= Math.floor(Math.max(...zs) / cellSize); z++)
        for (let x = Math.floor(Math.min(...xs) / cellSize); x <= Math.floor(Math.max(...xs) / cellSize); x++) {
          const key = `${x}:${z}`,
            bucket = cells.get(key) ?? new Map<number, Triangle[]>();
          const list = bucket.get(owner) ?? [];
          list.push(triangle);
          bucket.set(owner, list);
          cells.set(key, bucket);
        }
    }
  });
  return (p) => {
    const bucket = cells.get(`${Math.floor(p.x / cellSize)}:${Math.floor(p.z / cellSize)}`);
    if (!bucket) return undefined;
    let lane: number | undefined,
      sum = 0,
      total = 0,
      fallback: number | undefined;
    for (const triangles of bucket.values())
      for (const triangle of triangles) {
        const y = bridgeApproachMeshHeight(triangle.mesh, p);
        if (y === undefined) continue;
        if (triangle.lane) lane = Math.max(lane ?? -Infinity, y);
        else {
          const influence = Math.max(0, Math.min(1, bridgeApproachMeshHeight(triangle.influence, p)!));
          const weight = influence / Math.max(1e-9, 1 - influence);
          sum += y * weight;
          total += weight;
          fallback = y;
        }
        break; // A shared triangle edge must not count twice, nor may tessellation density bias a blend.
      }
    return lane ?? (total > 1e-9 ? sum / total : fallback === undefined ? undefined : (natural?.(p) ?? fallback));
  };
}
