/**
 * Lowers recess depths to the greatest field whose superlevel components reach
 * a top or bottom boundary through four-connected, circumferentially periodic samples.
 * Each result is the maximum, over paths to a boundary, of the minimum original
 * depth along that path. Boundary depths are preserved.
 * @param {Float64Array} depth Finite nonnegative depths, modified in place; length is columns * (rows + 1).
 * @param {number} columns Positive integer count of periodic circumferential samples.
 * @param {number} rows Nonnegative integer count of vertical intervals; boundary rows are 0 and rows.
 * @returns {{filledSamples: number, maxFillHeight: number}} Number of lowered depths and greatest reduction, in the input's length units.
 */
export function openRecesses(depth, columns, rows) {
  const visited = new Uint8Array(depth.length),
    heap = new Uint32Array(depth.length);
  let heapSize = 0,
    filledSamples = 0,
    maxFillHeight = 0;
  const higher = (a, b) => depth[a] > depth[b] || (depth[a] === depth[b] && a < b);

  function visit(index, ceiling) {
    if (visited[index]) return;
    visited[index] = 1;
    const fillHeight = Math.max(0, depth[index] - ceiling);
    if (fillHeight > 0) {
      depth[index] = ceiling;
      filledSamples++;
      maxFillHeight = Math.max(maxFillHeight, fillHeight);
    }
    let slot = heapSize++;
    while (slot > 0) {
      const parent = (slot - 1) >> 1;
      if (!higher(index, heap[parent])) break;
      heap[slot] = heap[parent];
      slot = parent;
    }
    heap[slot] = index;
  }

  function pop() {
    const first = heap[0],
      last = heap[--heapSize];
    if (heapSize > 0) {
      let slot = 0;
      while (slot * 2 + 1 < heapSize) {
        let child = slot * 2 + 1;
        if (child + 1 < heapSize && higher(heap[child + 1], heap[child])) child++;
        if (!higher(heap[child], last)) break;
        heap[slot] = heap[child];
        slot = child;
      }
      heap[slot] = last;
    }
    return first;
  }

  for (let column = 0; column < columns; column++) {
    visit(column, Infinity);
    visit(rows * columns + column, Infinity);
  }
  while (heapSize > 0) {
    const index = pop(),
      column = index % columns,
      row = Math.floor(index / columns),
      ceiling = depth[index];
    // The greatest frontier value is final, so the first visit already gives
    // each neighbor its strongest possible boundary connection.
    visit(row * columns + ((column + columns - 1) % columns), ceiling);
    visit(row * columns + ((column + 1) % columns), ceiling);
    if (row > 0) visit(index - columns, ceiling);
    if (row < rows) visit(index + columns, ceiling);
  }
  return { filledSamples, maxFillHeight };
}
