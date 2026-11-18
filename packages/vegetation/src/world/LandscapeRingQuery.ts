import type { LandscapePoint } from "./VegetationLandscapePlan";

/** Immutable exact contact query for a simple ring, including holes joined by doubled edges. */
export interface LandscapeRingQuery {
  /** Retained typed-array storage, excluding the small query object and closures. */
  readonly byteLength: number;
  /** Tests the filled ring or contact with its boundary, using the instance radius in metres. */
  intersects(point: LandscapePoint, radius: number): boolean;
}

/**
 * Indexes a published polygon boundary without triangulation or raster approximation.
 * Doubled bridges cancel in the parity test; their distance cannot extend the filled surface.
 * @param ring Immutable world XZ ring, with implicit closure; holes may use doubled bridges.
 * @returns A detached Float64 snapshot with allocation-free, radius-aware queries.
 */
export function createLandscapeRingQuery(ring: readonly LandscapePoint[]): LandscapeRingQuery {
  const count = ring.length,
    coordinates = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) coordinates.set(ring[i], i * 2);
  const order = Uint32Array.from({ length: count }, (_, i) => i);
  const capacity = count ? 2 * 2 ** Math.ceil(Math.log2(Math.ceil(count / 8))) - 1 : 0;
  const boxes = new Float64Array(capacity * 4),
    links = new Int32Array(capacity * 2);
  let nodes = 0;
  const build = (start: number, end: number): number => {
    const node = nodes++,
      box = node * 4;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let i = start; i < end; i++) {
      const a = order[i] * 2,
        b = ((order[i] + 1) % count) * 2;
      minX = Math.min(minX, coordinates[a], coordinates[b]);
      maxX = Math.max(maxX, coordinates[a], coordinates[b]);
      minZ = Math.min(minZ, coordinates[a + 1], coordinates[b + 1]);
      maxZ = Math.max(maxZ, coordinates[a + 1], coordinates[b + 1]);
    }
    boxes.set([minX, maxX, minZ, maxZ], box);
    if (end - start <= 8) {
      links[node * 2] = start;
      links[node * 2 + 1] = start - end;
    } else {
      const axis = maxX - minX >= maxZ - minZ ? 0 : 1;
      order
        .subarray(start, end)
        .sort(
          (a, b) =>
            coordinates[a * 2 + axis] +
            coordinates[((a + 1) % count) * 2 + axis] -
            coordinates[b * 2 + axis] -
            coordinates[((b + 1) % count) * 2 + axis]
        );
      const middle = (start + end) >>> 1;
      links[node * 2] = build(start, middle);
      links[node * 2 + 1] = build(middle, end);
    }
    return node;
  };
  if (count) build(0, count);
  const stack = new Int32Array(count ? Math.ceil(Math.log2(count)) + 2 : 0);
  return {
    byteLength: coordinates.byteLength + order.byteLength + boxes.byteLength + links.byteLength + stack.byteLength,
    intersects(point, radius) {
      const x = point[0],
        z = point[1];
      let inside = false,
        top = 0;
      if (count) stack[top++] = 0;
      while (top) {
        const node = stack[--top],
          box = node * 4;
        const near =
          x >= boxes[box] - radius &&
          x <= boxes[box + 1] + radius &&
          z >= boxes[box + 2] - radius &&
          z <= boxes[box + 3] + radius;
        const crosses = z >= boxes[box + 2] && z < boxes[box + 3] && x < boxes[box + 1];
        if (!near && !crosses) continue;
        const first = links[node * 2],
          second = links[node * 2 + 1];
        if (second >= 0) {
          stack[top++] = first;
          stack[top++] = second;
          continue;
        }
        for (let i = first; i < first - second; i++) {
          const a = order[i] * 2,
            b = ((order[i] + 1) % count) * 2;
          const ax = coordinates[a],
            az = coordinates[a + 1],
            bx = coordinates[b],
            bz = coordinates[b + 1];
          if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
          if (near) {
            const dx = bx - ax,
              dz = bz - az,
              length2 = dx * dx + dz * dz;
            const t = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2)) : 0;
            if (Math.hypot(x - ax - t * dx, z - az - t * dz) <= radius) return true;
          }
        }
      }
      return inside;
    }
  };
}
