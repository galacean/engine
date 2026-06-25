/**
 * Per-frame back-to-front depth sort of gaussian splats. O(n) counting sort over a depth-derived integer key,
 * ported from BabylonJS's GaussianSplattingSortWorker (run here on the main thread for simplicity). Scratch
 * buffers are reused across frames to avoid per-frame allocation.
 */
export class GaussianSplatSorter {
  private _depths: Float32Array = new Float32Array(0);
  private _keys: Uint32Array = new Uint32Array(0);
  private _counts: Uint32Array = new Uint32Array(0);

  /**
   * Writes the splat indices ordered farthest-first into `outIndices`.
   * @param positions - Splat centers in local space, stride 4 (x, y, z, _)
   * @param count - Splat count
   * @param mv - Model-view matrix elements (column-major); only the z row (2, 6, 10, 14) is used
   * @param outIndices - Destination instance buffer (length >= count), filled with sorted splat indices
   */
  sort(positions: Float32Array, count: number, mv: Float32Array, outIndices: Float32Array): void {
    if (this._depths.length < count) {
      this._depths = new Float32Array(count);
      this._keys = new Uint32Array(count);
    }
    const depths = this._depths;
    const keys = this._keys;

    // depth = distance along the view direction (negated z so farther = larger).
    const a = -mv[2];
    const b = -mv[6];
    const c = -mv[10];
    const d = -mv[14];
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    for (let i = 0; i < count; i++) {
      const o = i * 4;
      const depth = a * positions[o] + b * positions[o + 1] + c * positions[o + 2] + d;
      depths[i] = depth;
      depth < minDepth && (minDepth = depth);
      depth > maxDepth && (maxDepth = depth);
    }

    // Bucket bit depth follows PlayCanvas/Babylon: round(log2(n/4)) clamped to [10, 20].
    const compareBits = Math.max(10, Math.min(20, Math.round(Math.log2(Math.max(1, count) / 4))));
    const bucketCount = 2 ** compareBits + 1;
    if (this._counts.length !== bucketCount) {
      this._counts = new Uint32Array(bucketCount);
    } else {
      this._counts.fill(0);
    }
    const counts = this._counts;

    const range = maxDepth - minDepth;
    if (range > 1e-12) {
      const scale = (bucketCount - 1) / range;
      const maxKey = bucketCount - 1;
      for (let i = 0; i < count; i++) {
        // farthest (maxDepth) -> key 0 -> rendered first, so the ascending scatter is back-to-front.
        let key = ((maxDepth - depths[i]) * scale) >>> 0;
        key > maxKey && (key = maxKey);
        keys[i] = key;
        counts[key]++;
      }
    } else {
      for (let i = 0; i < count; i++) {
        keys[i] = 0;
      }
      counts[0] = count;
    }

    for (let i = 1; i < bucketCount; i++) {
      counts[i] += counts[i - 1];
    }
    for (let i = 0; i < count; i++) {
      outIndices[--counts[keys[i]]] = i;
    }
  }
}
