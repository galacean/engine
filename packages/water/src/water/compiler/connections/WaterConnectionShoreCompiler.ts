import {
  WATER_CONNECTION_SHORE_RANGE,
  WATER_CONNECTION_SHORE_SIZE,
  type WaterConnectionShoreField
} from "../../authoring/connections/WaterConnection";

type Point = readonly [number, number, number];

/** Extract the wet/dry contour from sampled terrain triangles, never from a coverage cut. */
export function compileWaterConnectionShore(
  center: readonly [number, number],
  radius: number,
  waterMinusBed: (x: number, z: number) => number
): WaterConnectionShoreField {
  const size = WATER_CONNECTION_SHORE_SIZE,
    padding = 12;
  const spacing = (2 * radius) / (size - 1);
  const origin = [center[0] - radius, center[1] - radius] as const;
  const segments: (readonly [Point, Point])[] = [];
  const point = (column: number, row: number): Point => {
    const x = origin[0] + column * spacing,
      z = origin[1] + row * spacing;
    const depth = waterMinusBed(x, z);
    if (!Number.isFinite(depth)) throw new Error("Water connection shoreline needs finite terrain coverage.");
    return [x, z, depth];
  };
  const triangle = (vertices: readonly Point[]) => {
    const crossings: Point[] = [];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i],
        b = vertices[(i + 1) % 3];
      if (a[2] > 0 === b[2] > 0) continue;
      const t = a[2] / (a[2] - b[2]);
      crossings.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]);
    }
    if (crossings.length === 2) segments.push([crossings[0], crossings[1]]);
  };
  let previous = Array.from({ length: size + 2 * padding }, (_, x) => point(x - padding, -padding));
  for (let row = -padding; row < size - 1 + padding; row++) {
    const next = Array.from({ length: previous.length }, (_, x) => point(x - padding, row + 1));
    for (let x = 0; x < previous.length - 1; x++) {
      triangle([previous[x], next[x], previous[x + 1]]);
      triangle([previous[x + 1], next[x], next[x + 1]]);
    }
    previous = next;
  }
  const distances: number[] = [];
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++) {
      const p = point(column, row);
      let distance = WATER_CONNECTION_SHORE_RANGE;
      for (const [a, b] of segments) {
        const dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        distance = Math.min(distance, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t));
      }
      const signed = p[2] > 0 ? distance : -distance;
      // CPU and GPU use the same 16-bit quantization (RGBA8 R/G channels).
      distances.push(
        (Math.round(((signed / WATER_CONNECTION_SHORE_RANGE) * 0.5 + 0.5) * 65535) / 65535) *
          2 *
          WATER_CONNECTION_SHORE_RANGE -
          WATER_CONNECTION_SHORE_RANGE
      );
    }
  return Object.freeze({ origin: Object.freeze(origin), spacing, distances: Object.freeze(distances) });
}
