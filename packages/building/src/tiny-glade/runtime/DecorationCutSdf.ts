/** Original startup_window_cut_sdf::bake_layer projects the selected visual
 * meshes into XY, conservatively rasterizes at 512², performs two Euclidean
 * distance transforms and filters to 128² SNORM. Geometry and sampling bounds
 * are separate inputs. By default the indexed visual bounds are expanded 16/15
 * about their centre, as recovered from bake_layer's ARM64 instructions.
 * No scene-dependent data or installed game files are used here.
 *
 * Source: retained 078-window-cut-sdf-bake / 079-window-cut-distance-transform,
 * binary 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * This is a TS implementation of the recovered algorithm, not a claim of
 * bitwise equivalence to native floating-point evaluation.
 */
export interface DecorationCutMesh {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}
export interface DecorationCutBounds {
  min: readonly [number, number];
  max: readonly [number, number];
}
export interface DecorationCutSdf {
  bounds: DecorationCutBounds;
  size: 128;
  /** Negative inside. Decode normalized signed byte × 0.25 to native metres. */
  samples: Int8Array;
}
const rasterSize = 512;
const outputSize = 128;
const f32 = Math.fround;
const add = (a: number, b: number) => f32(a + b);
const sub = (a: number, b: number) => f32(a - b);
const mul = (a: number, b: number) => f32(a * b);
const div = (a: number, b: number) => f32(a / b);
const cross = (ax: number, ay: number, bx: number, by: number) => sub(mul(ax, by), mul(ay, bx));

export function decorationCutBounds(meshes: readonly DecorationCutMesh[]): DecorationCutBounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const { positions, indices } of meshes) {
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      if (!Number.isInteger(index) || index < 0 || index >= positions.length / 3)
        throw Error("Decoration cut index out of bounds");
      const x = positions[index * 3],
        y = positions[index * 3 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error("Nonfinite decoration cut position");
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const f = Math.fround;
  const cx = f(f(minX + maxX) * 0.5),
    cy = f(f(minY + maxY) * 0.5);
  const hx = f(f(f(maxX - minX) * f(16 / 15)) * 0.5);
  const hy = f(f(f(maxY - minY) * f(16 / 15)) * 0.5);
  return { min: [f(cx - hx), f(cy - hy)], max: [f(cx + hx), f(cy + hy)] };
}

/** Squared Euclidean lower envelope. Empty scan lines remain at the same finite
 * sentinel as native (1e20), so no infinity-minus-infinity intersection occurs.
 * Two weighted passes preserve distances for non-square model bounds. */
function lowerEnvelope(
  input: Float64Array,
  output: Float64Array,
  spacing: number,
  sites: Int32Array,
  intersections: Float64Array
) {
  const weight = spacing * spacing;
  let k = 0;
  sites[0] = 0;
  intersections[0] = -Infinity;
  intersections[1] = Infinity;
  for (let q = 1; q < input.length; q++) {
    let v = sites[k];
    let s = (input[q] - input[v]) / (2 * weight * (q - v)) + (q + v) * 0.5;
    while (s <= intersections[k]) {
      v = sites[--k];
      s = (input[q] - input[v]) / (2 * weight * (q - v)) + (q + v) * 0.5;
    }
    sites[++k] = q;
    intersections[k] = s;
    intersections[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < input.length; q++) {
    while (intersections[k + 1] < q) k++;
    const d = q - sites[k];
    output[q] = weight * d * d + input[sites[k]];
  }
}

function distanceTransform(mask: Uint8Array, dx: number, dy: number, target: number) {
  const distances = new Float64Array(mask.length);
  const input = new Float64Array(rasterSize),
    output = new Float64Array(rasterSize);
  const sites = new Int32Array(rasterSize),
    intersections = new Float64Array(rasterSize + 1);
  for (let x = 0; x < rasterSize; x++) {
    for (let y = 0; y < rasterSize; y++) input[y] = mask[y * rasterSize + x] === target ? 0 : 1e20;
    lowerEnvelope(input, output, dy, sites, intersections);
    for (let y = 0; y < rasterSize; y++) distances[y * rasterSize + x] = output[y];
  }
  for (let y = 0; y < rasterSize; y++) {
    input.set(distances.subarray(y * rasterSize, (y + 1) * rasterSize));
    lowerEnvelope(input, output, dx, sites, intersections);
    for (let x = 0; x < rasterSize; x++) distances[y * rasterSize + x] = Math.sqrt(output[x]);
  }
  return distances;
}

export function bakeDecorationCutSdf(
  meshes: readonly DecorationCutMesh[],
  bounds: DecorationCutBounds = decorationCutBounds(meshes)
): DecorationCutSdf {
  const [minX, minY] = bounds.min,
    [maxX, maxY] = bounds.max;
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY)
    throw Error("Decoration cut requires finite, positive XY bounds");
  const dx = div(sub(maxX, minX), rasterSize),
    dy = div(sub(maxY, minY), rasterSize);
  const mask = new Uint8Array(rasterSize * rasterSize);
  for (const mesh of meshes) {
    const { positions, indices } = mesh;
    if (positions.length % 3 || indices.length % 3) throw Error("Decoration cut requires indexed triangles");
    for (let i = 0; i < positions.length; i++)
      if (!Number.isFinite(positions[i])) throw Error("Nonfinite decoration cut position");
    for (let i = 0; i < indices.length; i++)
      if (!Number.isInteger(indices[i]) || indices[i] < 0 || indices[i] >= positions.length / 3)
        throw Error("Decoration cut index out of bounds");
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const ax = positions[a],
        ay = positions[a + 1];
      let bx = positions[b],
        by = positions[b + 1],
        cx = positions[c],
        cy = positions[c + 1];
      const area = cross(sub(bx, ax), sub(by, ay), sub(cx, ax), sub(cy, ay));
      if (area === 0) continue;
      if (area < 0) {
        [bx, cx] = [cx, bx];
        [by, cy] = [cy, by];
      }
      const x0 = Math.max(0, Math.floor(sub(div(sub(Math.min(ax, bx, cx), minX), dx), 0.5)));
      const x1 = Math.min(rasterSize - 1, Math.ceil(sub(div(sub(Math.max(ax, bx, cx), minX), dx), 0.5)));
      const y0 = Math.max(0, Math.floor(sub(div(sub(Math.min(ay, by, cy), minY), dy), 0.5)));
      const y1 = Math.min(rasterSize - 1, Math.ceil(sub(div(sub(Math.max(ay, by, cy), minY), dy), 0.5)));
      // Pixel-box support along each edge normal: thin projected triangles
      // contribute coverage even when no sample centre lies inside them.
      const ab = -add(mul(mul(dx, 0.5), Math.abs(sub(by, ay))), mul(mul(dy, 0.5), Math.abs(sub(bx, ax))));
      const bc = -add(mul(mul(dx, 0.5), Math.abs(sub(cy, by))), mul(mul(dy, 0.5), Math.abs(sub(cx, bx))));
      const ca = -add(mul(mul(dx, 0.5), Math.abs(sub(ay, cy))), mul(mul(dy, 0.5), Math.abs(sub(ax, cx))));
      for (let y = y0; y <= y1; y++) {
        const py = add(minY, mul(dy, y + 0.5));
        for (let x = x0; x <= x1; x++) {
          const px = add(minX, mul(dx, x + 0.5));
          if (
            cross(sub(bx, ax), sub(by, ay), sub(px, ax), sub(py, ay)) >= ab &&
            cross(sub(cx, bx), sub(cy, by), sub(px, bx), sub(py, by)) >= bc &&
            cross(sub(ax, cx), sub(ay, cy), sub(px, cx), sub(py, cy)) >= ca
          )
            mask[y * rasterSize + x] = 1;
        }
      }
    }
  }
  if (!mask.some(Boolean)) throw Error("Empty decoration cut silhouette");
  const toInside = distanceTransform(mask, dx, dy, 1);
  const toOutside = distanceTransform(mask, dx, dy, 0);
  const halfPixel = mul(add(dx, dy), 0.25);
  const samples = new Int8Array(outputSize * outputSize);
  for (let y = 0; y < outputSize; y++) {
    for (let x = 0; x < outputSize; x++) {
      let sum = 0;
      for (let oy = 0; oy < 4; oy++) {
        for (let ox = 0; ox < 4; ox++) {
          const i = (y * 4 + oy) * rasterSize + x * 4 + ox;
          const signed = sub(toInside[i], toOutside[i]);
          sum = add(sum, sub(signed, mul(halfPixel, signed < 0 ? -1 : 1)));
        }
      }
      // Native erosion bias avoids exposing tiny gaps around the attached frame.
      const quantized = mul(Math.max(-1, Math.min(1, mul(add(mul(sum, 0.0625), f32(0.012)), 4))), 127);
      // ARM64 FCVTAS rounds ties away from zero (JS Math.round differs below 0).
      samples[y * outputSize + x] = Math.sign(quantized) * Math.floor(Math.abs(quantized) + 0.5);
    }
  }
  return { bounds: { min: [minX, minY], max: [maxX, maxY] }, size: outputSize, samples };
}

/** CPU counterpart of clamp/linear texture sampling, for placement/coverage
 * queries. The bounds test is separate: clamp must never extend a cut to infinity. */
export function sampleDecorationCutSdf(sdf: DecorationCutSdf, x: number, y: number): number {
  const { min, max } = sdf.bounds;
  if (x < min[0] || x > max[0] || y < min[1] || y > max[1]) return 0.25;
  const px = ((x - min[0]) / (max[0] - min[0])) * sdf.size - 0.5;
  const py = ((y - min[1]) / (max[1] - min[1])) * sdf.size - 0.5;
  const ix = Math.floor(px),
    iy = Math.floor(py),
    tx = px - ix,
    ty = py - iy;
  const at = (i: number, j: number) =>
    sdf.samples[Math.max(0, Math.min(sdf.size - 1, j)) * sdf.size + Math.max(0, Math.min(sdf.size - 1, i))] / 508;
  return (
    (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) +
    (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty
  );
}
