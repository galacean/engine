import { MaterialUnitLod } from "./MaterialUnitLod.js";

/** Ordinary wood80, matching cull_and_bucket_wooden_plank:
 * median basis-column length controls detail, max basis-row length / 2 controls
 * the near side of the depth interval. Decode once; no per-frame byte parsing.
 * Gable96 uses the same metric in the shipped culler; domain-roof does not. */
export function woodLodBounds(bytes) {
  return affinePlankLodBounds(bytes, 80);
}

/** cull_and_bucket_wooden_gable_plank.0: skew fields do not participate in
 * the source LOD metric. Decode the affine basis with the correct 96-byte stride. */
export function gableWoodLodBounds(bytes) {
  return affinePlankLodBounds(bytes, 96);
}

function affinePlankLodBounds(bytes, stride) {
  if (bytes.byteLength % stride) throw Error(`Wood LOD requires complete wood${stride} records`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    count = bytes.byteLength / stride,
    bounds = new Float32Array(count * 4),
    depthPadding = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * stride,
      a = [];
    for (let k = 0; k < 12; k++) a.push(view.getFloat32(p + k * 4, true));
    if (!a.every(Number.isFinite)) throw Error("Non-finite wood LOD transform");
    for (let k = 0; k < 3; k++) bounds[i * 4 + k] = a[9 + k] + a[3 + k] * 0.5;
    const x = Math.hypot(a[0], a[1], a[2]),
      y = Math.hypot(a[3], a[4], a[5]),
      z = Math.hypot(a[6], a[7], a[8]);
    bounds[i * 4 + 3] = Math.max(Math.min(x, y), Math.max(Math.min(y, z), Math.min(x, z)));
    depthPadding[i] =
      0.5 * Math.max(Math.hypot(a[0], a[3], a[6]), Math.hypot(a[1], a[4], a[7]), Math.hypot(a[2], a[5], a[8]));
  }
  if (!bounds.every(Number.isFinite) || !depthPadding.every(Number.isFinite))
    throw Error("Wood LOD bounds exceed finite f32 range");
  return { bounds, depthPadding };
}

/** Native threshold 7; 6..8 is our complementary transition, not a native fade.
 * Native flags bit0 selects another HIGH bucket, not a force-high exemption. */
export class WoodUnitLod extends MaterialUnitLod {
  constructor(bytes) {
    const { bounds, depthPadding } = woodLodBounds(bytes);
    super(bounds, new Uint8Array(bytes.byteLength / 80), 6, 8, depthPadding);
  }
}

/** Same native 7px threshold and host complementary transition as ordinary wood. */
export class GableWoodUnitLod extends MaterialUnitLod {
  constructor(bytes) {
    const { bounds, depthPadding } = gableWoodLodBounds(bytes);
    super(bounds, new Uint8Array(bytes.byteLength / 96), 6, 8, depthPadding);
  }
}
