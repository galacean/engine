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
    depthPadding = new Float32Array(count),
    cullRadius = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * stride;
    const a0 = view.getFloat32(p, true),
      a1 = view.getFloat32(p + 4, true),
      a2 = view.getFloat32(p + 8, true),
      a3 = view.getFloat32(p + 12, true),
      a4 = view.getFloat32(p + 16, true),
      a5 = view.getFloat32(p + 20, true),
      a6 = view.getFloat32(p + 24, true),
      a7 = view.getFloat32(p + 28, true),
      a8 = view.getFloat32(p + 32, true),
      a9 = view.getFloat32(p + 36, true),
      a10 = view.getFloat32(p + 40, true),
      a11 = view.getFloat32(p + 44, true);
    if (
      !Number.isFinite(a0) ||
      !Number.isFinite(a1) ||
      !Number.isFinite(a2) ||
      !Number.isFinite(a3) ||
      !Number.isFinite(a4) ||
      !Number.isFinite(a5) ||
      !Number.isFinite(a6) ||
      !Number.isFinite(a7) ||
      !Number.isFinite(a8) ||
      !Number.isFinite(a9) ||
      !Number.isFinite(a10) ||
      !Number.isFinite(a11)
    )
      throw Error("Non-finite wood LOD transform");
    const bx = a9 + a3 * 0.5,
      by = a10 + a4 * 0.5,
      bz = a11 + a5 * 0.5;
    const x = Math.hypot(a0, a1, a2),
      y = Math.hypot(a3, a4, a5),
      z = Math.hypot(a6, a7, a8);
    const med = Math.max(Math.min(x, y), Math.max(Math.min(y, z), Math.min(x, z)));
    const pad = 0.5 * Math.max(Math.hypot(a0, a3, a6), Math.hypot(a1, a4, a7), Math.hypot(a2, a5, a8));
    const b4 = i * 4;
    bounds[b4] = bx;
    bounds[b4 + 1] = by;
    bounds[b4 + 2] = bz;
    bounds[b4 + 3] = med;
    depthPadding[i] = pad;
    cullRadius[i] = 0.5 * (x + y + z) + 0.35;
    if (
      !Number.isFinite(bounds[b4]) ||
      !Number.isFinite(bounds[b4 + 1]) ||
      !Number.isFinite(bounds[b4 + 2]) ||
      !Number.isFinite(bounds[b4 + 3]) ||
      !Number.isFinite(depthPadding[i]) ||
      !Number.isFinite(cullRadius[i])
    )
      throw Error("Wood LOD bounds exceed finite f32 range");
  }
  return { bounds, depthPadding, cullRadius };
}

/** Native threshold 7; 6..8 is our complementary transition, not a native fade.
 * Native flags bit0 selects another HIGH bucket, not a force-high exemption. */
export class WoodUnitLod extends MaterialUnitLod {
  constructor(bytes) {
    const { bounds, depthPadding, cullRadius } = woodLodBounds(bytes);
    super(bounds, new Uint8Array(bytes.byteLength / 80), 6, 8, depthPadding, cullRadius);
  }
}

/** Same native 7px threshold and host complementary transition as ordinary wood. */
export class GableWoodUnitLod extends MaterialUnitLod {
  constructor(bytes) {
    const { bounds, depthPadding, cullRadius } = gableWoodLodBounds(bytes);
    super(bounds, new Uint8Array(bytes.byteLength / 96), 6, 8, depthPadding, cullRadius);
  }
}
