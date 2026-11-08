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

/** Box proxy derived from the very same placements consumed by unit renderers. */
export function supportCellFaces(cell: SupportCell, material?: MaterialUnit): SupportFace[] {
  const deformation = material === "brick" ? cell.brick_deformation : undefined;
  const faces: SupportFace[] = [];
  const corners = [-1, 1].flatMap((zz) =>
    [-1, 1].flatMap((yy) =>
      [-1, 1].map((xx) =>
        cell.center.map(
          (v, k) =>
            v +
            (xx * cell.size[0] * cell.tangent[k] +
              yy * cell.size[1] * cell.bitangent[k] +
              zz * cell.size[2] * cell.normal[k]) /
              2
        )
      )
    )
  );
  for (const indices of [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
    [2, 6, 7, 3],
    [0, 1, 5, 4]
  ]) {
    const pts = indices.map((i) => corners[i]),
      a = pts[0],
      b = pts[1],
      d = pts[3];
    const fw = Math.hypot(...a.map((x, k) => b[k] - x)),
      fh = Math.hypot(...a.map((x, k) => d[k] - x));
    faces.push({
      points: indices.map((index) => {
        const y = index & 2 ? 2 : 0,
          x = index & 1;
        const offset = deformation?.[y + x] ?? 0;
        return corners[index].map((v, k) => v + offset * cell.bitangent[k]);
      }),
      uv: [
        [0, 0],
        [fw, 0],
        [fw, fh],
        [0, fh]
      ].map((p) => [p[0] + cell.anchor_uv[0], p[1] + cell.anchor_uv[1]])
    });
  }

  return faces;
}
