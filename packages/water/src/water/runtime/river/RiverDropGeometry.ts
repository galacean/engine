import type { RiverDrop } from "../../authoring/river/RiverDrop";

export interface RiverDropPresentationGeometry {
  readonly positions: number[][];
  readonly normals: number[][];
  readonly uvs: number[][];
  /** Part: 0 curtain, 1 lip foam, 2 rolling foam, 3 impact sheet. */
  readonly parts: number[][];
  readonly indices: number[];
  readonly downstream: readonly [number, number];
  readonly height: number;
  readonly landingLength: number;
  readonly bounds: { min: number[]; max: number[] };
}

/** Generated from the same published drop endpoints as queries; no imported scene mesh or terrain edits. */
export function createRiverDropPresentationGeometry(drop: RiverDrop): RiverDropPresentationGeometry {
  const positions: number[][] = [],
    normals: number[][] = [],
    uvs: number[][] = [],
    parts: number[][] = [],
    indices: number[] = [];
  const [ax, az] = drop.across,
    downstream = [az, -ax] as const;
  const height = drop.upper[1] - drop.lower[1];
  const landingLength = Math.min(2, drop.width * 0.7, Math.max(0.15, height * 0.4));
  const lipLength = Math.min(0.6, drop.width * 0.25, height * 0.5);
  const addGrid = (
    part: number,
    columns: number,
    rows: number,
    point: (u: number, v: number) => number[],
    normal: readonly number[]
  ) => {
    const start = positions.length;
    for (let y = 0; y <= rows; y++)
      for (let x = 0; x <= columns; x++) {
        const u = x / columns,
          v = y / rows;
        positions.push(point(u, v));
        normals.push([...normal]);
        uvs.push([u, v]);
        parts.push([part, 0]);
      }
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const a = start + y * (columns + 1) + x,
          b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
  };
  const columns = Math.max(2, Math.min(96, Math.ceil(drop.width / 0.25)));
  addGrid(
    0,
    columns,
    Math.max(2, Math.min(192, Math.ceil(height / 0.2))),
    (u, v) => [
      drop.upper[0] + (drop.lower[0] - drop.upper[0]) * v + ax * (u - 0.5) * drop.width,
      drop.upper[1] - height * v,
      drop.upper[2] + (drop.lower[2] - drop.upper[2]) * v + az * (u - 0.5) * drop.width
    ],
    [downstream[0], 0, downstream[1]]
  );
  const patch = (part: number, center: readonly number[], from: number, length: number, bulge: number) =>
    addGrid(
      part,
      columns,
      8,
      (u, v) => [
        center[0] + ax * (u - 0.5) * drop.width + downstream[0] * (from + v * length),
        center[1] + 0.018 + bulge * Math.sin(Math.PI * v) * Math.sin(Math.PI * u),
        center[2] + az * (u - 0.5) * drop.width + downstream[1] * (from + v * length)
      ],
      [0, 1, 0]
    );
  patch(1, drop.upper, -lipLength, lipLength, Math.min(0.06, height * 0.04));
  patch(3, drop.lower, 0, landingLength, 0);
  patch(2, drop.lower, 0, landingLength * 0.48, Math.min(0.25, height * 0.12));
  // Conservative margin for displaced rolling foam. Native particles own their own bounds.
  const padding = Math.min(0.8, height * 0.3) + 0.2;
  return {
    positions,
    normals,
    uvs,
    parts,
    indices,
    downstream,
    height,
    landingLength,
    bounds: {
      min: [0, 1, 2].map((axis) => Math.min(...positions.map((p) => p[axis])) - padding),
      max: [0, 1, 2].map(
        (axis) =>
          Math.max(...positions.map((p) => p[axis])) +
          padding +
          (axis === 1 ? Math.min(1, height * 0.4) : landingLength)
      )
    }
  };
}

/** Per-vertex directions replace per-drop uniforms so every curtain shares one draw. */
export function createRiverDropBatchGeometry(drops: readonly RiverDrop[]) {
  const positions: number[][] = [],
    normals: number[][] = [],
    uvs: number[][] = [],
    parts: number[][] = [],
    directions: number[][] = [],
    indices: number[] = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const drop of drops) {
    const geometry = createRiverDropPresentationGeometry(drop);
    const offset = positions.length;
    for (let i = 0; i < geometry.positions.length; i++) {
      positions.push(geometry.positions[i]);
      normals.push(geometry.normals[i]);
      uvs.push(geometry.uvs[i]);
      parts.push(geometry.parts[i]);
      directions.push([...geometry.downstream]);
    }
    for (const index of geometry.indices) indices.push(offset + index);
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], geometry.bounds.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], geometry.bounds.max[axis]);
    }
  }
  if (drops.length === 0) bounds.min.fill(0), bounds.max.fill(0);
  return { positions, normals, uvs, parts, directions, indices, bounds };
}
