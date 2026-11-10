import type { MaterialUnit } from "./UnitPlacementStyle";

export interface SupportCell {
  id: string;
  logical_id: string;
  /** Material randomness identity; editing/picking still use id/logical_id. */
  seed_id?: string;
  /** Distance atlas may include a cut variant suffix unlike the source material. */
  lod_seed_id?: string;
  surface_id: string;
  anchor_uv: number[];
  center: number[];
  tangent: number[];
  bitangent: number[];
  normal: number[];
  size: number[];
  /** Optional native brick deformation flags; other material adapters ignore them. */
  brick_flags?: number;
  /** Wood plank shape flags: 64 and 128 keep the bevelled start and end at their size. */
  plank_flags?: number;
  /** Original metric bottom-left/right and top-left/right vertical offsets. */
  brick_deformation?: number[];
  /** Original recipe seed, retained through clipping and material changes. */
  brick_seed?: number;
  /** Accent stone: the brick shader draws it as a different stone. */
  brick_accent?: boolean;
  /** Where the brick lies along its wall, in metres; the brick shader maps its texture by it. */
  brick_span?: [number, number];
  /** Effective boundary interval in the owning wall metre chart, after contact cuts. */
  boundaryU?: [number, number];
}
export interface SupportFace {
  points: number[][];
  uv: number[][];
}
/** Shared output consumed by placement and the distance representation. */
export function constructionSupport(id: string, material: MaterialUnit, faces: SupportFace[]) {
  const vertices: number[][] = [],
    uv: number[][] = [],
    triangles: number[][] = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let width = 0,
    height = 0;
  for (const face of faces) {
    const base = vertices.length;
    // Geometry size must not become the argument count of a JS call. Accumulate
    // chart extents here without allocating whole-mesh coordinate arrays.
    for (const p of face.uv) {
      uv.push(p);
      width = Math.max(width, p[0]);
      height = Math.max(height, p[1]);
    }
    for (let i = 1; i + 1 < face.points.length; i++) triangles.push([base, base + i, base + i + 1]);
    for (const p of face.points) {
      vertices.push(p);
      for (let i = 0; i < 3; i++) {
        bounds.min[i] = Math.min(bounds.min[i], p[i]);
        bounds.max[i] = Math.max(bounds.max[i], p[i]);
      }
    }
  }
  return {
    geometry: {
      type: "triangulated" as const,
      id,
      vertices,
      uv,
      triangles,
      holes: [],
      width,
      height
    },
    previewParts: [{ owner: id, material, positions: vertices.flat(), uvs: uv, indices: triangles.flat() }],
    bounds
  };
}
