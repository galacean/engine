const VIEWS = [
  ["front", [0, 0, 1]],
  ["back", [0, 0, -1]],
  ["right", [1, 0, 0]],
  ["left", [-1, 0, 0]],
  ["top", [0, 1, 0]],
  ["bottom", [0, -1, 0]],
  ["diagonal-ne", [1, 0.65, 1]],
  ["diagonal-nw", [-1, 0.65, 1]],
  ["diagonal-sw", [-1, 0.65, -1]],
  ["diagonal-se", [1, 0.65, -1]]
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => {
  const n = Math.hypot(...a);
  return a.map((x) => x / n);
};
function basis(direction) {
  const w = normalize(direction),
    reference = Math.abs(w[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
  const u = normalize(cross(reference, w)),
    v = cross(w, u);
  return [u, v];
}
function project(mesh, axes) {
  const out = new Float64Array((mesh.positions.length / 3) * 2);
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
    const x = dot(p, axes[0]),
      y = dot(p, axes[1]),
      j = (i / 3) * 2;
    out[j] = x;
    out[j + 1] = y;
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }
  return { points: out, bounds };
}
function raster(mesh, projected, frame, size) {
  const p = new Float64Array(projected.length),
    mask = new Uint8Array(size * size);
  for (let i = 0; i < p.length; i += 2) {
    p[i] = (projected[i] - frame.cx) * frame.scale + size * 0.5;
    p[i + 1] = (projected[i + 1] - frame.cy) * frame.scale + size * 0.5;
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ai = mesh.indices[i] * 2,
      bi = mesh.indices[i + 1] * 2,
      ci = mesh.indices[i + 2] * 2;
    const ax = p[ai],
      ay = p[ai + 1],
      bx = p[bi],
      by = p[bi + 1],
      cx = p[ci],
      cy = p[ci + 1];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-10) continue;
    const minX = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5)),
      maxX = Math.min(size - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
    const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)),
      maxY = Math.min(size - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
    const sign = area > 0 ? 1 : -1;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5,
          py = y + 0.5;
        const e0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * sign;
        const e1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * sign;
        const e2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * sign;
        if (e0 >= -1e-7 && e1 >= -1e-7 && e2 >= -1e-7) mask[y * size + x] = 1;
      }
  }
  return mask;
}
function boundary(mask, size) {
  const out = new Uint8Array(mask.length);
  let count = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (
        mask[i] &&
        (x === 0 ||
          y === 0 ||
          x === size - 1 ||
          y === size - 1 ||
          !mask[i - 1] ||
          !mask[i + 1] ||
          !mask[i - size] ||
          !mask[i + size])
      ) {
        out[i] = 1;
        count++;
      }
    }
  return { mask: out, count };
}
// Exact squared Euclidean distance transform of a binary pixel-center set.
function distanceTransform(mask, size) {
  const far = size * size * 16,
    f = new Float64Array(size),
    d = new Float64Array(size),
    v = new Int32Array(size),
    z = new Float64Array(size + 1);
  function row() {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < size; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < size; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  }
  const temp = new Float64Array(mask.length),
    out = new Float64Array(mask.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) f[x] = mask[y * size + x] ? 0 : far;
    row();
    temp.set(d, y * size);
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) f[y] = temp[y * size + x];
    row();
    for (let y = 0; y < size; y++) out[y * size + x] = d[y];
  }
  return out;
}
function distances(from, toDistance) {
  const values = [];
  for (let i = 0; i < from.length; i++) if (from[i]) values.push(Math.sqrt(toDistance[i]));
  values.sort((a, b) => a - b);
  return {
    max: values.at(-1) || 0,
    p95: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] || 0,
    mean: values.reduce((s, x) => s + x, 0) / Math.max(1, values.length),
    count: values.length
  };
}
function round(value) {
  return Math.round(value * 1e6) / 1e6;
}
function statsObject(s, scale) {
  return {
    maxPx: round(s.max),
    p95Px: round(s.p95),
    meanPx: round(s.mean),
    maxWorld: round(s.max / scale),
    p95World: round(s.p95 / scale),
    boundarySamples: s.count
  };
}
/** Measures sampled multi-view silhouette differences independently of the simplifier.
 * @param {object} raw Original indexed mesh.
 * @param {object} reduced Reduced indexed mesh.
 * @param {object} options Raster size and orthographic viewing directions.
 * @returns Per-view pixel boundary distances and coverage overlap; not a continuous Hausdorff bound.
 */
export function compareSilhouettes(raw, reduced, { size = 512, margin = 8, views = VIEWS, includeMasks = false } = {}) {
  if (!Number.isInteger(size) || size < 32) throw new Error("size must be an integer >=32");
  const results = [];
  for (const [name, direction] of views) {
    const axes = basis(direction),
      a = project(raw, axes),
      b = project(reduced, axes);
    const bb = [
      Math.min(a.bounds[0], b.bounds[0]),
      Math.min(a.bounds[1], b.bounds[1]),
      Math.max(a.bounds[2], b.bounds[2]),
      Math.max(a.bounds[3], b.bounds[3])
    ];
    const width = bb[2] - bb[0],
      height = bb[3] - bb[1];
    const frame = {
      cx: (bb[0] + bb[2]) * 0.5,
      cy: (bb[1] + bb[3]) * 0.5,
      scale: (size - 2 * margin) / Math.max(width, height, 1e-12)
    };
    const am = raster(raw, a.points, frame, size),
      bm = raster(reduced, b.points, frame, size),
      ab = boundary(am, size),
      bbm = boundary(bm, size);
    if (!ab.count || !bbm.count) throw new Error(`${name}: no raster silhouette; increase size for thin objects`);
    const ad = distanceTransform(ab.mask, size),
      bd = distanceTransform(bbm.mask, size);
    const aToB = distances(ab.mask, bd),
      bToA = distances(bbm.mask, ad);
    let intersection = 0,
      union = 0,
      rawArea = 0,
      reducedArea = 0;
    for (let i = 0; i < am.length; i++) {
      intersection += am[i] & bm[i];
      union += am[i] | bm[i];
      rawArea += am[i];
      reducedArea += bm[i];
    }
    const shortSpanPx = Math.min(width, height) * frame.scale;
    const result = {
      name,
      direction,
      projectedWidthWorld: round(width),
      projectedHeightWorld: round(height),
      pixelsPerWorld: round(frame.scale),
      shortSpanPx: round(shortSpanPx),
      underResolved: shortSpanPx < 32,
      iou: round(intersection / union),
      rawAreaPx: rawArea,
      reducedAreaPx: reducedArea,
      lostAreaPx: rawArea - intersection,
      gainedAreaPx: reducedArea - intersection,
      rawToReduced: statsObject(aToB, frame.scale),
      reducedToRaw: statsObject(bToA, frame.scale),
      symmetricMaxPx: round(Math.max(aToB.max, bToA.max)),
      symmetricP95Px: round(Math.max(aToB.p95, bToA.p95))
    };
    if (includeMasks) result.masks = { raw: am, reduced: bm, rawBoundary: ab.mask, reducedBoundary: bbm.mask };
    results.push(result);
  }
  return {
    size,
    rawTriangles: raw.indices.length / 3,
    reducedTriangles: reduced.indices.length / 3,
    summary: {
      minIoU: Math.min(...results.map((v) => v.iou)),
      maxBoundaryDeviationPx: Math.max(...results.map((v) => v.symmetricMaxPx)),
      maxP95BoundaryDeviationPx: Math.max(...results.map((v) => v.symmetricP95Px)),
      underResolvedViews: results.filter((v) => v.underResolved).map((v) => v.name)
    },
    limitations: [
      "Binary pixel-center silhouettes: deviations below about 1 pixel are quantized.",
      "Silhouette agreement does not measure internal sculpted face detail or self-intersections.",
      "Opposite axis views intentionally duplicate silhouettes; four oblique views add distinct coverage.",
      "Thin projections below 32 pixels require a larger size or local close-up.",
      "Fixed finite views do not guarantee a continuous-view Hausdorff bound."
    ],
    views: results
  };
}
