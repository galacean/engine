import type { buildDecorationWindowCutBuffer } from "./DecorationWindowCutBuffer";
export const decorationWoodCutTemplate = "wood-window-cuts";
export const decorationGableCutTemplate = "wood-gable-window-cuts";
export const decorationGableStraightCutTemplate = "wood-gable-straight-window-cuts";

/** Bind a publication's piece lists to its corresponding wood instances. Copies
 * the input, preserving transform/seed/color, and clears the unused native address.
 * Invalid lists fail before a candidate is made visible. */
export function bindDecorationWoodCuts(instances: Uint8Array, cuts: ReturnType<typeof buildDecorationWindowCutBuffer>) {
  return bindWoodCutLists(instances, cuts, 80);
}

/** Native gable96 keeps four skew bounds at 64..79; its pointer/list follow at
 * 80/88. It must never pass through the ordinary wood80 binder or LOD decoder. */
export function bindDecorationGableCuts(
  instances: Uint8Array,
  cuts: ReturnType<typeof buildDecorationWindowCutBuffer>
) {
  return bindWoodCutLists(instances, cuts, 96);
}

function bindWoodCutLists(
  instances: Uint8Array,
  cuts: ReturnType<typeof buildDecorationWindowCutBuffer>,
  stride: 80 | 96
) {
  if (instances.byteLength % stride || cuts.lists.length !== instances.byteLength / stride)
    throw Error(`One window-cut list per wood${stride} instance required`);
  if (
    !Number.isSafeInteger(cuts.recordCount) ||
    cuts.recordCount < 0 ||
    !Number.isSafeInteger(cuts.indexCount) ||
    cuts.indexCount < 0 ||
    cuts.bytes.byteLength !== cuts.recordCount * 48 + cuts.indexCount * 4
  )
    throw Error("Invalid combined window-cut buffer");
  const bytes = cuts.bytes.slice(),
    data = new DataView(bytes.buffer),
    result = instances.slice(),
    view = new DataView(result.buffer),
    firstIndex = cuts.recordCount * 12,
    wordCount = bytes.byteLength / 4;
  for (let i = 0; i < cuts.lists.length; i++) {
    const list = cuts.lists[i],
      count = list >>> 24,
      start = list & 0xffffff;
    if ((count === 0 && list !== 0) || (count && (start < firstIndex || start + count > wordCount)))
      throw Error("Window-cut list points outside owned index storage");
    for (let k = 0; k < count; k++)
      if (data.getUint32((start + k) * 4, true) >= cuts.recordCount)
        throw Error("Window-cut index points outside owned records");
    view.setUint32(i * stride + stride - 16, 0, true);
    view.setUint32(i * stride + stride - 12, 0, true);
    view.setUint32(i * stride + stride - 8, list, true);
  }
  return { instances: result, bindings: { windowCuts: bytes.byteLength ? bytes : new Uint8Array(16) } };
}

/** Native flags&1 picks the straight high mesh, not a different LOD threshold.
 * Preserve producer order within each mesh bucket and return source indices so
 * local edit/selection identities do not become bucket-relative instance ids. */
export function decorationGableDraws(instances: Uint8Array, cuts: ReturnType<typeof buildDecorationWindowCutBuffer>) {
  const bound = bindDecorationGableCuts(instances, cuts),
    view = new DataView(bound.instances.buffer),
    buckets: number[][] = [[], []];
  for (let i = 0; i < instances.byteLength / 96; i++) buckets[view.getUint32(i * 96 + 56, true) & 1].push(i);
  return buckets.flatMap((ids, bucket) => {
    if (!ids.length) return [];
    const bytes = new Uint8Array(ids.length * 96);
    for (let i = 0; i < ids.length; i++) bytes.set(bound.instances.subarray(ids[i] * 96, (ids[i] + 1) * 96), i * 96);
    return [
      {
        template: bucket ? decorationGableStraightCutTemplate : decorationGableCutTemplate,
        instances: bytes,
        sourceIndices: Uint32Array.from(ids),
        bindings: bound.bindings
      }
    ];
  });
}
