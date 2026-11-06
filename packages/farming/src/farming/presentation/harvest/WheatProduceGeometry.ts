type Point = [number, number, number];
export interface WheatProduceGeometry {
  positions: Point[];
  normals: Point[];
  colors: Point[];
  indices: number[];
}

/** A cut, tied sheaf. Local Y follows the stalks; the shared produce builder lays it along Z. */
export function createWheatProduceGeometry(): WheatProduceGeometry {
  const geometry: WheatProduceGeometry = { positions: [], normals: [], colors: [], indices: [] };
  const straw: Point = [0.52, 0.34, 0.12],
    grain: Point = [0.72, 0.49, 0.19],
    cord: Point = [0.26, 0.16, 0.07];
  const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a: Point, n: number): Point => [a[0] * n, a[1] * n, a[2] * n];
  const cross = (a: Point, b: Point): Point => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const unit = (a: Point): Point => mul(a, 1 / Math.hypot(...a));
  function vertex(position: Point, normal: Point, color: Point): number {
    geometry.positions.push(position);
    geometry.normals.push(normal);
    geometry.colors.push(color);
    return geometry.positions.length - 1;
  }
  function triangle(a: number, b: number, c: number): void {
    const p = geometry.positions,
      n = geometry.normals;
    const face = cross(add(p[b], mul(p[a], -1)), add(p[c], mul(p[a], -1)));
    const normal = add(add(n[a], n[b]), n[c]);
    if (face.reduce((sum, value, axis) => sum + value * normal[axis], 0) < 0) [b, c] = [c, b];
    geometry.indices.push(a, b, c);
  }
  function frame(direction: Point): [Point, Point] {
    const u = unit(cross(direction, Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    return [u, cross(direction, u)];
  }
  function stalk(points: Point[], radius: number): void {
    const start = geometry.positions.length,
      sides = 4;
    for (let ring = 0; ring < points.length; ring++) {
      const direction = unit(
        add(points[Math.min(ring + 1, points.length - 1)], mul(points[Math.max(0, ring - 1)], -1))
      );
      const [u, v] = frame(direction),
        r = radius * (1 - ring * 0.14);
      for (let side = 0; side < sides; side++) {
        const angle = (side * Math.PI * 2) / sides,
          normal = add(mul(u, Math.cos(angle)), mul(v, Math.sin(angle)));
        vertex(add(points[ring], mul(normal, r)), normal, mul(straw, 0.88 + ring * 0.065));
      }
      if (ring)
        for (let side = 0; side < sides; side++) {
          const a = start + (ring - 1) * sides + side,
            b = start + (ring - 1) * sides + ((side + 1) % sides);
          triangle(a, b, b + sides);
          triangle(a, b + sides, a + sides);
        }
    }
    for (const ring of [0, points.length - 1]) {
      const normal = unit(add(points[ring], mul(points[ring === 0 ? 1 : ring - 1], -1)));
      const center = vertex(points[ring], normal, straw);
      for (let side = 0; side < sides; side++)
        triangle(center, start + ring * sides + side, start + ring * sides + ((side + 1) % sides));
    }
  }
  function awn(start: Point, end: Point): void {
    const direction = unit(add(end, mul(start, -1))),
      [u, v] = frame(direction);
    const first = geometry.positions.length;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3,
        normal = add(mul(u, Math.cos(a)), mul(v, Math.sin(a)));
      vertex(add(start, mul(normal, 0.00065)), normal, [0.78, 0.59, 0.28]);
    }
    const tip = vertex(end, direction, [0.91, 0.74, 0.4]);
    for (let i = 0; i < 3; i++) triangle(first + i, first + ((i + 1) % 3), tip);
    triangle(first, first + 2, first + 1);
  }
  function kernel(center: Point, direction: Point, length: number, width: number, color: Point): void {
    const axis = unit(direction),
      [u, v] = frame(axis),
      sides = 6;
    const bottom = vertex(add(center, mul(axis, -length * 0.46)), mul(axis, -1), mul(color, 0.78));
    const first = geometry.positions.length;
    for (let side = 0; side < sides; side++) {
      const angle = (side * Math.PI * 2) / sides,
        normal = add(mul(u, Math.cos(angle)), mul(v, Math.sin(angle)));
      vertex(add(add(center, mul(axis, -length * 0.1)), mul(normal, width * 0.5)), normal, color);
    }
    const tip = vertex(add(center, mul(axis, length * 0.54)), axis, mul(color, 1.14));
    for (let side = 0; side < sides; side++) {
      triangle(bottom, first + side, first + ((side + 1) % sides));
      triangle(tip, first + ((side + 1) % sides), first + side);
    }
  }
  // Fan the cut ends and ears around a narrow binding, with slight height and depth differences.
  for (const [index, [x, z, height]] of [
    [-0.025, 0.004, 0.002],
    [0.008, -0.01, 0.018],
    [0.03, 0.005, -0.008],
    [-0.006, 0.014, 0.03]
  ].entries()) {
    const base: Point = [x, 0.035 + height, z],
      tip: Point = [x * 1.13, 0.116 + height, z + 0.002];
    stalk([[x * 0.9, -0.16 + index * 0.007, z], [x * 0.18, -0.06, z * 0.22], base, tip], 0.0017);
    for (let row = 0; row < 4; row++)
      for (const side of [-1, 1]) {
        const t = row / 4,
          y = base[1] + 0.012 + row * 0.018 + (side === 1 ? 0.003 : 0);
        const center: Point = [base[0] + side * (0.007 - t * 0.001), y, z];
        kernel(
          center,
          [side * 0.5, 1, 0.13],
          0.025 - t * 0.005,
          0.012 - t * 0.002,
          mul(grain, 0.9 + index * 0.035 + t * 0.08)
        );
        awn(add(center, [side * 0.004, 0.009, 0]), [center[0] + side * 0.015, y + 0.039 - t * 0.006, z + 0.001]);
      }
    awn(tip, add(tip, [0.001, 0.022, 0]));
  }
  // Two turns of straw-coloured binding, baked into the same mesh/material as the ears.
  for (const y of [-0.061, -0.055]) {
    const start = geometry.positions.length,
      rings = 8,
      sides = 3;
    for (let ring = 0; ring < rings; ring++) {
      const a = (ring * Math.PI * 2) / rings;
      for (let side = 0; side < sides; side++) {
        const b = (side * Math.PI * 2) / sides;
        const normal: Point = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];
        vertex(add([0.011 * Math.cos(a), y, 0.009 * Math.sin(a)], mul(normal, 0.0015)), normal, cord);
      }
    }
    for (let ring = 0; ring < rings; ring++)
      for (let side = 0; side < sides; side++) {
        const a = start + ring * sides + side,
          b = start + ring * sides + ((side + 1) % sides);
        const c = start + ((ring + 1) % rings) * sides + side,
          d = start + ((ring + 1) % rings) * sides + ((side + 1) % sides);
        triangle(a, b, d);
        triangle(a, d, c);
      }
  }
  kernel([0.01, -0.058, -0.005], [1, 0.3, 0], 0.008, 0.006, cord);
  return geometry;
}
