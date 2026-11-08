import { requireConstructionWindowCuts, type ConstructionWindowCutAsset } from "./ConstructionWindowCutAsset";
import { add, sub, mul, f32 } from "./RecoveredRoofMath";

/** Native blueprint32 semantic fields. Wall-chart anchor and unwarped world
 * origin are deliberately separate. scaleXY is a host authoring extension: native
 * records omit it. The shader must consume the scaled bounds AND ray metric. */
export interface DecorationWindowCut {
  anchor: readonly [number, number];
  normalXZ: readonly [number, number];
  origin: readonly [number, number, number];
  layer: number;
  flags: number;
  /** Positive model-space XY resize; omitted means the original fixed-size cut. */
  scaleXY?: readonly [number, number];
}
export type WindowCutBounds = readonly [number, number, number, number];
export interface FinalDecorationWindowCut {
  readonly cut: DecorationWindowCut;
  readonly bounds: WindowCutBounds;
}

function checkedBounds(bounds: WindowCutBounds): WindowCutBounds {
  if (
    bounds.length !== 4 ||
    !bounds.every((v) => Number.isFinite(f32(v))) ||
    bounds[0] > bounds[2] ||
    bounds[1] > bounds[3]
  )
    throw Error("Finite ordered window-cut bounds required");
  return [f32(bounds[0]), f32(bounds[1]), f32(bounds[2]), f32(bounds[3])];
}
function checkedCut(asset: ConstructionWindowCutAsset, cut: DecorationWindowCut): DecorationWindowCut {
  const scale = cut.scaleXY ?? [1, 1];
  if (
    cut.anchor.length !== 2 ||
    cut.normalXZ.length !== 2 ||
    cut.origin.length !== 3 ||
    ![...cut.anchor, ...cut.normalXZ, ...cut.origin].every((v) => Number.isFinite(f32(v))) ||
    !cut.normalXZ.some((v) => f32(v) !== 0) ||
    !Number.isInteger(cut.layer) ||
    !asset.layers[cut.layer] ||
    !Number.isInteger(cut.flags) ||
    cut.flags < 0 ||
    cut.flags > 255 ||
    scale.length !== 2 ||
    !scale.every((v) => f32(v) > 0 && Number.isFinite(f32(v)) && Number.isFinite(f32(1 / f32(v))))
  )
    throw Error("Invalid native decoration window cut");
  return {
    anchor: [f32(cut.anchor[0]), f32(cut.anchor[1])],
    normalXZ: [f32(cut.normalXZ[0]), f32(cut.normalXZ[1])],
    origin: [f32(cut.origin[0]), f32(cut.origin[1]), f32(cut.origin[2])],
    layer: cut.layer,
    flags: cut.flags,
    ...(cut.scaleXY ? { scaleXY: [f32(scale[0]), f32(scale[1])] as const } : {})
  };
}

/** WindowCutStorage::finalize 0x101232614, retained 193-wood-cut-finalize.
 * Corner layers widen their chart search box by sqrt(2), not their GPU SDF
 * sampling bounds. expanded(.3,.3) adds .3 to the full extent (.15 per side).
 * Closed-seam copies move only the search box, never the pose.
 * Returned records own their nested data; callers may release/edit the input. */
export function finalizeDecorationWindowCuts(
  sourceAsset: ConstructionWindowCutAsset | undefined,
  cuts: readonly DecorationWindowCut[],
  perimeter: number,
  closed: boolean
): FinalDecorationWindowCut[] {
  const asset = requireConstructionWindowCuts(sourceAsset);
  if (!Number.isFinite(f32(perimeter)) || !(f32(perimeter) > 0))
    throw Error("Positive finite window-cut perimeter required");
  perimeter = f32(perimeter);
  const result: FinalDecorationWindowCut[] = [];
  for (const source of cuts) {
    const cut = checkedCut(asset, source),
      { min, max } = asset.layers[cut.layer].bounds,
      scale = cut.scaleXY ?? [1, 1],
      widthScale = mul(cut.layer >= 15 ? f32(Math.SQRT2) : 1, scale[0]);
    const bounds: [number, number, number, number] = [
      sub(add(cut.anchor[0], mul(widthScale, min[0])), 0.15),
      sub(add(cut.anchor[1], mul(min[1], scale[1])), 0.15),
      add(add(cut.anchor[0], mul(widthScale, max[0])), 0.15),
      add(add(cut.anchor[1], mul(max[1], scale[1])), 0.15)
    ];
    checkedBounds(bounds);
    result.push({ cut, bounds });
    if (closed && (bounds[0] < 0 || bounds[2] > perimeter)) {
      const shift = bounds[0] < 0 ? perimeter : -perimeter;
      const copy: WindowCutBounds = [add(bounds[0], shift), bounds[1], add(bounds[2], shift), bounds[3]];
      checkedBounds(copy);
      result.push({ cut: checkedCut(asset, cut), bounds: copy });
    }
  }
  // Stable chart order; record indices belong only to this publication.
  return result.sort((a, b) => a.bounds[0] - b.bounds[0]);
}

/** Aabb2::intersects 0x101ff804c includes edge touch. NaNs are rejected at
 * publication rather than inheriting the original unordered-comparison result. */
function intersects(a: WindowCutBounds, b: WindowCutBounds, shift: number) {
  return add(a[0], shift) <= b[2] && b[0] <= add(a[2], shift) && a[1] <= b[3] && b[1] <= a[3];
}

/** The native field has a 24-bit word offset and an 8-bit count. Unlike the
 * native saturating helper, reject overflow: silently dropping cuts is invalid
 * for an editor transaction. An empty list is always the zero sentinel. */
export function packDecorationWindowCutList(startWord: number, count: number): number {
  if (!Number.isSafeInteger(startWord) || startWord < 0 || !Number.isInteger(count) || count < 0 || count > 255)
    throw Error("Window-cut list exceeds native address/count capacity");
  if (count === 0) return 0;
  if (startWord > 0xffffff) throw Error("Window-cut list exceeds native address/count capacity");
  return (startWord | (count << 24)) >>> 0;
}

/** WindowCutRecordGpu::new 0x101232958, REA
 * ev_a4affa81369f6da76dea12f5c419d7636b8932a365e46d14ab0386dd3dacd9f7.
 * Records (48B) precede uint32 indices in ONE allocation. List offsets address
 * that entire allocation in words. No native GPU address crosses this boundary.
 * Construction-time only; atlas sampling and render bindings are separate. */
export function buildDecorationWindowCutBuffer(
  sourceAsset: ConstructionWindowCutAsset | undefined,
  records: readonly FinalDecorationWindowCut[],
  pieces: readonly WindowCutBounds[],
  perimeter: number
): { bytes: Uint8Array; lists: Uint32Array; recordCount: number; indexCount: number } {
  const asset = requireConstructionWindowCuts(sourceAsset);
  if (!Number.isFinite(f32(perimeter)) || perimeter < 0) throw Error("Finite window-cut wrap distance required");
  const firstIndexWord = records.length * 12;
  if (firstIndexWord > 0xffffff) throw Error("Window-cut records exceed native address capacity");
  const cuts = records.map((r) => checkedCut(asset, r.cut)),
    boxes = records.map((r) => checkedBounds(r.bounds));
  const indices: number[] = [],
    lists = new Uint32Array(pieces.length);
  for (let piece = 0; piece < pieces.length; piece++) {
    const bounds = checkedBounds(pieces[piece]);
    const start = indices.length;
    for (let record = 0; record < records.length; record++) {
      const box = boxes[record];
      if (intersects(box, bounds, 0) || intersects(box, bounds, perimeter)) {
        if (indices.length - start === 255) throw Error("Window-cut list exceeds native address/count capacity");
        if (firstIndexWord + indices.length > 0xffffff)
          throw Error("Window-cut index storage exceeds native address capacity");
        indices.push(record);
      }
    }
    lists[piece] = packDecorationWindowCutList(firstIndexWord + start, indices.length - start);
  }
  const bytes = new Uint8Array((firstIndexWord + indices.length) * 4),
    view = new DataView(bytes.buffer);
  cuts.forEach((cut, i) => {
    const offset = i * 48,
      { min, max } = asset.layers[cut.layer].bounds,
      scale = cut.scaleXY ?? [1, 1];
    const sampling = [
      mul(min[0], scale[0]),
      mul(min[1], scale[1]),
      mul(max[0], scale[0]),
      mul(max[1], scale[1])
    ] as const;
    checkedBounds(sampling);
    if (
      !(sub(sampling[2], sampling[0]) > 0) ||
      !(sub(sampling[3], sampling[1]) > 0) ||
      !Number.isFinite(sub(sampling[2], sampling[0])) ||
      !Number.isFinite(sub(sampling[3], sampling[1]))
    )
      throw Error("Window-cut scaled sampling extent is not representable");
    cut.origin.forEach((v, k) => view.setFloat32(offset + k * 4, v, true));
    view.setUint32(offset + 12, (asset.layers[cut.layer].layer << 8) | cut.flags, true);
    [...cut.normalXZ, ...sampling].forEach((v, k) => view.setFloat32(offset + 16 + k * 4, v, true));
    // Host GPU48 extension in native unused words. Zero means unit scale and
    // preserves every byte of the original constructor at scale [1,1]. These
    // values are consumed only by the owned full-cut program, never native replay.
    if (scale[0] !== 1) view.setFloat32(offset + 40, scale[0], true);
    if (scale[1] !== 1) view.setFloat32(offset + 44, scale[1], true);
  });
  indices.forEach((value, i) => view.setUint32((firstIndexWord + i) * 4, value, true));
  return { bytes, lists, recordCount: cuts.length, indexCount: indices.length };
}
