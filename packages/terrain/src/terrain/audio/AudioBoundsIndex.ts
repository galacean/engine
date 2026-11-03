import type { AudioPoint } from "./EnvironmentAudioMath";

export interface AudioBounds {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}
interface Node<T> extends AudioBounds {
  readonly entries?: readonly T[];
  readonly left?: Node<T>;
  readonly right?: Node<T>;
}

/** Immutable publication index. Queries reuse published geometry and retain the exact narrow-phase test. */
export class AudioBoundsIndex<T extends AudioBounds> {
  private readonly root?: Node<T>;

  constructor(entries: readonly T[]) {
    if (entries.length) this.root = build([...entries]);
  }

  queryRadius(p: AudioPoint, radius: number, visit: (entry: T) => void): void {
    if (this.root) visitRadius(this.root, p, radius * radius, visit);
  }

  intersectsSegment(a: AudioPoint, b: AudioPoint, test: (entry: T) => boolean): boolean {
    return !!this.root && testSegment(this.root, a, b, test);
  }
}

function visitRadius<T extends AudioBounds>(
  node: Node<T>,
  p: AudioPoint,
  squared: number,
  visit: (entry: T) => void
): void {
  if (!withinRadius(node, p, squared)) return;
  if (node.entries) {
    for (let i = 0; i < node.entries.length; i++) {
      const entry = node.entries[i]!;
      if (withinRadius(entry, p, squared)) visit(entry);
    }
  } else {
    visitRadius(node.left!, p, squared, visit);
    visitRadius(node.right!, p, squared, visit);
  }
}

function testSegment<T extends AudioBounds>(
  node: Node<T>,
  a: AudioPoint,
  b: AudioPoint,
  test: (entry: T) => boolean
): boolean {
  if (!intersects(node, a, b)) return false;
  if (node.entries) {
    for (let i = 0; i < node.entries.length; i++) {
      const entry = node.entries[i]!;
      if (intersects(entry, a, b) && test(entry)) return true;
    }
    return false;
  }
  return testSegment(node.left!, a, b, test) || testSegment(node.right!, a, b, test);
}

function build<T extends AudioBounds>(entries: T[]): Node<T> {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const e of entries) {
    minX = Math.min(minX, e.minX);
    minY = Math.min(minY, e.minY);
    minZ = Math.min(minZ, e.minZ);
    maxX = Math.max(maxX, e.maxX);
    maxY = Math.max(maxY, e.maxY);
    maxZ = Math.max(maxZ, e.maxZ);
  }
  const bounds = { minX, minY, minZ, maxX, maxY, maxZ };
  if (entries.length <= 8) return { ...bounds, entries };
  const dx = maxX - minX,
    dy = maxY - minY,
    dz = maxZ - minZ;
  const axis = dx >= dy && dx >= dz ? "X" : dy >= dz ? "Y" : "Z";
  entries.sort((a, b) => a[`min${axis}`] + a[`max${axis}`] - b[`min${axis}`] - b[`max${axis}`]);
  const middle = entries.length >>> 1;
  return { ...bounds, left: build(entries.slice(0, middle)), right: build(entries.slice(middle)) };
}

function withinRadius(b: AudioBounds, p: AudioPoint, squared: number): boolean {
  const x = Math.max(b.minX - p.x, 0, p.x - b.maxX);
  const y = Math.max(b.minY - p.y, 0, p.y - b.maxY);
  const z = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
  return x * x + y * y + z * z <= squared;
}

function intersects(bounds: AudioBounds, a: AudioPoint, b: AudioPoint): boolean {
  let low = 0,
    high = 1;
  const dX = b.x - a.x;
  if (dX === 0) {
    if (a.x < bounds.minX || a.x > bounds.maxX) return false;
  } else {
    const t0 = (bounds.minX - a.x) / dX,
      t1 = (bounds.maxX - a.x) / dX;
    low = Math.max(low, Math.min(t0, t1));
    high = Math.min(high, Math.max(t0, t1));
    if (low > high) return false;
  }
  const dY = b.y - a.y;
  if (dY === 0) {
    if (a.y < bounds.minY || a.y > bounds.maxY) return false;
  } else {
    const t0 = (bounds.minY - a.y) / dY,
      t1 = (bounds.maxY - a.y) / dY;
    low = Math.max(low, Math.min(t0, t1));
    high = Math.min(high, Math.max(t0, t1));
    if (low > high) return false;
  }
  const dZ = b.z - a.z;
  if (dZ === 0) {
    if (a.z < bounds.minZ || a.z > bounds.maxZ) return false;
  } else {
    const t0 = (bounds.minZ - a.z) / dZ,
      t1 = (bounds.maxZ - a.z) / dZ;
    low = Math.max(low, Math.min(t0, t1));
    high = Math.min(high, Math.max(t0, t1));
    if (low > high) return false;
  }
  return true;
}
