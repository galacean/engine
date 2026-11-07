import { openRecesses } from "./open-recesses.js";

const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Reconstruct one connected surface from the authored masses. Narrow recesses
 * are filled by a metric slope bound before triangulation, not hidden by normals.
 * @param {object} source Body, envelope and crown functions in authoring metres.
 * @param {object} parameters Validated shape controls.
 * @returns Closed indexed surface and measured geometric diagnostics.
 */
export function buildBoundedRockSurface(source, parameters) {
  const pointedBottom = parameters.bottomScale === 0;
  const metric = source.metric || [1, 1, 1],
    sectionScale = source.sectionScale || ((t) => mix(parameters.bottomScale, parameters.topScale, t));
  const horizontalAspect = Math.max(metric[0], metric[2]) / Math.min(metric[0], metric[2]);
  const columns = Math.max(Math.round(parameters.resolution / 4) * 8, Math.ceil(2 * Math.sqrt(horizontalAspect)) * 8);
  const rows = Math.round(parameters.resolution * 0.75);
  const count = columns * (rows + 1),
    envelope = new Float64Array(columns);
  const recess = new Float64Array(count),
    angles = [];
  const minimumDepth = new Float64Array(count);
  const wallHeights = new Float64Array(columns);
  // At most 0.58m of depth per metre along either surface direction. A narrow
  // gap cannot retain the old 0.5m depth and near-vertical opposing walls.
  const slopeLimit = 0.58;
  function radialRoot(field, c, s, maximum) {
    let outer = maximum,
      inner = 0;
    for (let step = 1; step <= 48; step++) {
      const radius = maximum * (1 - step / 48);
      if (field(radius * c, radius * s) <= 0) {
        inner = radius;
        break;
      }
      outer = radius;
    }
    for (let iteration = 0; iteration < 14; iteration++) {
      const radius = (inner + outer) / 2;
      if (field(radius * c, radius * s) <= 0) inner = radius;
      else outer = radius;
    }
    return inner;
  }
  for (let i = 0; i < columns; i++) {
    const angle = (i * TAU) / columns,
      c = Math.cos(angle),
      s = Math.sin(angle);
    angles.push([c, s]);
    envelope[i] = radialRoot(source.envelope, c, s, 3.1);
  }
  // A safe authoring-space corner can become a sharp V after an 80:1 metric
  // stretch. Relax only those radial samples toward their neighboring chord;
  // the chord stays in the OBB and leaves already-safe outline faces intact.
  let metricOutlineCorrections = 0;
  for (let pass = 0; pass < 2000; pass++) {
    let changed = false;
    const before = envelope.slice();
    for (let i = 0; i < columns; i++) {
      const previous = (i + columns - 1) % columns,
        next = (i + 1) % columns;
      const a = [before[previous] * angles[previous][0], before[previous] * angles[previous][1]],
        b = [before[i] * angles[i][0], before[i] * angles[i][1]],
        c = [before[next] * angles[next][0], before[next] * angles[next][1]];
      const u = [(b[0] - a[0]) * metric[0], (b[1] - a[1]) * metric[2]],
        v = [(c[0] - b[0]) * metric[0], (c[1] - b[1]) * metric[2]];
      if ((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)) >= Math.cos((80 * Math.PI) / 180))
        continue;
      const dx = c[0] - a[0],
        dz = c[1] - a[1],
        chordRadius = (a[0] * dz - a[1] * dx) / (angles[i][0] * dz - angles[i][1] * dx);
      envelope[i] = mix(before[i], chordRadius, 0.4);
      metricOutlineCorrections++;
      changed = true;
    }
    if (!changed) break;
  }
  for (let i = 0; i < columns; i++) {
    let lowRoof = 2.1;
    for (let j = 0; j <= 32; j++) {
      const radius = (envelope[i] * parameters.topScale * j) / 32;
      lowRoof = Math.min(lowRoof, source.crown(radius * angles[i][0], radius * angles[i][1]));
    }
    wallHeights[i] = lowRoof + 2.1 - 0.05 * parameters.topRoughness;
  }
  const arcStep = Array.from(envelope, (r, i) => {
    const next = (i + 1) % columns;
    return Math.hypot(
      r * angles[i][0] - envelope[next] * angles[next][0],
      r * angles[i][1] - envelope[next] * angles[next][1]
    );
  });
  const perimeter = arcStep.reduce((sum, step) => sum + step, 0);
  const radialMetric = angles.map(([c, s]) => Math.hypot(c * metric[0], s * metric[2]));
  const metricArcStep = Array.from(envelope, (r, i) => {
    const next = (i + 1) % columns;
    return Math.hypot(
      (r * angles[i][0] - envelope[next] * angles[next][0]) * metric[0],
      (r * angles[i][1] - envelope[next] * angles[next][1]) * metric[2]
    );
  });
  const wall = source.compose(perimeter);
  let u = 0;
  for (let i = 0; i < columns; i++) {
    const previous = (i + columns - 1) % columns,
      next = (i + 1) % columns;
    const dx = envelope[next] * angles[next][0] - envelope[previous] * angles[previous][0];
    const dz = envelope[next] * angles[next][1] - envelope[previous] * angles[previous][1];
    const projection = Math.max(0.35, (dz * angles[i][0] - dx * angles[i][1]) / Math.hypot(dx, dz));
    for (let j = 0; j <= rows; j++) {
      const t = j / rows,
        scale = sectionScale(t);
      // Convert normal-direction cuts into radial offsets. Flat envelope faces
      // stay flat instead of becoming cylindrical pillows under displacement.
      const base = envelope[i] * scale,
        maximum = 2.1 / Math.max(Math.abs(angles[i][0]), Math.abs(angles[i][1]));
      const cut = Math.min(envelope[i] * 0.65, wall.depth(u, -2.1 + 4.2 * t) / projection) * scale;
      // The budget starts at the carved face. A full-size OBB still has room
      // above its cuts; measuring from the uncut envelope silently disabled it.
      const available = Math.max(0, maximum - base + cut),
        requested = ((wall.relief?.(u, -2.1 + 4.2 * t) || 0) * scale) / projection;
      const relief = available > 1e-10 ? -available * Math.expm1(-requested / available) : 0;
      minimumDepth[j * columns + i] = base - maximum;
      recess[j * columns + i] = cut - relief;
    }
    u += arcStep[i];
  }
  // Discrete infimum of recess(q) + L * surfaceDistance(p,q). Only recesses
  // decrease: broad faces survive, deep narrow notches grow a supporting ramp.
  function constrainDepth() {
    for (let pass = 0; pass < 12; pass++) {
      let change = 0;
      for (const direction of [1, -1])
        for (let jj = 0; jj <= rows; jj++) {
          const j = direction > 0 ? jj : rows - jj;
          for (let ii = 0; ii < columns; ii++) {
            const i = direction > 0 ? ii : columns - 1 - ii,
              k = j * columns + i;
            const left = (i + columns - 1) % columns,
              right = (i + 1) % columns;
            const scale = sectionScale(j / rows);
            const heightStep = (wallHeights[i] * metric[1]) / (rows * radialMetric[i]);
            let value = Math.min(
              recess[k],
              recess[j * columns + left] +
                (slopeLimit * metricArcStep[left] * scale) / Math.max(radialMetric[i], radialMetric[left]),
              recess[j * columns + right] +
                (slopeLimit * metricArcStep[i] * scale) / Math.max(radialMetric[i], radialMetric[right])
            );
            if (j) value = Math.min(value, recess[k - columns] + slopeLimit * heightStep);
            if (j < rows) value = Math.min(value, recess[k + columns] + slopeLimit * heightStep);
            value = pointedBottom && j === 0 ? 0 : Math.max(minimumDepth[k], value);
            change = Math.max(change, recess[k] - value);
            recess[k] = value;
          }
        }
      if (change < 1e-7) break;
    }
  }
  constrainDepth();
  // Filter only the joins of the limiting ramps, never the whole rock envelope.
  for (let pass = 0; pass < 1; pass++) {
    const before = recess.slice();
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i < columns; i++) {
        const k = j * columns + i;
        recess[k] =
          0.6 * before[k] +
          0.1 *
            (before[j * columns + ((i + 1) % columns)] +
              before[j * columns + ((i + columns - 1) % columns)] +
              before[Math.max(0, j - 1) * columns + i] +
              before[Math.min(rows, j + 1) * columns + i]);
      }
  }
  constrainDepth();
  let depthShift = 0;
  for (const depth of recess) depthShift = Math.max(depthShift, -depth);
  if (depthShift) for (let i = 0; i < count; i++) recess[i] += depthShift;
  const openedRecesses = openRecesses(recess, columns, rows);
  for (let i = 0; i < count; i++) recess[i] = Math.max(minimumDepth[i], recess[i] - depthShift);
  // Interpolate displacement as a fraction of its continuous radial budget.
  // Linear interpolation of metre offsets would overshoot the OBB wherever
  // the curved body profile lies above the chord between two sampled rows.
  const relativeRecess = new Float64Array(count);
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i < columns; i++) {
      const k = j * columns + i,
        scale = sectionScale(j / rows),
        budget = recess[k] < 0 ? -minimumDepth[k] : scale;
      relativeRecess[k] = budget > 1e-12 ? recess[k] / budget : 0;
    }
  const bottomRadius = [],
    topRadius = [],
    roof = [],
    bottomBevel = [],
    topBevel = [];
  for (let i = 0; i < columns; i++) {
    bottomRadius[i] = envelope[i] * parameters.bottomScale - recess[i];
    topRadius[i] = envelope[i] * parameters.topScale - recess[rows * columns + i];
    roof[i] = 2.1;
    bottomBevel[i] = Math.min(
      (0.18 * parameters.bottomScale * Math.min(radialMetric[i], metric[1])) / radialMetric[i],
      bottomRadius[i] * 0.15
    );
    topBevel[i] = Math.min(
      0.18 * parameters.topScale * Math.min(radialMetric[i], metric[1]),
      topRadius[i] * 0.15 * radialMetric[i]
    );
  }
  const positions = [],
    indices = [],
    surfaceRoles = [],
    heightWeights = [];
  const addRing = (fn, role = 0) => {
    for (let i = 0; i < columns; i++) {
      const [radius, y] = fn(i),
        x = radius * angles[i][0],
        z = radius * angles[i][1];
      // This positive-Jacobian height map keeps every side/bevel point below
      // its own roof, even when an outward wall passes under a steep crown.
      const height = source.crown(x, z) + 2.1;
      positions.push(x, -2.1 + ((y + 2.1) / 4.2) * height, z);
      surfaceRoles.push(role);
      heightWeights.push((y + 2.1) / 4.2);
    }
  };
  const side = (i, t) => {
    const row = t * rows,
      lo = Math.min(rows - 1, Math.floor(row));
    const relative = mix(relativeRecess[lo * columns + i], relativeRecess[(lo + 1) * columns + i], row - lo),
      scale = sectionScale(t),
      base = envelope[i] * scale,
      maximum = 2.1 / Math.max(Math.abs(angles[i][0]), Math.abs(angles[i][1])),
      depth = relative * (relative < 0 ? Math.max(0, maximum - base) : scale);
    return [base - depth, mix(-2.1, roof[i], t)];
  };
  const metricPoint = (p, i) => [
    p[0] * radialMetric[i],
    (-2.1 + ((p[1] + 2.1) / 4.2) * (source.crown(p[0] * angles[i][0], p[0] * angles[i][1]) + 2.1)) * metric[1]
  ];
  const distance = (a, b, i) => {
    const A = metricPoint(a, i),
      B = metricPoint(b, i);
    return Math.hypot(A[0] - B[0], A[1] - B[1]);
  };
  const cornerTurn = (a, b, c, i) => {
    const A = metricPoint(a, i),
      B = metricPoint(b, i),
      C = metricPoint(c, i),
      u = [B[0] - A[0], B[1] - A[1]],
      v = [C[0] - B[0], C[1] - B[1]];
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)))));
  };
  const lowerLimit = parameters.shoulderHeight * 0.85,
    upperLimit = parameters.shoulderHeight + (1 - parameters.shoulderHeight) * 0.15;
  function bottomCorner(i, length) {
    const b = [bottomRadius[i], -2.1];
    let lo = 0,
      hi = lowerLimit;
    for (let n = 0; n < 24; n++) {
      const t = (lo + hi) / 2;
      if (distance(side(i, t), b, i) < length) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2,
      a = [bottomRadius[i] - length / radialMetric[i], -2.1],
      c = side(i, t);
    const turn = cornerTurn(a, b, c, i);
    return { a, b, c, t, turn };
  }
  const bottoms = bottomRadius.map((radius, i) => {
    if (pointedBottom) return { a: [0, -2.1], b: [0, -2.1], c: [0, -2.1], t: 0, turn: 0 };
    const available = Math.min(radius * 0.65 * radialMetric[i], distance(side(i, lowerLimit), [radius, -2.1], i));
    let length = bottomBevel[i] * radialMetric[i];
    for (let n = 0; n < 6; n++) {
      const corner = bottomCorner(i, length);
      length = Math.min(
        available,
        Math.max(
          length,
          0.02 * parameters.bottomScale * Math.min(radialMetric[i], metric[1]) * Math.tan(corner.turn / 2)
        )
      );
    }
    return bottomCorner(i, length);
  });
  const bottomT = (i) => bottoms[i].t;
  const tops = [];
  const roofPoint = (i, inset) => {
    const radius = topRadius[i] - inset;
    return [radius, 2.1];
  };
  function topCorner(i, length) {
    const b = [topRadius[i], roof[i]];
    let lo = Math.max(0.4, upperLimit),
      hi = 1;
    for (let n = 0; n < 24; n++) {
      const mid = (lo + hi) / 2;
      if (distance(side(i, mid), b, i) > length) lo = mid;
      else hi = mid;
    }
    const t = (lo + hi) / 2,
      a = side(i, t);
    lo = 0;
    hi = topRadius[i] * 0.65;
    for (let n = 0; n < 24; n++) {
      const mid = (lo + hi) / 2;
      if (distance(roofPoint(i, mid), b, i) < length) lo = mid;
      else hi = mid;
    }
    const c = roofPoint(i, (lo + hi) / 2),
      turn = cornerTurn(a, b, c, i);
    return { a, b, c, t, turn };
  }
  const cutbacks = [];
  for (let i = 0; i < columns; i++) {
    const available = Math.min(
      distance(side(i, Math.max(0.4, upperLimit)), [topRadius[i], roof[i]], i),
      distance(roofPoint(i, topRadius[i] * 0.65), [topRadius[i], roof[i]], i)
    );
    let length = topBevel[i];
    for (let n = 0; n < 6; n++) {
      const corner = topCorner(i, length);
      length = Math.min(
        available,
        Math.max(length, 0.02 * parameters.topScale * Math.min(radialMetric[i], metric[1]) * Math.tan(corner.turn / 2))
      );
    }
    cutbacks[i] = length;
  }
  for (let i = 0; i < columns; i++) tops[i] = topCorner(i, cutbacks[i]);
  const topT = (i) => tops[i].t;
  function arc(corner, t, i) {
    const w = Math.cos(corner.turn / 2),
      a = (1 - t) ** 2,
      b = 2 * t * (1 - t) * w,
      c = t * t,
      denominator = a + b + c;
    const A = metricPoint(corner.a, i),
      B = metricPoint(corner.b, i),
      C = metricPoint(corner.c, i),
      radius = (a * A[0] + b * B[0] + c * C[0]) / denominator / radialMetric[i],
      y = (a * A[1] + b * B[1] + c * C[1]) / denominator / metric[1],
      roofHeight = source.crown(radius * angles[i][0], radius * angles[i][1]) + 2.1;
    return [radius, -2.1 + ((y + 2.1) * 4.2) / roofHeight];
  }
  const capRows = 24,
    bevelRows = 16;
  if (!pointedBottom) for (let j = 1; j <= capRows; j++) addRing((i) => [(bottoms[i].a[0] * j) / capRows, -2.1]);
  // Cut back the actual side/roof intersection. A fixed quarter-circle assumes
  // a vertical wall, and creates an acute kink when the envelope leans outward.
  if (!pointedBottom) for (let j = 1; j <= bevelRows; j++) addRing((i) => arc(bottoms[i], j / bevelRows, i));
  const shoulder = parameters.shoulderHeight,
    sideSamples = Array.from({ length: rows + 1 }, (_, j) => j / rows);
  if (!sideSamples.some((t) => Math.abs(t - shoulder) < 1e-9)) sideSamples.push(shoulder);
  sideSamples.sort((a, b) => a - b);
  const sideRows = sideSamples.length - 1;
  for (const phase of sideSamples.slice(1))
    addRing((i) =>
      side(
        i,
        phase <= shoulder
          ? mix(bottomT(i), shoulder, phase / shoulder)
          : mix(shoulder, topT(i), (phase - shoulder) / (1 - shoulder))
      )
    );
  for (let j = 1; j <= bevelRows; j++) addRing((i) => arc(tops[i], j / bevelRows, i), j / bevelRows);
  const capBoundary = positions.length / 3 - columns;
  for (let j = capRows - 1; j >= 1; j--)
    addRing((i) => {
      const radius = (tops[i].c[0] * j) / capRows;
      return [radius, 2.1];
    }, 1);
  const rings = positions.length / 3 / columns;
  for (let j = 0; j < rings - 1; j++)
    for (let i = 0; i < columns; i++) {
      const next = (i + 1) % columns,
        a = j * columns + i,
        b = a + columns;
      const c = j * columns + next,
        d = c + columns;
      indices.push(a, b, c, c, b, d);
    }
  const bottomCenter = positions.length / 3;
  positions.push(0, -2.1, 0);
  surfaceRoles.push(0);
  heightWeights.push(0);
  const topCenter = positions.length / 3;
  positions.push(0, source.crown(0, 0), 0);
  surfaceRoles.push(1);
  heightWeights.push(1);
  for (let i = 0; i < columns; i++) {
    const next = (i + 1) % columns;
    indices.push(bottomCenter, i, next, topCenter, (rings - 1) * columns + next, (rings - 1) * columns + i);
  }
  // The analytic roof reserves space over the entire OBB, although a narrow
  // crown uses only part of it. Raise the crown to the available ceiling while
  // keeping the base fixed. Every cap point receives the same offset, so the
  // authored roof slope survives; this is not a bounding-box Y stretch.
  let crownLift = Infinity;
  for (let i = 0; i < heightWeights.length; i++)
    if (heightWeights[i] > 1e-8) crownLift = Math.min(crownLift, (2.1 - positions[i * 3 + 1]) / heightWeights[i]);
  if (Number.isFinite(crownLift) && crownLift > 0)
    for (let i = 0; i < heightWeights.length; i++) positions[i * 3 + 1] += crownLift * heightWeights[i];
  // All topology choices and normals use the final metre coordinates.
  for (let i = 0; i < positions.length; i++) positions[i] = Math.fround(positions[i] * metric[i % 3]);
  // A warped wall quad can make a fixed diagonal exaggerate a crease.
  // Flip only when the worst geometric turn across its complete neighborhood
  // improves; triangle aspect alone can make a neighboring crease worse.
  const faceNormal = (triangle) => {
    const [a, b, c] = triangle.map((index) => index * 3);
    const u = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]);
    const v = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n);
    return length > 1e-12 ? n.map((value) => value / length) : null;
  };
  const dotNormals = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const edgeKey = (a, b) => Math.min(a, b) * (positions.length / 3) + Math.max(a, b);
  const wallNormals = [],
    wallEdges = new Map();
  const faceVertices = (face) => indices.slice(face * 3, face * 3 + 3);
  function attachFace(face, remove = false) {
    const triangle = faceVertices(face);
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(triangle[k], triangle[(k + 1) % 3]),
        faces = wallEdges.get(key) || [];
      if (remove) {
        const index = faces.indexOf(face);
        if (index >= 0) faces.splice(index, 1);
        if (!faces.length) wallEdges.delete(key);
      } else {
        faces.push(face);
        wallEdges.set(key, faces);
      }
    }
  }
  for (let face = 0; face < indices.length / 3; face++) {
    wallNormals.push(faceNormal(faceVertices(face)));
    attachFace(face);
  }
  const wallFaceLimit = capBoundary * 2;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const pair of Array.from(wallEdges.values(), (faces) => faces.slice())) {
      if (
        pair.length !== 2 ||
        dotNormals(wallNormals[pair[0]], wallNormals[pair[1]]) >= Math.cos((89.5 * Math.PI) / 180)
      )
        continue;
      for (const face of pair) {
        const first = face - (face % 2);
        if (first >= wallFaceLimit) continue;
        const quad = first / 2,
          row = Math.floor(quad / columns),
          column = quad % columns;
        const a = row * columns + column,
          b = a + columns,
          c = row * columns + ((column + 1) % columns),
          d = c + columns;
        const candidate =
          indices[first * 3 + 2] === c
            ? [
                [a, b, d],
                [a, d, c]
              ]
            : [
                [a, b, c],
                [c, b, d]
              ];
        const normals = candidate.map(faceNormal);
        if (normals.some((normal) => !normal)) continue;
        const score = (triangles, normals) => {
          let value = dotNormals(normals[0], normals[1]);
          for (let j = 0; j < 2; j++)
            for (let k = 0; k < 3; k++)
              for (const other of wallEdges.get(edgeKey(triangles[j][k], triangles[j][(k + 1) % 3])) || []) {
                if (other !== first && other !== first + 1)
                  value = Math.min(value, dotNormals(normals[j], wallNormals[other]));
              }
          return value;
        };
        if (
          score(candidate, normals) <=
          score([faceVertices(first), faceVertices(first + 1)], [wallNormals[first], wallNormals[first + 1]]) + 1e-6
        )
          continue;
        attachFace(first, true);
        attachFace(first + 1, true);
        for (let j = 0; j < 2; j++) {
          indices.splice((first + j) * 3, 3, ...candidate[j]);
          wallNormals[first + j] = normals[j];
          attachFace(first + j);
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  // A radial grid can produce nearly collinear roof triangles when neighboring
  // wall faces have different depths. Delaunay flips in the roof plane keep
  // the same crown samples and boundary while removing that interpolation bias.

  const capFaces = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    if ([0, 1, 2].every((k) => indices[offset + k] >= capBoundary && indices[offset + k] !== bottomCenter))
      capFaces.push(offset);
  }
  const orient = (a, b, c) =>
    (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2]) -
    (positions[b * 3 + 2] - positions[a * 3 + 2]) * (positions[c * 3] - positions[a * 3]);
  const writeCapFace = (offset, a, b, c) => {
    if (orient(a, b, c) > 0) [b, c] = [c, b];
    indices[offset] = a;
    indices[offset + 1] = b;
    indices[offset + 2] = c;
  };
  for (let pass = 0; pass < 40; pass++) {
    const edges = new Map(),
      touched = new Set();
    for (const offset of capFaces)
      for (let k = 0; k < 3; k++) {
        const a = indices[offset + k],
          b = indices[offset + ((k + 1) % 3)],
          opposite = indices[offset + ((k + 2) % 3)];
        const key = Math.min(a, b) * (positions.length / 3) + Math.max(a, b),
          other = edges.get(key);
        if (!other) {
          edges.set(key, { a, b, opposite, offset });
          continue;
        }
        if (touched.has(offset) || touched.has(other.offset)) continue;
        const c = opposite,
          d = other.opposite;
        if (orient(c, d, a) * orient(c, d, b) >= -1e-14) continue;
        const angle = (p) => {
          const ux = positions[a * 3] - positions[p * 3],
            uz = positions[a * 3 + 2] - positions[p * 3 + 2];
          const vx = positions[b * 3] - positions[p * 3],
            vz = positions[b * 3 + 2] - positions[p * 3 + 2];
          return Math.atan2(Math.abs(ux * vz - uz * vx), ux * vx + uz * vz);
        };
        if (angle(c) + angle(d) <= Math.PI + 1e-8) continue;
        writeCapFace(offset, c, d, a);
        writeCapFace(other.offset, d, c, b);
        touched.add(offset);
        touched.add(other.offset);
      }
    if (!touched.size) break;
  }
  for (let i = 0; i < positions.length; i++) positions[i] = Math.fround(positions[i]);
  const metricRepair = enforceMetricAngles(positions, indices, [2.1 * metric[0], 2.1 * metric[1], 2.1 * metric[2]]);
  for (let i = 0; i < positions.length; i++) positions[i] = Math.fround(positions[i]);
  const normalSums = new Float64Array(positions.length),
    faceNormals = [],
    edges = new Map();
  let maxTurn = 0,
    sharpEdges = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i],
      b = indices[i + 1],
      c = indices[i + 2];
    const ux = positions[b * 3] - positions[a * 3],
      uy = positions[b * 3 + 1] - positions[a * 3 + 1],
      uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const vx = positions[c * 3] - positions[a * 3],
      vy = positions[c * 3 + 1] - positions[a * 3 + 1],
      vz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...cross),
      normal = cross.map((v) => v / length);
    faceNormals.push(normal);
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normalSums[v * 3 + k] += cross[k];
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a]
    ]) {
      const key = Math.min(u, v) * (positions.length / 3) + Math.max(u, v),
        other = edges.get(key);
      if (other === undefined) edges.set(key, i / 3);
      else {
        const dot = Math.max(
          -1,
          Math.min(
            1,
            normal.reduce((sum, v, k) => sum + v * faceNormals[other][k], 0)
          )
        );
        const turn = (Math.acos(dot) * 180) / Math.PI;
        maxTurn = Math.max(maxTurn, turn);
        if (turn > 90.1) sharpEdges++;
      }
    }
  }
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normalSums[i], normalSums[i + 1], normalSums[i + 2]);
    for (let k = 0; k < 3; k++) normals[i + k] = normalSums[i + k] / length;
  }
  return {
    positions: new Float32Array(positions),
    normals,
    surfaceRoles: new Float32Array(surfaceRoles),
    indices: new Uint32Array(indices),
    composition: wall.composition,
    stats: {
      maxFaceTurn: maxTurn,
      sharpEdges,
      reliefSlopeLimit: slopeLimit,
      rawTriangles: indices.length / 3,
      pointedBottom,
      simplificationMethod: "bounded-loft",
      minRoofProfileRadius: Math.min(...tops.map((c, i) => distance(c.a, c.b, i) / Math.tan(c.turn / 2))),
      filledRecessSamples: openedRecesses.filledSamples,
      maxRecessFill: openedRecesses.maxFillHeight,
      metricOutlineCorrections,
      metricAngleCorrections: metricRepair.adjustments,
      maxMetricCorrection: metricRepair.maxDisplacement
    }
  };
}

// Project only violating geometric hinges in metre space. A margin below the
// ninety-degree limit absorbs final Float32 quantization; shading normals play
// no part in this correction. Coordinate bounds keep every update in the OBB.
function enforceMetricAngles(positions, indices, limits) {
  const P = positions,
    I = indices,
    N = P.length / 3,
    F = I.length / 3,
    E = [],
    map = new Map(),
    incident = Array.from({ length: N }, () => []),
    faceEdges = new Uint32Array(I.length),
    normals = new Float64Array(I.length);
  const original = P.slice();
  const rays = Array.from({ length: N }, (_, id) => {
    const x = P[id * 3],
      z = P[id * 3 + 2],
      r = Math.hypot(x, z);
    return r
      ? [x / r, z / r, Math.min(limits[0] / Math.abs(x / r || 1e-30), limits[2] / Math.abs(z / r || 1e-30))]
      : [0, 0, 0];
  });
  function normal(f, unit = true) {
    const a = I[f * 3] * 3,
      b = I[f * 3 + 1] * 3,
      c = I[f * 3 + 2] * 3,
      ux = P[b] - P[a],
      uy = P[b + 1] - P[a + 1],
      uz = P[b + 2] - P[a + 2],
      vx = P[c] - P[a],
      vy = P[c + 1] - P[a + 1],
      vz = P[c + 2] - P[a + 2],
      n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx],
      len = Math.hypot(...n);
    return unit ? n.map((v) => v / len) : n;
  }
  function angle(e, probe = false) {
    const a = probe ? normal(e.f) : normals.subarray(e.f * 3, e.f * 3 + 3),
      b = probe ? normal(e.g) : normals.subarray(e.g * 3, e.g * 3 + 3),
      cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
      dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return Math.atan2(Math.hypot(...cross), dot);
  }
  for (let f = 0; f < F; f++) {
    normals.set(normal(f), f * 3);
    for (let k = 0; k < 3; k++) {
      const a = I[f * 3 + k],
        b = I[f * 3 + ((k + 1) % 3)],
        key = Math.min(a, b) * N + Math.max(a, b);
      incident[a].push(f);
      let e = map.get(key);
      if (e === undefined) {
        e = E.length;
        E.push({ a, b, f, g: -1 });
        map.set(key, e);
      } else E[e].g = f;
      faceEdges[f * 3 + k] = e;
    }
  }
  const queued = new Uint8Array(E.length),
    q = [],
    target = (88 * Math.PI) / 180;

  let ptr = 0,
    adjustments = 0,
    quantizationPass = 0;
  const enqueue = (index) => {
    if (!queued[index] && E[index].g >= 0 && angle(E[index]) > (89 * Math.PI) / 180) {
      queued[index] = 1;
      q.push(index);
    }
  };
  E.forEach((e, index) => enqueue(index));
  while (adjustments < 200000) {
    if (ptr >= q.length) {
      // Recheck the exact representation that will be returned. On a 120m
      // pillar, Float32's vertical spacing can be large relative to a tiny
      // bevel triangle, so a double-precision margin alone is insufficient.
      if (quantizationPass++ >= 8) break;
      for (let i = 0; i < P.length; i++) P[i] = Math.fround(P[i]);
      for (let f = 0; f < F; f++) normals.set(normal(f), f * 3);
      E.forEach((edge, index) => enqueue(index));
      if (ptr >= q.length) break;
    }
    const ei = q[ptr++];
    queued[ei] = 0;
    const e = E[ei],
      theta = angle(e);
    if (theta <= (89 * Math.PI) / 180) continue;
    const ids = Array.from(new Set([...I.slice(e.f * 3, e.f * 3 + 3), ...I.slice(e.g * 3, e.g * 3 + 3)]));
    let minEdge = Infinity;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        minEdge = Math.min(minEdge, Math.hypot(...[0, 1, 2].map((k) => P[ids[i] * 3 + k] - P[ids[j] * 3 + k])));
    const eps = Math.max(1e-7, minEdge * 1e-3),
      grads = [];
    let sum = 0,
      maxGradient = 0;
    for (const id of ids) {
      const ray = rays[id],
        at = id * 3,
        x = P[at],
        y = P[at + 1],
        z = P[at + 2],
        radius = x * ray[0] + z * ray[1];
      P[at] = x + eps * ray[0];
      P[at + 2] = z + eps * ray[1];
      const radialPlus = angle(e, true);
      P[at] = x - eps * ray[0];
      P[at + 2] = z - eps * ray[1];
      const radialMinus = angle(e, true);
      P[at] = x;
      P[at + 2] = z;
      P[at + 1] = y + eps;
      const verticalPlus = angle(e, true);
      P[at + 1] = y - eps;
      const verticalMinus = angle(e, true);
      P[at + 1] = y;
      const radialGradient = (radialPlus - radialMinus) / (2 * eps);
      const gr =
        (radius >= ray[2] - 1e-10 && radialGradient < 0) || (radius <= 1e-8 && radialGradient > 0) ? 0 : radialGradient;
      const grad = [gr * ray[0], (verticalPlus - verticalMinus) / (2 * eps), gr * ray[1]];
      if ((y <= -limits[1] + 1e-10 && grad[1] > 0) || (y >= limits[1] - 1e-10 && grad[1] < 0)) grad[1] = 0;
      sum += grad.reduce((s, v) => s + v * v, 0);
      maxGradient = Math.max(maxGradient, Math.hypot(...grad));
      grads.push(grad);
    }
    if (sum < 1e-20 || !Number.isFinite(sum)) continue;
    const scale = Math.min(((theta - target) / sum) * 0.65, (minEdge * 0.12) / Math.max(maxGradient, 1e-12));
    const touched = new Set();
    for (const id of ids) for (const f of incident[id]) touched.add(f);
    ids.forEach((id, j) => {
      const ray = rays[id],
        radius = P[id * 3] * ray[0] + P[id * 3 + 2] * ray[1],
        gr = grads[j][0] * ray[0] + grads[j][2] * ray[1];
      const next = ray[2] ? Math.max(1e-8, Math.min(ray[2], radius - scale * gr)) : 0;
      P[id * 3] = next * ray[0];
      P[id * 3 + 2] = next * ray[1];
      P[id * 3 + 1] = Math.max(-limits[1], Math.min(limits[1], P[id * 3 + 1] - scale * grads[j][1]));
    });
    for (const f of touched) normals.set(normal(f), f * 3);
    for (const f of touched) for (let k = 0; k < 3; k++) enqueue(faceEdges[f * 3 + k]);
    adjustments++;
  }
  let maxDisplacement = 0;
  for (let i = 0; i < N; i++)
    maxDisplacement = Math.max(
      maxDisplacement,
      Math.hypot(...[0, 1, 2].map((k) => P[i * 3 + k] - original[i * 3 + k]))
    );
  return { adjustments, maxDisplacement };
}
