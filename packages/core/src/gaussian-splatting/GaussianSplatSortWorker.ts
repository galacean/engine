// Self-contained worker body (kept as a verbatim string so the build's transpiler cannot rewrite it). It
// runs the same O(n) counting sort as GaussianSplatSorter, off the main thread. The instance index buffer
// ping-pongs between main and worker via transfer, so neither side allocates per sort.
const WORKER_SOURCE = `
let positions = null;
let depths = null;
let keys = null;
let counts = null;
self.onmessage = function (e) {
  const data = e.data;
  if (data.cmd === "positions") {
    positions = data.positions;
    return;
  }
  const indices = data.indices;
  const count = data.count;
  const a = data.a, b = data.b, c = data.c, d = data.d;
  if (!positions) {
    self.postMessage({ indices: indices }, [indices.buffer]);
    return;
  }
  if (!depths || depths.length < count) {
    depths = new Float32Array(count);
    keys = new Uint32Array(count);
  }
  let minDepth = Infinity, maxDepth = -Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const depth = a * positions[o] + b * positions[o + 1] + c * positions[o + 2] + d;
    depths[i] = depth;
    if (depth < minDepth) minDepth = depth;
    if (depth > maxDepth) maxDepth = depth;
  }
  const bits = Math.max(10, Math.min(20, Math.round(Math.log2(Math.max(1, count) / 4))));
  const bucketCount = Math.pow(2, bits) + 1;
  if (!counts || counts.length !== bucketCount) counts = new Uint32Array(bucketCount);
  else counts.fill(0);
  const range = maxDepth - minDepth;
  if (range > 1e-12) {
    const scale = (bucketCount - 1) / range;
    const maxKey = bucketCount - 1;
    for (let i = 0; i < count; i++) {
      let key = ((maxDepth - depths[i]) * scale) >>> 0;
      if (key > maxKey) key = maxKey;
      keys[i] = key;
      counts[key]++;
    }
  } else {
    for (let i = 0; i < count; i++) keys[i] = 0;
    counts[0] = count;
  }
  for (let i = 1; i < bucketCount; i++) counts[i] += counts[i - 1];
  for (let i = 0; i < count; i++) indices[--counts[keys[i]]] = i;
  self.postMessage({ indices: indices }, [indices.buffer]);
};
`;

/**
 * Runs the per-frame splat depth sort on a Web Worker. The result is delivered asynchronously (one or two
 * frames late, which is imperceptible) so the main thread never blocks on the sort.
 */
export class GaussianSplatSortWorker {
  private _worker: Worker;
  private _busy = false;
  private _onSorted: (indices: Float32Array) => void;

  get busy(): boolean {
    return this._busy;
  }

  constructor(onSorted: (indices: Float32Array) => void) {
    this._onSorted = onSorted;
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    this._worker = new Worker(url);
    URL.revokeObjectURL(url);
    this._worker.onmessage = (e: MessageEvent) => {
      this._busy = false;
      this._onSorted(e.data.indices);
    };
  }

  /** Upload the splat centers (copied, since the asset keeps ownership). */
  setPositions(positions: Float32Array): void {
    const copy = positions.slice();
    this._worker.postMessage({ cmd: "positions", positions: copy }, [copy.buffer]);
  }

  /** Request a sort for the given view-space depth coefficients; `indices` is transferred to the worker. */
  requestSort(a: number, b: number, c: number, d: number, count: number, indices: Float32Array): void {
    this._busy = true;
    this._worker.postMessage({ cmd: "sort", a, b, c, d, count, indices }, [indices.buffer]);
  }

  destroy(): void {
    this._worker.terminate();
  }
}
